import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildSavageArena } from './model';
import { createArenaAtmosphere } from './atmosphere';
import { createArenaGlitch } from './glitch';
import { createArenaJourney } from './journey';
import { arenaChapters, type ArenaDestination, type ChapterId, type JourneyState } from '../../data/arena-chapters';

export type ArenaMotionSource = 'device' | 'visitor';
const preferenceKey = 'savage-arena-effects';
function readPreference() {
  try { const value = localStorage.getItem(preferenceKey); return value === 'on' ? true : value === 'off' ? false : null; }
  catch { return null; }
}
function savePreference(value: boolean | null) {
  try { if (value === null) localStorage.removeItem(preferenceKey); else localStorage.setItem(preferenceKey, value ? 'on' : 'off'); }
  catch { /* Navigation and motion controls do not depend on storage access. */ }
}
export interface ArenaEngine {
  navigate(destination: ArenaDestination, immediate?: boolean): void;
  skip(): void;
  setEffects(enabled: boolean): void;
  setDrag(enabled: boolean): void;
  rotate(direction: number): void;
  highlight(chapter: ChapterId | null): void;
  dispose(): void;
}

export function mountArena(host: HTMLElement, callbacks: {
  ready(): void; failed(): void; changed(state: JourneyState): void;
  selected(destination: ArenaDestination): void;
  effectsChanged(enabled: boolean, source: ArenaMotionSource): void;
}): ArenaEngine {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.25 : 1.5));
  renderer.setClearColor(0x020914, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'Interactive x-ray model of Savage Arena');
  canvas.setAttribute('aria-describedby', 'arena-instructions');
  canvas.setAttribute('role', 'img'); canvas.tabIndex = 0; host.appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, .15, 350);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false; controls.enableZoom = false;
  controls.minPolarAngle = .15; controls.maxPolarAngle = Math.PI * .46;
  controls.rotateSpeed = .45; controls.dampingFactor = .12;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  controls.enableDamping = !reduced.matches; canvas.style.touchAction = 'pan-y';
  let model: ReturnType<typeof buildSavageArena>;
  try { model = buildSavageArena(); }
  catch (error) { controls.dispose(); renderer.dispose(); canvas.remove(); throw error; }
  const atmosphere = createArenaAtmosphere();
  const glitch = createArenaGlitch(model.group);
  scene.add(model.group, atmosphere.group); model.tracking.visible = false;
  const markers = new THREE.Group(); markers.name = 'Portfolio destinations'; scene.add(markers);
  const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const hitGeometry = new THREE.SphereGeometry(2.8, 8, 6);
  const hits: THREE.Mesh[] = [];
  const rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
  arenaChapters.forEach(chapter => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .045, 4, 48), new THREE.MeshBasicMaterial({ color: 0x87cfe6, transparent: true, opacity: .8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.fromArray(chapter.anchor); markers.add(ring); rings.push(ring);
    const hit = new THREE.Mesh(hitGeometry, hitMaterial); hit.position.copy(ring.position); hit.userData.chapter = chapter.id; markers.add(hit); hits.push(hit);
  });
  const labelNodes = arenaChapters.map(chapter => host.parentElement?.querySelector<HTMLElement>(`[data-anchor="${chapter.id}"]`) ?? null);
  const leaderNodes = arenaChapters.map(chapter => host.parentElement?.querySelector<SVGLineElement>(`[data-leader="${chapter.id}"]`) ?? null);
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), projected = new THREE.Vector3();
  let disposed = false, failed = false, ready = false, inView = true, frame = 0, timer = 0;
  let previous = 0, seconds = 0, width = 1, height = 1, drawCount = 0;
  const preference = readPreference();
  let effects = preference ?? !reduced.matches, drag = false, held = false, idleUntil = 0;
  let down: { x: number; y: number } | null = null;
  let hovered: ChapterId | null = null;
  let transitionAge = 1;
  const journey = createArenaJourney(camera, controls, model, state => {
    model.tracking.visible = state.destination === 'projects'; markers.visible = state.phase === 'overview';
    model.setScoreboard(arenaChapters.find(chapter => chapter.id === state.destination)?.title ?? 'HOME COURT');
    updateControls(); callbacks.changed(state); requestRender();
  });
  markers.visible = false;
  callbacks.effectsChanged(effects, preference === null && !effects ? 'device' : 'visitor');
  function updateControls() {
    const phase = journey.state.phase;
    controls.enabled = (phase === 'exterior' || phase === 'overview') && (!coarse.matches || drag);
    canvas.style.touchAction = coarse.matches && drag && controls.enabled ? 'none' : 'pan-y';
  }
  function requestRender() {
    clearTimeout(timer); timer = 0;
    if (!disposed && !failed && inView && !document.hidden && !frame) frame = requestAnimationFrame(render);
  }
  function projectLabels() {
    if (journey.state.phase !== 'overview') return;
    const placed: { x: number; y: number; w: number }[] = [];
    arenaChapters.forEach((chapter, index) => {
      const label = labelNodes[index]; if (!label) return;
      projected.fromArray(chapter.anchor).project(camera);
      const labelWidth = label.offsetWidth || 145;
      const anchorX = (projected.x + 1) * width / 2, anchorY = (1 - projected.y) * height / 2;
      let x = THREE.MathUtils.clamp(anchorX, labelWidth / 2 + 12, width - labelWidth / 2 - 12);
      let y = THREE.MathUtils.clamp(anchorY - 14, 90, height - 35);
      if (window.innerWidth <= 760) {
        // Stable touch targets with leaders to the moving 3D anchors. Reserve space for the heading.
        const locations = [[.5, .65], [.23, .48], [.77, .48], [.23, .84], [.77, .84]];
        x = THREE.MathUtils.clamp(width * locations[index][0], labelWidth / 2 + 12, width - labelWidth / 2 - 12);
        y = height * locations[index][1];
      } else {
        for (const other of placed) if (Math.abs(x - other.x) < (labelWidth + other.w) / 2 + 8 && Math.abs(y - other.y) < 64) y = Math.max(80, other.y - 68);
      }
      placed.push({ x, y, w: labelWidth });
      label.style.left = `${x}px`; label.style.top = `${y}px`;
      label.style.visibility = projected.z < 1 && projected.z > -1 ? 'visible' : 'hidden';
      const leader = leaderNodes[index];
      if (leader) { leader.setAttribute('x1', String(anchorX)); leader.setAttribute('y1', String(anchorY)); leader.setAttribute('x2', String(x)); leader.setAttribute('y2', String(y)); leader.style.visibility = label.style.visibility; }
    });
  }
  function render(now: number) {
    frame = 0;
    if (disposed || failed || !inView || document.hidden) return;
    const elapsed = previous ? Math.max(0, (now - previous) / 1000) : 0;
    const delta = Math.min(elapsed, .08); previous = now;
    if (effects) seconds += delta;
    // Authored camera durations follow real elapsed time even on a software GPU.
    // Ambient simulation remains capped; suspend() clears previous to exclude time offscreen.
    journey.step(elapsed);
    if (journey.state.phase === 'exterior' && effects && !held && now >= idleUntil && !journey.moving) {
      if (idleUntil) { idleUntil = 0; journey.resetExterior(); }
      else model.group.rotation.y -= delta * .075;
    }
    if (effects && model.tracking.visible) model.update(seconds);
    transitionAge += delta;
    // One restrained scan during deliberate travel, never a recurring interruption while reading.
    const accent = effects && !reduced.matches && journey.moving && transitionAge < .22 ? Math.sin(transitionAge / .22 * Math.PI) * .18 : 0;
    glitch.update(seconds, accent);
    const moving = controls.update(); atmosphere.update(seconds, camera);
    scene.updateMatrixWorld(); camera.updateMatrixWorld(); projectLabels(); renderer.render(scene, camera);
    canvas.dataset.rotation = model.group.rotation.y.toFixed(5);
    canvas.dataset.cameraPosition = camera.position.toArray().map(value => value.toFixed(3)).join(',');
    canvas.dataset.renderCount = String(++drawCount); canvas.dataset.glitch = String(accent > .01);
    canvas.dataset.roofVisible = String(model.roof.visible); canvas.dataset.scoreboardVisible = String(model.scoreboard.visible);
    if (!ready) { ready = true; callbacks.ready(); }
    if (journey.moving || moving) requestRender();
    else if (effects) timer = window.setTimeout(requestRender, 34);
    else previous = 0;
  }
  function navigate(destination: ArenaDestination, immediate = false) {
    held = false; down = null; idleUntil = 0; transitionAge = 0;
    journey.travel(destination, immediate || !effects); updateControls(); requestRender();
  }
  function resize() {
    const bounds = host.getBoundingClientRect(); if (!bounds.width || !bounds.height || disposed) return;
    width = bounds.width; height = bounds.height; camera.aspect = width / height;
    // Panel layout must not change the authored destination mid-flight.
    const phone = window.innerWidth <= 760;
    camera.fov = phone ? 48 : 40;
    camera.updateProjectionMatrix(); renderer.setSize(width, height); journey.resize(phone); requestRender();
  }
  function suspend() { clearTimeout(timer); timer = 0; cancelAnimationFrame(frame); frame = 0; previous = 0; held = false; down = null; }
  function visibility() { if (document.hidden) suspend(); else requestRender(); }
  function setEffects(value: boolean, source: ArenaMotionSource = 'visitor') {
    effects = value; previous = 0; savePreference(source === 'visitor' ? value : null);
    if (!value && journey.moving) journey.skip(); callbacks.effectsChanged(value, source); requestRender();
  }
  function motionChanged(event: MediaQueryListEvent) { controls.enableDamping = !event.matches; if (event.matches) setEffects(false, 'device'); requestRender(); }
  function rotate(direction: number) {
    if (journey.moving || journey.state.phase === 'section') return;
    const delta = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * Math.PI / 9);
    camera.position.copy(controls.target).add(delta); idleUntil = performance.now() + 3000; controls.update(); requestRender();
  }
  function highlight(chapter: ChapterId | null) {
    hovered = chapter;
    rings.forEach((ring, index) => { const active = arenaChapters[index].id === chapter; ring.material.color.setHex(active ? 0xffd200 : 0x87cfe6); ring.scale.setScalar(active ? 1.3 : 1); }); requestRender();
  }
  function pick(event: PointerEvent): ChapterId | null {
    if (journey.state.phase !== 'overview') return null;
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera); return raycaster.intersectObjects(hits, false)[0]?.object.userData.chapter ?? null;
  }
  function pointerDown(event: PointerEvent) { journey.cancelExteriorReset(); down = { x: event.clientX, y: event.clientY }; held = true; }
  function pointerUp(event: PointerEvent) {
    if (!held) return;
    const click = down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6;
    held = false; down = null; idleUntil = performance.now() + 3000;
    if (click) { const chapter = pick(event); if (chapter) callbacks.selected(chapter); } requestRender();
  }
  function pointerCancel() { held = false; down = null; idleUntil = performance.now() + 3000; requestRender(); }
  function pointerMove(event: PointerEvent) { if (held) return; const chapter = pick(event); if (chapter !== hovered) highlight(chapter); canvas.style.cursor = chapter ? 'pointer' : controls.enabled ? 'grab' : 'default'; }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); rotate(event.key === 'ArrowLeft' ? -1 : 1); }
    if (event.key === 'Home') { event.preventDefault(); callbacks.selected(journey.state.phase === 'exterior' ? 'exterior' : 'overview'); }
  }
  function contextLost(event: Event) { event.preventDefault(); failed = true; suspend(); journey.dispose(); callbacks.failed(); }
  const observer = new ResizeObserver(resize); observer.observe(host);
  const intersection = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; if (!inView) suspend(); else requestRender(); }, { threshold: .02 }); intersection.observe(host);
  controls.addEventListener('change', requestRender);
  canvas.addEventListener('pointerdown', pointerDown); window.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerCancel);
  canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('keydown', keydown); canvas.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', visibility); reduced.addEventListener('change', motionChanged);
  navigate('exterior', true); resize();
  return {
    navigate, setEffects, highlight, rotate,
    skip() { journey.skip(); requestRender(); },
    setDrag(value) { drag = value; updateControls(); requestRender(); },
    dispose() {
      disposed = true; suspend(); journey.dispose(); observer.disconnect(); intersection.disconnect();
      document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', motionChanged);
      canvas.removeEventListener('pointerdown', pointerDown); window.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerCancel);
      canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('keydown', keydown); canvas.removeEventListener('webglcontextlost', contextLost);
      controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      geometries.forEach(item => item.dispose()); textures.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); renderer.dispose(); canvas.remove();
    },
  };
}
