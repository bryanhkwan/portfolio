import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildSavageArena } from './model';

export type ArenaView = 'orbit' | 'courtside' | 'top';
export interface ArenaEngine {
  setView(view: ArenaView): void;
  setRoof(visible: boolean): void;
  setTracking(visible: boolean): void;
  setPlaying(playing: boolean): void;
  setDrag(enabled: boolean): void;
  rotate(direction: number): void;
  dispose(): void;
}

/** A demand-driven renderer: an idle arena doesn't run an animation loop. */
export function mountArena(host: HTMLElement, callbacks: {
  ready(): void; failed(): void; paused(): void; viewChanged(view: ArenaView): void;
}): ArenaEngine {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
  renderer.setClearColor(0x020914, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'Interactive x-ray model of Savage Arena');
  canvas.setAttribute('aria-describedby', 'arena-instructions');
  canvas.setAttribute('role', 'img');
  canvas.tabIndex = 0;
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, .1, 250);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableZoom = false; // Keep page scrolling natural, including over the scene.
  controls.minPolarAngle = .03;
  controls.maxPolarAngle = Math.PI * .485;
  controls.rotateSpeed = .48;
  controls.dampingFactor = .09;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  controls.enableDamping = !reduced.matches;
  controls.enabled = !coarse.matches;
  canvas.style.touchAction = 'pan-y';

  let model: ReturnType<typeof buildSavageArena>;
  try { model = buildSavageArena(); }
  catch (error) { controls.dispose(); renderer.dispose(); canvas.remove(); throw error; }
  scene.add(model.group);
  model.tracking.visible = false;
  scene.add(new THREE.AmbientLight(0xb3dbff, 1.6));
  const key = new THREE.DirectionalLight(0xc4ebff, 2.2);
  key.position.set(12, 30, 18); scene.add(key);

  // Architectural reference lines ground the model without an opaque floor.
  const groundPoints: number[] = [];
  for (const radius of [37, 40]) {
    for (let i = 0; i < 128; i++) {
      const a = i / 128 * Math.PI * 2, b = (i + 1) / 128 * Math.PI * 2;
      groundPoints.push(Math.cos(a) * radius, -.9, Math.sin(a) * radius * .72,
        Math.cos(b) * radius, -.9, Math.sin(b) * radius * .72);
    }
  }
  const guides = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',
    new THREE.Float32BufferAttribute(groundPoints, 3)), new THREE.LineBasicMaterial({ color: 0x4c8299, transparent: true, opacity: .19 }));
  scene.add(guides);

  let disposed = false, failed = false, ready = false, inView = true, frame = 0, playbackTimer = 0;
  let playing = false, seconds = 0, previous = 0;
  let tween: { start: number; from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3 } | null = null;

  function requestRender() {
    clearTimeout(playbackTimer); playbackTimer = 0;
    if (!disposed && !failed && inView && !document.hidden && !frame) frame = requestAnimationFrame(render);
  }
  function render(now: number) {
    frame = 0;
    if (disposed || failed || !inView || document.hidden) return;
    if (tween) {
      const progress = reduced.matches ? 1 : Math.min((now - tween.start) / 950, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(tween.from, tween.to, eased);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
      if (progress === 1) tween = null;
    }
    if (playing) {
      seconds += previous ? Math.min((now - previous) / 1000, .05) : 0;
      model.update(seconds);
    }
    previous = now;
    const moving = controls.update();
    renderer.render(scene, camera);
    if (!ready) { ready = true; callbacks.ready(); }
    if (tween || moving) requestRender();
    else if (playing) {
      // A paced analytical replay leaves time for input and software rendering.
      // Camera transitions and direct manipulation retain immediate frame updates.
      playbackTimer = window.setTimeout(requestRender, 34);
    }
  }
  function setView(view: ArenaView, immediate = false) {
    const positions: Record<ArenaView, [number, number, number]> = {
      orbit: [54, 40, 59], courtside: [3, 29, 78], top: [0, 91, .1],
    };
    const target = new THREE.Vector3(0, view === 'top' ? 0 : 4, 0);
    const position = new THREE.Vector3(...positions[view]);
    // Remove residual drag inertia before starting a camera transition.
    const damping = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
    if (immediate || reduced.matches) {
      tween = null; camera.position.copy(position); controls.target.copy(target); controls.update();
    } else tween = { start: performance.now(), from: camera.position.clone(), to: position,
      fromTarget: controls.target.clone(), toTarget: target };
    callbacks.viewChanged(view);
    requestRender();
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height || disposed) return;
    camera.aspect = width / height;
    camera.fov = window.innerWidth <= 850 || camera.aspect < 1.15 ? 47 : 37;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    requestRender();
  }
  function pause() {
    clearTimeout(playbackTimer); playbackTimer = 0;
    if (playing) { playing = false; callbacks.paused(); }
    previous = 0;
  }
  function visibility() {
    if (document.hidden) { pause(); cancelAnimationFrame(frame); frame = 0; }
    else requestRender();
  }
  function reduceMotion() {
    controls.enableDamping = !reduced.matches;
    if (reduced.matches) { pause(); if (tween) { camera.position.copy(tween.to); controls.target.copy(tween.toTarget); tween = null; } }
    requestRender();
  }
  function rotate(direction: number) {
    tween = null;
    const delta = camera.position.clone().sub(controls.target);
    delta.applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * Math.PI / 9);
    camera.position.copy(controls.target).add(delta);
    callbacks.viewChanged('orbit'); controls.update(); requestRender();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); rotate(event.key === 'ArrowLeft' ? -1 : 1);
    } else if (event.key === 'Home') { event.preventDefault(); setView('orbit', true); }
  }
  function dragStart() { tween = null; callbacks.viewChanged('orbit'); requestRender(); }
  function contextLost(event: Event) {
    event.preventDefault(); failed = true; pause(); cancelAnimationFrame(frame); frame = 0; callbacks.failed();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!inView) { pause(); cancelAnimationFrame(frame); frame = 0; }
    else requestRender();
  }, { threshold: .05 });
  intersection.observe(host);
  controls.addEventListener('change', requestRender);
  controls.addEventListener('start', dragStart);
  canvas.addEventListener('keydown', keydown);
  canvas.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', visibility);
  reduced.addEventListener('change', reduceMotion);
  setView('orbit', true); resize();
  if (!reduced.matches) {
    // A short establishing move introduces depth, then the scene comes to rest.
    camera.position.set(59, 45, 64);
    setView('orbit');
  }

  return {
    setView,
    setRoof(visible) { model.roof.visible = visible; requestRender(); },
    setTracking(visible) { model.tracking.visible = visible; if (!visible) pause(); requestRender(); },
    setPlaying(value) { playing = value && model.tracking.visible && inView && !document.hidden && !failed; previous = 0; if (value && !playing) callbacks.paused(); requestRender(); },
    setDrag(enabled) { controls.enabled = !coarse.matches || enabled; canvas.style.touchAction = coarse.matches && enabled ? 'none' : 'pan-y'; },
    rotate,
    dispose() {
      disposed = true; cancelAnimationFrame(frame); clearTimeout(playbackTimer); observer.disconnect(); intersection.disconnect();
      document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', reduceMotion);
      canvas.removeEventListener('keydown', keydown); canvas.removeEventListener('webglcontextlost', contextLost);
      controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      geometries.forEach(item => item.dispose()); textures.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
      renderer.dispose(); canvas.remove();
    },
  };
}
