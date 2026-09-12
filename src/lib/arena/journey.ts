import * as THREE from 'three';
import gsap from 'gsap';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SavageArenaModel } from './model';
import type { ArenaDestination, JourneyState } from '../../data/arena-chapters';

type Point = [number, number, number];
type Pose = { position: Point; target: Point };
const poses: Record<ArenaDestination, Pose> = {
  exterior: { position: [58, 41, 63], target: [0, 5, 0] },
  overview: { position: [31, 31, 39], target: [0, 2, 0] },
  projects: { position: [18, 13, 18], target: [0, .5, 0] },
  experience: { position: [-12, 6.6, 5], target: [-3, 1.5, -8.7] },
  research: { position: [17, 10.4, -13.8], target: [-3, 1, 1] },
  about: { position: [-20, 8.4, 12], target: [0, 2, -3] },
  contact: { position: [14, 5.7, 7.8], target: [-4, 1.4, -2] },
};

/** One paused timeline, advanced by the renderer: no competing camera writers or hidden-tab ticker. */
export function createArenaJourney(camera: THREE.PerspectiveCamera, controls: OrbitControls, model: SavageArenaModel,
  changed: (state: JourneyState) => void) {
  let state: JourneyState = { destination: 'exterior', phase: 'exterior' };
  let timeline: gsap.core.Timeline | null = null;
  let clock = 0;
  let narrow = false;
  const appearance = { interior: 0 };
  const vec = (point: Point) => ({ x: point[0], y: point[1], z: point[2] });
  function poseFor(destination: ArenaDestination): Pose {
    const pose = poses[destination];
    if (!narrow || (destination !== 'exterior' && destination !== 'overview')) return pose;
    const scale = destination === 'exterior' ? 1.5 : 1.45;
    return { ...pose, position: pose.position.map((value, index) => pose.target[index] + (value - pose.target[index]) * scale) as Point };
  }
  function applyAppearance() { model.setInterior(appearance.interior); }
  function notify(phase: JourneyState['phase']) { state = { ...state, phase }; changed(state); }
  function flushDrag() {
    // Consume the remaining OrbitControls delta before an authored camera move.
    // Its decay is frame-based, so even a three-second pause can leave inertia on slow GPUs.
    const damping = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
  }
  function applyPose() {
    flushDrag();
    const pose = poseFor(state.destination);
    camera.position.set(...pose.position); controls.target.set(...pose.target);
    controls.update();
  }
  function settle() {
    timeline?.kill(); timeline = null;
    applyPose();
    model.group.rotation.y = 0;
    appearance.interior = state.destination === 'exterior' ? 0 : 1;
    applyAppearance();
    notify(state.destination === 'exterior' ? 'exterior' : state.destination === 'overview' ? 'overview' : 'section');
  }
  function travel(destination: ArenaDestination, immediate = false) {
    const wasExterior = state.phase === 'exterior';
    timeline?.kill(); timeline = null;
    flushDrag();
    state = { destination, phase: destination === 'exterior' ? 'returning' : wasExterior ? 'entering' : 'travelling' };
    if (immediate) { settle(); return; }
    changed(state);
    const pose = poseFor(destination);
    const angle = model.group.rotation.y;
    const endAngle = Math.round(angle / (Math.PI * 2)) * Math.PI * 2;
    clock = 0;
    timeline = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' }, onComplete: settle });
    timeline.to(model.group.rotation, { y: endAngle, duration: .55 }, 0);
    timeline.to(appearance, { interior: destination === 'exterior' ? 0 : 1, duration: .85, onUpdate: applyAppearance }, .1);
    if (wasExterior && destination !== 'exterior') {
      // Cross above the seating rim through the revealed roof, then descend into the open bowl.
      // x=22 avoids the suspended central scoreboard; y>=20 clears the 17m trusses.
      timeline.to(camera.position, { x: 29, y: 25, z: 29, duration: 1.1 }, .2)
        .to(controls.target, { x: 1, y: 2, z: 0, duration: 1.1 }, .2)
        .to(camera.position, { x: 22, y: 20, z: 19, duration: .65 }, 1.3)
        .to(camera.position, { ...vec(pose.position), duration: .75 }, 1.95)
        .to(controls.target, { ...vec(pose.target), duration: .75 }, 1.95);
    } else {
      // Return to a high, open corridor before changing sides. This avoids flying through the scoreboard or stands.
      const high = Math.max(camera.position.y, pose.position[1], 20);
      timeline.to(camera.position, { y: high, duration: .25 }, 0)
        .to(camera.position, { x: pose.position[0], z: pose.position[2], duration: .6 }, .2)
        .to(camera.position, { y: pose.position[1], duration: .4 }, .75)
        .to(controls.target, { ...vec(pose.target), duration: 1.15 }, 0);
    }
  }
  return {
    get state() { return state; },
    get moving() { return timeline !== null; },
    travel,
    resetExterior() {
      if (state.phase !== 'exterior') return;
      timeline?.kill(); clock = 0;
      flushDrag();
      const pose = poseFor('exterior');
      timeline = gsap.timeline({ paused: true, defaults: { duration: .9, ease: 'power2.out' }, onComplete: settle });
      timeline.to(camera.position, vec(pose.position), 0).to(controls.target, vec(pose.target), 0);
    },
    cancelExteriorReset() { if (state.phase === 'exterior') { timeline?.kill(); timeline = null; } },
    skip: settle,
    step(delta: number) { if (timeline) { clock += delta; timeline.totalTime(clock); } },
    resize(isNarrow: boolean) { narrow = isNarrow; if (!timeline) applyPose(); },
    dispose() { timeline?.kill(); timeline = null; },
  };
}
