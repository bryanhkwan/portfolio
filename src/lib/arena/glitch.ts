import * as THREE from 'three';

/** Brief scanline displacement, applied to the existing arena draw calls. */
export function createArenaGlitch(group: THREE.Group) {
  const strength = { value: 0 }, time = { value: 0 };
  const materials = new Set<THREE.Material>();
  group.traverse(object => {
    const material = (object as THREE.Mesh).material;
    if (material) for (const item of Array.isArray(material) ? material : [material]) materials.add(item);
  });
  for (const material of materials) {
    material.onBeforeCompile = shader => {
      shader.uniforms.arenaGlitch = strength;
      shader.uniforms.arenaGlitchTime = time;
      shader.vertexShader = `uniform float arenaGlitch; uniform float arenaGlitchTime;\n${shader.vertexShader}`
        .replace('#include <project_vertex>', `#include <project_vertex>
          float band = floor(mvPosition.y * 1.35 + arenaGlitchTime * 3.0);
          float noise = fract(sin(band * 127.1) * 43758.5453);
          float slice = step(0.64, noise);
          gl_Position.x += (noise - 0.5) * slice * arenaGlitch * 0.048 * gl_Position.w;
        `);
      shader.fragmentShader = `uniform float arenaGlitch;\n${shader.fragmentShader}`
        .replace('#include <opaque_fragment>', `
          outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.6, 1.13, 1.23), arenaGlitch * 0.65);
          #include <opaque_fragment>
        `);
    };
    material.customProgramCacheKey = () => 'savage-arena-scanline-v1';
    material.needsUpdate = true;
  }
  return {
    update(seconds: number, intensity: number) { time.value = seconds; strength.value = intensity; },
  };
}
