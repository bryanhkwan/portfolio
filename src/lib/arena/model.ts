import * as THREE from 'three';
import toledoRocketSvg from '../../assets/toledo-rocket.svg?raw';

/** An illustrative architectural reconstruction, not a surveyed arena model. */
export interface SavageArenaModel {
  group: THREE.Group;
  roof: THREE.Group;
  seating: THREE.Group;
  structure: THREE.Group;
  court: THREE.Group;
  tracking: THREE.Group;
  update: (seconds: number) => void;
}

type Point = [number, number, number];
type PlanPoint = [number, number];

const ICE = 0x96dded;
const CYAN = 0x5bb7d1;
const GOLD = 0xefbd50;

class Linework {
  private positions: number[] = [];

  line(a: Point, b: Point) {
    this.positions.push(...a, ...b);
  }

  path(points: Point[], closed = false) {
    for (let i = 1; i < points.length; i++) this.line(points[i - 1], points[i]);
    if (closed && points.length > 2) this.line(points[points.length - 1], points[0]);
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number) {
    const p: Point[] = [
      [x - w / 2, y - h / 2, z - d / 2], [x + w / 2, y - h / 2, z - d / 2],
      [x + w / 2, y - h / 2, z + d / 2], [x - w / 2, y - h / 2, z + d / 2],
      [x - w / 2, y + h / 2, z - d / 2], [x + w / 2, y + h / 2, z - d / 2],
      [x + w / 2, y + h / 2, z + d / 2], [x - w / 2, y + h / 2, z + d / 2],
    ];
    this.path(p.slice(0, 4), true);
    this.path(p.slice(4), true);
    for (let i = 0; i < 4; i++) this.line(p[i], p[i + 4]);
  }

  arc(x: number, y: number, z: number, r: number, start = 0, end = Math.PI * 2, segments = 72) {
    const points: Point[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = start + (end - start) * i / segments;
      points.push([x + Math.cos(angle) * r, y, z + Math.sin(angle) * r]);
    }
    this.path(points);
  }

  addTo(parent: THREE.Group, color: number, opacity: number, name: string) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = name;
    parent.add(lines);
    return lines;
  }
}

class Surfaces {
  private positions: number[] = [];

  quad(a: Point, b: Point, c: Point, d: Point) {
    this.positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number) {
    const [l, r, b, t, n, f] = [x - w / 2, x + w / 2, y - h / 2, y + h / 2, z - d / 2, z + d / 2];
    this.quad([l, b, n], [r, b, n], [r, t, n], [l, t, n]);
    this.quad([l, b, f], [r, b, f], [r, t, f], [l, t, f]);
    this.quad([l, b, n], [l, b, f], [l, t, f], [l, t, n]);
    this.quad([r, b, n], [r, b, f], [r, t, f], [r, t, n]);
    this.quad([l, t, n], [r, t, n], [r, t, f], [l, t, f]);
    this.quad([l, b, n], [r, b, n], [r, b, f], [l, b, f]);
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    return geometry;
  }

  addTo(parent: THREE.Group, color: number, opacity: number, name: string) {
    const mesh = new THREE.Mesh(this.geometry(), new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    }));
    mesh.name = name;
    parent.add(mesh);
    return mesh;
  }
}

function bowlRing(offset: number): PlanPoint[] {
  const x = 17 + offset;
  const z = 9.8 + offset;
  const cut = 2.1 + offset * 0.19;
  return [[-x + cut, -z], [x - cut, -z], [x, -z + cut], [x, z - cut],
    [x - cut, z], [-x + cut, z], [-x, z - cut], [-x, -z + cut]];
}

function ringLines(lines: Linework, ring: PlanPoint[], y: number) {
  lines.path(ring.map(([x, z]) => [x, y, z]), true);
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The arena requires a 2D canvas context.');
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function buildSeating(parent: THREE.Group) {
  const terrace = new Surfaces();
  const edges = new Linework();
  const aisles = new Linework();
  const seatEdges = new Linework();
  const seats: { x: number; y: number; z: number; angle: number; gold: boolean }[] = [];

  for (let row = 0; row < 18; row++) {
    const upper = row >= 9;
    const offset = row * 0.56 + (upper ? 1.02 : 0);
    const height = 0.64 + row * 0.435 + (upper ? 0.32 : 0);
    const inner = bowlRing(offset);
    const outer = bowlRing(offset + 0.56);
    ringLines(edges, inner, height);
    ringLines(edges, outer, height);

    for (let side = 0; side < 8; side++) {
      const a = inner[side], b = inner[(side + 1) % 8];
      const c = outer[(side + 1) % 8], d = outer[side];
      terrace.quad([a[0], height, a[1]], [b[0], height, b[1]], [c[0], height, c[1]], [d[0], height, d[1]]);
      terrace.quad([a[0], height - 0.435, a[1]], [b[0], height - 0.435, b[1]], [b[0], height, b[1]], [a[0], height, a[1]]);
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const length = Math.hypot(dx, dz);
      const tx = dx / length, tz = dz / length;
      const nx = -tz, nz = tx;
      const count = Math.floor(length / 0.47);
      const aisleEvery = side % 2 === 0 ? Math.max(1, Math.round(count / (side === 0 || side === 4 ? 5 : 3))) : count + 1;
      for (let index = 1; index < count; index++) {
        const along = index * length / count;
        const x = a[0] + tx * along - nx * 0.3;
        const z = a[1] + tz * along - nz * 0.3;
        if (index % aisleEvery < 2 || index > count - 2) {
          aisles.line([x + nx * 0.26, height + 0.01, z + nz * 0.26], [x - nx * 0.26, height + 0.01, z - nz * 0.26]);
          continue;
        }
        const gold = upper && side === 0 && (Math.floor(index / 7) + Math.floor((row - 9) / 3)) % 4 === 1;
        seats.push({ x, y: height, z, angle: Math.atan2(nx, nz), gold });
        const l: Point = [x - tx * 0.175 - nx * 0.13, height + 0.51, z - tz * 0.175 - nz * 0.13];
        const r: Point = [x + tx * 0.175 - nx * 0.13, height + 0.51, z + tz * 0.175 - nz * 0.13];
        seatEdges.line(l, r);
        seatEdges.line(l, [l[0], height + 0.23, l[2]]);
        seatEdges.line(r, [r[0], height + 0.23, r[2]]);
      }
      edges.line([a[0], height, a[1]], [d[0], height, d[1]]);
    }
  }

  // Continuous concourse between the lower and upper seating decks.
  const concourseInner = bowlRing(9 * 0.56);
  const concourseOuter = bowlRing(9 * 0.56 + 1.02);
  for (let side = 0; side < 8; side++) {
    const a = concourseInner[side], b = concourseInner[(side + 1) % 8];
    const c = concourseOuter[(side + 1) % 8], d = concourseOuter[side];
    terrace.quad([a[0], 4.32, a[1]], [b[0], 4.32, b[1]], [c[0], 4.32, c[1]], [d[0], 4.32, d[1]]);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t < length; t += 2.3) {
      const x = a[0] + (b[0] - a[0]) * t / length;
      const z = a[1] + (b[1] - a[1]) * t / length;
      aisles.line([x, 4.32, z], [x, 5.12, z]);
    }
  }
  ringLines(aisles, concourseInner, 5.12);
  ringLines(aisles, bowlRing(10.99), 9.58);
  terrace.addTo(parent, 0x123a54, 0.2, 'Transparent terraced stands');
  edges.addTo(parent, CYAN, 0.28, 'Terrace edges');
  aisles.addTo(parent, ICE, 0.48, 'Aisles and concourse rails');
  seatEdges.addTo(parent, 0x7cb7cb, 0.2, 'Individual seat backs');

  const seatShape = new Surfaces();
  seatShape.box(0, 0.23, 0, 0.35, 0.075, 0.3);
  seatShape.box(0, 0.395, -0.135, 0.35, 0.28, 0.055);
  const mesh = new THREE.InstancedMesh(seatShape.geometry(), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.36, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
  }), seats.length);
  const transform = new THREE.Object3D();
  const blue = new THREE.Color(0x285b7d), gold = new THREE.Color(0x997f3c);
  seats.forEach((seat, index) => {
    transform.position.set(seat.x, seat.y, seat.z);
    transform.rotation.set(0, seat.angle, 0);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, seat.gold ? gold : blue);
  });
  mesh.name = 'Navy seating with Toledo gold upper sections';
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  parent.add(mesh);
}

function buildStructure(parent: THREE.Group) {
  const primary = new Linework();
  const secondary = new Linework();
  const slab = new Surfaces();
  const outer = bowlRing(11.8);
  ringLines(primary, outer, -0.35);
  ringLines(primary, outer, 0);
  ringLines(primary, outer, 9.2);
  ringLines(secondary, outer, 10.1);
  ringLines(primary, outer, 13.8);
  slab.box(0, -0.23, 0, 58.2, 0.35, 43.8);
  primary.box(0, -0.23, 0, 58.2, 0.35, 43.8);

  for (let side = 0; side < 8; side++) {
    const a = outer[side], b = outer[(side + 1) % 8];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bays = Math.max(1, Math.round(length / 4.6));
    for (let i = 0; i < bays; i++) {
      const x = a[0] + (b[0] - a[0]) * i / bays;
      const z = a[1] + (b[1] - a[1]) * i / bays;
      primary.box(x, 6.9, z, 0.2, 13.8, 0.2);
      secondary.box(x, 0.1, z, 0.7, 0.18, 0.7);
      const nx = a[0] + (b[0] - a[0]) * (i + 1) / bays;
      const nz = a[1] + (b[1] - a[1]) * (i + 1) / bays;
      // Sparse external framing retains an open, cutaway view into the bowl.
      if (side === 0 || side === 6) {
        secondary.line([x, 10.1, z], [nx, 13.8, nz]);
        secondary.line([x, 13.8, z], [nx, 10.1, nz]);
        secondary.line([x, 11.9, z], [nx, 11.9, nz]);
      }
      secondary.line([x * 0.78, 4.1, z * 0.76], [x, 8.7, z]);
    }
  }

  // Courtside circulation, scorer's table, and player benches.
  primary.box(0, 0.56, -8.72, 7.4, 0.96, 0.6);
  secondary.box(0, 0.52, -8.72, 7.8, 0.07, 0.85);
  for (const sign of [-1, 1]) {
    primary.box(sign * 9.2, 0.36, -8.72, 5.2, 0.14, 0.45);
    for (let seat = 0; seat < 8; seat++) secondary.box(sign * 9.2 - 2.25 + seat * 0.64, 0.65, -8.92, 0.48, 0.48, 0.07);
  }
  slab.addTo(parent, 0x133b56, 0.14, 'Arena foundation');
  primary.addTo(parent, CYAN, 0.4, 'Structural steel and circulation');
  secondary.addTo(parent, 0x8ad4e7, 0.22, 'Structural bracing');
}

function buildRoof(parent: THREE.Group) {
  const chords = new Linework();
  const braces = new Linework();
  const purlins = new Linework();
  const panels = new Surfaces();
  const roofY = (z: number) => 16.7 - Math.abs(z) * 0.074;

  for (let index = 0; index < 11; index++) {
    const x = -27 + index * 5.4;
    for (const width of [-0.12, 0.12]) {
      for (let bay = 0; bay < 10; bay++) {
        const z0 = -21 + bay * 4.2, z1 = z0 + 4.2;
        chords.line([x + width, 13.85, z0], [x + width, 13.85, z1]);
        chords.line([x + width, roofY(z0), z0], [x + width, roofY(z1), z1]);
        braces.line([x + width, 13.85, z0], [x + width, roofY(z0), z0]);
        braces.line([x + width, bay % 2 ? roofY(z0) : 13.85, z0], [x + width, bay % 2 ? 13.85 : roofY(z1), z1]);
      }
      braces.line([x + width, 13.85, 21], [x + width, roofY(21), 21]);
    }
    for (let z = -21; z <= 21; z += 4.2) braces.line([x - 0.12, 13.85, z], [x + 0.12, 13.85, z]);
  }
  for (let z = -21; z <= 21; z += 2.1) purlins.line([-28.8, roofY(z), z], [28.8, roofY(z), z]);
  for (const x of [-27, -16.2, 5.4, 16.2]) {
    for (let z = -21; z < 21; z += 8.4) {
      purlins.line([x, roofY(z), z], [x + 5.4, roofY(z + 8.4), z + 8.4]);
      purlins.line([x + 5.4, roofY(z), z], [x, roofY(z + 8.4), z + 8.4]);
    }
  }
  // Only a narrow translucent roof strip: the interior remains readable.
  panels.quad([-28.8, roofY(-21), -21], [28.8, roofY(-21), -21], [28.8, roofY(-17), -17], [-28.8, roofY(-17), -17]);
  // Arena light bars are geometry, avoiding the expense of many scene lights.
  const lights = new Linework();
  for (const x of [-18, -9, 9, 18]) {
    for (const z of [-7.6, 7.6]) {
      braces.line([x, roofY(z), z], [x, 12.92, z]);
      lights.line([x - 1.15, 12.9, z], [x + 1.15, 12.9, z]);
    }
  }
  chords.addTo(parent, ICE, 0.38, 'Repeating steel roof trusses');
  braces.addTo(parent, CYAN, 0.25, 'Roof web members');
  purlins.addTo(parent, 0x79bed3, 0.13, 'Roof purlins and cross bracing');
  panels.addTo(parent, 0x337c98, 0.055, 'Cutaway roof plane');
  lights.addTo(parent, 0xd9f6ff, 0.83, 'Overhead light bars');

  const scoreboardFrame = new Linework();
  scoreboardFrame.box(0, 11.85, 0, 6.1, 3.45, 4.35);
  scoreboardFrame.box(0, 10.06, 0, 6.35, 0.14, 4.6);
  scoreboardFrame.box(0, 13.65, 0, 6.35, 0.14, 4.6);
  for (const x of [-2.4, 2.4]) {
    for (const z of [-1.55, 1.55]) scoreboardFrame.line([x, 13.65, z], [x, 16.55, z]);
  }
  scoreboardFrame.addTo(parent, ICE, 0.69, 'Suspended scoreboard and rigging');
  const screenTexture = canvasTexture(1024, 512, (ctx) => {
    ctx.fillStyle = '#071a29'; ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = '#dbad46'; ctx.fillRect(0, 0, 1024, 8);
    ctx.fillStyle = '#7197a6'; ctx.font = '500 28px Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('UNIVERSITY OF TOLEDO', 512, 77);
    ctx.fillStyle = '#f0c45c'; ctx.font = 'italic 900 144px Arial, sans-serif'; ctx.fillText('TOLEDO', 501, 264);
    ctx.strokeStyle = '#52758c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(90, 317); ctx.lineTo(934, 317); ctx.stroke();
    ctx.fillStyle = '#b6d6e2'; ctx.font = '600 44px Arial, sans-serif'; ctx.fillText('SAVAGE ARENA', 512, 395);
    ctx.fillStyle = '#648496'; ctx.font = '500 20px Arial, sans-serif'; ctx.fillText('HOME OF THE ROCKETS', 512, 455);
  });
  const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, transparent: true, opacity: 0.89, side: THREE.DoubleSide, toneMapped: false });
  const longScreen = new THREE.PlaneGeometry(5.86, 3.11);
  const shortScreen = new THREE.PlaneGeometry(4.1, 3.11);
  for (const sign of [-1, 1]) {
    const screen = new THREE.Mesh(longScreen, screenMaterial);
    screen.position.set(0, 11.87, sign * 2.18);
    screen.rotation.y = sign === 1 ? 0 : Math.PI;
    parent.add(screen);
    const end = new THREE.Mesh(shortScreen, screenMaterial);
    end.position.set(sign * 3.06, 11.87, 0);
    end.rotation.y = sign * Math.PI / 2;
    parent.add(end);
  }
}

function buildCourt(parent: THREE.Group) {
  const floor = new Surfaces();
  const markings = new Linework();
  const detail = new Linework();
  const baskets = new Linework();
  const rims = new Linework();
  const y = 0.035, halfLength = 14.325, halfWidth = 7.62;
  floor.quad([-halfLength, 0, -halfWidth], [halfLength, 0, -halfWidth], [halfLength, 0, halfWidth], [-halfLength, 0, halfWidth]);
  floor.addTo(parent, 0x6d551f, 0.2, 'Toledo gold court');
  markings.path([[-halfLength, y, -halfWidth], [halfLength, y, -halfWidth], [halfLength, y, halfWidth], [-halfLength, y, halfWidth]], true);
  markings.line([0, y, -halfWidth], [0, y, halfWidth]);
  markings.arc(0, y, 0, 1.83);
  detail.arc(0, y, 0, 2.02);
  detail.path([[-15.05, y, -8.25], [15.05, y, -8.25], [15.05, y, 8.25], [-15.05, y, 8.25]], true);
  // Subtle individual hardwood strips are visible only at close range.
  for (let z = -7.4; z < 7.6; z += 0.38) detail.line([-halfLength, 0.008, z], [halfLength, 0.008, z]);

  for (const sign of [-1, 1]) {
    const basketX = sign * 12.75;
    const freeX = sign * 8.535;
    markings.path([[sign * halfLength, y, -1.83], [freeX, y, -1.83], [freeX, y, 1.83], [sign * halfLength, y, 1.83]]);
    markings.arc(freeX, y, 0, 1.83, sign === 1 ? Math.PI / 2 : -Math.PI / 2, sign === 1 ? Math.PI * 1.5 : Math.PI / 2);
    for (let i = 0; i < 9; i++) {
      const start = -Math.PI / 2 + i * Math.PI / 9;
      detail.arc(freeX, y, 0, 1.83, start + (sign === -1 ? Math.PI : 0), start + 0.16 + (sign === -1 ? Math.PI : 0), 5);
    }
    const radius = 6.75, cornerWidth = 6.6;
    const theta = Math.asin(cornerWidth / radius);
    const join = basketX - sign * Math.cos(theta) * radius;
    markings.line([sign * halfLength, y, cornerWidth], [join, y, cornerWidth]);
    markings.line([sign * halfLength, y, -cornerWidth], [join, y, -cornerWidth]);
    markings.arc(basketX, y, 0, radius, sign === 1 ? Math.PI - theta : -theta, sign === 1 ? Math.PI + theta : theta);
    markings.arc(basketX, y, 0, 1.22, sign === 1 ? Math.PI / 2 : -Math.PI / 2, sign === 1 ? Math.PI * 1.5 : Math.PI / 2);
    for (const z of [-1.83, 1.83]) {
      for (const x of [10.05, 11, 11.85, 12.8]) markings.line([sign * x, y, z], [sign * x, y, z + Math.sign(z) * 0.25]);
    }

    // Freestanding basket supports, regulation-height rims, and glass boards.
    baskets.box(sign * 15.5, 0.32, 0, 1.65, 0.62, 1.0);
    baskets.path([[sign * 15.85, 0.55, -0.32], [sign * 15.55, 2.15, -0.32], [sign * 13.02, 3.5, -0.32]]);
    baskets.path([[sign * 15.85, 0.55, 0.32], [sign * 15.55, 2.15, 0.32], [sign * 13.02, 3.5, 0.32]]);
    baskets.line([sign * 15.85, 0.55, 0], [sign * 13.02, 3.5, 0]);
    baskets.box(sign * 13.17, 3.6, 0, 0.055, 1.05, 1.8);
    baskets.path([[sign * 13.13, 3.13, -0.295], [sign * 13.13, 3.57, -0.295], [sign * 13.13, 3.57, 0.295], [sign * 13.13, 3.13, 0.295]], true);
    rims.arc(basketX, 3.05, 0, 0.2286, 0, Math.PI * 2, 40);
    rims.line([sign * 13.13, 3.05, 0], [basketX, 3.05, 0]);
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * Math.PI * 2;
      baskets.line([basketX + Math.cos(angle) * 0.2286, 3.04, Math.sin(angle) * 0.2286], [basketX + Math.cos(angle + 0.25) * 0.15, 2.63, Math.sin(angle + 0.25) * 0.15]);
    }
    baskets.arc(basketX, 2.64, 0, 0.15, 0, Math.PI * 2, 24);
    const glass = new Surfaces();
    glass.quad([sign * 13.17, 3.075, -0.9], [sign * 13.17, 4.125, -0.9], [sign * 13.17, 4.125, 0.9], [sign * 13.17, 3.075, 0.9]);
    glass.addTo(parent, 0x9cdded, 0.1, 'Transparent backboard');
  }
  detail.addTo(parent, GOLD, 0.14, 'Court surround and hardwood detail');
  markings.addTo(parent, GOLD, 0.91, 'Basketball court markings');
  baskets.addTo(parent, ICE, 0.74, 'Basketball goals');
  rims.addTo(parent, 0xf7c76c, 1, 'Regulation height rims');

  const labels = canvasTexture(2048, 1280, (ctx) => {
    const px = (x: number) => (x / 34 + 0.5) * 2048;
    const pz = (z: number) => (z / 21.25 + 0.5) * 1280;
    // Preserve the official vector artwork and proportions at 8.4 metres wide.
    // Drawing it synchronously also keeps the first rendered frame complete.
    const rocket = new DOMParser().parseFromString(toledoRocketSvg, 'image/svg+xml');
    const rocketScale = (2048 / 34) * 8.4 / 78;
    ctx.save();
    ctx.translate(px(0), pz(0));
    ctx.scale(rocketScale, rocketScale);
    ctx.translate(-39, -15);
    for (const path of rocket.querySelectorAll('path')) {
      ctx.fillStyle = path.getAttribute('fill') ?? '#FFCD00';
      ctx.fill(new Path2D(path.getAttribute('d') ?? ''), path.getAttribute('fill-rule') === 'evenodd' ? 'evenodd' : 'nonzero');
    }
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e6b957';
    ctx.font = '700 39px Arial, sans-serif';
    ctx.fillText('S A V A G E   A R E N A', px(0), pz(7.99));
    ctx.fillStyle = '#b2cdd0'; ctx.font = '600 25px Arial, sans-serif';
    ctx.fillText('U N I V E R S I T Y   O F   T O L E D O', px(0), pz(-8.03));
    for (const sign of [-1, 1]) {
      ctx.save(); ctx.translate(px(sign * 14.73), pz(0)); ctx.rotate(sign * Math.PI / 2);
      ctx.fillStyle = '#edbc4f'; ctx.font = '900 40px Arial, sans-serif'; ctx.fillText('T O L E D O', 0, 0); ctx.restore();
    }
  });
  const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(34, 21.25), new THREE.MeshBasicMaterial({
    map: labels, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
  labelMesh.rotation.x = -Math.PI / 2;
  labelMesh.position.y = 0.048;
  labelMesh.name = 'Official Toledo rocket and court lettering';
  parent.add(labelMesh);
}

function buildTracking(parent: THREE.Group) {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-9.4, 0.14, 4.8), new THREE.Vector3(-5.7, 0.14, 3.9),
    new THREE.Vector3(-2.3, 0.14, 1.15), new THREE.Vector3(3.4, 0.14, 2.2),
    new THREE.Vector3(7.8, 0.14, -0.75), new THREE.Vector3(10.4, 0.14, -2.7),
  ]);
  const pathGeometry = new THREE.BufferGeometry().setFromPoints(path.getPoints(120));
  const pathLine = new THREE.Line(pathGeometry, new THREE.LineDashedMaterial({
    color: GOLD, transparent: true, opacity: 0.67, dashSize: 0.3, gapSize: 0.2, depthWrite: false, toneMapped: false,
  }));
  pathLine.computeLineDistances();
  pathLine.name = 'Illustrative player movement';
  parent.add(pathLine);

  const positions: PlanPoint[] = [[-8, -3.9], [-4.1, -5.4], [-1.2, 4.4], [4.9, -4.1], [9.7, 1.7],
    [-6.3, -2.4], [-1.8, -4.2], [1.3, 3.35], [6.7, -2.7], [10.9, 0.1]];
  const playerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false });
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.16, 0.4, 3, 6), playerMaterial, 10);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 6), playerMaterial, 10);
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(0.38, 0.015, 3, 24), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.61, depthWrite: false, toneMapped: false,
  }), 10);
  bodies.name = 'Illustrative players'; heads.name = 'Player heads'; rings.name = 'Player tracking rings';
  const transform = new THREE.Object3D();
  const gold = new THREE.Color(GOLD), ice = new THREE.Color(0xa8e2f2);
  for (let i = 0; i < 10; i++) {
    const color = i < 5 ? gold : ice;
    bodies.setColorAt(i, color); heads.setColorAt(i, color); rings.setColorAt(i, color);
  }
  parent.add(bodies, heads, rings);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd36b, toneMapped: false }));
  ball.name = 'Illustrative basketball';
  parent.add(ball);
  const location = new THREE.Vector3();

  return (seconds: number) => {
    for (let i = 0; i < positions.length; i++) {
      const x = positions[i][0] + Math.sin(seconds * 0.45 + i * 2.2) * 0.32;
      const z = positions[i][1] + Math.cos(seconds * 0.38 + i * 1.7) * 0.27;
      transform.rotation.set(0, 0, 0);
      transform.position.set(x, 0.7, z); transform.updateMatrix(); bodies.setMatrixAt(i, transform.matrix);
      transform.position.y = 1.19; transform.updateMatrix(); heads.setMatrixAt(i, transform.matrix);
      transform.rotation.x = Math.PI / 2; transform.position.y = 0.12; transform.updateMatrix(); rings.setMatrixAt(i, transform.matrix);
    }
    bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true; rings.instanceMatrix.needsUpdate = true;
    path.getPointAt((seconds * 0.045) % 1, location);
    ball.position.copy(location);
    ball.position.y = 0.34 + Math.abs(Math.sin(seconds * 4.5)) * 0.72;
  };
}

export function buildSavageArena(): SavageArenaModel {
  const group = new THREE.Group();
  group.name = 'Savage Arena — architectural study';
  const roof = new THREE.Group(); roof.name = 'Roof and scoreboard';
  const seating = new THREE.Group(); seating.name = 'Seating bowl';
  const structure = new THREE.Group(); structure.name = 'Arena structure';
  const court = new THREE.Group(); court.name = 'Toledo basketball court';
  const tracking = new THREE.Group(); tracking.name = 'Illustrative tracking overlay';
  group.add(structure, seating, court, roof, tracking);
  buildStructure(structure);
  buildSeating(seating);
  buildCourt(court);
  buildRoof(roof);
  const update = buildTracking(tracking);
  update(0);
  return { group, roof, seating, structure, court, tracking, update };
}
