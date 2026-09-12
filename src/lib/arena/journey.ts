import * as THREE from 'three';
import gsap from 'gsap';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SavageArenaModel } from './model';
import { destinationScreens } from './destinations';
import type { ArenaDestination, ChapterId, JourneyState } from '../../data/arena-chapters';

type Point = [number, number, number];
type Pose = { position: Point; target: Point };
const entrances: Record<ChapterId, Point[]> = {
  experience: [[12,20,14],[0,11.85,12]],
  projects: [[13,12,14],[0,4.5,10]],
  research: [[35,20,-22],[0,8.6,-22],[0,8.6,-29]],
  about: [[-35,23,22],[-39,8,13],[-39,8,7]],
  contact: [[38,12,24],[38,6,20]],
};

/** One renderer-driven timeline owns the camera from departure through screen docking. */
export function createArenaJourney(camera: THREE.PerspectiveCamera, controls: OrbitControls, model: SavageArenaModel,
  changed: (state: JourneyState) => void) {
  let state: JourneyState = { destination: 'exterior', phase: 'exterior' };
  let timeline: gsap.core.Timeline | null = null;
  let clock = 0, width = 1440, height = 800;
  let narrow = false;
  const appearance = { interior: 0 };
  const vec = (point: Point) => ({ x: point[0], y: point[1], z: point[2] });
  function poseFor(destination: ArenaDestination): Pose {
    if (destination === 'exterior') return narrow ? { position:[87,59,94.5], target:[0,5,0] } : { position:[53,38,58], target:[0,5,0] };
    if (destination === 'overview') return narrow ? { position:[63,51,75], target:[2,5,0] } : { position:[46,40,59], target:[2,5,0] };
    const screen = destinationScreens[destination];
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // Fill the viewport with the physical face. In portrait/short views its surround
    // is cropped; the visible rectangle supports readable, responsive HTML.
    const distance = Math.min(screen.width / (2 * tangent * (width / height) * .88), screen.height / (2 * tangent * .88));
    return { position:[screen.center[0],screen.center[1],screen.center[2] + Math.max(1.5,distance)], target:[...screen.center] };
  }
  function flushDrag() {
    const damping = controls.enableDamping, min = controls.minPolarAngle, max = controls.maxPolarAngle;
    controls.enableDamping = false; controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI;
    controls.update(); controls.enableDamping = damping; controls.minPolarAngle = min; controls.maxPolarAngle = max;
  }
  function applyPose() {
    flushDrag(); const pose = poseFor(state.destination);
    camera.position.set(...pose.position); controls.target.set(...pose.target); camera.lookAt(controls.target);
  }
  function applyAppearance() { model.setInterior(appearance.interior); }
  function settle() {
    timeline?.kill(); timeline = null; applyPose(); model.group.rotation.y = 0;
    appearance.interior = state.destination === 'exterior' ? 0 : 1; applyAppearance();
    model.setDestination(state.destination);
    state = { ...state, phase: state.destination === 'exterior' ? 'exterior' : state.destination === 'overview' ? 'overview' : 'section' };
    changed(state);
  }
  function exitRoom(): Point[] {
    const {x,y,z} = camera.position;
    if (Math.abs(x)<8 && z < -24 && y < 13) return [[0,8.6,-22]];
    if (x > -48 && x < -30 && z < 10 && z > -12 && y < 13) return [[-39,8,13]];
    if (x > 28 && x < 48 && z > -4 && z < 20 && y < 12) return [[38,6,22]];
    // Move out from underneath the suspended board before ascending from court level.
    if (Math.abs(x)<5 && Math.abs(z)<7 && y<10) return [[0,4.5,12]];
    return [];
  }
  function travel(destination: ArenaDestination, immediate = false) {
    const wasExterior = state.phase === 'exterior';
    if (state.destination === destination && state.phase === 'section') { settle(); return; }
    timeline?.kill(); timeline = null; flushDrag();
    const exit = exitRoom();
    state = { destination, phase: destination === 'exterior' ? 'returning' : wasExterior ? 'entering' : 'travelling' };
    model.setDestination(destination === 'exterior' ? 'overview' : destination);
    if (immediate) { settle(); return; }
    changed(state); clock = 0;
    const pose = poseFor(destination);
    timeline = gsap.timeline({ paused:true, defaults:{ease:'power2.inOut'}, onComplete:settle });
    timeline.to(model.group.rotation, { y:Math.round(model.group.rotation.y/(Math.PI*2))*Math.PI*2, duration:.5 }, 0);
    // Keep the cutaway open throughout departure; the roof closes only on the exterior arrival.
    timeline.to(appearance, { interior:1, duration:.6, onUpdate:applyAppearance }, 0);
    let cursor = 0;
    function move(position:Point, target:Point, duration:number) {
      timeline!.to(camera.position, { ...vec(position), duration }, cursor)
        .to(controls.target, { ...vec(target), duration }, cursor);
      cursor += duration;
    }
    if (wasExterior) move([29,25,29], [0,4,0], .65);
    else for (const point of exit) move(point, [point[0],point[1],point[2]-8], .42);
    if (!wasExterior && !exit.length) {
      const raised:Point = [camera.position.x,Math.max(23,camera.position.y),camera.position.z];
      move(raised, [0,6,0], .35);
    }
    if (destination === 'overview') move(pose.position, pose.target, .75);
    else if (destination === 'exterior') {
      move([36,26,32], [0,5,0], .5); move(pose.position, pose.target, .7);
      timeline.to(appearance, {interior:0,duration:.7,onUpdate:applyAppearance}, cursor-.7);
    } else {
      move([36,23,24], [0,6,0], .35);
      for (const [index, point] of entrances[destination].entries()) {
        const target:Point = destination === 'research' && point[2] > -28 ? [0,8.6,-33] : pose.target;
        move(point, target, index === entrances[destination].length - 1 ? .65 : .42);
      }
      if (['research','about','contact'].includes(destination)) cursor += .28;
      move(pose.position, pose.target, .85);
    }
  }
  return {
    get state() { return state; }, get moving() { return timeline !== null; }, travel,
    resetExterior() {
      if (state.phase !== 'exterior') return;
      timeline?.kill(); clock=0; flushDrag(); const pose=poseFor('exterior');
      timeline=gsap.timeline({paused:true,defaults:{duration:.9,ease:'power2.out'},onComplete:settle});
      timeline.to(camera.position,vec(pose.position),0).to(controls.target,vec(pose.target),0);
    },
    cancelExteriorReset() { if (state.phase==='exterior') { timeline?.kill(); timeline=null; } },
    skip:settle,
    step(delta:number) { if (timeline) { clock+=delta; timeline.totalTime(clock); } },
    resize(nextWidth:number,nextHeight:number,isNarrow:boolean) {
      width=nextWidth; height=nextHeight; narrow=isNarrow;
      // Shell reflow and browser chrome changes must not skip an active journey.
      // Arrival resolves the final screen pose against the latest viewport size.
      if (!timeline) applyPose();
    },
    dispose() { timeline?.kill(); timeline=null; },
  };
}
