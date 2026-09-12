import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildSavageArena } from './model';
import { createArenaAtmosphere } from './atmosphere';
import { createArenaGlitch } from './glitch';

export type ArenaView = 'orbit' | 'courtside' | 'top';
export type ArenaMotion = 'orbiting' | 'interacting' | 'waiting' | 'returning' | 'paused';
export type ArenaMotionSource = 'device' | 'visitor';
const effectsPreferenceKey = 'savage-arena-effects';
function readEffectsPreference(): boolean | null {
  try {
    const value = localStorage.getItem(effectsPreferenceKey);
    return value === 'on' ? true : value === 'off' ? false : null;
  } catch { return null; }
}
function saveEffectsPreference(value: boolean | null) {
  try {
    if (value === null) localStorage.removeItem(effectsPreferenceKey);
    else localStorage.setItem(effectsPreferenceKey, value ? 'on' : 'off');
  } catch { /* Animation controls still work when storage is unavailable. */ }
}
export interface ArenaEngine {
  setView(view: ArenaView): void;
  setRoof(visible: boolean): void;
  setTracking(visible: boolean): void;
  setPlaying(playing: boolean): void;
  setEffects(enabled: boolean): void;
  setDrag(enabled: boolean): void;
  rotate(direction: number): void;
  dispose(): void;
}

/** Direct manipulation is immediate; ambient effects use a paced render loop. */
export function mountArena(host: HTMLElement, callbacks: {
  ready(): void; failed(): void; paused(): void; viewChanged(view: ArenaView): void;
  motionChanged(motion: ArenaMotion): void; effectsChanged(enabled: boolean, source: ArenaMotionSource): void;
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
  const atmosphere = createArenaAtmosphere();
  const glitch = createArenaGlitch(model.group);
  scene.add(model.group, atmosphere.group);
  model.tracking.visible = false;

  const groundPoints: number[] = [];
  for (const radius of [37, 40]) {
    for (let i = 0; i < 128; i++) {
      const a = i / 128 * Math.PI * 2, b = (i + 1) / 128 * Math.PI * 2;
      groundPoints.push(Math.cos(a) * radius, -1, Math.sin(a) * radius * .72,
        Math.cos(b) * radius, -1, Math.sin(b) * radius * .72);
    }
  }
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',
    new THREE.Float32BufferAttribute(groundPoints, 3)), new THREE.LineBasicMaterial({ color: 0x4c8299, transparent: true, opacity: .13 })));

  let disposed = false, failed = false, ready = false, inView = true, frame = 0, ambientTimer = 0;
  let playing = false, seconds = 0, previous = 0, ambienceSeconds = 0;
  const preference = readEffectsPreference();
  let effects = preference ?? !reduced.matches, motion: ArenaMotion = effects ? 'orbiting' : 'paused';
  let pointerHeld = false, idleUntil = 0, glitchCount = 0, lastGlitchCycle = 0, glitchStart = -1;
  let tween: { start: number; from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3; fromAngle: number; toAngle: number; resume: boolean } | null = null;
  callbacks.effectsChanged(effects, !effects && preference === null ? 'device' : 'visitor'); callbacks.motionChanged(motion);
  canvas.dataset.glitch = 'false'; canvas.dataset.glitchCount = '0';

  function setMotion(value: ArenaMotion) {
    if (motion !== value) { motion = value; callbacks.motionChanged(value); }
  }
  function requestRender() {
    clearTimeout(ambientTimer); ambientTimer = 0;
    if (!disposed && !failed && inView && !document.hidden && !frame) frame = requestAnimationFrame(render);
  }
  function flushInertia() {
    const damping = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
  }
  function markInteraction() {
    if (tween?.resume) tween = null;
    if (effects) {
      idleUntil = performance.now() + 3000;
      setMotion(pointerHeld ? 'interacting' : 'waiting');
    }
    requestRender();
  }
  function moveToView(view: ArenaView, immediate = false, resume = false) {
    const positions: Record<ArenaView, [number, number, number]> = {
      orbit: [56, 42, 62], courtside: [3, 29, 78], top: [0, 91, .1],
    };
    const target = new THREE.Vector3(0, view === 'top' ? 0 : 4, 0);
    const position = new THREE.Vector3(...positions[view]);
    flushInertia();
    // Return by the shortest path, without winding back through completed turns.
    const angle = model.group.rotation.y;
    const endAngle = Math.round(angle / (Math.PI * 2)) * Math.PI * 2;
    if (immediate || reduced.matches) {
      tween = null; camera.position.copy(position); controls.target.copy(target);
      model.group.rotation.y = 0; controls.update();
      if (resume) setMotion('orbiting');
    } else {
      tween = { start: performance.now(), from: camera.position.clone(), to: position,
        fromTarget: controls.target.clone(), toTarget: target, fromAngle: angle, toAngle: endAngle, resume };
      if (resume) setMotion('returning');
    }
    callbacks.viewChanged(view); requestRender();
  }
  function render(now: number) {
    frame = 0;
    if (disposed || failed || !inView || document.hidden) return;
    const elapsed = previous ? Math.max(0, (now - previous) / 1000) : 0;
    if (effects && motion === 'waiting' && !pointerHeld && now >= idleUntil) moveToView('orbit', false, true);
    if (tween) {
      const progress = reduced.matches ? 1 : Math.min((now - tween.start) / 950, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(tween.from, tween.to, eased);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
      model.group.rotation.y = THREE.MathUtils.lerp(tween.fromAngle, tween.toAngle, eased);
      if (progress === 1) {
        const resume = tween.resume; tween = null; model.group.rotation.y = 0;
        if (resume && effects) setMotion('orbiting');
      }
    } else if (effects && motion === 'orbiting') {
      // Negative Y rotation is clockwise when looking down on the court.
      model.group.rotation.y -= Math.min(elapsed, .1) * .105;
    }
    if (effects) ambienceSeconds += elapsed;
    if (playing) { seconds += Math.min(elapsed, .05); model.update(seconds); }
    const cycle = Math.floor(ambienceSeconds / 6);
    if (effects && cycle > lastGlitchCycle) {
      lastGlitchCycle = cycle;
      glitchStart = ambienceSeconds; glitchCount++;
    }
    const age = glitchStart < 0 ? 1 : ambienceSeconds - glitchStart;
    const intensity = effects && age < .28 ? (.35 + .65 * Math.sin(age / .28 * Math.PI)) * (.7 + .3 * Math.sin(age * 110)) : 0;
    glitch.update(ambienceSeconds, intensity);
    canvas.dataset.rotation = model.group.rotation.y.toFixed(5);
    canvas.dataset.glitch = String(intensity > .01);
    canvas.dataset.glitchCount = String(glitchCount);
    previous = now;
    const moving = controls.update();
    atmosphere.update(ambienceSeconds, camera);
    renderer.render(scene, camera);
    if (!ready) { ready = true; callbacks.ready(); }
    if (tween || moving) requestRender();
    else if (playing || effects) {
      // Leave time for input, especially on software WebGL renderers.
      ambientTimer = window.setTimeout(requestRender, 34);
    } else previous = 0;
  }
  function setView(view: ArenaView) { markInteraction(); moveToView(view); }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height || disposed) return;
    camera.aspect = width / height;
    camera.fov = window.innerWidth <= 850 || camera.aspect < 1.15 ? 47 : 37;
    camera.updateProjectionMatrix(); renderer.setSize(width, height); requestRender();
  }
  function pausePlayback() {
    if (playing) { playing = false; callbacks.paused(); }
    previous = 0;
  }
  function suspend() {
    clearTimeout(ambientTimer); ambientTimer = 0;
    pausePlayback(); cancelAnimationFrame(frame); frame = 0; pointerHeld = false;
    glitchStart = -1;
    if (effects && motion !== 'orbiting') { tween = null; idleUntil = performance.now() + 3000; setMotion('waiting'); }
  }
  function visibility() {
    if (document.hidden) suspend();
    else { if (motion === 'waiting') idleUntil = performance.now() + 3000; requestRender(); }
  }
  function setEffects(value: boolean, source: ArenaMotionSource = 'visitor') {
    effects = value; previous = 0; glitchStart = -1;
    saveEffectsPreference(source === 'visitor' ? value : null);
    if (!value) {
      if (tween?.resume) tween = null;
      setMotion('paused');
    } else if (pointerHeld) setMotion('interacting');
    else moveToView('orbit', false, true);
    callbacks.effectsChanged(value, source); requestRender();
  }
  function reduceMotion() {
    controls.enableDamping = !reduced.matches;
    if (reduced.matches) {
      pausePlayback(); setEffects(false, 'device');
      if (tween) { camera.position.copy(tween.to); controls.target.copy(tween.toTarget); model.group.rotation.y = 0; tween = null; }
    }
    requestRender();
  }
  function rotate(direction: number) {
    markInteraction(); tween = null; flushInertia();
    const delta = camera.position.clone().sub(controls.target);
    delta.applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * Math.PI / 9);
    camera.position.copy(controls.target).add(delta);
    callbacks.viewChanged('orbit'); controls.update(); requestRender();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); rotate(event.key === 'ArrowLeft' ? -1 : 1);
    } else if (event.key === 'Home') { event.preventDefault(); setView('orbit'); }
  }
  function dragStart() { pointerHeld = true; tween = null; markInteraction(); callbacks.viewChanged('orbit'); }
  function dragEnd() { pointerHeld = false; markInteraction(); }
  function pointerMove() { if (pointerHeld) markInteraction(); }
  function contextLost(event: Event) {
    event.preventDefault(); failed = true; suspend(); callbacks.failed();
  }
  const observer = new ResizeObserver(resize); observer.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!inView) suspend();
    else { if (motion === 'waiting') idleUntil = performance.now() + 3000; requestRender(); }
  }, { threshold: .05 });
  intersection.observe(host);
  controls.addEventListener('change', requestRender);
  controls.addEventListener('start', dragStart);
  controls.addEventListener('end', dragEnd);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('keydown', keydown);
  canvas.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', visibility);
  reduced.addEventListener('change', reduceMotion);
  moveToView('orbit', true); resize();

  return {
    setView, setEffects,
    setRoof(visible) { markInteraction(); model.roof.visible = visible; requestRender(); },
    setTracking(visible) { markInteraction(); model.tracking.visible = visible; if (!visible) pausePlayback(); requestRender(); },
    setPlaying(value) { markInteraction(); playing = value && model.tracking.visible && inView && !document.hidden && !failed; previous = 0; if (value && !playing) callbacks.paused(); requestRender(); },
    setDrag(enabled) { markInteraction(); controls.enabled = !coarse.matches || enabled; canvas.style.touchAction = coarse.matches && enabled ? 'none' : 'pan-y'; },
    rotate,
    dispose() {
      disposed = true; cancelAnimationFrame(frame); clearTimeout(ambientTimer); observer.disconnect(); intersection.disconnect();
      document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', reduceMotion);
      canvas.removeEventListener('pointermove', pointerMove);
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
