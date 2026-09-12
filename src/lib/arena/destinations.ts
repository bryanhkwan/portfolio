import * as THREE from 'three';
import type { ArenaDestination, ChapterId } from '../../data/arena-chapters';

/** Authored display faces in model coordinates. All faces lie in XY and face +Z. */
export interface DestinationScreen { center: [number, number, number]; width: number; height: number; }
export const destinationScreens: Record<ChapterId, DestinationScreen> = {
  experience: { center: [0, 11.85, 3.31], width: 6.5, height: 3.5 },
  projects: { center: [0, 2.8, -5.8], width: 9.6, height: 5.4 },
  research: { center: [0, 8.6, -40], width: 8.5, height: 4.8 },
  about: { center: [-39, 8, -8], width: 9.6, height: 5.4 },
  contact: { center: [38, 6, 2], width: 8.5, height: 4.8 },
};

type Point = [number, number, number];
const NAVY = 0x071827, WALL = 0x0c2538, ICE = 0x9eddeb, CYAN = 0x5ab8d2, GOLD = 0xe8bc56;

/** Batch the architectural solids and edges: detail does not require a draw call per object. */
class Architecture {
  private positions: number[] = [];
  private linePositions: number[] = [];
  box(x: number, y: number, z: number, w: number, h: number, d: number, outline = true) {
    const [l, r, b, t, n, f] = [x - w / 2, x + w / 2, y - h / 2, y + h / 2, z - d / 2, z + d / 2];
    const p: Point[] = [[l,b,n],[r,b,n],[r,b,f],[l,b,f],[l,t,n],[r,t,n],[r,t,f],[l,t,f]];
    for (const [a,c,e,g] of [[0,1,5,4],[3,2,6,7],[0,3,7,4],[1,2,6,5],[4,5,6,7],[0,1,2,3]]) {
      this.positions.push(...p[a], ...p[c], ...p[e], ...p[a], ...p[e], ...p[g]);
    }
    if (outline) for (const [a,c] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]) this.line(p[a],p[c]);
  }
  line(a: Point, b: Point) { this.linePositions.push(...a, ...b); }
  build(parent: THREE.Group, color: number, edgeColor: number, name: string, opacity = 1, edgeOpacity = .55) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, toneMapped: false, depthWrite: opacity >= 1 });
    if (this.positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
      const mesh = new THREE.Mesh(geometry, material); mesh.name = name; parent.add(mesh);
    }
    if (this.linePositions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.linePositions, 3));
      const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: edgeOpacity, depthWrite: false, toneMapped: false }));
      lines.name = `${name} — architectural edges`; parent.add(lines);
    }
    return material;
  }
}

function screenTexture(title: string, subtitle: string, width = 1536, height = 864) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Arena displays require a 2D canvas context.');
  const draw = (nextTitle: string) => {
    ctx.fillStyle = '#061521'; ctx.fillRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, height, width, 0);
    gradient.addColorStop(0, '#0b3044'); gradient.addColorStop(1, '#071523');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#1a3b4c'; ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.fillStyle = '#efc55d'; ctx.fillRect(0, 0, width, 8);
    ctx.textAlign = 'left'; ctx.fillStyle = '#a4d6e2'; ctx.font = `600 ${Math.round(height * .035)}px Arial, sans-serif`;
    ctx.fillText('BRYAN KWAN  /  HOME COURT', width * .075, height * .15);
    ctx.fillStyle = '#f3f2e8'; ctx.font = `800 ${Math.round(height * .125)}px Arial, sans-serif`;
    ctx.fillText(nextTitle.toUpperCase(), width * .075, height * .51, width * .85);
    ctx.strokeStyle = '#57828f'; ctx.beginPath(); ctx.moveTo(width * .075, height * .61); ctx.lineTo(width * .925, height * .61); ctx.stroke();
    ctx.fillStyle = '#e8bc56'; ctx.font = `600 ${Math.round(height * .04)}px Arial, sans-serif`;
    ctx.fillText(subtitle.toUpperCase(), width * .075, height * .74, width * .85);
    ctx.fillStyle = '#6e9cac'; ctx.font = `500 ${Math.round(height * .025)}px Arial, sans-serif`;
    ctx.fillText('UNIVERSITY OF TOLEDO  ·  SAVAGE ARENA', width * .075, height * .9);
  };
  draw(title);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return { texture, setTitle(nextTitle: string) { draw(nextTitle); texture.needsUpdate = true; } };
}

function display(parent: THREE.Group, screen: DestinationScreen, title: string, subtitle: string) {
  const [x, y, z] = screen.center;
  const { texture, setTitle } = screenTexture(title, subtitle);
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(screen.width, screen.height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  surface.name = `${title} — reading screen`; surface.position.set(x, y, z); parent.add(surface);
  const frame = new Architecture();
  const thickness = .105;
  frame.box(x, y, z - .13, screen.width + .28, screen.height + .28, .22, false);
  frame.box(x, y + screen.height / 2 + thickness / 2, z + .014, screen.width + .22, thickness, .16);
  frame.box(x, y - screen.height / 2 - thickness / 2, z + .014, screen.width + .22, thickness, .16);
  for (const sign of [-1, 1]) frame.box(x + sign * (screen.width / 2 + thickness / 2), y, z + .014, thickness, screen.height, .16);
  frame.build(parent, 0x142e3c, ICE, `${title} display casing`, 1, .7);
  const accent = new Architecture();
  accent.line([x - screen.width / 2, y - screen.height / 2 - .17, z + .06], [x + screen.width / 2, y - screen.height / 2 - .17, z + .06]);
  accent.build(parent, GOLD, GOLD, `${title} display status light`, 1, .92);
  return setTitle;
}

function sign(parent: THREE.Group, label: string, center: Point, width: number, height = .7) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.fillStyle = '#092334'; ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = '#e8bc56'; ctx.fillRect(0, 0, 10, 128);
  ctx.fillStyle = '#c4e5eb'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 50px Arial, sans-serif'; ctx.fillText(label.toUpperCase(), 512, 66, 930);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  mesh.position.set(...center); mesh.name = `${label} wayfinding sign`; parent.add(mesh);
}

function roundedSlab(width: number, depth: number, height: number, radius: number) {
  const shape = new THREE.Shape(), x = -width / 2, y = -depth / 2;
  shape.moveTo(x + radius, y); shape.lineTo(x + width - radius, y); shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + depth - radius); shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
  shape.lineTo(x + radius, y + depth); shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
  shape.lineTo(x, y + radius); shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 6 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** Four broad display faces with rounded crowns and a separate suspended rig. */
export function buildJumbotron(parent: THREE.Group) {
  const housing = new Architecture();
  housing.box(0, 11.85, 0, 6.58, 3.5, 6.58, false);
  housing.build(parent, NAVY, CYAN, 'Jumbotron core');
  const casingMaterial = new THREE.MeshBasicMaterial({ color: 0x193647, toneMapped: false });
  const trimGeometry = roundedSlab(7.22, 7.22, .22, .48);
  const trimEdgeGeometry = new THREE.EdgesGeometry(trimGeometry, 24);
  const trimEdgeMaterial = new THREE.LineBasicMaterial({ color: ICE, transparent: true, opacity: .82, toneMapped: false });
  for (const y of [9.87, 13.66]) {
    const trim = new THREE.Mesh(trimGeometry, casingMaterial); trim.position.y = y; trim.name = 'Rounded videoboard crown'; parent.add(trim);
    const edges = new THREE.LineSegments(trimEdgeGeometry, trimEdgeMaterial); edges.position.y = y; parent.add(edges);
  }
  const columns = new Architecture();
  for (const x of [-3.42, 3.42]) for (const z of [-3.42, 3.42]) columns.box(x, 11.87, z, .19, 3.61, .19);
  columns.build(parent, 0x234355, CYAN, 'Jumbotron corner spines', 1, .66);

  const rigging = new Architecture();
  rigging.box(0, 15.65, 0, 5.4, .12, 5.4);
  rigging.box(0, 16.15, 0, 5.4, .12, 5.4);
  for (const x of [-2.55, 2.55]) for (const z of [-2.55, 2.55]) {
    rigging.line([x, 13.88, z], [x * .65, 16.55, z * .65]);
    rigging.line([x, 15.65, z], [-x, 16.15, z]);
  }
  rigging.build(parent, 0x284b5e, ICE, 'Jumbotron suspension and cross bracing', 1, .65);

  const updates: ((title: string) => void)[] = [];
  for (let side = 0; side < 4; side++) {
    const face = new THREE.Group(); face.rotation.y = side * Math.PI / 2; face.name = `Videoboard face ${side + 1}`;
    parent.add(face);
    updates.push(display(face, destinationScreens.experience, 'Experience', 'Work on the board'));
    sign(face, 'HOME COURT  /  UNIVERSITY OF TOLEDO', [0, 9.7, 3.37], 6.7, .28);
  }
  const undercarriage = new THREE.Mesh(roundedSlab(6.25, 6.25, .15, .48), new THREE.MeshBasicMaterial({ color: 0x0a2030, toneMapped: false }));
  undercarriage.position.y = 9.4; undercarriage.name = 'Suspended videoboard undercarriage'; parent.add(undercarriage);
  return (title: string) => updates.forEach(update => update(title === 'Home Court' || title === 'HOME COURT' ? 'Experience' : title));
}

interface Room { group: THREE.Group; detail: THREE.Group; surfaces: THREE.MeshBasicMaterial[]; }
function room(parent: THREE.Group, name: string): Room {
  const group = new THREE.Group(); group.name = name;
  const detail = new THREE.Group(); detail.name = `${name} interior furnishings`; group.add(detail); parent.add(group);
  return { group, detail, surfaces: [] };
}
function buildFilmRoom(parent: THREE.Group) {
  const result = room(parent, 'Film room — illustrative Chapman interior');
  const shell = new Architecture(), accents = new Architecture(), furniture = new Architecture(), panels = new Architecture();
  shell.box(0, 4.86, -34.5, 17, .28, 13.6);
  shell.box(0, 8.5, -41, 17, 7, .22);
  for (const x of [-8.5, 8.5]) shell.box(x, 8.5, -34.5, .22, 7, 13);
  // Open 5m doorway on the camera axis, with a short open passage to the bowl.
  for (const x of [-5.55, 5.55]) shell.box(x, 8.5, -28, 6.1, 7, .22);
  shell.box(0, 11.35, -28, 5, 1.3, .22);
  shell.box(0, 4.86, -26, 5.2, .28, 4);
  for (const x of [-2.6, 2.6]) shell.box(x, 7.8, -26, .16, 5.6, 4);
  for (const x of [-2.55, 2.55]) accents.box(x, 7.8, -27.87, .055, 5.6, .07);
  accents.box(0, 10.6, -27.87, 5.15, .055, .07);
  // Roof beams express a room without concealing the interior from the overview.
  for (const z of [-40.4, -36.4, -32.4, -28.4]) accents.box(0, 12, z, 17, .08, .08);
  for (const x of [-7.8, 7.8]) accents.line([x, 5.04, -40.4], [x, 5.04, -28.4]);
  for (const x of [-8.32, 8.32]) for (let z = -39; z <= -29; z += 1.15) panels.box(x, 8.65, z, .2, 3.9, .76);
  for (const x of [-6.3, 6.3]) panels.box(x, 8.9, -40.8, 2.6, 4.9, .18);

  // Review seats face the wall screen. The generous center aisle stays clear.
  for (const x of [-5.65, -3.9, 3.9, 5.65]) for (const z of [-31, -33.6, -36.2]) {
    furniture.box(x, 5.78, z, 1.23, .2, 1.05);
    furniture.box(x, 6.35, z + .52, 1.25, 1.22, .14);
    furniture.box(x, 5.37, z, .15, .65, .16);
    for (const side of [-1, 1]) furniture.box(x + side * .64, 6.05, z + .06, .1, .12, 1.02);
  }
  furniture.box(-5.85, 6.25, -38.9, 3.05, .14, 1.1);
  for (const x of [-7.1, -4.6]) furniture.box(x, 5.61, -38.9, .12, 1.22, .86);
  furniture.box(-5.85, 6.35, -38.78, .92, .06, .64);
  furniture.box(-5.85, 6.72, -39.1, .93, .68, .07);
  const laptop = new THREE.Mesh(new THREE.PlaneGeometry(.8, .51), new THREE.MeshBasicMaterial({ color: 0x45889d, toneMapped: false }));
  laptop.position.set(-5.85, 6.72, -39.055); laptop.name = 'Film-room review console'; result.detail.add(laptop);
  result.surfaces.push(shell.build(result.group, WALL, CYAN, 'Film-room walls and passage', .12, .42));
  accents.build(result.group, GOLD, GOLD, 'Film-room doorway and ceiling lights', 1, .7);
  panels.build(result.detail, 0x142f42, 0x426575, 'Acoustic wall panels', 1, .3);
  furniture.build(result.detail, 0x133349, CYAN, 'Film review seating and desk', 1, .48);
  display(result.group, destinationScreens.research, 'Research', 'The film room');
  sign(result.group, 'FILM ROOM  /  RESEARCH', [0, 11.33, -27.83], 5.5, .55);
  return result;
}

function buildGallery(parent: THREE.Group) {
  const result = room(parent, 'Concourse story wall — illustrative gallery');
  const shell = new Architecture(), frame = new Architecture(), furniture = new Architecture(), glass = new Architecture();
  shell.box(-39, 3.85, -.5, 16, .3, 17);
  shell.box(-39, 7.9, -8.6, 16, 7.8, .24);
  shell.box(-47, 7.9, -.5, .2, 7.8, 17);
  // The east wall is cut away to connect to the arena concourse.
  for (const z of [-7, 6.5]) shell.box(-31, 7.9, z, .2, 7.8, 3);
  for (const x of [-46.7, -31.3]) frame.box(x, 11.8, -.5, .12, .12, 17);
  for (const z of [-8.4, -.5, 7.7]) frame.box(-39, 11.8, z, 16, .12, .12);
  // Display cases flank the reading wall; no invented trophies or personal awards.
  for (const x of [-45.65, -32.35]) {
    furniture.box(x, 4.8, -7.55, 1.45, 1.6, .95);
    glass.box(x, 7.65, -7.57, 1.4, 4.1, .9);
    frame.box(x, 9.85, -7.57, 1.5, .09, 1);
    furniture.box(x, 7.75, -7.9, .95, 2.8, .04);
    frame.line([x - .5, 6.55, -7.84], [x + .5, 8.95, -7.84]);
  }
  for (const x of [-44.75, -33.25]) {
    furniture.box(x, 4.78, 3.1, 2.8, .19, 1);
    for (const side of [-1, 1]) furniture.box(x + side * .98, 4.35, 3.1, .13, .75, .78);
  }
  // Quiet concession detail at the gallery edge gives the concourse a human scale.
  furniture.box(-46.4, 5.15, 4.7, .85, 2.3, 4.1);
  frame.box(-46.35, 6.4, 4.7, 1, .14, 4.3);
  frame.line([-46.7, 4.03, 7.7], [-31.3, 4.03, 7.7]);
  result.surfaces.push(shell.build(result.group, WALL, CYAN, 'Concourse floor and gallery walls', .12, .4));
  frame.build(result.group, 0x244657, ICE, 'Gallery light rails and cases', 1, .6);
  furniture.build(result.detail, 0x183a50, CYAN, 'Story cases and concourse benches', 1, .4);
  glass.build(result.detail, 0x80c3d5, ICE, 'Concourse display glass', .09, .45);
  display(result.group, destinationScreens.about, 'About', 'Rooted in Toledo');
  sign(result.group, 'THE STORY WALL', [-39, 11.17, -8.41], 6.8, .51);
  return result;
}

function buildAtrium(parent: THREE.Group) {
  const result = room(parent, 'Sullivan-inspired atrium and welcome desk');
  const solid = new Architecture(), steel = new Architecture(), glass = new Architecture(), furniture = new Architecture();
  solid.box(38, 1.82, 8, 18, .36, 22);
  solid.box(38, 6.5, -3, 18, 9, .22);
  for (const x of [29, 47]) {
    for (const z of [-3, 2.5, 8, 13.5, 19]) steel.box(x, 6.5, z, .16, 9, .16);
    for (const y of [2, 6.5, 11]) steel.box(x, y, 8, .16, .16, 22);
    glass.box(x, 6.5, 8, .035, 8.75, 21.75);
  }
  for (const x of [29, 33.5, 42.5, 47]) steel.box(x, 6.5, 19, .16, 9, .16);
  // The entrance stays open down the middle for the authored arrival camera.
  for (const x of [31.25, 44.75]) glass.box(x, 6.5, 19, 4.2, 8.7, .035);
  steel.box(38, 10.9, 19, 18, .2, .2);
  for (const z of [-3, 2.5, 8, 13.5, 19]) steel.box(38, 11, z, 18, .16, .16);
  for (const x of [33.5, 38, 42.5]) steel.line([x, 11, -3], [x, 11, 19]);
  solid.box(38, 5.8, 1.7, 10.1, 7.1, .35);
  furniture.box(38, 2.72, 2.9, 11, 1.44, 1.1);
  furniture.box(38, 3.49, 2.9, 11.3, .13, 1.25);
  for (const x of [31.4, 44.6]) {
    furniture.box(x, 2.6, 7.2, 2.4, .19, 1.1);
    for (const dx of [-.8, .8]) furniture.box(x + dx, 2.3, 7.2, .12, .5, .8);
    // Geometric planters soften the architecture without organic texture assets.
    furniture.box(x, 2.58, .15, 1, 1.16, 1);
    steel.line([x, 3.16, .15], [x, 5.1, .15]);
    for (const sign of [-1, 1]) {
      steel.line([x, 3.6, .15], [x + sign * .65, 4.52, .15]);
      steel.line([x, 4.15, .15], [x + sign * .48, 5.05, .5]);
    }
  }
  result.surfaces.push(solid.build(result.group, WALL, CYAN, 'Atrium floor and welcome wall', .13, .4));
  steel.build(result.group, 0x254c60, ICE, 'Glass atrium mullions and canopy', 1, .5);
  glass.build(result.group, 0x7bbbd4, ICE, 'Atrium glazing', .055, .25);
  furniture.build(result.detail, 0x15384c, GOLD, 'Welcome desk and lobby furniture', 1, .42);
  display(result.group, destinationScreens.contact, 'Contact', 'Let\'s build the next chapter');
  sign(result.group, 'WELCOME TO HOME COURT', [38, 9.33, 1.91], 8, .65);
  return result;
}

function buildCourtDisplay(parent: THREE.Group) {
  const group = new THREE.Group(); group.name = 'Deployable center-court analysis screen'; parent.add(group);
  display(group, destinationScreens.projects, 'Projects', 'A different angle on the game');
  const base = new Architecture();
  for (const x of [-4.55, 4.55]) base.box(x, .085, -5.9, .48, .17, 1.2);
  base.box(0, .075, -5.9, 9.9, .15, .35);
  base.build(group, 0x1b3b4b, GOLD, 'Court analysis display supports', 1, .66);
  return group;
}

/** Additional rooms are artistic interpretations, not a surveyed Savage Arena floor plan. */
export function buildDestinationArchitecture(parent: THREE.Group) {
  const roomGroup = new THREE.Group(); roomGroup.name = 'Portfolio destination architecture'; parent.add(roomGroup);
  const rooms = { research: buildFilmRoom(roomGroup), about: buildGallery(roomGroup), contact: buildAtrium(roomGroup) };
  const courtDisplay = buildCourtDisplay(parent);
  const circulation = new Architecture();
  // Visible connecting walkways retain the sense of one coherent building.
  circulation.box(0, 4.84, -23, 5.2, .22, 2);
  circulation.box(-29.2, 3.85, 4.5, 3.6, .25, 5.2);
  circulation.box(28.6, 1.82, 13, 2, .3, 5.6);
  circulation.build(roomGroup, 0x173b50, CYAN, 'Concourse destination connections', .16, .3);
  return {
    setDestination(destination: ArenaDestination) {
      // The hero remains the recognizable bowl; the cutaway additions reveal on entry.
      roomGroup.visible = destination !== 'exterior';
      courtDisplay.visible = destination === 'projects';
      for (const [id, room] of Object.entries(rooms)) {
        const active = destination === id;
        room.detail.visible = active;
        for (const material of room.surfaces) {
          material.opacity = active ? 1 : .12;
          material.transparent = !active;
          material.depthWrite = active;
          material.needsUpdate = true;
        }
      }
    },
  };
}
