import * as THREE from 'three';

/**
 * A low cloud bank below the arena, rendered in one instanced draw call.
 * Add `group` to the scene alongside the arena, rather than inside its rotating
 * group. Call update with the ambience clock (seconds) after camera controls
 * update; keeping that clock at zero gives a complete, motionless cloud bank.
 * The visible cloud occupies approximately x ±44, z ±36, y -4.8…-0.25.
 * Its hollow center and upper fade leave the court and architecture readable.
 * Geometry and material are ordinary mesh resources for traversal disposal.
 */
export function createArenaAtmosphere(): {
  group: THREE.Group;
  update: (seconds: number, camera: THREE.Camera) => void;
} {
  const group = new THREE.Group();
  group.name = 'Peripheral cloud atmosphere';

  const puffs: { center: THREE.Vector3; shape: [number, number, number, number] }[] = [];
  // Interleaved banks avoid the regular scallops of a single ring of sprites.
  // All variation is deterministic so initial and reduced-motion views match.
  for (let layer = 0; layer < 2; layer++) {
    const count = layer === 0 ? 22 : 15;
    for (let i = 0; i < count; i++) {
      const phase = i * 2.399963 + layer * 1.71;
      const angle = i / count * Math.PI * 2 + layer * .17;
      const radius = 1 + Math.sin(phase * 1.9) * .045;
      puffs.push({
        center: new THREE.Vector3(
          Math.cos(angle) * (layer === 0 ? 31.8 : 34.6) * radius,
          (layer === 0 ? -1.12 : -2.55) + Math.sin(phase) * .27,
          Math.sin(angle) * (layer === 0 ? 24.3 : 26.3) * radius,
        ),
        shape: [
          14.8 + (Math.sin(phase * 1.4) + 1) * 3.5,
          10.5 + (Math.cos(phase * 1.6) + 1) * 2.3,
          layer === 0 ? .32 : .21,
          i * 5.37 + layer * 41.8,
        ],
      });
    }
  }

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const centers = new THREE.InstancedBufferAttribute(new Float32Array(puffs.length * 3), 3);
  const shapes = new THREE.InstancedBufferAttribute(new Float32Array(puffs.length * 4), 4);
  centers.setUsage(THREE.DynamicDrawUsage);
  shapes.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aCenter', centers);
  geometry.setAttribute('aShape', shapes);
  geometry.instanceCount = puffs.length;
  // Include shader-expanded billboards in the otherwise point-sized bounds.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -2, 0), 54);

  const material = new THREE.ShaderMaterial({
    name: 'Cyan cloud wisps',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uRight: { value: new THREE.Vector3(1, 0, 0) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uDeep: { value: new THREE.Color(0x15364f) },
      uLight: { value: new THREE.Color(0x8cdaeb) },
    },
    vertexShader: /* glsl */`
      attribute vec3 aCenter;
      attribute vec4 aShape;
      uniform float uTime;
      uniform vec3 uRight;
      uniform vec3 uUp;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vSeed;
      varying float vOpacity;

      void main() {
        vUv = uv;
        vSeed = aShape.w;
        vOpacity = aShape.z;
        // Camera-facing wisps flatten vertically into a shallow volume. At a
        // top view they become broad cloud patches instead of vanishing edges.
        vec3 up = vec3(uUp.x, uUp.y * .34, uUp.z);
        float breath = 1.0 + .035 * sin(uTime * .16 + aShape.w);
        vec3 center = aCenter;
        center.x += .32 * sin(uTime * .075 + aShape.w);
        center.z += .26 * cos(uTime * .065 + aShape.w * .7);
        vec3 local = center + uRight * position.x * aShape.x * breath
          + up * position.y * aShape.y;
        vec4 world = modelMatrix * vec4(local, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uLight;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vSeed;
      varying float vOpacity;

      float hash(vec2 p) {
        vec3 q = fract(vec3(p.x, p.y, p.x + p.y) * .1031);
        q += dot(q, q.yzx + 31.32);
        return fract((q.x + q.y) * q.z);
      }

      float noise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
          mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);
      }

      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float circle = 1.0 - dot(p, p);
        if (circle < -.12) discard;

        // A soft hole follows the arena footprint, while a separate height
        // mask keeps every cloud layer below the foundation in all views.
        float perimeter = smoothstep(.72, 1.02,
          length(vWorld.xz / vec2(31.0, 23.5)));
        float height = smoothstep(-4.8, -3.3, vWorld.y)
          * (1.0 - smoothstep(-1.15, -.25, vWorld.y));
        if (perimeter * height < .005) discard;

        vec2 flow = p * vec2(2.1, 2.8) + vec2(vSeed, vSeed * .39);
        flow += vec2(uTime * .023, -uTime * .011);
        float broad = noise(flow);
        float detail = noise(flow * 2.13 + vec2(broad * .8, 7.3));
        float fine = noise(flow * 4.17 + vec2(12.7, detail * .65));
        float cloud = broad * .57 + detail * .29 + fine * .14;
        float fringe = smoothstep(.025, .5, circle + (cloud - .5) * .62);
        float billow = smoothstep(.24, .78, cloud);
        float wisp = smoothstep(.44, .84, detail + fine * .16);
        float density = (billow * .73 + wisp * .27) * fringe;
        float alpha = density * vOpacity * perimeter * height;
        if (alpha < .003) discard;

        // Pale rims with a blue interior read as smoke against the dark scene;
        // restrained normal alpha blending avoids an emissive neon fog ring.
        float light = clamp(.3 + cloud * .52 + detail * .2, 0.0, 1.0);
        vec3 color = mix(uDeep, uLight, light);
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const cloud = new THREE.Mesh(geometry, material);
  cloud.name = 'Layered peripheral cloud bank';
  // The architectural linework stays crisp over the soft atmosphere.
  cloud.renderOrder = -2;
  group.add(cloud);

  const cameraPosition = new THREE.Vector3();
  const sorted = [...puffs];
  function writeInstances() {
    sorted.forEach((puff, i) => {
      centers.setXYZ(i, puff.center.x, puff.center.y, puff.center.z);
      shapes.setXYZW(i, ...puff.shape);
    });
    centers.needsUpdate = true;
    shapes.needsUpdate = true;
  }
  writeInstances();

  return {
    group,
    update(seconds, camera) {
      material.uniforms.uTime.value = seconds;
      camera.updateMatrixWorld();
      material.uniforms.uRight.value.setFromMatrixColumn(camera.matrixWorld, 0);
      material.uniforms.uUp.value.setFromMatrixColumn(camera.matrixWorld, 1);
      camera.getWorldPosition(cameraPosition);
      // Three.js sorts transparent objects, not instances. With only 37 puffs,
      // sorting these small arrays is cheap and keeps every orbit angle clean.
      sorted.sort((a, b) => b.center.distanceToSquared(cameraPosition) - a.center.distanceToSquared(cameraPosition));
      writeInstances();
    },
  };
}
