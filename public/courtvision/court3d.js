import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { timedTrajectory, createBallSampler } from "./replay-trajectory.js";
import { sourceProjectionAt, sourceGapDisplaySample, sourceClipMatrix, sourceCameraCenter, sourceFloorScreenRight } from "./replay-camera.js";
import { ANNOTATION_LIMITS, AnnotationHistory, annotationRibbonVertices, nearestAnnotationId, normalizeAnnotations, validAnnotationPoint } from "./replay-annotations.js";
import { orbitCameraPose } from "./replay-orbit.js";
import { captureRendererSnapshot } from "./replay-snapshot.js";
import { identityAbstentionVisible, identityIntervalBlocked } from "./replay-identity-barriers.js";
import { normalizeCoachingOptions, buildCoachingState } from "./replay-coaching.js";
import { normalizeReplayPredictionLabels } from "./replay-evidence.js";
import { preloadPlayerAvatar, createSkinnedPlayer, retargetSkinnedPlayer, avatarAssetStatus } from "./replay-avatar.js";
import { attachCourtPlinth } from "./replay-court-asset.js";

const sceneState = {
  container: null,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  courtGroup: null,
  courtConfig: null,
  courtSignature: null,
  activeHoopId: "left",
  currentView: "broadcast",
  dynamicGroup: null,
  playerGroup: null,
  annotationGroup: null,
  annotationStrokes: [],
  annotationHistory: new AnnotationHistory(),
  annotationMeshes: new Map(),
  annotationPreview: null,
  annotationInputCleanup: null,
  annotationEraseOriginal: null,
  annotationSequence: 0,
  activeAnnotation: null,
  annotationMode: "navigate",
  annotationColor: "#ffd200",
  annotationPointerId: null,
  annotationRaycaster: new THREE.Raycaster(),
  annotationPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.14),
  playerMarkers: new Map(),
  ball: null,
  selectedShot: null,
  replay: null,
  replayTimeS: null,
  ballLastPosition: null,
  ballTrailSegments: [],
  dribbleMarkers: [],
  shotProgressLine: null,
  fullTrajectoryVisible: true,
  showPlayers: true,
  animationStart: null,
  animationDurationMs: 0,
  animationFrame: null,
  resizeObserver: null,
  cameraTween: null,
  cameraPresetActive: true,
  sourceCameraSample: null,
  sourceCameraStatus: "inactive",
  sourceFilmAnchor: null,
  sourceCameraDisplayHeld: false,
  sourceOrbitAnchor: null,
  orbitCameraMode: "legacy_perspective",
  coachingOptions: normalizeCoachingOptions(),
  coachingState: null,
  coachingGroup: null,
  coachingGraphics: null,
  coachingInputCleanup: null,
  coachingLastNotifyMs: 0,
  coachingLastTimeS: null,
};

const COLORS = {
  background: 0x020916,
  floor: 0x03152f,
  floorEdge: 0x003e7e,
  line: 0x89b9d8,
  key: 0x67cce8,
  three: 0xffd200,
  rim: 0xffd200,
  made: 0x29a56b,
  miss: 0xd35555,
  selected: 0xffd200,
  ballObserved: 0xe86f22,
  ballInferred: 0xffbd43,
  ballTemporal: 0x38b9c8,
  ballHandlerPredicted: 0x7aa2ff,
  playerPredicted: 0x77d8ff,
  dribble: 0x38b9c8,
  playerCore: 0xc4e1ee,
  playerJersey: 0x063765,
  playerAccent: 0x78dcf5,
  playerShoe: 0xe1f1fb,
};
const COMET_FLOOR_COLOR = new THREE.Color(COLORS.floor);
let avatarLoadRequested = false;
const DEFAULT_COURT_WIDTH_FT = 50;
const HALF_COURT_LENGTH_FT = 47;
const FULL_COURT_LENGTH_FT = 94;
const DEFAULT_HOOP_X_FT = 25;
const DEFAULT_HOOP_OFFSET_FT = 5.25;
const DEFAULT_RIM_HEIGHT_FT = 10;
const DEFAULT_RIM_DIAMETER_FT = 1.5;
const RIM_TUBE_RADIUS_FT = 0.065;
const BACKBOARD_DEPTH_FT = 0.12;
const BACKBOARD_TARGET_FACE_OFFSET_FT = 0.005;
const BACKBOARD_TOP_HEIGHT_FT = 13;
const BACKBOARD_TARGET_BOTTOM_HEIGHT_FT = 10;
const BACKBOARD_TARGET_HEIGHT_FT = 1.5;

function finiteNumber(value, fallback) {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : fallback;
}

function courtDimensions(court = sceneState.courtConfig) {
  const scope = String(court?.scope || "active_half");
  const coordinateSpace = String(court?.coordinate_space || "active_half_court_50x47_ft");
  const explicitLength = finiteNumber(court?.length_ft, NaN);
  const fullCourt = scope === "full_court"
    || coordinateSpace === "global_full_court_50x94_ft"
    || explicitLength > HALF_COURT_LENGTH_FT + 0.5;
  return {
    width: finiteNumber(court?.width_ft, DEFAULT_COURT_WIDTH_FT),
    length: finiteNumber(
      court?.length_ft,
      fullCourt ? FULL_COURT_LENGTH_FT : HALF_COURT_LENGTH_FT,
    ),
    fullCourt,
    scope: fullCourt ? "full_court" : scope,
    coordinateSpace,
  };
}

function normalizedHoops(court, dimensions = courtDimensions(court)) {
  if (dimensions.fullCourt) {
    const supplied = Array.isArray(court?.hoops) ? court.hoops : [];
    const defaults = [
      { id: "left", x_ft: DEFAULT_HOOP_X_FT, y_ft: DEFAULT_HOOP_OFFSET_FT },
      { id: "right", x_ft: DEFAULT_HOOP_X_FT, y_ft: dimensions.length - DEFAULT_HOOP_OFFSET_FT },
    ];
    return defaults.map((fallback) => {
      const candidate = supplied.find((hoop) => hoop?.id === fallback.id) || fallback;
      return {
        id: fallback.id,
        x_ft: finiteNumber(candidate.x_ft, fallback.x_ft),
        y_ft: finiteNumber(candidate.y_ft, fallback.y_ft),
        z_ft: finiteNumber(candidate.z_ft, DEFAULT_RIM_HEIGHT_FT),
        inner_diameter_ft: finiteNumber(candidate.inner_diameter_ft, DEFAULT_RIM_DIAMETER_FT),
      };
    });
  }
  const candidate = court?.hoop || {};
  return [{
    id: String(candidate.id || court?.active_hoop_id || "left"),
    x_ft: finiteNumber(candidate.x_ft, DEFAULT_HOOP_X_FT),
    y_ft: finiteNumber(candidate.y_ft, DEFAULT_HOOP_OFFSET_FT),
    z_ft: finiteNumber(candidate.z_ft, DEFAULT_RIM_HEIGHT_FT),
    inner_diameter_ft: finiteNumber(candidate.inner_diameter_ft, DEFAULT_RIM_DIAMETER_FT),
  }];
}

function normalizedBackboard(court, hoop, dimensions = courtDimensions(court)) {
  const supplied = Array.isArray(court?.backboards)
    ? court.backboards.find((board) => board?.hoop_id === hoop.id)
    : court?.backboard;
  const baselineSide = hoop.id === "right" && dimensions.fullCourt ? "right" : "left";
  return {
    hoop_id: hoop.id,
    y_ft: finiteNumber(supplied?.y_ft, baselineSide === "right" ? dimensions.length - 4 : 4),
    width_ft: finiteNumber(supplied?.width_ft, 6),
    height_ft: finiteNumber(supplied?.height_ft, 3.5),
  };
}

function activeHoop(court = sceneState.courtConfig) {
  const dimensions = courtDimensions(court);
  const hoops = normalizedHoops(court, dimensions);
  const requested = String(sceneState.activeHoopId || court?.active_hoop_id || "left");
  return hoops.find((hoop) => hoop.id === requested) || hoops[0];
}

function worldPoint(point) {
  return new THREE.Vector3(
    Number(point.x_ft) - 25,
    Number(point.z_ft || 0),
    Number(point.y_ft),
  );
}

function line(points, color, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
  });
  return new THREE.Line(geometry, material);
}

// Static local light around regulation markings. The original line geometry
// remains authoritative; these narrow, floor-only strips are presentation.
// No render targets, clocks, animated uniforms, or changes to court coordinates.
function courtMarking(points, color, opacity = 1) {
  const core = line(points, color, opacity);
  core.name = "court-regulation-line";
  core.material.toneMapped = false;
  const positions = [];
  const edges = [];
  const halfWidth = 0.18;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    const nx = -dz / length * halfWidth;
    const nz = dx / length * halfWidth;
    for (const [point, side] of [[a, -1], [b, -1], [a, 1], [a, 1], [b, -1], [b, 1]]) {
      positions.push(point.x + nx * side, point.y - 0.004, point.z + nz * side);
      edges.push(side);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aEdge", new THREE.Float32BufferAttribute(edges, 1));
  const glow = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity * 0.22 } },
    vertexShader: "attribute float aEdge; varying float vEdge; void main() { vEdge = aEdge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vEdge;
      void main() {
        float soft = pow(max(0.0, 1.0 - abs(vEdge)), 2.4);
        gl_FragColor = vec4(uColor, soft * uOpacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  glow.name = "court-marking-static-glow";
  glow.userData.presentationOnly = true;
  core.add(glow);
  return core;
}

function floorPoint(x, y, elevation = 0.04) {
  return new THREE.Vector3(x - 25, elevation, y);
}

function arcPoints(centerX, centerY, radius, start, end, count = 72) {
  const points = [];
  for (let index = 0; index <= count; index += 1) {
    const angle = start + (end - start) * (index / count);
    points.push(floorPoint(
      centerX + radius * Math.cos(angle),
      centerY + radius * Math.sin(angle),
    ));
  }
  return points;
}

function addBasketAssembly(courtGroup, court, hoop, dimensions) {
  const board = normalizedBackboard(court, hoop, dimensions);
  // TorusGeometry's first radius is measured to the centre of the tube.  The
  // court contract supplies the clear *inner* rim diameter, so add the tube
  // radius here to preserve an actual 18-inch opening in the rendered model.
  const rimMajorRadius = hoop.inner_diameter_ft / 2 + RIM_TUBE_RADIUS_FT;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(rimMajorRadius, RIM_TUBE_RADIUS_FT, 12, 64),
    new THREE.MeshStandardMaterial({ color: COLORS.rim, emissive: COLORS.rim, emissiveIntensity: 0.24, roughness: 0.42, metalness: 0.18 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(hoop.x_ft - 25, hoop.z_ft, hoop.y_ft);
  rim.castShadow = true;
  courtGroup.add(rim);

  const backboard = new THREE.Mesh(
    new THREE.BoxGeometry(board.width_ft, board.height_ft, BACKBOARD_DEPTH_FT),
    new THREE.MeshPhysicalMaterial({
      color: 0x8abbd6,
      transparent: true,
      opacity: 0.30,
      roughness: 0.3,
      transmission: 0,
    }),
  );
  const hoopWorldX = hoop.x_ft - DEFAULT_HOOP_X_FT;
  const backboardCenterHeight = BACKBOARD_TOP_HEIGHT_FT - board.height_ft / 2;
  backboard.position.set(hoopWorldX, backboardCenterHeight, board.y_ft);
  backboard.castShadow = true;
  courtGroup.add(backboard);

  // Draw the target on the court-facing face rather than through the centre
  // plane of the translucent board. This avoids z-fighting and mirrors the
  // target correctly at the far basket.
  const courtFacingDirection = hoop.id === "right" && dimensions.fullCourt ? -1 : 1;
  const targetPlaneY = board.y_ft + courtFacingDirection * (
    BACKBOARD_DEPTH_FT / 2 + BACKBOARD_TARGET_FACE_OFFSET_FT
  );
  const targetTopHeight = (
    BACKBOARD_TARGET_BOTTOM_HEIGHT_FT + BACKBOARD_TARGET_HEIGHT_FT
  );
  const target = line([
    new THREE.Vector3(hoopWorldX - 1, BACKBOARD_TARGET_BOTTOM_HEIGHT_FT, targetPlaneY),
    new THREE.Vector3(hoopWorldX + 1, BACKBOARD_TARGET_BOTTOM_HEIGHT_FT, targetPlaneY),
    new THREE.Vector3(hoopWorldX + 1, targetTopHeight, targetPlaneY),
    new THREE.Vector3(hoopWorldX - 1, targetTopHeight, targetPlaneY),
    new THREE.Vector3(hoopWorldX - 1, BACKBOARD_TARGET_BOTTOM_HEIGHT_FT, targetPlaneY),
  ], COLORS.line);
  courtGroup.add(target);

  const netMaterial = new THREE.LineBasicMaterial({ color: 0xc3e2f4, transparent: true, opacity: 0.7 });
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const top = new THREE.Vector3(
      hoopWorldX + Math.cos(angle) * hoop.inner_diameter_ft / 2,
      hoop.z_ft - 0.05,
      hoop.y_ft + Math.sin(angle) * hoop.inner_diameter_ft / 2,
    );
    const bottom = new THREE.Vector3(
      hoopWorldX + Math.cos(angle) * 0.38,
      hoop.z_ft - 1.25,
      hoop.y_ft + Math.sin(angle) * 0.38,
    );
    const geometry = new THREE.BufferGeometry().setFromPoints([top, bottom]);
    courtGroup.add(new THREE.Line(geometry, netMaterial));
  }

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 10, 18),
    new THREE.MeshStandardMaterial({ color: COLORS.floorEdge, emissive: COLORS.floorEdge, emissiveIntensity: 0.1, roughness: 0.68 }),
  );
  const towardBaseline = hoop.id === "right" && dimensions.fullCourt ? 1 : -1;
  pole.position.set(hoop.x_ft - 25, 5, board.y_ft + towardBaseline * 1.4);
  pole.castShadow = true;
  courtGroup.add(pole);
}

function addHalfCourtMarkings(courtGroup, court, hoop, dimensions) {
  const right = hoop.id === "right" && dimensions.fullCourt;
  const baseline = right ? dimensions.length : 0;
  const direction = right ? -1 : 1;
  const key = court?.key || {};
  const keyX1 = finiteNumber(key.x1_ft, 19);
  const keyX2 = finiteNumber(key.x2_ft, 31);
  const keyDepth = finiteNumber(key.depth_ft, 19);
  const freeThrowY = baseline + direction * keyDepth;
  courtGroup.add(courtMarking([
    floorPoint(keyX1, baseline), floorPoint(keyX1, freeThrowY),
    floorPoint(keyX2, freeThrowY), floorPoint(keyX2, baseline),
  ], COLORS.key));
  courtGroup.add(courtMarking(
    arcPoints(DEFAULT_HOOP_X_FT, freeThrowY, 6, 0, Math.PI * 2),
    COLORS.key,
  ));
  courtGroup.add(courtMarking(
    arcPoints(
      hoop.x_ft,
      hoop.y_ft,
      4,
      right ? Math.PI : 0,
      right ? Math.PI * 2 : Math.PI,
    ),
    COLORS.key,
  ));

  const three = court?.three_point || {};
  const radius = finiteNumber(three.radius_ft, 22.145833);
  const cornerDistance = finiteNumber(three.corner_distance_ft, 21.65625);
  const breakDistance = finiteNumber(three.break_y_ft, 9.880848);
  const breakY = baseline + direction * breakDistance;
  const breakAngle = Math.asin(Math.min(1, Math.max(-1, cornerDistance / radius)));
  courtGroup.add(courtMarking([
    floorPoint(hoop.x_ft - cornerDistance, baseline),
    floorPoint(hoop.x_ft - cornerDistance, breakY),
  ], COLORS.three));
  const threeArc = [];
  for (let index = 0; index <= 120; index += 1) {
    const angle = -breakAngle + (2 * breakAngle * index) / 120;
    threeArc.push(floorPoint(
      hoop.x_ft + radius * Math.sin(angle),
      hoop.y_ft + direction * radius * Math.cos(angle),
    ));
  }
  courtGroup.add(courtMarking(threeArc, COLORS.three));
  courtGroup.add(courtMarking([
    floorPoint(hoop.x_ft + cornerDistance, breakY),
    floorPoint(hoop.x_ft + cornerDistance, baseline),
  ], COLORS.three));
}

function addCourt(scene, court) {
  const dimensions = courtDimensions(court);
  const courtGroup = new THREE.Group();
  courtGroup.name = "courtvision-court";
  courtGroup.userData.scope = dimensions.scope;
  courtGroup.userData.widthFt = dimensions.width;
  courtGroup.userData.lengthFt = dimensions.length;
  courtGroup.userData.presentationTheme = "constellation-coach-v1";
  courtGroup.userData.glowPolicy = "static-local-markings-no-postprocessing";
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(dimensions.width, 0.16, dimensions.length),
    // An unlit board keeps Midnight Blue consistent under every orbit angle;
    // player/hoop lighting remains physical and the foot rings show anchors.
    new THREE.MeshBasicMaterial({ color: COLORS.floor, toneMapped: false }),
  );
  floor.position.set(0, -0.08, dimensions.length / 2);
  floor.receiveShadow = true;
  courtGroup.add(floor);

  const boundary = [
    floorPoint(0, 0), floorPoint(dimensions.width, 0),
    floorPoint(dimensions.width, dimensions.length),
    floorPoint(0, dimensions.length), floorPoint(0, 0),
  ];
  courtGroup.add(courtMarking(boundary, COLORS.line));

  const hoops = normalizedHoops(court, dimensions);
  hoops.forEach((hoop) => {
    addHalfCourtMarkings(courtGroup, court, hoop, dimensions);
    addBasketAssembly(courtGroup, court, hoop, dimensions);
  });

  if (dimensions.fullCourt) {
    courtGroup.add(courtMarking([
      floorPoint(0, dimensions.length / 2),
      floorPoint(dimensions.width, dimensions.length / 2),
    ], COLORS.line));
    courtGroup.add(courtMarking(
      arcPoints(DEFAULT_HOOP_X_FT, dimensions.length / 2, 6, 0, Math.PI * 2),
      COLORS.line,
    ));
  } else {
    courtGroup.add(courtMarking([
      floorPoint(0, dimensions.length), floorPoint(dimensions.width, dimensions.length),
    ], COLORS.floorEdge));
  }

  scene.add(courtGroup);
  attachCourtPlinth(courtGroup, dimensions);
  return courtGroup;
}

function geometrySignature(court) {
  const dimensions = courtDimensions(court);
  return JSON.stringify({
    width_ft: dimensions.width,
    length_ft: dimensions.length,
    scope: dimensions.scope,
    coordinate_space: dimensions.coordinateSpace,
    hoops: normalizedHoops(court, dimensions),
    backboards: normalizedHoops(court, dimensions).map((hoop) => (
      normalizedBackboard(court, hoop, dimensions)
    )),
    key: court?.key || null,
    three_point: court?.three_point || null,
  });
}

function updateCourtContext(court) {
  if (!court) return;
  const previousHoopId = sceneState.activeHoopId;
  const dimensions = courtDimensions(court);
  sceneState.courtConfig = court;
  sceneState.activeHoopId = String(
    court.active_hoop_id
      || (dimensions.fullCourt ? previousHoopId : court?.hoop?.id)
      || "left",
  );
  const signature = geometrySignature(court);
  if (sceneState.scene && signature !== sceneState.courtSignature) {
    if (sceneState.courtGroup) {
      sceneState.scene.remove(sceneState.courtGroup);
      disposeObject(sceneState.courtGroup);
    }
    sceneState.courtGroup = addCourt(sceneState.scene, court);
    sceneState.courtSignature = signature;
  }
  if (sceneState.controls) {
    sceneState.controls.maxDistance = dimensions.fullCourt ? 155 : 105;
  }
  if (sceneState.renderer?.domElement) {
    const canvas = sceneState.renderer.domElement;
    canvas.dataset.courtScope = dimensions.scope;
    canvas.dataset.coordinateSpace = dimensions.coordinateSpace;
    canvas.dataset.courtWidthFt = String(dimensions.width);
    canvas.dataset.courtLengthFt = String(dimensions.length);
    canvas.dataset.activeHoop = sceneState.activeHoopId;
  }
  if (previousHoopId !== sceneState.activeHoopId && sceneState.camera) {
    setView(sceneState.currentView);
  }
}

function createScene(container, data) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);
  scene.fog = new THREE.Fog(COLORS.background, 150, 240);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 240);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.replaceChildren(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 18;
  controls.maxDistance = 155;
  controls.minPolarAngle = 0.025;
  controls.maxPolarAngle = Math.PI / 2.04;
  controls.addEventListener("start", () => {
    sceneState.cameraPresetActive = false;
    sceneState.cameraTween = null;
  });

  scene.add(new THREE.HemisphereLight(0xdcecff, 0x06162e, 1.35));
  const keyLight = new THREE.DirectionalLight(0xf2f7ff, 1.9);
  keyLight.position.set(-18, 38, 35);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -34;
  keyLight.shadow.camera.right = 34;
  keyLight.shadow.camera.top = 52;
  keyLight.shadow.camera.bottom = -12;
  scene.add(keyLight);
  const fill = new THREE.DirectionalLight(0x78c9f5, 0.8);
  fill.position.set(28, 16, 8);
  scene.add(fill);

  sceneState.container = container;
  sceneState.scene = scene;
  sceneState.camera = camera;
  sceneState.renderer = renderer;
  sceneState.controls = controls;
  updateCourtContext(data.court);
  setupAnnotationInput(renderer.domElement);
  setupCoachingInput(renderer.domElement);
  setView("broadcast");
  resize();

  if (sceneState.resizeObserver) sceneState.resizeObserver.disconnect();
  sceneState.resizeObserver = new ResizeObserver(resize);
  sceneState.resizeObserver.observe(container);
  if (!sceneState.animationFrame) animate();
}

function annotationPointFromPointer(event) {
  if (sceneState.sourceCameraDisplayHeld) return null;
  const canvas = sceneState.renderer?.domElement;
  if (!canvas || !sceneState.camera) return null;
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height || event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) return null;
  const pointer = new THREE.Vector2(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  if ((sceneState.currentView === "film" && sceneState.sourceCameraStatus === "source_aligned_2_5d_candidate")
    || sceneState.sourceOrbitAnchor) {
    const near = new THREE.Vector3(pointer.x, pointer.y, -1).unproject(sceneState.camera);
    const far = new THREE.Vector3(pointer.x, pointer.y, 1).unproject(sceneState.camera);
    sceneState.annotationRaycaster.ray.set(near, far.sub(near).normalize());
  } else {
    sceneState.annotationRaycaster.setFromCamera(pointer, sceneState.camera);
  }
  const point = new THREE.Vector3();
  if (!sceneState.annotationRaycaster.ray.intersectPlane(sceneState.annotationPlane, point)) return null;
  sceneState.scene?.worldToLocal(point);
  const floor = { x_ft: point.x + DEFAULT_HOOP_X_FT, y_ft: point.z };
  // A miss is a miss. Clamping an off-court ray would fabricate a sideline path.
  return validAnnotationPoint(floor, courtDimensions()) ? floor : null;
}

function annotationMesh(stroke) {
  const group = new THREE.Group();
  for (const [width, opacity, color] of [[0.7, 0.92, "#020916"], [0.34, 1, stroke.color]]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(annotationRibbonVertices(stroke, width), 3));
    const material = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthTest: true, depthWrite: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = width > 0.4 ? 4 : 5;
    group.add(mesh);
  }
  group.userData.annotationId = stroke.id;
  group.userData.annotationSignature = JSON.stringify(stroke);
  return group;
}

function ensureAnnotationGroup() {
  if (sceneState.annotationGroup || !sceneState.scene) return;
  sceneState.annotationGroup = new THREE.Group();
  sceneState.annotationGroup.renderOrder = 4;
  sceneState.scene.add(sceneState.annotationGroup);
}

function renderAnnotationPreview() {
  ensureAnnotationGroup();
  if (!sceneState.annotationGroup) return;
  const stroke = sceneState.activeAnnotation;
  const valid = stroke && normalizeAnnotations([stroke], courtDimensions()).length > 0;
  if (!valid) {
    if (sceneState.annotationPreview) sceneState.annotationPreview.visible = false;
    return;
  }
  if (!sceneState.annotationPreview) {
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array((ANNOTATION_LIMITS.pointsPerStroke + 4) * 18), 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positions);
    const material = new THREE.MeshBasicMaterial({ color: stroke.color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    sceneState.annotationPreview = new THREE.Mesh(geometry, material);
    sceneState.annotationPreview.frustumCulled = false;
    sceneState.annotationPreview.renderOrder = 6;
    sceneState.annotationGroup.add(sceneState.annotationPreview);
  }
  const preview = sceneState.annotationPreview;
  const vertices = annotationRibbonVertices(stroke);
  preview.geometry.attributes.position.array.set(vertices);
  preview.geometry.attributes.position.needsUpdate = true;
  preview.geometry.setDrawRange(0, vertices.length / 3);
  preview.material.color.set(stroke.color);
  preview.visible = true;
}

function renderAnnotations() {
  ensureAnnotationGroup();
  if (!sceneState.annotationGroup) return;
  const retained = new Set(sceneState.annotationStrokes.map((stroke) => stroke.id));
  sceneState.annotationMeshes.forEach((mesh, id) => {
    if (!retained.has(id)) {
      sceneState.annotationGroup.remove(mesh);
      disposeObject(mesh);
      sceneState.annotationMeshes.delete(id);
    }
  });
  for (const stroke of sceneState.annotationStrokes) {
    const existing = sceneState.annotationMeshes.get(stroke.id);
    if (existing?.userData.annotationSignature === JSON.stringify(stroke)) continue;
    if (existing) { sceneState.annotationGroup.remove(existing); disposeObject(existing); }
    const mesh = annotationMesh(stroke);
    sceneState.annotationMeshes.set(stroke.id, mesh);
    sceneState.annotationGroup.add(mesh);
  }
  renderAnnotationPreview();
}

function getAnnotations() {
  return sceneState.annotationHistory.snapshot().annotations;
}

function notifyAnnotationChange() {
  window.dispatchEvent(new CustomEvent("courtvision-annotation-change", {
    detail: sceneState.annotationHistory.snapshot(),
  }));
}

function syncAnnotationHistory() {
  sceneState.annotationStrokes = getAnnotations();
  renderAnnotations();
  notifyAnnotationChange();
}

function finishActiveAnnotation(commit = true) {
  const pointerId = sceneState.annotationPointerId;
  sceneState.annotationPointerId = null;
  const canvas = sceneState.renderer?.domElement;
  if (pointerId !== null && canvas?.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  let changed = false;
  if (sceneState.annotationEraseOriginal) {
    if (commit) changed = sceneState.annotationHistory.commit(sceneState.annotationStrokes);
  } else if (commit && sceneState.activeAnnotation) {
    const [stroke] = normalizeAnnotations([sceneState.activeAnnotation], courtDimensions());
    if (stroke) changed = sceneState.annotationHistory.commit([...sceneState.annotationHistory.strokes, stroke]);
  }
  sceneState.activeAnnotation = null;
  sceneState.annotationEraseOriginal = null;
  sceneState.annotationStrokes = getAnnotations();
  renderAnnotations();
  if (changed) notifyAnnotationChange();
}

function loadAnnotations(strokes = [], options = {}) {
  // Props echoed after a pointer edit must not clear redo or interrupt a gesture.
  const normalized = normalizeAnnotations(strokes, courtDimensions());
  const scopeKey = String(options?.scopeKey ?? sceneState.annotationHistory.scopeKey);
  if (scopeKey === sceneState.annotationHistory.scopeKey && JSON.stringify(normalized) === JSON.stringify(sceneState.annotationHistory.strokes)) return;
  finishActiveAnnotation(false);
  sceneState.annotationHistory.load(normalized, { scopeKey, dimensions: courtDimensions() });
  syncAnnotationHistory();
}

function undoAnnotation() {
  finishActiveAnnotation(false);
  if (sceneState.annotationHistory.undo()) syncAnnotationHistory();
}

function redoAnnotation() {
  finishActiveAnnotation(false);
  if (sceneState.annotationHistory.redo()) syncAnnotationHistory();
}

function clearAnnotations() {
  finishActiveAnnotation(false);
  if (sceneState.annotationHistory.commit([])) syncAnnotationHistory();
}

function eraseAnnotationAt(point) {
  const id = nearestAnnotationId(sceneState.annotationStrokes, point);
  if (!id) return;
  sceneState.annotationStrokes = sceneState.annotationStrokes.filter((stroke) => stroke.id !== id);
  renderAnnotations();
}

function appendAnnotationPoint(point) {
  const stroke = sceneState.activeAnnotation;
  if (!stroke || !point) return;
  if (stroke.kind !== "pen") {
    stroke.points = [stroke.points[0], point];
    return;
  }
  const previous = stroke.points.at(-1);
  const availablePoints = ANNOTATION_LIMITS.totalPoints - sceneState.annotationHistory.strokes.reduce((sum, item) => sum + item.points.length, 0);
  if (stroke.points.length >= Math.min(ANNOTATION_LIMITS.pointsPerStroke, availablePoints)
    || Math.hypot(point.x_ft - previous.x_ft, point.y_ft - previous.y_ft) < 0.10) return;
  stroke.points.push(point);
}

function setupAnnotationInput(canvas) {
  sceneState.annotationInputCleanup?.();
  const listeners = [];
  const listen = (name, handler) => { canvas.addEventListener(name, handler, true); listeners.push([name, handler]); };
  const consume = (event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  listen("pointerdown", (event) => {
    if (sceneState.annotationMode === "navigate") return;
    consume(event);
    if (event.button !== 0 || event.isPrimary === false || sceneState.annotationPointerId !== null) return;
    const point = annotationPointFromPointer(event);
    if (!point) return;
    const history = sceneState.annotationHistory;
    if (sceneState.annotationMode !== "erase" && (history.strokes.length >= ANNOTATION_LIMITS.strokes
      || history.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) >= ANNOTATION_LIMITS.totalPoints - 1)) return;
    window.dispatchEvent(new CustomEvent("courtvision-annotation-start", {
      detail: { scopeKey: history.scopeKey, mode: sceneState.annotationMode, time_s: sceneState.replayTimeS },
    }));
    sceneState.annotationPointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    if (sceneState.annotationMode === "erase") {
      sceneState.annotationEraseOriginal = getAnnotations();
      eraseAnnotationAt(point);
      return;
    }
    sceneState.activeAnnotation = {
      id: `annotation-${Date.now()}-${++sceneState.annotationSequence}`,
      kind: sceneState.annotationMode === "draw" ? "pen" : sceneState.annotationMode,
      color: sceneState.annotationColor,
      ...(Number.isFinite(sceneState.replayTimeS) ? { time_s: sceneState.replayTimeS } : {}),
      points: [point],
    };
  });
  listen("pointermove", (event) => {
    if (event.pointerId !== sceneState.annotationPointerId) return;
    consume(event);
    const events = sceneState.activeAnnotation?.kind === "pen" ? (event.getCoalescedEvents?.() || []) : [];
    for (const sample of (events.length ? events.slice(-32) : [event])) {
      const point = annotationPointFromPointer(sample);
      if (!point) continue;
      if (sceneState.annotationEraseOriginal) eraseAnnotationAt(point);
      else appendAnnotationPoint(point);
    }
    // Committed meshes stay resident while this single reusable buffer changes.
    renderAnnotationPreview();
  });
  listen("pointerup", (event) => {
    if (event.pointerId !== sceneState.annotationPointerId) return;
    consume(event);
    const point = annotationPointFromPointer(event);
    if (point) appendAnnotationPoint(point);
    finishActiveAnnotation(true);
  });
  for (const name of ["pointercancel", "lostpointercapture"]) listen(name, (event) => {
    if (event.pointerId !== sceneState.annotationPointerId) return;
    finishActiveAnnotation(false);
  });
  listen("contextmenu", (event) => { if (sceneState.annotationMode !== "navigate") consume(event); });
  sceneState.annotationInputCleanup = () => {
    finishActiveAnnotation(false);
    listeners.forEach(([name, handler]) => canvas.removeEventListener(name, handler, true));
  };
  setAnnotationMode(sceneState.annotationMode);
}

function setAnnotationMode(mode) {
  const supported = new Set(["navigate", "draw", "arrow", "circle", "erase"]);
  const nextMode = supported.has(mode) ? mode : "navigate";
  if (nextMode !== sceneState.annotationMode) finishActiveAnnotation(false);
  sceneState.annotationMode = nextMode;
  if (nextMode !== "navigate") {
    sceneState.cameraTween = null;
    if (sceneState.camera && sceneState.controls && sceneState.currentView !== "film") {
      synchronizeOrbitCamera(sceneState.camera.position.clone(), sceneState.controls.target.clone());
    }
  }
  if (sceneState.controls) sceneState.controls.enabled = nextMode === "navigate" && sceneState.currentView !== "film";
  const canvas = sceneState.renderer?.domElement;
  if (canvas) {
    canvas.dataset.annotationMode = nextMode;
    canvas.style.touchAction = nextMode === "navigate" && sceneState.currentView === "film" ? "pan-y" : "none";
    canvas.style.cursor = nextMode === "navigate" ? (sceneState.currentView === "film" ? "default" : "grab")
      : nextMode === "erase" ? "cell" : "crosshair";
  }
}

function setAnnotationColor(color) {
  if (/^#[0-9a-f]{6}$/i.test(String(color))) sceneState.annotationColor = String(color).toLowerCase();
}

function disposeObject(object) {
  const skeletons = new Set();
  object.traverse((child) => {
    if (child.isSkinnedMesh && child.skeleton) skeletons.add(child.skeleton);
    if (child.isInstancedMesh) child.dispose();
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
  skeletons.forEach(skeleton => skeleton.dispose());
}

const shotCurveCache = new WeakMap();
const postResultCurveCache = new WeakMap();

function shotCurve(shot) {
  if (!shotCurveCache.has(shot)) shotCurveCache.set(shot, sourceTimedCurve(shot.points));
  return shotCurveCache.get(shot);
}

function sourceTimedCurve(points) {
  const trajectory = timedTrajectory(points);
  const curve = new THREE.Curve();
  curve.getPoint = (fraction, target = new THREE.Vector3()) => {
    const point = trajectory?.at(trajectory.start + Math.max(0, Math.min(1, fraction)) * (trajectory.end - trajectory.start));
    return target.copy(worldPoint(point || points[0]));
  };
  return curve;
}

function postResultCurve(shot) {
  const points = shot?.post_result_points || [];
  if (points.length < 2) return null;
  if (!postResultCurveCache.has(shot)) postResultCurveCache.set(shot, sourceTimedCurve(points));
  return postResultCurveCache.get(shot);
}

function shotPositionAfterRelease(shot, elapsedS) {
  if (shot?.ball_trajectory_available === false || (shot?.points || []).length < 2) {
    return { position: null, phase: "trajectory_withheld" };
  }
  const flightDuration = Math.max(0.01, Number(shot?.flight_time_s || 1));
  if (elapsedS <= flightDuration) {
    return {
      position: shotCurve(shot).getPoint(Math.max(0, Math.min(1, elapsedS / flightDuration))),
      phase: "flight",
    };
  }
  const postCurve = postResultCurve(shot);
  if (!postCurve) {
    if (shot.after_flight_policy === "withhold_without_source_depth") {
      return { position: null, phase: "unobserved_after_flight" };
    }
    return { position: shotCurve(shot).getPoint(1), phase: "result_hold" };
  }
  const postDuration = Math.max(0.01, Number(shot.post_result_duration_s || 0.6));
  const postFraction = (elapsedS - flightDuration) / postDuration;
  return {
    position: postCurve.getPoint(Math.max(0, Math.min(1, postFraction))),
    phase: postFraction <= 1 ? "post_result" : "post_result_hold",
  };
}

function createBasketball() {
  const group = new THREE.Group();
  const surfaceMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.ballObserved,
    roughness: 0.78,
    metalness: 0.01,
    transparent: true,
    opacity: 1,
  });
  const surface = new THREE.Mesh(new THREE.SphereGeometry(0.39, 32, 24), surfaceMaterial);
  surface.castShadow = true;
  group.add(surface);
  const wireMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc27a,
    wireframe: true,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const wire = new THREE.Mesh(new THREE.SphereGeometry(0.398, 20, 14), wireMaterial);
  group.add(wire);
  const seamMaterial = new THREE.MeshStandardMaterial({
    color: 0x27231f,
    roughness: 0.9,
    transparent: true,
    opacity: 0.92,
  });
  [
    [0, 0, 0],
    [Math.PI / 2, 0, 0],
    [0, Math.PI / 2, 0],
  ].forEach((rotation) => {
    const seam = new THREE.Mesh(
      new THREE.TorusGeometry(0.392, 0.014, 7, 64),
      seamMaterial,
    );
    seam.rotation.set(...rotation);
    group.add(seam);
  });
  group.userData.surfaceMaterial = surfaceMaterial;
  group.userData.seamMaterial = seamMaterial;
  group.userData.wireMaterial = wireMaterial;
  return group;
}

function setBallEvidenceStyle(ball, provenance = "physics_shot_estimate", staleFade = 1) {
  if (!ball) return;
  const fade = Math.max(0.05, Math.min(1, Number(staleFade)));
  const inferred = provenance === "short_gap_interpolation"
    || provenance === "source_endpoint_interpolation"
    || provenance === "handler_forward_dribble_extrapolation";
  const sourceContext = provenance === "source_image_context_2_5d_candidate"
    || provenance === "source_endpoint_interpolation";
  const temporal = provenance === "temporal_model_candidate";
  const handlerPredicted = provenance === "handler_relative_physics_prediction"
    || provenance === "handler_forward_dribble_extrapolation";
  const surface = ball.userData.surfaceMaterial;
  const seams = ball.userData.seamMaterial;
  const wire = ball.userData.wireMaterial;
  if (surface) {
    surface.color.setHex(
      handlerPredicted ? COLORS.ballHandlerPredicted
        : temporal ? COLORS.ballTemporal
          : inferred ? COLORS.ballInferred : COLORS.ballObserved,
    );
    surface.opacity = (sourceContext ? 0.92 : handlerPredicted ? 0.5 : temporal ? 0.82 : inferred ? 0.58 : 1) * fade;
    surface.emissive.setHex(sourceContext ? 0x6b2608 : 0x000000);
    surface.emissiveIntensity = sourceContext ? .12 : 0;
    surface.transparent = true;
  }
  if (seams) {
    seams.opacity = (handlerPredicted ? 0.34 : temporal ? 0.68 : inferred ? 0.48 : 0.92) * fade;
    seams.transparent = true;
  }
  if (wire) {
    wire.color.setHex(handlerPredicted ? 0xc6d5ff : temporal ? 0x8eefff : 0xffc27a);
    wire.opacity = (handlerPredicted ? 0.56 : temporal ? 0.4 : inferred ? 0.34 : 0.22) * fade;
  }
}

function setFullTrajectoryVisibility(visible) {
  sceneState.fullTrajectoryVisible = Boolean(visible);
  sceneState.dynamicGroup?.traverse((object) => {
    if (object.userData?.futureTrajectory) object.visible = sceneState.fullTrajectoryVisible;
  });
}

function updateElapsedShotTrajectory(timeS) {
  const progress = sceneState.shotProgressLine;
  const replay = sceneState.replay;
  const shot = sceneState.selectedShot;
  if (!progress || !replay || !shot) return;
  if (shot.ball_trajectory_available === false || (shot.points || []).length < 2) {
    progress.visible = false;
    return;
  }
  const timeline = replay.timeline || {};
  const release = finiteNumber(timeline.release_s, NaN);
  const result = finiteNumber(timeline.result_s, NaN);
  if (!Number.isFinite(release) || !Number.isFinite(result) || timeS <= release) {
    progress.visible = false;
    return;
  }
  const flightCurve = shotCurve(shot);
  const flightFraction = Math.max(0, Math.min(1, (timeS - release) / Math.max(0.01, result - release)));
  const points = [];
  const flightSteps = Math.max(2, Math.ceil(48 * flightFraction));
  for (let index = 0; index <= flightSteps; index += 1) {
    points.push(flightCurve.getPoint((index / flightSteps) * flightFraction));
  }
  const postCurve = postResultCurve(shot);
  if (postCurve && timeS > result) {
    const postDuration = Math.max(0.01, finiteNumber(shot.post_result_duration_s, 0.6));
    const postFraction = Math.max(0, Math.min(1, (timeS - result) / postDuration));
    const postSteps = Math.max(2, Math.ceil(24 * postFraction));
    for (let index = 1; index <= postSteps; index += 1) {
      points.push(postCurve.getPoint((index / postSteps) * postFraction));
    }
  }
  progress.geometry.dispose();
  progress.geometry = new THREE.BufferGeometry().setFromPoints(points);
  progress.visible = points.length >= 2;
}

function updateElapsedBallEvidence(timeS) {
  const historyWindowS = 0.9;
  sceneState.ballTrailSegments.forEach(({ mesh, startS, endS }) => {
    mesh.visible = endS <= timeS + 0.001 && endS >= timeS - historyWindowS && startS <= timeS;
  });
  sceneState.dribbleMarkers.forEach(({ mesh, timeS: markerTime }) => {
    mesh.visible = Number.isFinite(markerTime)
      && markerTime <= timeS + 0.08
      && markerTime >= timeS - 0.42;
  });
  updateElapsedShotTrajectory(timeS);
}

function drawShots(data, selectedId, showAll) {
  if (sceneState.dynamicGroup) {
    sceneState.scene.remove(sceneState.dynamicGroup);
    disposeObject(sceneState.dynamicGroup);
  }
  const group = new THREE.Group();
  const selected = data.shots.find((shot) => shot.event_id === selectedId) || data.shots[0] || null;
  data.shots.forEach((shot) => {
    if (!showAll && shot !== selected) return;
    const color = shot.outcome === "made" ? COLORS.made : COLORS.miss;
    if (shot.ball_trajectory_available === false || (shot.points || []).length < 2) {
      if (shot.release_point) {
        const start = worldPoint(shot.release_point);
        const marker = new THREE.Mesh(
          new THREE.RingGeometry(0.42, 0.62, 32),
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(start.x, 0.055, start.z);
        group.add(marker);
      }
      return;
    }
    if (shot === selected) {
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(shotCurve(shot), 72, 0.105, 10, false),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.24,
          roughness: 0.45,
        }),
      );
      tube.userData.futureTrajectory = true;
      tube.castShadow = true;
      group.add(tube);
      const postCurve = postResultCurve(shot);
      if (postCurve) {
        const postTrajectory = new THREE.Mesh(
          new THREE.TubeGeometry(postCurve, 32, 0.075, 8, false),
          new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.1,
            transparent: true,
            opacity: 0.72,
            roughness: 0.5,
          }),
        );
        postTrajectory.userData.futureTrajectory = true;
        group.add(postTrajectory);
      }
      const start = worldPoint(shot.points[0]);
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.62, 32),
        new THREE.MeshBasicMaterial({ color: COLORS.selected, side: THREE.DoubleSide }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(start.x, 0.055, start.z);
      group.add(marker);
    } else {
      const trajectory = line(
        shot.points.map(worldPoint),
        color,
        shot.confidence === "medium" ? 0.42 : 0.24,
      );
      trajectory.userData.futureTrajectory = true;
      group.add(trajectory);
      if ((shot.post_result_points || []).length >= 2) {
        const postTrajectory = line(
          shot.post_result_points.map(worldPoint),
          color,
          shot.confidence === "medium" ? 0.3 : 0.18,
        );
        postTrajectory.userData.futureTrajectory = true;
        group.add(postTrajectory);
      }
    }
  });

  const progressLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: selected?.outcome === "made" ? COLORS.made : COLORS.miss,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    }),
  );
  progressLine.userData.elapsedTrajectory = true;
  progressLine.visible = false;
  progressLine.renderOrder = 3;
  group.add(progressLine);

  const ball = createBasketball();
  ball.visible = Boolean(selected?.points?.length) && selected?.ball_trajectory_available !== false;
  if (ball.visible) ball.position.copy(worldPoint(selected.points[0]));
  group.add(ball);
  sceneState.scene.add(group);
  sceneState.dynamicGroup = group;
  sceneState.ball = ball;
  sceneState.selectedShot = selected;
  sceneState.shotProgressLine = progressLine;
  sceneState.ballLastPosition = null;
  sceneState.animationStart = null;
  setFullTrajectoryVisibility(!sceneState.replay);
}

function labelSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  const fitted = String(text || "Player").slice(0, 19);
  context.font = "700 28px Segoe UI, Arial, sans-serif";
  canvas.width = Math.max(96, Math.min(320, Math.ceil(context.measureText(fitted).width + 42)));
  context.fillStyle = "rgba(2, 9, 22, 0.9)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.fillRect(0, 0, 8, canvas.height);
  context.fillStyle = "#ffffff";
  context.font = "700 28px Segoe UI, Arial, sans-serif";
  context.textBaseline = "middle";
  context.fillText(fitted, 22, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
  const width = canvas.width / 80;
  sprite.scale.set(width, 0.9, 1);
  sprite.position.set(0, 6.55, 0);
  sprite.renderOrder = 5;
  sprite.userData.baseScale = { x: width, y: 0.9 };
  sprite.userData.anchorY = 6.55;
  return sprite;
}

function avatarSkinColor(player) {
  // A neutral studio material avoids inventing a person's physical appearance.
  return COLORS.playerCore;
}

function avatarFillMaterial(color, emissive, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.2,
    roughness: 0.52,
    metalness: 0.1,
    transparent: opacity < 1,
    opacity,
  });
}

function avatarWireMaterial(color, opacity = 0.64) {
  return new THREE.MeshBasicMaterial({
    color,
    wireframe: true,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

function layeredAvatarMesh(geometry, fillMaterial, wireMaterial) {
  const group = new THREE.Group();
  const fill = new THREE.Mesh(geometry, fillMaterial);
  fill.castShadow = true;
  fill.receiveShadow = true;
  group.add(fill);
  return group;
}

function avatarSegment(radius, fillMaterial, wireMaterial, radialSegments = 14, profile = "limb") {
  const profiles = {
    limb: [
      [0, -0.5], [0.62, -0.49], [0.84, -0.34], [1.0, -0.04], [0.92, 0.24], [0.62, 0.49], [0, 0.5],
    ],
    torso: [
      [0, -0.5], [0.72, -0.49], [0.8, -0.32], [0.93, 0.05], [1.16, 0.36], [1.0, 0.5], [0, 0.51],
    ],
    neck: [
      [0, -0.5], [0.82, -0.49], [1.0, -0.25], [1.0, 0.25], [0.82, 0.49], [0, 0.5],
    ],
  };
  const points = profiles[profile].map(([scale, y]) => new THREE.Vector2(radius * scale, y));
  return layeredAvatarMesh(
    new THREE.LatheGeometry(points, radialSegments),
    fillMaterial,
    wireMaterial,
  );
}

function setSegment(segment, start, end) {
  const delta = end.clone().sub(start);
  const length = delta.length();
  segment.visible = length > 0.04;
  if (!segment.visible) return;
  segment.position.copy(start).add(end).multiplyScalar(0.5);
  segment.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  segment.scale.set(1, length, 1);
}

function requestPlayerAvatar() {
  if (!avatarLoadRequested) {
    avatarLoadRequested = true;
    preloadPlayerAvatar().then(() => {
      if (sceneState.replay && sceneState.replayTimeS != null) setReplayTime(sceneState.replayTimeS);
    });
  }
}

function createPlayerMarker(player) {
  requestPlayerAvatar();
  const group = new THREE.Group();
  const color = new THREE.Color(player.color || "#78dcf5");
  const neon = player.role === "shooter"
    ? new THREE.Color(COLORS.selected)
    : new THREE.Color(COLORS.playerAccent);
  const skinColor = new THREE.Color(avatarSkinColor(player));
  const jerseyColor = player.role === "shooter" ? new THREE.Color(COLORS.selected) : new THREE.Color(COLORS.playerJersey).lerp(color, 0.15);
  const jerseyMaterial = avatarFillMaterial(jerseyColor, neon);
  const shortsMaterial = avatarFillMaterial(new THREE.Color(0x03172e).lerp(color, 0.08), neon);
  const skinMaterial = avatarFillMaterial(skinColor, neon);
  const shoeMaterial = avatarFillMaterial(new THREE.Color(COLORS.playerShoe), neon);
  const wireMaterial = avatarWireMaterial(neon, player.role === "shooter" ? 0.78 : 0.65);
  [jerseyMaterial, shortsMaterial, skinMaterial, shoeMaterial, wireMaterial].forEach((material) => {
    material.userData.observedOpacity = material.opacity;
  });
  const rig = new THREE.Group();
  group.add(rig);

  const torso = avatarSegment(0.58, jerseyMaterial, wireMaterial, 20, "torso");
  const pelvis = layeredAvatarMesh(
    new THREE.SphereGeometry(0.5, 18, 12), shortsMaterial, wireMaterial,
  );
  const neck = avatarSegment(0.15, skinMaterial, wireMaterial, 12, "neck");
  const head = layeredAvatarMesh(
    new THREE.SphereGeometry(0.43, 20, 16), skinMaterial, wireMaterial,
  );
  rig.add(torso, pelvis, neck, head);

  const segmentDefinitions = [
    ["left_upper_arm", 0.2, skinMaterial],
    ["left_forearm", 0.155, skinMaterial],
    ["right_upper_arm", 0.2, skinMaterial],
    ["right_forearm", 0.155, skinMaterial],
    ["left_thigh", 0.31, shortsMaterial],
    ["left_calf", 0.195, skinMaterial],
    ["right_thigh", 0.31, shortsMaterial],
    ["right_calf", 0.195, skinMaterial],
  ];
  const segments = {};
  segmentDefinitions.forEach(([name, radius, material]) => {
    segments[name] = avatarSegment(radius, material, wireMaterial);
    rig.add(segments[name]);
  });
  const joints = {};
  ["left_elbow", "right_elbow", "left_knee", "right_knee"].forEach((name) => {
    joints[name] = layeredAvatarMesh(
      new THREE.SphereGeometry(name.includes("knee") ? 0.2 : 0.16, 12, 9),
      skinMaterial,
      wireMaterial,
    );
    rig.add(joints[name]);
  });
  const shoulderCaps = {
    left: layeredAvatarMesh(new THREE.SphereGeometry(0.25, 14, 10), jerseyMaterial, wireMaterial),
    right: layeredAvatarMesh(new THREE.SphereGeometry(0.25, 14, 10), jerseyMaterial, wireMaterial),
  };
  const hipCaps = {
    left: layeredAvatarMesh(new THREE.SphereGeometry(0.23, 14, 10), shortsMaterial, wireMaterial),
    right: layeredAvatarMesh(new THREE.SphereGeometry(0.23, 14, 10), shortsMaterial, wireMaterial),
  };
  const hands = {
    left: layeredAvatarMesh(new THREE.SphereGeometry(0.14, 12, 8), skinMaterial, wireMaterial),
    right: layeredAvatarMesh(new THREE.SphereGeometry(0.14, 12, 8), skinMaterial, wireMaterial),
  };
  hands.left.scale.set(0.76, 1.15, 0.52);
  hands.right.scale.set(0.76, 1.15, 0.52);
  rig.add(
    shoulderCaps.left, shoulderCaps.right,
    hipCaps.left, hipCaps.right,
    hands.left, hands.right,
  );
  const shoes = {
    left: layeredAvatarMesh(new THREE.SphereGeometry(0.25, 14, 10), shoeMaterial, wireMaterial),
    right: layeredAvatarMesh(new THREE.SphereGeometry(0.25, 14, 10), shoeMaterial, wireMaterial),
  };
  shoes.left.scale.set(0.8, 0.44, 1.58);
  shoes.right.scale.copy(shoes.left.scale);
  rig.add(shoes.left, shoes.right);

  const chestTrim = new THREE.Group();
  const trimMaterial = new THREE.MeshStandardMaterial({ color: player.role === "shooter" ? 0x03172e : COLORS.playerAccent, emissive: neon, emissiveIntensity: 0.2, roughness: 0.5 });
  trimMaterial.userData.observedOpacity = 1;
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.025), trimMaterial);
  crest.position.set(0.17, 0.16, 0.39);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.64, 0.025), trimMaterial);
  stripe.position.set(-0.35, -0.1, 0.36);
  chestTrim.add(crest, stripe);
  rig.add(chestTrim);
  const footMarker = new THREE.Mesh(
    new THREE.RingGeometry(player.role === "shooter" ? 0.72 : 0.58, player.role === "shooter" ? 0.94 : 0.76, 32),
    new THREE.MeshBasicMaterial({
      color: neon,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.96,
    }),
  );
  footMarker.rotation.x = -Math.PI / 2;
  footMarker.position.y = 0.08;
  group.add(footMarker);
  const predictionHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.88, 1.03, 32),
    new THREE.MeshBasicMaterial({
      color: COLORS.playerPredicted,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
    }),
  );
  predictionHalo.rotation.x = -Math.PI / 2;
  predictionHalo.position.y = 0.09;
  predictionHalo.visible = false;
  group.add(predictionHalo);
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0.12, 0),
    1.8,
    color,
    0.5,
    0.32,
  );
  group.add(arrow);
  const label = labelSprite(player.label, player.role === "shooter" ? "#ffd200" : player.color || "#78dcf5");
  group.add(label);
  group.userData.arrow = arrow;
  group.userData.label = label;
  group.userData.footMarker = footMarker;
  group.userData.predictionHalo = predictionHalo;
  group.userData.player = player;
  group.userData.rig = {
    root: rig,
    torso,
    pelvis,
    neck,
    head,
    chestTrim,
    segments,
    joints,
    shoulderCaps,
    hipCaps,
    hands,
    shoes,
    evidenceMaterials: [jerseyMaterial, shortsMaterial, skinMaterial, shoeMaterial, trimMaterial],
    wireMaterial,
  };
  return group;
}

function setPlayerEvidenceStyle(marker, predicted, staleFade = 1) {
  const rig = marker.userData.rig;
  if (!rig) return;
  const fade = Math.max(0.05, Math.min(1, Number(staleFade)));
  const isStale = fade < 0.999;
  const baseMultiplier = predicted ? 0.46 : 1;
  [...rig.evidenceMaterials, ...(rig.skinnedAvatar?.evidenceMaterials || [])].forEach((material) => {
    const observed = Number(material.userData.observedOpacity || material.opacity || 1);
    material.opacity = observed * baseMultiplier * fade;
    material.transparent = material.opacity < 0.999;
    material.depthWrite = !predicted && !isStale;
  });
  const footOpacity = (predicted ? 0.42 : 0.96) * fade;
  marker.userData.footMarker.material.opacity = footOpacity;
  marker.userData.footMarker.material.transparent = true;
  marker.userData.predictionHalo.visible = predicted || isStale;
  const haloOpacity = predicted ? 0.72 * fade : 0.42 * fade;
  marker.userData.predictionHalo.material.opacity = haloOpacity;
  marker.userData.predictionHalo.material.color.setHex(
    isStale && !predicted ? 0xffbd43 : COLORS.playerPredicted,
  );
  marker.userData.label.material.opacity = (predicted ? 0.7 : 1) * fade;
  marker.userData.label.material.transparent = true;
  const arrowOpacity = (predicted ? 0.38 : 1) * fade;
  marker.userData.arrow.line.material.opacity = arrowOpacity;
  marker.userData.arrow.cone.material.opacity = arrowOpacity;
  marker.userData.arrow.line.material.transparent = true;
  marker.userData.arrow.cone.material.transparent = true;
}

function vectorFromCourtJoint(joint, sample) {
  return new THREE.Vector3(
    Number(joint.x_ft) - Number(sample.x_ft),
    Number(joint.z_ft),
    Number(joint.y_ft) - Number(sample.y_ft),
  );
}

function midpoint(first, second) {
  return first.clone().add(second).multiplyScalar(0.5);
}

function proceduralPlayerPose(player, sample) {
  // Location-only evidence gets a neutral mannequin: no fabricated gait, jump,
  // shooting gesture, or ball-hand reach. The floor anchor still follows the track.
  const rawHeading = new THREE.Vector3(Number(sample.heading_x || 0), 0, Number(sample.heading_y || 0));
  const attackingHoop = activeHoop();
  const hoopHeading = new THREE.Vector3(Number(attackingHoop.x_ft) - Number(sample.x_ft), 0,
    Number(attackingHoop.y_ft) - Number(sample.y_ft));
  const forward = rawHeading.lengthSq() > 0.01 ? rawHeading.normalize() : hoopHeading.normalize();
  if (forward.lengthSq() < 0.01) forward.set(0, 0, 1);
  const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
  const local = (across, height, ahead = 0) => right.clone().multiplyScalar(across)
    .add(new THREE.Vector3(0, height, 0)).addScaledVector(forward, ahead);
  return {
    left_ankle: local(0.35, 0.15, 0), right_ankle: local(-0.35, 0.15, 0),
    left_knee: local(0.36, 1.68, 0.12), right_knee: local(-0.36, 1.68, 0.12),
    left_hip: local(0.37, 3.18, 0), right_hip: local(-0.37, 3.18, 0),
    left_shoulder: local(0.72, 5.03, 0), right_shoulder: local(-0.72, 5.03, 0),
    left_elbow: local(0.88, 4.06, 0.08), right_elbow: local(-0.88, 4.06, 0.08),
    left_wrist: local(0.86, 3.17, 0.2), right_wrist: local(-0.86, 3.17, 0.2),
    nose: local(0, 5.90, 0.10),
  };
}

const AVATAR_JOINT_CONFIDENCE = 0.35;
const AVATAR_MAX_POSE_GAP_S = 0.16;
const avatarPoseIndex = new WeakMap();
function validAvatarJoint(joint, pose = null) {
  const projected = String(pose?.geometry_status || pose?.geometry || "").includes("camera_facing_2_5d");
  return joint && [joint.x_ft, joint.y_ft, joint.z_ft].every(value => value != null && Number.isFinite(Number(value)))
    && (joint.confidence == null || Number(joint.confidence) >= AVATAR_JOINT_CONFIDENCE)
    && Number(joint.z_ft) >= (projected ? -0.351 : -0.3) && Number(joint.z_ft) <= (projected ? 12.001 : 11);
}
function avatarPoseSamples(player) {
  let cached = avatarPoseIndex.get(player);
  if (!cached || cached.source !== player.samples) {
    cached = { source: player.samples, samples: (player.samples || []).filter(candidate => candidate.pose
      && Number.isFinite(Number(candidate.time_s))).sort((a, b) => a.time_s - b.time_s) };
    avatarPoseIndex.set(player, cached);
  }
  return cached.samples;
}
function boundedJointCoordinate(previous, first, second, following, key, fraction, span) {
  const a = Number(first[key]);
  const b = Number(second[key]);
  const slope = (b - a) / span;
  const tangent = other => {
    if (other == null || slope === 0 || other * slope <= 0) return other == null ? slope : 0;
    return 2 * slope * other / (slope + other);
  };
  const beforeSlope = previous ? (a - Number(previous.joint[key])) / previous.span : null;
  const afterSlope = following ? (Number(following.joint[key]) - b) / following.span : null;
  const left = tangent(beforeSlope) * span;
  const right = tangent(afterSlope) * span;
  const t2 = fraction * fraction;
  const t3 = t2 * fraction;
  const value = (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + fraction) * left
    + (-2 * t3 + 3 * t2) * b + (t3 - t2) * right;
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), value));
}

function poseEvidenceAt(player, timeS, sample) {
  const poseSamples = player.identity_barriers?.length || player.identity_abstention_intervals != null
    ? avatarPoseSamples(player).filter(candidate => !identityIntervalBlocked(player, candidate.time_s, timeS))
    : avatarPoseSamples(player);
  if (!poseSamples.length) return null;
  let low = 0;
  let high = poseSamples.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (poseSamples[middle].time_s < timeS) low = middle + 1;
    else high = middle;
  }
  const rightIndex = Math.min(low, poseSamples.length - 1);
  const leftIndex = Math.max(0, rightIndex - 1);
  const left = poseSamples[leftIndex];
  const rightSample = poseSamples[rightIndex];
  const nearestDistance = Math.min(Math.abs(left.time_s - timeS), Math.abs(rightSample.time_s - timeS));
  if (nearestDistance > 0.15) return null;
  const span = Math.max(1e-6, rightSample.time_s - left.time_s);
  const fraction = Math.max(0, Math.min(1, (timeS - left.time_s) / span));
  const joints = {};
  const confidences = {};
  const contact = {};
  const names = new Set([
    ...Object.keys(left.pose.joints || {}),
    ...Object.keys(rightSample.pose.joints || {}),
  ]);
  names.forEach((name) => {
    const first = validAvatarJoint(left.pose.joints?.[name], left.pose) ? left.pose.joints[name] : null;
    const second = validAvatarJoint(rightSample.pose.joints?.[name], rightSample.pose) ? rightSample.pose.joints[name] : null;
    if (first && second && span <= AVATAR_MAX_POSE_GAP_S) {
      const previousSample = poseSamples[leftIndex - 1];
      const followingSample = poseSamples[rightIndex + 1];
      const previousJoint = previousSample?.pose.joints?.[name];
      const followingJoint = followingSample?.pose.joints?.[name];
      const previousSpan = previousSample ? left.time_s - previousSample.time_s : Infinity;
      const followingSpan = followingSample ? followingSample.time_s - rightSample.time_s : Infinity;
      const previous = validAvatarJoint(previousJoint, previousSample?.pose) && previousSpan > 0 && previousSpan <= AVATAR_MAX_POSE_GAP_S
        ? { joint: previousJoint, span: previousSpan } : null;
      const following = validAvatarJoint(followingJoint, followingSample?.pose) && followingSpan > 0 && followingSpan <= AVATAR_MAX_POSE_GAP_S
        ? { joint: followingJoint, span: followingSpan } : null;
      joints[name] = vectorFromCourtJoint({
        x_ft: boundedJointCoordinate(previous, first, second, following, "x_ft", fraction, span),
        y_ft: boundedJointCoordinate(previous, first, second, following, "y_ft", fraction, span),
        z_ft: boundedJointCoordinate(previous, first, second, following, "z_ft", fraction, span),
      }, sample);
      confidences[name] = Math.min(Number(first.confidence ?? 1), Number(second.confidence ?? 1));
      contact[name] = first.grounded === true && second.grounded === true;
    } else {
      const chooseLeft = Math.abs(left.time_s - timeS) <= Math.abs(rightSample.time_s - timeS);
      const chosen = chooseLeft ? first : second;
      const chosenTime = chooseLeft ? left.time_s : rightSample.time_s;
      if (chosen && Math.abs(chosenTime - timeS) <= 0.15) {
        joints[name] = vectorFromCourtJoint(chosen, sample);
        confidences[name] = Number(chosen.confidence ?? 1);
        contact[name] = chosen.grounded === true;
      }
    }
    if (joints[name] && Math.hypot(joints[name].x, joints[name].z) > 7) delete joints[name];
  });
  if (Object.keys(joints).length < 4) return null;
  return {
    joints, confidences, contact,
    confidence: fraction < 0.5 ? left.pose.confidence : rightSample.pose.confidence,
    geometryStatus: (fraction < 0.5 ? left.pose : rightSample.pose).geometry_status
      || (fraction < 0.5 ? left.pose : rightSample.pose).geometry || "court-space-pose-candidate",
    status: "pose-assisted",
  };
}

function constrainedAvatarJoints(fallback, evidence) {
  const joints = Object.fromEntries(Object.entries(fallback).map(([name, point]) => [name, point.clone()]));
  const observed = evidence?.joints || {};
  const projectedPose = String(evidence?.geometryStatus || "").includes("camera_facing_2_5d");
  const corrections = [];
  Object.entries(observed).forEach(([name, point]) => { joints[name] = point.clone(); });
  const torsoNames = ["left_hip", "right_hip", "left_shoulder", "right_shoulder"];
  // Never attach measured arms to a missing, arbitrarily oriented torso.
  let completeTorso = torsoNames.every(name => observed[name]);
  if (completeTorso) {
    const torsoHeight = midpoint(observed.left_hip, observed.right_hip).distanceTo(midpoint(observed.left_shoulder, observed.right_shoulder));
    const shoulders = observed.left_shoulder.distanceTo(observed.right_shoulder);
    const hips = observed.left_hip.distanceTo(observed.right_hip);
    // Side-on camera-facing poses legitimately collapse transverse joint
    // separation. Requiring full3D shoulder width would discard real arm motion.
    // The solid torso supplies unmeasured thickness; joint locations stay intact.
    completeTorso = torsoHeight >= 0.8 && torsoHeight <= 2.85
      && shoulders >= (projectedPose ? 0.008 : 0.35) && shoulders <= 2.4
      && hips >= (projectedPose ? 0.008 : 0.25) && hips <= 1.85;
    if (projectedPose && (shoulders < 0.35 || hips < 0.25)) corrections.push("unmeasured-torso-depth");
    if (!completeTorso) corrections.push("unsupported-torso-anatomy");
  }
  if (!completeTorso) {
    torsoNames.forEach(name => { joints[name] = fallback[name].clone(); });
    corrections.push("neutral-torso-for-incomplete-evidence");
  }
  const chainDefinitions = [
    ["left_shoulder", "left_elbow", "left_wrist", 0.65, 1.5, 0.60, 1.45],
    ["right_shoulder", "right_elbow", "right_wrist", 0.65, 1.5, 0.60, 1.45],
    ["left_hip", "left_knee", "left_ankle", 1.05, 2.05, 1.0, 2.05],
    ["right_hip", "right_knee", "right_ankle", 1.05, 2.05, 1.0, 2.05],
  ];
  for (const [root, middle, end, minUpper, maxUpper, minLower, maxLower] of chainDefinitions) {
    const supported = completeTorso && observed[root] && observed[middle] && observed[end];
    if (!supported) {
      // A missing joint completes a neutral local chain; it is not a guessed action.
      const offset = joints[root].clone().sub(fallback[root]);
      joints[middle] = fallback[middle].clone().add(offset);
      joints[end] = fallback[end].clone().add(offset);
      corrections.push(`neutral-chain:${middle}`);
      continue;
    }
    const upper = joints[middle].clone().sub(joints[root]);
    const lower = joints[end].clone().sub(joints[middle]);
    if (upper.length() < (projectedPose ? 0.008 : 0.15) || lower.length() < (projectedPose ? 0.008 : 0.15)
      || upper.length() > maxUpper * 1.7 || lower.length() > maxLower * 1.7) {
      const offset = joints[root].clone().sub(fallback[root]);
      joints[middle] = fallback[middle].clone().add(offset);
      joints[end] = fallback[end].clone().add(offset);
      corrections.push(`unsupported-chain:${middle}`);
      continue;
    }
    // Render-only limits prevent telephoto lifting noise from stretching anatomy.
    // The source pose and player floor anchor remain untouched.
    // Foreshortened image limbs cannot be lengthened in the projected plane
    // without moving the source wrist/ankle. Preserve those endpoints; their
    // unmeasured depth is not a license to change the observed screen motion.
    const upperLength = projectedPose ? upper.length() : THREE.MathUtils.clamp(upper.length(), minUpper, maxUpper);
    const lowerLength = projectedPose ? lower.length() : THREE.MathUtils.clamp(lower.length(), minLower, maxLower);
    if (Math.abs(upperLength - upper.length()) > 0.001 || Math.abs(lowerLength - lower.length()) > 0.001) {
      corrections.push(`anatomy-bounded:${middle}`);
      joints[middle].copy(joints[root]).add(upper.setLength(upperLength));
      joints[end].copy(joints[middle]).add(lower.setLength(lowerLength));
    }
  }
  for (const side of ["left", "right"]) {
    const ankle = joints[`${side}_ankle`];
    // Shoe geometry must sit above the floor. This is a collision constraint,
    // not evidence that the player's foot was in contact with the court.
    if (ankle.y < 0.11) { ankle.y = 0.11; corrections.push(`floor-collision:${side}`); }
    if (evidence?.contact?.[`${side}_ankle`]) ankle.y = 0.11;
  }
  return { joints, corrections, completeTorso };
}

function updateArticulatedAvatar(marker, player, sample, timeS, timeline, ballSample) {
  const rig = marker.userData.rig;
  if (!rig) return "neutral-fallback";
  const fallback = proceduralPlayerPose(player, sample, timeS, timeline, ballSample);
  const evidence = poseEvidenceAt(player, timeS, sample);
  const constrained = constrainedAvatarJoints(fallback, evidence);
  const joints = constrained.joints;
  const leftHip = joints.left_hip;
  const rightHip = joints.right_hip;
  const leftShoulder = joints.left_shoulder;
  const rightShoulder = joints.right_shoulder;
  const hipCenter = midpoint(leftHip, rightHip);
  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const ears = [evidence?.joints.left_ear, evidence?.joints.right_ear].filter(Boolean);
  const requestedHeadCenter = ears.length
    ? ears.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / ears.length)
    : evidence?.joints.nose
      ? evidence.joints.nose.clone().add(new THREE.Vector3(0, 0.12, 0))
      : shoulderCenter.clone().add(new THREE.Vector3(0, 0.78, 0));
  const headOffset = requestedHeadCenter.clone().sub(shoulderCenter);
  const horizontalHeadOffset = new THREE.Vector2(headOffset.x, headOffset.z);
  if (horizontalHeadOffset.length() > 0.32) horizontalHeadOffset.setLength(0.32);
  const headCenter = shoulderCenter.clone().add(new THREE.Vector3(
    horizontalHeadOffset.x,
    Math.max(0.60, Math.min(0.9, headOffset.y)),
    horizontalHeadOffset.y,
  ));
  const headBase = headCenter.clone().add(new THREE.Vector3(0, -0.45, 0));

  setSegment(rig.torso, hipCenter, shoulderCenter);
  const torsoUp = shoulderCenter.clone().sub(hipCenter).normalize();
  const torsoRight = leftShoulder.clone().sub(rightShoulder);
  torsoRight.addScaledVector(torsoUp, -torsoRight.dot(torsoUp));
  const transverseSupport = torsoRight.length();
  const referenceRight = fallback.left_shoulder.clone().sub(fallback.right_shoulder);
  referenceRight.addScaledVector(torsoUp, -referenceRight.dot(torsoUp)).normalize();
  if (transverseSupport > 0.001) {
    torsoRight.normalize();
    if (referenceRight.dot(torsoRight) < 0) referenceRight.negate();
    const support = THREE.MathUtils.smoothstep(transverseSupport, 0.04, 0.35);
    torsoRight.copy(referenceRight.lerp(torsoRight, support)).normalize();
  } else torsoRight.copy(referenceRight);
  const torsoForward = new THREE.Vector3().crossVectors(torsoRight, torsoUp).normalize();
  torsoRight.crossVectors(torsoUp, torsoForward).normalize();
  const torsoRotation = new THREE.Matrix4().makeBasis(torsoRight, torsoUp, torsoForward);
  rig.torso.quaternion.setFromRotationMatrix(torsoRotation);
  rig.torso.scale.x = THREE.MathUtils.clamp(leftShoulder.distanceTo(rightShoulder) / 1.34, 0.8, 1.35);
  rig.torso.scale.z = 0.67;
  const hipWidth = Math.max(0.72, Math.min(1.35, leftHip.distanceTo(rightHip)));
  const hipAxis = leftHip.clone().sub(rightHip);
  hipAxis.y = 0;
  rig.pelvis.position.copy(hipCenter);
  rig.pelvis.scale.set(hipWidth * 0.82, 0.55, 0.6);
  const pelvisYaw = hipAxis.lengthSq() > 0.02 ? Math.atan2(-hipAxis.z, hipAxis.x) : 0;
  // Pose interpolation is timestamp-based, so scrubbing is deterministic and
  // repeated calls at one paused frame cannot continue changing the anatomy.
  rig.pelvis.rotation.set(0, pelvisYaw, 0);
  setSegment(rig.neck, shoulderCenter.clone().add(new THREE.Vector3(0, 0.04, 0)), headBase);
  rig.head.position.copy(headCenter);
  rig.head.scale.set(0.88, 1.12, 0.84);
  rig.head.userData.attachmentGapFt = Math.max(
    0,
    headBase.distanceTo(rig.neck.position.clone().add(
      new THREE.Vector3(0, Number(rig.neck.scale.y || 0) / 2, 0)
        .applyQuaternion(rig.neck.quaternion),
    )),
  );
  rig.chestTrim.position.copy(shoulderCenter.clone().lerp(hipCenter, 0.34));
  rig.chestTrim.quaternion.copy(rig.torso.quaternion);

  const limbPairs = {
    left_upper_arm: ["left_shoulder", "left_elbow"],
    left_forearm: ["left_elbow", "left_wrist"],
    right_upper_arm: ["right_shoulder", "right_elbow"],
    right_forearm: ["right_elbow", "right_wrist"],
    left_thigh: ["left_hip", "left_knee"],
    left_calf: ["left_knee", "left_ankle"],
    right_thigh: ["right_hip", "right_knee"],
    right_calf: ["right_knee", "right_ankle"],
  };
  Object.entries(limbPairs).forEach(([name, [start, end]]) => {
    setSegment(rig.segments[name], joints[start], joints[end]);
  });
  Object.entries(rig.joints).forEach(([name, mesh]) => mesh.position.copy(joints[name]));
  rig.shoulderCaps.left.position.copy(leftShoulder);
  rig.shoulderCaps.right.position.copy(rightShoulder);
  rig.hipCaps.left.position.copy(leftHip);
  rig.hipCaps.right.position.copy(rightHip);
  rig.hands.left.position.copy(joints.left_wrist);
  rig.hands.right.position.copy(joints.right_wrist);

  const heading = new THREE.Vector3(Number(sample.heading_x || 0), 0, Number(sample.heading_y || 0));
  const bodyYaw = Math.atan2(torsoForward.x, torsoForward.z);
  const shoeAngle = heading.lengthSq() > 0.01 ? Math.atan2(heading.x, heading.z) : bodyYaw;
  rig.head.rotation.y = bodyYaw;
  rig.shoes.left.position.copy(joints.left_ankle).add(new THREE.Vector3(0, 0.02, 0));
  rig.shoes.right.position.copy(joints.right_ankle).add(new THREE.Vector3(0, 0.02, 0));
  rig.shoes.left.rotation.y = shoeAngle;
  rig.shoes.right.rotation.y = shoeAngle;
  for (const side of ["left", "right"]) {
    const wrist = joints[`${side}_wrist`];
    const forearm = wrist.clone().sub(joints[`${side}_elbow`]).normalize();
    rig.hands[side].quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), forearm);
  }
  marker.userData.label.userData.anchorY = Math.max(6.55, headCenter.y + 0.86, joints.left_wrist.y + 0.7, joints.right_wrist.y + 0.7);
  const source = evidence && constrained.completeTorso ? "pose-assisted" : "neutral-fallback";
  rig.poseDiagnostics = {
    source, geometryStatus: evidence?.geometryStatus || "location-only-neutral-avatar",
    confidence: evidence?.confidence ?? null, supportedJoints: Object.keys(evidence?.joints || {}).length,
    interpolation: "bounded-monotone-cubic-at-source-time", corrections: constrained.corrections,
    joints: Object.fromEntries(Object.entries(joints).map(([name, point]) => [name, point.toArray()])),
    floorAnchorUnchanged: true, measuredFullBody3D: false,
  };
  if (!rig.skinnedAvatar) {
    const avatar = createSkinnedPlayer(player);
    if (avatar) {
      rig.skinnedAvatar = avatar;
      marker.add(avatar.root);
      setPlayerEvidenceStyle(marker, Boolean(sample.is_predicted), Number(sample.stale_fade ?? 1));
    }
  }
  if (rig.skinnedAvatar) {
    const ready = retargetSkinnedPlayer(rig.skinnedAvatar, rig);
    rig.root.visible = !ready;
    rig.skinnedAvatar.root.visible = ready;
  }
  return source;
}

function placeReplayLabel(rect, obstacles, width, height) {
  // Bounded, deterministic screen layout: no animation clock or accumulated
  // offset. Dense views may omit a label, but never an athlete's movement.
  const intersects = (a, b) => a.left < b.right + 3 && a.right > b.left - 3
    && a.top < b.bottom + 3 && a.bottom > b.top - 3;
  for (let dy = 0; dy >= -96; dy -= 8) {
    for (const dx of [0, -16, 16, -32, 32]) {
      const candidate = {left:rect.left+dx, right:rect.right+dx, top:rect.top+dy, bottom:rect.bottom+dy};
      if (candidate.left < 4 || candidate.right > width-4 || candidate.top < 4 || candidate.bottom > height-4) continue;
      if (!obstacles.some(box => intersects(candidate, box))) return { ...candidate, dx, dy };
    }
  }
  return null;
}

function updatePlayerLabelScales() {
  const {camera, scene, container} = sceneState;
  if (!camera || !scene || !container) return;
  const width=container.clientWidth, height=container.clientHeight;
  if (!width || !height) return;
  scene.updateMatrixWorld(true);
  const screen = point => {
    const ndc=point.clone().project(camera);
    return {x:(ndc.x+1)*width/2, y:(1-ndc.y)*height/2, z:ndc.z};
  };
  const markers=[...sceneState.playerMarkers.entries()].filter(([,m])=>m.visible && m.userData.label);
  const obstacles=[];
  for (const [,marker] of markers) {
    const points=Object.values(marker.userData.rig?.poseDiagnostics?.joints || {})
      .map(p=>screen(marker.localToWorld(new THREE.Vector3(...p))));
    const head=marker.userData.rig?.head;
    if(head) {
      const center=head.getWorldPosition(new THREE.Vector3());
      points.push(screen(center.clone().add(new THREE.Vector3(0,.5,0))));
      points.push(screen(center));
    }
    if (points.length && points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))) {
      obstacles.push({left:Math.min(...points.map(p=>p.x))-7,right:Math.max(...points.map(p=>p.x))+7,
        top:Math.min(...points.map(p=>p.y))-7,bottom:Math.max(...points.map(p=>p.y))+7});
    }
  }
  // Stable ordering makes seeking reproducible. Highlighted shooter labels get
  // first choice, followed by the stable marker ID, independently of insertion.
  markers.sort(([a,ma],[b,mb])=>Number(mb.userData.player?.role==='shooter')-Number(ma.userData.player?.role==='shooter') || a.localeCompare(b));
  for (const [,marker] of markers) {
    const label=marker.userData.label, base=label.userData.baseScale;
    label.position.set(0,label.userData.anchorY ?? 6.55,0);
    const world=marker.localToWorld(label.position.clone());
    const factor=Math.max(.45,Math.min(1.4,world.distanceTo(camera.position)/48));
    label.scale.set(base.x*factor,base.y*factor,1);
    // Match Sprite's view-space billboard corners, including projective Film
    // cameras. Ordinary perspective/FOV approximations are incorrect here.
    const center=world.clone().applyMatrix4(camera.matrixWorldInverse);
    const corners=[];
    for(const x of [-.5,.5])for(const y of [-.5,.5]) {
      const ndc=center.clone().add(new THREE.Vector3(x*label.scale.x,y*label.scale.y,0)).applyMatrix4(camera.projectionMatrix);
      corners.push({x:(ndc.x+1)*width/2,y:(1-ndc.y)*height/2});
    }
    const rect={left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),
      top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
    const placed=Object.values(rect).every(Number.isFinite) ? placeReplayLabel(rect,obstacles,width,height) : null;
    label.visible=Boolean(placed);
    label.userData.screenRect=placed;
    if(!placed)continue;
    const ndc=world.clone().project(camera);
    ndc.x+=2*placed.dx/width;ndc.y-=2*placed.dy/height;
    label.position.copy(marker.worldToLocal(ndc.unproject(camera)));
    obstacles.push(placed);
  }
}

const PLAYER_STALE_HOLD_S = 0.4;

function playerSampleAt(player, timeS) {
  const samples = player.samples || [];
  if (!samples.length || !identityAbstentionVisible(player, timeS) || identityIntervalBlocked(player, timeS)) return null;
  // Additive source bridges carry their original endpoints as interpolation
  // support, while the original avatar continues to own its visible intervals.
  const exclusions = player.render_exclusion_intervals;
  if (exclusions != null) {
    if (!Array.isArray(exclusions) || !exclusions.every(span => span
      && Number.isFinite(span.start_s) && Number.isFinite(span.end_s)
      && span.start_s >= 0 && span.end_s >= span.start_s)) return null;
    if (exclusions.some(span => timeS >= span.start_s - .0001 && timeS <= span.end_s + .0001)) return null;
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (timeS < first.time_s && identityIntervalBlocked(player, timeS, first.time_s)) return null;
  if (timeS > last.time_s && identityIntervalBlocked(player, last.time_s, timeS)) return null;
  if (timeS < first.time_s - PLAYER_STALE_HOLD_S) return null;
  if (timeS > last.time_s + PLAYER_STALE_HOLD_S) return null;
  if (timeS > last.time_s + 0.13) {
    const gap = timeS - last.time_s;
    const fade = Math.max(0, 1 - gap / PLAYER_STALE_HOLD_S);
    return {
      ...last,
      temporal_gap_s: gap,
      is_stale: true,
      stale_fade: fade,
      position_source: "stale_last_sample_hold",
      is_predicted: Boolean(last.is_predicted),
      prediction_confidence: Number(last.prediction_confidence || last.confidence || 0) * fade,
    };
  }
  if (timeS < first.time_s - 0.13) {
    const gap = first.time_s - timeS;
    const fade = Math.max(0, 1 - gap / PLAYER_STALE_HOLD_S);
    return {
      ...first,
      temporal_gap_s: gap,
      is_stale: true,
      stale_fade: fade,
      position_source: "stale_first_sample_hold",
      is_predicted: Boolean(first.is_predicted),
      prediction_confidence: Number(first.prediction_confidence || first.confidence || 0) * fade,
    };
  }
  let rightIndex = samples.findIndex((sample) => sample.time_s >= timeS);
  if (rightIndex < 0) rightIndex = samples.length - 1;
  const leftIndex = Math.max(0, rightIndex - 1);
  const left = samples[leftIndex];
  const right = samples[rightIndex];
  // A native observation keeps its own provenance and contact status. The
  // previous sample's prediction must not repaint this measured source time.
  if (Math.abs(right.time_s - timeS) < 1e-9) {
    return { ...right, temporal_gap_s: 0, is_stale: false, stale_fade: 1 };
  }
  if (identityIntervalBlocked(player, left.time_s, right.time_s)) {
    // An exact supported observation on either side remains usable, but neither
    // interpolation nor nearest/stale holds may traverse the reviewed gap.
    const supported = [left, right].filter(candidate => !identityIntervalBlocked(player, candidate.time_s, timeS));
    const nearest = supported.sort((a, b) => Math.abs(a.time_s - timeS) - Math.abs(b.time_s - timeS))[0];
    if (!nearest || Math.abs(nearest.time_s - timeS) > 0.13) return null;
    return { ...nearest, temporal_gap_s: Math.abs(nearest.time_s - timeS), is_stale: false, stale_fade: 1 };
  }
  if (right.time_s - left.time_s > 0.28) {
    const distLeft = Math.abs(left.time_s - timeS);
    const distRight = Math.abs(right.time_s - timeS);
    const nearestSample = distLeft <= distRight ? left : right;
    const nearestGap = Math.min(distLeft, distRight);
    if (nearestGap > 0.13) return null;
    return { ...nearestSample, temporal_gap_s: nearestGap, is_stale: false, stale_fade: 1 };
  }
  const span = Math.max(1e-6, right.time_s - left.time_s);
  const fraction = Math.max(0, Math.min(1, (timeS - left.time_s) / span));
  const leftSpeed = Number(left.speed_ft_s || 0);
  const rightSpeed = Number(right.speed_ft_s || 0);
  const leftVx = Number(left.heading_x || 0) * leftSpeed;
  const leftVz = Number(left.heading_y || 0) * leftSpeed;
  const rightVx = Number(right.heading_x || 0) * rightSpeed;
  const rightVz = Number(right.heading_y || 0) * rightSpeed;
  const linX = left.x_ft + (right.x_ft - left.x_ft) * fraction;
  const linY = left.y_ft + (right.y_ft - left.y_ft) * fraction;
  const nearest = fraction < 0.5 ? left : right;
  const predicted = Boolean(left.is_predicted || right.is_predicted);
  return {
    ...nearest,
    time_s: timeS,
    x_ft: linX,
    y_ft: linY,
    speed_ft_s: left.speed_ft_s + (right.speed_ft_s - left.speed_ft_s) * fraction,
    heading_x: left.heading_x + (right.heading_x - left.heading_x) * fraction,
    heading_y: left.heading_y + (right.heading_y - left.heading_y) * fraction,
    action: nearest.action,
    confidence: typeof left.confidence === "number" && typeof right.confidence === "number"
      ? left.confidence + (right.confidence - left.confidence) * fraction : null,
    source_reviewed_observation: false,
    source_frame_role_reviewed: false,
    source_footpoint_px: null,
    position_source: predicted
      ? "endpoint_supported_occlusion_prediction"
      : "source_endpoint_interpolation",
    interpolation: "bounded_source_time_linear",
    interpolation_support_times_s: [left.time_s, right.time_s],
    is_predicted: predicted,
    prediction_confidence: predicted
      ? Math.min(
        Number(left.prediction_confidence || left.confidence || 0),
        Number(right.prediction_confidence || right.confidence || 0),
      )
      : 1,
    evidence_left_frame: nearest.evidence_left_frame,
    evidence_right_frame: nearest.evidence_right_frame,
    temporal_gap_s: Math.min(Math.abs(left.time_s - timeS), Math.abs(right.time_s - timeS)),
    is_stale: false,
    stale_fade: 1,
  };
}

const ballSamplerCache = new WeakMap();

function ballContextSampler(ballReplay) {
  if (!ballReplay || typeof ballReplay !== "object") return null;
  if (!ballSamplerCache.has(ballReplay)) ballSamplerCache.set(ballReplay, createBallSampler(ballReplay));
  return ballSamplerCache.get(ballReplay);
}

function ballSampleAt(ballReplay, timeS) {
  return ballContextSampler(ballReplay)?.at(timeS) ?? null;
}

function clearReplay() {
  disposePlayerMarkers();
  if (sceneState.playerGroup && sceneState.scene) {
    sceneState.scene.remove(sceneState.playerGroup);
    disposeObject(sceneState.playerGroup);
  }
  sceneState.playerGroup = null;
  sceneState.playerMarkers = new Map();
  sceneState.replay = null;
  sceneState.replayTimeS = null;
  sceneState.sourceFilmAnchor = null;
  sceneState.sourceCameraDisplayHeld = false;
  sceneState.coachingState = null;
  sceneState.coachingLastTimeS = null;
  if (sceneState.coachingGroup) sceneState.coachingGroup.visible = false;
  sceneState.ballLastPosition = null;
  sceneState.ballTrailSegments = [];
  if (sceneState.ball) sceneState.ball.userData.evidence = null;
  sceneState.dribbleMarkers = [];
  if (sceneState.shotProgressLine) sceneState.shotProgressLine.visible = false;
  setFullTrajectoryVisibility(true);
}

function disposePlayerMarkers() {
  // Inactive fragments are cached outside the scene to avoid updating hundreds
  // of invisible bones. Dispose those cached objects as well as attached ones.
  sceneState.playerMarkers.forEach(marker => {
    marker.removeFromParent();
    const comet = marker.userData.comet?.mesh;
    if (comet) { comet.removeFromParent(); disposeObject(comet); }
    disposeObject(marker);
  });
  sceneState.playerMarkers.clear();
}

function replayPlayerMarker(player) {
  let marker = sceneState.playerMarkers.get(player.marker_id);
  if (!marker) {
    marker = createPlayerMarker(player);
    marker.userData.comet = createCometTrail(player.color);
    sceneState.playerMarkers.set(player.marker_id, marker);
  }
  if (!marker.parent) sceneState.playerGroup.add(marker);
  if (!marker.userData.comet.mesh.parent) sceneState.playerGroup.add(marker.userData.comet.mesh);
  return marker;
}

function addPlayerTrail(group, player) {
  const samples = player.samples || [];
  if (samples.length < 2) return;
  const baseColor = new THREE.Color(player.color || "#89938c");
  // Dim "ghost path" for whole-clip context; the comet trail (see updateCometTrail)
  // carries the primary, time-synced representation of recent movement.
  const observedOpacity = player.role === "shooter" ? 0.22 : 0.1;
  let run = [];
  let predictedRun = false;
  const flush = () => {
    if (run.length < 2) return;
    group.add(line(
      run.map((sample) => floorPoint(sample.x_ft, sample.y_ft, 0.07)),
      predictedRun ? COLORS.playerPredicted : baseColor,
      predictedRun ? 0.12 : observedOpacity,
    ));
  };
  const addBridge = (left, right) => {
    group.add(line(
      [floorPoint(left.x_ft, left.y_ft, 0.07), floorPoint(right.x_ft, right.y_ft, 0.07)],
      COLORS.playerPredicted,
      0.08,
    ));
  };
  for (let index = 1; index < samples.length; index += 1) {
    const left = samples[index - 1];
    const right = samples[index];
    const pairPredicted = Boolean(left.is_predicted || right.is_predicted);
    const gap = Number(right.time_s) - Number(left.time_s);
    if (identityIntervalBlocked(player, left.time_s, right.time_s)) {
      flush();
      run = [];
      continue;
    }
    if (gap > 0.35) {
      flush();
      run = [];
      continue;
    }
    if (gap > 0.18) {
      flush();
      run = [];
      addBridge(left, right);
      continue;
    }
    if (!run.length) {
      run = [left, right];
      predictedRun = pairPredicted;
    } else if (pairPredicted === predictedRun) {
      run.push(right);
    } else {
      flush();
      run = [left, right];
      predictedRun = pairPredicted;
    }
  }
  flush();
}

const TRAIL_WINDOW_S = 1.1;
const TRAIL_MAX_POINTS = 48;

function createCometTrail(color) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(TRAIL_MAX_POINTS * 3);
  const colors = new Float32Array(TRAIL_MAX_POINTS * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const mesh = new THREE.Line(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;
  return {
    mesh,
    positions,
    positionAttribute: geometry.attributes.position,
    colorAttribute: geometry.attributes.color,
    baseColor: new THREE.Color(color || "#89938c"),
  };
}

/**
 * Redraws a player's short "comet" trail for the current replay time: a
 * fading streak over the last TRAIL_WINDOW_S seconds that visually reads as
 * motion, layered above the dim whole-clip ghost path from addPlayerTrail.
 */
function updateCometTrail(marker, player, timeS, opacityScale = 1) {
  const comet = marker.userData.comet;
  if (!comet) return;
  const samples = player.samples || [];
  const windowStart = timeS - TRAIL_WINDOW_S;
  const recent = [];
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index];
    if (sample.time_s > timeS + 0.02) continue;
    if (sample.time_s < windowStart) break;
    if (identityIntervalBlocked(player, sample.time_s, timeS)) break;
    if (recent.length && recent[recent.length - 1].time_s - sample.time_s > 0.3) break;
    recent.push(sample);
    if (recent.length >= TRAIL_MAX_POINTS) break;
  }
  recent.reverse();
  const count = recent.length;
  if (count < 2) {
    comet.mesh.visible = false;
    comet.mesh.geometry.setDrawRange(0, 0);
    return;
  }
  comet.mesh.visible = true;
  comet.mesh.material.opacity = 0.92 * Math.max(0.05, Math.min(1, Number(opacityScale)));
  const floorColor = COMET_FLOOR_COLOR;
  for (let index = 0; index < count; index += 1) {
    const sample = recent[index];
    const age = Math.max(0, Math.min(1, (timeS - sample.time_s) / TRAIL_WINDOW_S));
    const point = floorPoint(sample.x_ft, sample.y_ft, 0.065);
    comet.positions[index * 3] = point.x;
    comet.positions[index * 3 + 1] = point.y;
    comet.positions[index * 3 + 2] = point.z;
    const tint = comet.baseColor.clone().lerp(floorColor, 0.15 + age * 0.75);
    comet.colorAttribute.setXYZ(index, tint.r, tint.g, tint.b);
  }
  comet.positionAttribute.needsUpdate = true;
  comet.colorAttribute.needsUpdate = true;
  comet.mesh.geometry.setDrawRange(0, count);
}

// Fixed-capacity floor ribbons retain their GPU buffers while scrubbing. Each
// pair is an independent quad, so missing samples never become a connecting line.
function coachingRibbonPool(capacity, color, opacity) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(capacity * 18);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color,
    transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.visible = false;
  return { mesh, capacity, positions, count: 0 };
}

function fillCoachingRibbons(pool, segments, width, dashed = false) {
  let count = 0;
  const append = (a, b) => {
    if (count >= pool.capacity) return;
    const dx = b.x_ft - a.x_ft, dy = b.y_ft - a.y_ft, length = Math.hypot(dx, dy);
    if (length < 0.001) return;
    const ox = -dy / length * width / 2, oy = dx / length * width / 2;
    const offset = count * 18;
    pool.positions.set([
      a.x_ft - 25 + ox, 0.16, a.y_ft + oy, a.x_ft - 25 - ox, 0.16, a.y_ft - oy,
      b.x_ft - 25 + ox, 0.16, b.y_ft + oy, b.x_ft - 25 + ox, 0.16, b.y_ft + oy,
      a.x_ft - 25 - ox, 0.16, a.y_ft - oy, b.x_ft - 25 - ox, 0.16, b.y_ft - oy,
    ], offset);
    count += 1;
  };
  for (const segment of segments) {
    if (!dashed) { append(segment.start, segment.end); continue; }
    const a = segment.start, b = segment.end;
    const length = Math.hypot(b.x_ft - a.x_ft, b.y_ft - a.y_ft);
    const parts = Math.max(1, Math.ceil(length / 0.65));
    for (let index = 0; index < parts && count < pool.capacity; index += 1) {
      const left = index / parts, right = (index + 0.52) / parts;
      append({ x_ft: a.x_ft + (b.x_ft - a.x_ft) * left, y_ft: a.y_ft + (b.y_ft - a.y_ft) * left },
        { x_ft: a.x_ft + (b.x_ft - a.x_ft) * right, y_ft: a.y_ft + (b.y_ft - a.y_ft) * right });
    }
  }
  pool.count = count;
  pool.mesh.geometry.attributes.position.needsUpdate = true;
  pool.mesh.geometry.setDrawRange(0, count * 6);
  pool.mesh.visible = count > 0;
}

function ensureCoachingGraphics() {
  if (sceneState.coachingGraphics || !sceneState.scene) return sceneState.coachingGraphics;
  const group = new THREE.Group();
  group.name = "coaching-evidence-overlays";
  const observed = coachingRibbonPool(640, COLORS.selected, 0.9);
  const estimated = coachingRibbonPool(1280, COLORS.playerAccent, 0.72);
  const teammates = coachingRibbonPool(24, COLORS.playerAccent, 0.72);
  const nearest = coachingRibbonPool(1, COLORS.selected, 0.92);
  const anchors = new THREE.InstancedMesh(new THREE.RingGeometry(0.07, 0.16, 12),
    new THREE.MeshBasicMaterial({ color: COLORS.selected, side: THREE.DoubleSide, depthWrite: false }), 640);
  anchors.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  anchors.frustumCulled = false; anchors.count = 0; anchors.renderOrder = 4;
  const anchorTransform = new THREE.Object3D(); anchorTransform.rotation.x = -Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.31, 48),
    new THREE.MeshBasicMaterial({ color: COLORS.selected, side: THREE.DoubleSide, transparent: true, opacity: 0.98, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 4;
  const labels = Array.from({ length: 12 }, () => {
    const canvas = document.createElement("canvas"); canvas.width = 192; canvas.height = 64;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    sprite.scale.set(3.9, 1.3, 1); sprite.renderOrder = 6; sprite.visible = false;
    group.add(sprite);
    return { canvas, texture, sprite, text: null };
  });
  group.add(observed.mesh, estimated.mesh, teammates.mesh, nearest.mesh, ring, anchors);
  sceneState.scene.add(group);
  sceneState.coachingGroup = group;
  sceneState.coachingGraphics = { observed, estimated, teammates, nearest, ring, labels, anchors, anchorTransform };
  return sceneState.coachingGraphics;
}

function getCoachingState() {
  return sceneState.coachingState;
}

function updateCoaching(forceNotify = false) {
  const replay = sceneState.replay;
  const visible = new Set([...sceneState.playerMarkers].filter(([, marker]) => marker.visible).map(([id]) => id));
  const state = buildCoachingState(replay, sceneState.replayTimeS, sceneState.coachingOptions, visible);
  sceneState.coachingState = state;
  const active = state.enabled && replay && sceneState.showPlayers;
  sceneState.playerGroup?.children.forEach(child => {
    if (child.userData.legacyPlayerHistory) child.visible = !state.enabled;
  });
  if (state.enabled) sceneState.playerMarkers.forEach(marker => {
    if (marker.userData.comet) marker.userData.comet.mesh.visible = false;
  });
  const graphics = active ? ensureCoachingGraphics() : sceneState.coachingGraphics;
  if (sceneState.coachingGroup) sceneState.coachingGroup.visible = Boolean(active);
  if (graphics && active) {
    const ringAnchor = state.selection.anchor;
    graphics.ring.visible = Boolean(ringAnchor);
    if (ringAnchor) {
      graphics.ring.position.copy(floorPoint(ringAnchor.x_ft, ringAnchor.y_ft, 0.2));
      graphics.ring.material.color.setHex(state.selection.status === "observed" ? COLORS.selected : COLORS.playerPredicted);
      graphics.ring.material.opacity = state.selection.status === "observed" ? 0.98 : 0.5;
    }
    const segments = state.showHistory ? state.trails.segments : [];
    const anchorPoints = state.showHistory ? state.trails.anchorPoints : [];
    graphics.anchors.count = Math.min(640, anchorPoints.length);
    for (let index = 0; index < graphics.anchors.count; index += 1) {
      const anchor = anchorPoints[index];
      graphics.anchorTransform.position.set(anchor.x_ft - 25, 0.185, anchor.y_ft);
      graphics.anchorTransform.updateMatrix(); graphics.anchors.setMatrixAt(index, graphics.anchorTransform.matrix);
    }
    graphics.anchors.instanceMatrix.needsUpdate = true;
    fillCoachingRibbons(graphics.observed, segments.filter(segment => segment.kind === "observed"), 0.17);
    fillCoachingRibbons(graphics.estimated, segments.filter(segment => segment.kind === "estimated"), 0.12, true);
    const connections = state.showSpacing ? state.connections : [];
    fillCoachingRibbons(graphics.teammates, connections.filter(connection => connection.kind === "teammate"), 0.085);
    fillCoachingRibbons(graphics.nearest, connections.filter(connection => connection.kind !== "teammate"), 0.13);
    graphics.labels.forEach((label, index) => {
      const connection = connections[index]; label.sprite.visible = Boolean(connection);
      if (!connection) return;
      const text = `\u2248 ${connection.distanceFt.toFixed(1)} ft`;
      if (label.text !== text) {
        const context = label.canvas.getContext("2d");
        context.clearRect(0, 0, 192, 64); context.fillStyle = "rgba(2,9,22,.94)"; context.fillRect(0, 0, 192, 64);
        context.strokeStyle = "#89b9d8"; context.lineWidth = 2; context.strokeRect(1, 1, 190, 62);
        context.font = "700 28px Segoe UI, Arial, sans-serif"; context.textBaseline = "middle"; context.textAlign = "center";
        context.fillStyle = "#f1f7ff"; context.fillText(text, 96, 32); label.texture.needsUpdate = true; label.text = text;
      }
      label.sprite.position.copy(floorPoint((connection.start.x_ft + connection.end.x_ft) / 2,
        (connection.start.y_ft + connection.end.y_ft) / 2, 0.75));
    });
  }
  // React controls receive at most eight playback updates per second. Explicit
  // configuration and non-local seeks update immediately; GPU ribbons still
  // follow every source-clock sample without a separate animation clock.
  const now = performance.now();
  const time = state.timeS;
  const seek = Number.isFinite(time) && Number.isFinite(sceneState.coachingLastTimeS)
    && (time < sceneState.coachingLastTimeS || Math.abs(time - sceneState.coachingLastTimeS) > 0.2);
  sceneState.coachingLastTimeS = time;
  if (forceNotify || seek || now - sceneState.coachingLastNotifyMs >= 125) {
    sceneState.coachingLastNotifyMs = now;
    window.dispatchEvent(new CustomEvent("courtvision-coaching-change", { detail: state }));
  }
}

function configureCoaching(options = {}) {
  sceneState.coachingOptions = normalizeCoachingOptions(options, sceneState.coachingOptions);
  if (sceneState.replay && Number.isFinite(sceneState.replayTimeS)) setReplayTime(sceneState.replayTimeS);
  updateCoaching(true);
  return getCoachingState();
}

function setupCoachingInput(canvas) {
  sceneState.coachingInputCleanup?.();
  let down = null;
  const canSelect = () => sceneState.coachingOptions.enabled && sceneState.annotationMode === "navigate" && sceneState.showPlayers;
  const onDown = event => {
    if (!canSelect() || event.button !== 0 || event.isPrimary === false) { down = null; return; }
    down = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now(), moved: false };
  };
  const onMove = event => {
    if (down && (event.pointerId !== down.id || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6)) down.moved = true;
  };
  const onCancel = () => { down = null; };
  const onUp = event => {
    const start = down; down = null;
    if (!start || start.id !== event.pointerId || start.moved || !canSelect() || performance.now() - start.at > 650
      || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const pointer = new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    sceneState.scene.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    // Sprite labels participate in avatar picking and require the camera even
    // when a source-projection ray is constructed manually below.
    raycaster.camera = sceneState.camera;
    const near = new THREE.Vector3(pointer.x, pointer.y, -1).unproject(sceneState.camera);
    const far = new THREE.Vector3(pointer.x, pointer.y, 1).unproject(sceneState.camera);
    raycaster.ray.set(near, far.sub(near).normalize());
    const markers = [...sceneState.playerMarkers.values()].filter(marker => marker.visible);
    const hit = raycaster.intersectObjects(markers, true)[0];
    let object = hit?.object;
    while (object && !object.userData?.player) object = object.parent;
    const player = object?.userData?.player;
    if (!player) return;
    const playerId = player.profile_id || player.marker_id;
    configureCoaching({ selectedPlayerId: playerId });
    window.dispatchEvent(new CustomEvent("courtvision-coaching-select", { detail: { playerId, markerId: player.marker_id } }));
  };
  const listeners = [["pointerdown", onDown], ["pointermove", onMove], ["pointerup", onUp], ["pointercancel", onCancel]];
  listeners.forEach(([name, handler]) => canvas.addEventListener(name, handler));
  sceneState.coachingInputCleanup = () => listeners.forEach(([name, handler]) => canvas.removeEventListener(name, handler));
}

function updateReplay(replay, options = {}) {
  clearReplay();
  if (!sceneState.scene || !replay?.available) return;
  replay = normalizeReplayPredictionLabels(replay);
  sceneState.replay = replay;
  // Load the shared asset even when the opening source frame has no supported
  // people. Markers remain lazy and evidence-gated; an initial gap must not
  // defer asset loading until the first supported frame is already playing.
  if (replay.players?.length) requestPlayerAvatar();
  sceneState.coachingOptions = normalizeCoachingOptions({ trustedTeams: replay.coaching?.trusted_teams || {} }, sceneState.coachingOptions);
  if (replay.shot?.source_fit || replay.shot?.source_contact_fit?.accepted === true) {
    // The event endpoint owns the source-fitted flight. The dashboard summary
    // may still contain its older generic arc; never render that stale curve.
    drawShots({ shots: [replay.shot] }, replay.shot.event_id, false);
  }
  const replayCourt = replay.court || sceneState.courtConfig;
  if (replayCourt) {
    updateCourtContext({
      ...replayCourt,
      active_hoop_id: replay.active_hoop_id || replayCourt.active_hoop_id,
    });
  } else if (replay.active_hoop_id) {
    sceneState.activeHoopId = String(replay.active_hoop_id);
    setView(sceneState.currentView);
  }
  setFullTrajectoryVisibility(options.showFutureTrajectory === true);
  sceneState.showPlayers = options.showPlayers !== false;
  const group = new THREE.Group();
  replay.players.forEach((player) => {
    const beforeHistory = group.children.length;
    addPlayerTrail(group, player);
    group.children.slice(beforeHistory).forEach(child => { child.userData.legacyPlayerHistory = true; });
    // Only supported visible fragments need an avatar. Long broadcast payloads
    // can contain many successive fragments for the same ten court positions.
    // Each fragment retains its own cached marker; no identities are merged.
  });
  for (const { left, right } of ballContextSampler(replay.ball)?.segments || []) {
    const temporal = left.provenance === "temporal_model_candidate" || right.provenance === "temporal_model_candidate";
    const handlerPredicted = left.provenance === "handler_relative_physics_prediction"
      || right.provenance === "handler_relative_physics_prediction";
    const inferred = !temporal && !handlerPredicted
      && (left.provenance !== "model_detection" || right.provenance !== "model_detection");
    const segment = line(
      [worldPoint(left), worldPoint(right)],
      handlerPredicted ? COLORS.ballHandlerPredicted
        : temporal ? COLORS.ballTemporal : inferred ? COLORS.ballInferred : COLORS.ballObserved,
      handlerPredicted ? 0.42 : temporal ? 0.46 : inferred ? 0.28 : 0.58,
    );
    segment.visible = false;
    group.add(segment);
    sceneState.ballTrailSegments.push({
      mesh: segment,
      startS: finiteNumber(left.time_s, Number.NEGATIVE_INFINITY),
      endS: finiteNumber(right.time_s, Number.POSITIVE_INFINITY),
    });
  }
  (replay.ball?.dribble_candidates || []).forEach((candidate) => {
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.68, 28),
      new THREE.MeshBasicMaterial({
        color: COLORS.dribble,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.82,
      }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.copy(floorPoint(candidate.x_ft, candidate.y_ft, 0.075));
    marker.visible = false;
    group.add(marker);
    sceneState.dribbleMarkers.push({
      mesh: marker,
      timeS: finiteNumber(candidate.time_s, NaN),
    });
  });
  sceneState.scene.add(group);
  sceneState.playerGroup = group;
  setView(sceneState.currentView);
  setReplayTime(replay.timeline.start_s);
}

function setPlayersVisible(visible) {
  sceneState.showPlayers = Boolean(visible);
  if (sceneState.playerGroup) sceneState.playerGroup.visible = sceneState.showPlayers;
  updateCoaching(true);
}

function setReplayTime(timeS) {
  if (!sceneState.replay) return [];
  if (!Number.isFinite(Number(timeS))) return [];
  const timeline = sceneState.replay.timeline;
  const clamped = Math.max(timeline.start_s, Math.min(timeline.end_s, Number(timeS)));
  sceneState.replayTimeS = clamped;
  if (sceneState.currentView === "film" && !applySourceCamera()) setView("film", { immediate: true });
  updateElapsedBallEvidence(clamped);
  const playerStates = [];
  const contextualBall = ballSampleAt(sceneState.replay.ball, clamped);
  const continuousMultiview = sceneState.replay.playback_mode === "continuous_multiview";
  const candidates = [];
  sceneState.playerMarkers.forEach(marker => {
    marker.visible = false;
    if (marker.userData.comet) marker.userData.comet.mesh.visible = false;
  });
  sceneState.replay.players.forEach((player) => {
    const sample = playerSampleAt(player, clamped);
    if (sample) candidates.push({ player, sample });
  });
  candidates.sort((first, second) => (
    Number(second.player.role === "shooter") - Number(first.player.role === "shooter")
    || Number(first.sample.temporal_gap_s || 0) - Number(second.sample.temporal_gap_s || 0)
    || Number(Boolean(second.player.profile_id)) - Number(Boolean(first.player.profile_id))
    || Number(second.sample.confidence || 0) - Number(first.sample.confidence || 0)
  ));
  const expectedPlayers = Number(sceneState.replay.expected_players || 0);
  const visibleCandidates = expectedPlayers > 0 ? candidates.slice(0, expectedPlayers) : candidates;
  visibleCandidates.forEach(({ player, sample }) => {
    const marker = replayPlayerMarker(player);
    marker.visible = true;
    marker.userData.currentSample = sample;
    const staleFade = Number.isFinite(Number(sample.stale_fade))
      ? Number(sample.stale_fade)
      : 1;
    setPlayerEvidenceStyle(marker, Boolean(sample.is_predicted), staleFade);
    marker.position.set(sample.x_ft - 25, 0, sample.y_ft);
    const direction = new THREE.Vector3(sample.heading_x, 0, sample.heading_y);
    if (direction.lengthSq() > 0.01) marker.userData.arrow.setDirection(direction.normalize());
    marker.userData.arrow.setLength(Math.max(0.8, Math.min(3.1, sample.speed_ft_s * 0.23)), 0.48, 0.3);
    marker.userData.arrow.visible = sample.speed_ft_s >= 1.0;
    const motionSource = updateArticulatedAvatar(
      marker,
      player,
      sample,
      clamped,
      timeline,
      contextualBall,
    );
    // Chronoscope owns the visible history in coaching mode; the hidden legacy
    // comet does not need new vertices and colors until that mode is disabled.
    if (!sceneState.coachingOptions.enabled) updateCometTrail(marker, player, clamped, staleFade);
    playerStates.push({
      marker_id: player.marker_id,
      profile_id: player.profile_id,
      label: player.label,
      role: player.role,
      identity_source: player.identity_source,
      color: player.color,
      x_ft: sample.x_ft,
      y_ft: sample.y_ft,
      speed_ft_s: sample.speed_ft_s,
      motion_source: motionSource,
      avatar_geometry: marker.userData.rig?.skinnedAvatar?.root.visible
        ? "blender-skinned-constellation-v1" : "solid-articulated-v2",
      pose_details: marker.userData.rig?.poseDiagnostics || null,
      position_source: sample.position_source || "model_detection",
      is_predicted: Boolean(sample.is_predicted),
      prediction_confidence: sample.is_predicted
        ? Number(sample.prediction_confidence || sample.confidence || 0)
        : null,
      pose_confidence: marker.userData.rig?.poseDiagnostics?.confidence ?? null,
      head_attachment_gap_ft: Number(
        marker.userData.rig?.head?.userData?.attachmentGapFt || 0,
      ),
      action: player.role === "shooter" && Math.abs(clamped - timeline.release_s) <= 0.22
        ? "shot release"
        : sample.action,
    });
  });
  sceneState.playerMarkers.forEach(marker => {
    if (marker.visible) return;
    marker.removeFromParent();
    marker.userData.comet?.mesh.removeFromParent();
  });
  if (sceneState.playerGroup) sceneState.playerGroup.visible = sceneState.showPlayers;
  if (sceneState.ball) {
    const release = timeline.release_s;
    const result = timeline.result_s;
    const shot = sceneState.selectedShot;
    const contextual = Boolean(sceneState.replay.ball?.context_scope);
    const inFlight = Number.isFinite(release) && Number.isFinite(result) && clamped >= release && clamped <= result;
    const hasFlight = shot && shot.ball_trajectory_available !== false && (shot.points || []).length >= 2;
    let nextPosition = null;
    let provenance = "unsupported_source_interval";
    let phase = clamped < release ? "pre_release_unobserved" : clamped > result ? "post_result_unobserved" : "trajectory_withheld";
    let ballStaleFade = 1;
    let sample = null;
    // A source-fitted/reviewed shot retains authority during its own flight.
    // Full-clip context is independent of that flight's start and end points.
    if (!continuousMultiview && inFlight && hasFlight) {
      const normalizedDuration = Math.max(.01, result - release);
      const sourceDuration = Math.max(.01, Number(shot.flight_time_s || normalizedDuration));
      // Divide before scaling: multiplying first can round the exact result
      // timestamp past the last observed point and hide that source frame.
      const sourceFraction = Math.max(0, Math.min(1, (clamped - release) / normalizedDuration));
      const resolved = shotPositionAfterRelease(shot, sourceFraction * sourceDuration);
      nextPosition = resolved.position;
      phase = resolved.phase;
      provenance = shot.source_contact_fit?.accepted === true
        ? "source_contact_trajectory_candidate"
        : shot.source_fit ? "source_fitted_flight_candidate" : "physics_shot_estimate";
    } else if (contextualBall) {
      sample = contextualBall;
      nextPosition = worldPoint(sample);
      provenance = sample.provenance || sample.position_source || "model_detection";
      ballStaleFade = Number.isFinite(sample.stale_fade) ? sample.stale_fade : 1;
      phase = continuousMultiview ? "multiview_observed" : clamped < release ? "pre_release_context"
        : clamped > result ? "post_result_context" : "flight_source_context";
    } else if (!contextual && !continuousMultiview && hasFlight && clamped > result) {
      // Keep older sessions' explicit post-flight contracts. A new full-clip
      // source context never falls back to a guessed rebound or endless rim hold.
      const sourceDuration = Math.max(.01, Number(shot.flight_time_s || result - release));
      const resolved = shotPositionAfterRelease(shot, sourceDuration + clamped - result);
      nextPosition = resolved.position;
      phase = resolved.phase;
      provenance = "physics_shot_estimate";
    }
    sceneState.ball.visible = Boolean(nextPosition);
    sceneState.ball.userData.replayPhase = phase;
    sceneState.ball.userData.evidence = {
      visible: Boolean(nextPosition), phase, provenance,
      time_s: clamped,
      confidence: Number.isFinite(sample?.confidence) ? sample.confidence : null,
      is_predicted: sample ? Boolean(sample.is_predicted) : Boolean(nextPosition),
      source_observed: sample ? sample.source_observed === true : false,
      depth_status: sample?.depth_status || (nextPosition && !continuousMultiview ? "estimated_not_metric_3d_measurement" : null),
      interpolation: sample?.interpolation || null,
      segment_id: sample?.segment_id ?? null,
      continuity_id: sample?.continuity_id ?? null,
      support_frames: sample?.support_frames || [],
      support_start_s: sample?.support_start_s ?? null,
      support_end_s: sample?.support_end_s ?? null,
      height_source: sample?.height_source ?? null,
      reacquisition_candidate: sample?.reacquisition_candidate ?? null,
      temporal_gap_s: sample?.temporal_gap_s ?? null,
    };
    if (nextPosition) {
      // Decorative spin follows the source clock; it is not measured ball spin.
      const spin = (Math.max(0, clamped - timeline.start_s) * 9) % (Math.PI * 2);
      sceneState.ball.rotation.set(spin, 0, -spin * .23);
      sceneState.ball.position.copy(nextPosition);
      sceneState.ballLastPosition = nextPosition.clone();
      setBallEvidenceStyle(sceneState.ball, provenance, ballStaleFade);
    } else {
      sceneState.ballLastPosition = null;
    }
  }
  updateCoaching();
  return playerStates;
}

function update(data, options = {}) {
  if (!sceneState.container || !data?.available) return;
  if (!sceneState.scene) createScene(sceneState.container, data);
  updateCourtContext(data.court);
  drawShots(data, options.selectedId, options.showAll !== false);
  resize();
}

function init(container) {
  if (sceneState.scene && sceneState.container !== container) {
    sceneState.annotationInputCleanup?.();
    sceneState.annotationInputCleanup = null;
    sceneState.coachingInputCleanup?.();
    sceneState.coachingInputCleanup = null;
    if (sceneState.resizeObserver) sceneState.resizeObserver.disconnect();
    sceneState.controls?.dispose();
    disposePlayerMarkers();
    disposeObject(sceneState.scene);
    sceneState.renderer?.dispose();
    sceneState.container?.replaceChildren();
    sceneState.scene = null;
    sceneState.camera = null;
    sceneState.renderer = null;
    sceneState.controls = null;
    sceneState.courtGroup = null;
    sceneState.courtConfig = null;
    sceneState.courtSignature = null;
    sceneState.activeHoopId = "left";
    sceneState.currentView = "broadcast";
    sceneState.dynamicGroup = null;
    sceneState.playerGroup = null;
    sceneState.annotationGroup = null;
    sceneState.annotationStrokes = [];
    sceneState.annotationHistory = new AnnotationHistory();
    sceneState.annotationMeshes = new Map();
    sceneState.annotationPreview = null;
    sceneState.annotationEraseOriginal = null;
    sceneState.annotationPointerId = null;
    sceneState.annotationMode = "navigate";
    sceneState.activeAnnotation = null;
    sceneState.playerMarkers = new Map();
    sceneState.ball = null;
    sceneState.selectedShot = null;
    sceneState.replay = null;
    sceneState.replayTimeS = null;
    sceneState.ballLastPosition = null;
    sceneState.ballTrailSegments = [];
    sceneState.dribbleMarkers = [];
    sceneState.shotProgressLine = null;
    sceneState.fullTrajectoryVisible = true;
    sceneState.resizeObserver = null;
    sceneState.cameraTween = null;
    sceneState.sourceOrbitAnchor = null;
    sceneState.orbitCameraMode = "legacy_perspective";
    sceneState.coachingOptions = normalizeCoachingOptions();
    sceneState.coachingState = null;
    sceneState.coachingGroup = null;
    sceneState.coachingGraphics = null;
    sceneState.coachingLastTimeS = null;
    sceneState.coachingLastNotifyMs = 0;
  }
  sceneState.container = container;
}

function play() {
  if (sceneState.replay) return;
  if (!sceneState.selectedShot || !sceneState.ball) return;
  sceneState.animationStart = performance.now();
  sceneState.animationDurationMs = Math.max(
    650,
    (
      Number(sceneState.selectedShot.flight_time_s || 1)
      + Number(sceneState.selectedShot.post_result_duration_s || 0)
    ) * 1000,
  );
  sceneState.ball.visible = true;
  setBallEvidenceStyle(sceneState.ball);
}

function fittedBasketCamera(position, target, dimensions, attacksRight) {
  const camera = sceneState.camera;
  const away = position.clone().sub(target).normalize();
  const right = new THREE.Vector3().crossVectors(camera.up, away).normalize();
  const up = new THREE.Vector3().crossVectors(away, right).normalize();
  const tangentY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.88;
  const tangentX = tangentY * Math.max(0.1, camera.aspect);
  const halfLength = Math.min(HALF_COURT_LENGTH_FT, dimensions.length);
  const start = attacksRight ? dimensions.length - halfLength : 0;
  const end = attacksRight ? dimensions.length : halfLength;
  let distance = position.distanceTo(target);
  // Fit the actual half-court width, player height and basket equipment in the
  // current viewport. Split film/replay panels can be narrower than a square;
  // a fixed camera distance otherwise clips the near-side corner shooter.
  for (const x of [-dimensions.width / 2 - 2, dimensions.width / 2 + 2]) {
    for (const y of [0, BACKBOARD_TOP_HEIGHT_FT + 1]) {
      for (const z of [start - 2, end + 2]) {
        const relative = new THREE.Vector3(x, y, z).sub(target);
        const depth = relative.dot(away);
        distance = Math.max(distance,
          depth + Math.abs(relative.dot(right)) / tangentX,
          depth + Math.abs(relative.dot(up)) / tangentY);
      }
    }
  }
  return target.clone().addScaledVector(away, distance);
}

function applySourceCamera() {
  const { camera, controls, container, replay } = sceneState;
  if (!camera || !controls || !container) return false;
  const timeS = sceneState.replayTimeS ?? replay?.timeline?.release_s;
  const sample = sourceProjectionAt(replay?.source_projection, Number(timeS));
  const held = !sample && sourceGapDisplaySample(replay, Number(timeS), sceneState.sourceFilmAnchor);
  const values = sourceClipMatrix(sample || held, container.clientWidth, container.clientHeight);
  sceneState.sourceCameraDisplayHeld = Boolean(held && values);
  if (!values) {
    sceneState.sourceCameraStatus = "source_projection_unavailable";
    return false;
  }
  sceneState.sourceCameraSample = sample;
  sceneState.sourceCameraStatus = held ? "source_projection_unavailable" : "source_aligned_2_5d_candidate";
  if (sample) sceneState.sourceFilmAnchor = { replay, sample };
  sceneState.cameraTween = null;
  // The historical renderer swaps court Y/Z, reversing handedness. Correct
  // winding for this projective camera, then undo this presentation basis in
  // the projection itself. Source coordinates and projected pixels stay exact.
  if (sceneState.scene.scale.x !== -1) {
    sceneState.scene.scale.x = -1;
    sceneState.scene.updateMatrixWorld(true);
  }
  controls.enabled = false;
  // This fixed orthogonal basis makes text/sprites face source-screen right.
  // The complete projective view below owns framing, including pan and zoom.
  camera.position.set(-100, 0, 0);
  controls.target.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  camera.lookAt(controls.target);
  camera.updateMatrixWorld(true);
  const sourceMatrix = new THREE.Matrix4().set(...values).multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  camera.projectionMatrix.copy(sourceMatrix).multiply(camera.matrixWorld);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  if (sceneState.scene?.fog) {
    sceneState.scene.fog.near = 1e6;
    sceneState.scene.fog.far = 2e6;
  }
  return true;
}

function sourceOrbitFocus(timeS) {
  const dimensions = courtDimensions();
  const points = (sceneState.replay?.players || []).map(player => playerSampleAt(player, timeS))
    .filter(point => point && validAnnotationPoint(point, dimensions));
  const hoop = activeHoop();
  const fallbackY = dimensions.fullCourt && hoop.id === "right"
    ? dimensions.length - Math.min(47, dimensions.length) / 2 : Math.min(47, dimensions.length) / 2;
  return {
    x_ft: points.length ? points.reduce((sum,point)=>sum+point.x_ft,0)/points.length : dimensions.width/2,
    y_ft: points.length ? points.reduce((sum,point)=>sum+point.y_ft,0)/points.length : fallbackY,
    z_ft: 3,
  };
}

function applySourceOrbitProjection() {
  const { sourceOrbitAnchor: anchor, camera, container } = sceneState;
  if (!anchor || anchor.replay !== sceneState.replay || !camera || !container) return false;
  const values = sourceClipMatrix(anchor.sample, container.clientWidth, container.clientHeight);
  if (!values) return false;
  // Freeze the source intrinsics at orbit entry. The current view matrix is
  // free to rotate; at zero rotation these factors reproduce Film exactly.
  const sourceMatrix = new THREE.Matrix4().set(...values).multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  camera.projectionMatrix.copy(sourceMatrix).multiply(anchor.referenceCameraWorld);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return true;
}

function startSourceOrbit(sample, focus, timeS) {
  const center = sourceCameraCenter(sample);
  if (!center) return false;
  const target = worldPoint(focus); target.x *= -1;
  const position = worldPoint(center); position.x *= -1;
  const distance = position.distanceTo(target);
  if (distance < 18 || distance > 10000) return false;
  sceneState.controls.maxDistance = Math.max(155, distance * 2);
  sceneState.cameraTween = null;
  synchronizeOrbitCamera(position, target);
  sceneState.sourceOrbitAnchor = {
    sample, timeS, replay: sceneState.replay, center, focus,
    referenceCameraWorld: sceneState.camera.matrixWorld.clone(),
  };
  sceneState.orbitCameraMode = "source_projective_orbit_candidate";
  sceneState.sourceCameraSample = sample;
  sceneState.sourceCameraStatus = "source_orbit_2_5d_candidate";
  if (sceneState.scene?.fog) {
    sceneState.scene.fog.near = 1e6;
    sceneState.scene.fog.far = 2e6;
  }
  return applySourceOrbitProjection();
}

function setView(view, { immediate = false } = {}) {
  if (!sceneState.camera || !sceneState.controls) return;
  if (!["film", "broadcast", "sideline", "top"].includes(view)) return;
  finishActiveAnnotation(false);
  synchronizeOrbitCamera(sceneState.camera.position.clone(), sceneState.controls.target.clone());
  sceneState.sourceOrbitAnchor = null;
  sceneState.orbitCameraMode = view === "film" ? "source_locked" : "legacy_perspective";
  sceneState.currentView = view;
  sceneState.cameraPresetActive = true;
  setAnnotationMode(sceneState.annotationMode);
  if (view === "film" && applySourceCamera()) return;
  const sourceTime = Number(sceneState.replayTimeS ?? sceneState.replay?.timeline?.start_s);
  const sourceSample = view !== "film" ? sourceProjectionAt(sceneState.replay?.source_projection, sourceTime) : null;
  const sourceFocus = sourceSample ? sourceOrbitFocus(sourceTime) : null;
  // Preserve the same source presentation handedness through every source-aware
  // preset. This changes camera framing only; tracked coordinates stay intact.
  sceneState.scene.scale.x = sourceSample ? -1 : 1;
  sceneState.scene.updateMatrixWorld(true);
  sceneState.controls.enabled = sceneState.annotationMode === "navigate" && view !== "film";
  if (view !== "film") {
    sceneState.sourceCameraSample = null;
    sceneState.sourceCameraDisplayHeld = false;
    sceneState.sourceCameraStatus = "inactive";
  }
  if (view === "broadcast" && sourceSample && startSourceOrbit(sourceSample, sourceFocus, sourceTime)) return;
  const dimensions = courtDimensions();
  const hoop = activeHoop();
  const attacksRight = dimensions.fullCourt && hoop.id === "right";
  const mirrorY = (leftY) => (attacksRight ? dimensions.length - leftY : leftY);
  const presets = dimensions.fullCourt ? {
    broadcast: {
      position: [0, 25, mirrorY(63)],
      target: [hoop.x_ft - DEFAULT_HOOP_X_FT, 5, mirrorY(13)],
    },
    sideline: {
      position: [38, 20, mirrorY(31)],
      target: [hoop.x_ft - DEFAULT_HOOP_X_FT, 5, mirrorY(14)],
    },
    top: {
      position: [0, 67, mirrorY(25)],
      target: [0, 0, mirrorY(21)],
    },
  } : {
    broadcast: { position: [0, 25, 63], target: [0, 5, 13] },
    sideline: { position: [38, 20, 31], target: [0, 5, 14] },
    top: { position: [0, 67, 25], target: [0, 0, 21] },
  };
  const preset = presets[view] || presets.broadcast;
  let target = new THREE.Vector3(...preset.target);
  let position = new THREE.Vector3(...preset.position);
  if (sourceSample) {
    const center = sourceCameraCenter(sourceSample);
    const screenRight = sourceFloorScreenRight(sourceSample, sourceFocus);
    // Source side, in the corrected renderer basis. An affine/orthographic
    // projection can still supply its screen-right floor tangent as fallback.
    const away = center
      ? new THREE.Vector3(-(center.x_ft - sourceFocus.x_ft), 0, center.y_ft - sourceFocus.y_ft).normalize()
      : new THREE.Vector3(-Number(screenRight?.y_ft ?? 1), 0, -Number(screenRight?.x_ft ?? 0)).normalize();
    target = worldPoint(sourceFocus); target.x *= -1;
    if (view === "top") {
      target.y = 0;
      position = target.clone().addScaledVector(away, 4).add(new THREE.Vector3(0, 67, 0));
    } else if (view === "sideline") {
      position = target.clone().add(new THREE.Vector3(Math.sign(away.x || -1) * 50, 27, 0));
    } else {
      position = target.clone().addScaledVector(away, 50).add(new THREE.Vector3(0, 27, 0));
    }
    position = fittedBasketCamera(position, target, dimensions, attacksRight);
    sceneState.orbitCameraMode = "source_side_perspective_candidate";
  } else if (view === "broadcast" || !presets[view]) {
    const direction = position.clone().sub(target);
    target.z = mirrorY(Math.min(HALF_COURT_LENGTH_FT, dimensions.length) / 2);
    position = fittedBasketCamera(target.clone().add(direction), target, dimensions, attacksRight);
  }
  const distance = position.distanceTo(target);
  sceneState.controls.maxDistance = Math.max(155, distance * 1.5);
  sceneState.camera.far = Math.max(240, distance + dimensions.length + 60);
  sceneState.camera.updateProjectionMatrix();
  if (sceneState.scene?.fog) {
    sceneState.scene.fog.near = Math.max(65, distance + 30);
    sceneState.scene.fog.far = Math.max(115, distance + dimensions.length + 55);
  }
  if (immediate || sceneState.annotationMode !== "navigate" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    sceneState.cameraTween = null;
    synchronizeOrbitCamera(position, target);
    return;
  }
  // Ease between framings instead of cutting instantly, so the camera move
  // itself communicates spatial continuity (see animate() for the tween step).
  sceneState.cameraTween = {
    fromPosition: sceneState.camera.position.clone(),
    toPosition: position,
    fromTarget: sceneState.controls.target.clone(),
    toTarget: target,
    start: performance.now(),
    duration: 550,
  };
}

function synchronizeOrbitCamera(position, target) {
  const { camera, controls } = sceneState;
  if (!camera || !controls) return;
  // Drain pending orbit damping using the supported update API, then apply the
  // command exactly. A keyboard tap must not inherit an old pointer velocity.
  const damping = controls.enableDamping;
  const autoRotate = controls.autoRotate;
  controls.enableDamping = false;
  controls.autoRotate = false;
  controls.update();
  camera.position.copy(position);
  controls.target.copy(target);
  controls.update();
  controls.enableDamping = damping;
  controls.autoRotate = autoRotate;
  camera.updateMatrixWorld(true);
}

function changeOrbitCamera(options) {
  const { camera, controls } = sceneState;
  if (!camera || !controls || sceneState.currentView === "film") return false;
  const pose = orbitCameraPose(camera.position.toArray(), controls.target.toArray(), {
    ...options, minDistance: controls.minDistance, maxDistance: controls.maxDistance,
    minPolarAngle: controls.minPolarAngle, maxPolarAngle: controls.maxPolarAngle,
  });
  if (!pose) return false;
  sceneState.cameraTween = null;
  sceneState.cameraPresetActive = false;
  synchronizeOrbitCamera(new THREE.Vector3(...pose.position), new THREE.Vector3(...pose.target));
  return true;
}

function rotateCamera(deltaYaw, deltaPitch = 0) {
  return changeOrbitCamera({ yaw: deltaYaw, pitch: deltaPitch });
}

function zoomCamera(factor) {
  return changeOrbitCamera({ factor });
}

function captureSnapshot() {
  return captureRendererSnapshot(sceneState.renderer, sceneState.scene, sceneState.camera, THREE);
}

function resize() {
  const { container, renderer, camera } = sceneState;
  if (!container || !renderer || !camera) return;
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (applySourceOrbitProjection()) return;
  if (sceneState.cameraPresetActive) setView(sceneState.currentView, { immediate: true });
}

function animate(time = performance.now()) {
  sceneState.animationFrame = requestAnimationFrame(animate);
  if (sceneState.cameraTween && sceneState.camera && sceneState.controls) {
    const tween = sceneState.cameraTween;
    const fraction = Math.max(0, Math.min(1, (time - tween.start) / tween.duration));
    const eased = fraction < 0.5
      ? 4 * fraction * fraction * fraction
      : 1 - ((-2 * fraction + 2) ** 3) / 2;
    sceneState.camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
    sceneState.controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
    if (fraction >= 1) sceneState.cameraTween = null;
  }
  if (sceneState.animationStart !== null && sceneState.selectedShot && sceneState.ball) {
    const elapsed = time - sceneState.animationStart;
    const fraction = Math.min(1, elapsed / sceneState.animationDurationMs);
    const totalSeconds = (
      Number(sceneState.selectedShot.flight_time_s || 1)
      + Number(sceneState.selectedShot.post_result_duration_s || 0)
    );
    const resolved = shotPositionAfterRelease(sceneState.selectedShot, fraction * totalSeconds);
    sceneState.ball.visible = Boolean(resolved.position);
    if (resolved.position) sceneState.ball.position.copy(resolved.position);
    sceneState.ball.userData.replayPhase = resolved.phase;
    if (fraction >= 1) sceneState.animationStart = null;
  }
  if (sceneState.annotationMode === "navigate" && !sceneState.sourceCameraDisplayHeld
    && (sceneState.currentView !== "film" || sceneState.sourceCameraStatus !== "source_aligned_2_5d_candidate")) sceneState.controls?.update();
  if (sceneState.renderer && sceneState.scene && sceneState.camera) {
    updatePlayerLabelScales();
    sceneState.renderer.render(sceneState.scene, sceneState.camera);
  }
}

function avatarPoseDiagnostics(marker) {
  const pose = marker?.userData?.rig?.poseDiagnostics;
  return {
    motion_source: pose?.source || 'unavailable',
    // Bounded fields from the rig actually updated this frame. Do not copy
    // every joint into performance diagnostics or imply anatomical truth.
    pose_details: pose ? {
      source: pose.source,
      geometryStatus: pose.geometryStatus,
      confidence: pose.confidence,
      supportedJoints: pose.supportedJoints,
      floorAnchorUnchanged: pose.floorAnchorUnchanged,
      measuredFullBody3D: pose.measuredFullBody3D,
    } : null,
  };
}

function getDiagnostics() {
  if (!sceneState.camera || !sceneState.scene || !sceneState.controls || !sceneState.renderer) {
    return {
      renderer_ready: false, selected_event_id: null, player_positions: [],
      camera_view: sceneState.currentView, source_camera: { status: "initializing" },
      annotation_count: sceneState.annotationStrokes.length,
      annotation_can_undo: sceneState.annotationHistory.past.length > 0,
      annotation_can_redo: sceneState.annotationHistory.future.length > 0,
    };
  }
  const playerHeadGaps = [];
  const playerPositions = [];
  sceneState.playerMarkers.forEach((marker, markerId) => {
    if (!marker.visible) return;
    playerHeadGaps.push({
      marker_id: markerId,
      gap_ft: Number(marker.userData.rig?.head?.userData?.attachmentGapFt || 0),
    });
    const projection = (point) => {
      const ndc = point.project(sceneState.camera);
      return { x_ndc: ndc.x, y_ndc: ndc.y, z_ndc: ndc.z,
        in_frustum: Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1 };
    };
    const head = marker.userData.rig?.head?.getWorldPosition(new THREE.Vector3());
    playerPositions.push({
      marker_id: markerId,
      ...avatarPoseDiagnostics(marker),
      x: marker.position.x,
      y: marker.position.y,
      z: marker.position.z,
      is_predicted: Boolean(marker.userData.currentSample?.is_predicted),
      position_source: marker.userData.currentSample?.position_source || "model_detection",
      // Report the mesh actually shown, independently of the shared asset's
      // loading status. A loaded template does not prove every pose retargeted.
      avatar_geometry: marker.userData.rig?.skinnedAvatar?.root.visible
        ? "blender-skinned-constellation-v1" : "solid-articulated-v2",
      screen_position: projection(sceneState.scene.localToWorld(marker.position.clone())),
      head_screen_position: head ? projection(head) : null,
    });
  });
  const dimensions = courtDimensions();
  const hoops = normalizedHoops(sceneState.courtConfig, dimensions);
  const basketEquipment = hoops.map((hoop) => {
    const board = normalizedBackboard(sceneState.courtConfig, hoop, dimensions);
    const courtFacingDirection = hoop.id === "right" && dimensions.fullCourt ? -1 : 1;
    const rimMajorRadiusFt = hoop.inner_diameter_ft / 2 + RIM_TUBE_RADIUS_FT;
    return {
      hoop_id: hoop.id,
      requested_inner_diameter_ft: hoop.inner_diameter_ft,
      rendered_inner_diameter_ft: 2 * (rimMajorRadiusFt - RIM_TUBE_RADIUS_FT),
      rim_major_radius_ft: rimMajorRadiusFt,
      rim_tube_radius_ft: RIM_TUBE_RADIUS_FT,
      backboard_y_ft: board.y_ft,
      backboard_center_height_ft: BACKBOARD_TOP_HEIGHT_FT - board.height_ft / 2,
      backboard_top_height_ft: BACKBOARD_TOP_HEIGHT_FT,
      target_plane_y_ft: board.y_ft + courtFacingDirection * (
        BACKBOARD_DEPTH_FT / 2 + BACKBOARD_TARGET_FACE_OFFSET_FT
      ),
      target_bottom_height_ft: BACKBOARD_TARGET_BOTTOM_HEIGHT_FT,
      target_top_height_ft: (
        BACKBOARD_TARGET_BOTTOM_HEIGHT_FT + BACKBOARD_TARGET_HEIGHT_FT
      ),
    };
  });
  const visibleFutureTrajectories = [];
  sceneState.dynamicGroup?.traverse((object) => {
    if (object.userData?.futureTrajectory && object.visible) {
      visibleFutureTrajectories.push(object.uuid);
    }
  });
  return {
    selected_event_id: sceneState.selectedShot?.event_id || null,
    renderer_ready: true,
    player_asset: avatarAssetStatus(),
    selected_outcome: sceneState.selectedShot?.outcome || null,
    replay_time_s: sceneState.replayTimeS,
    ball_visible: Boolean(sceneState.ball?.visible),
    ball_phase: sceneState.ball?.userData?.replayPhase || null,
    ball_evidence: sceneState.ball?.userData?.evidence || null,
    ball_context_sample_count: sceneState.replay?.ball?.samples?.length || 0,
    ball_context_scope: sceneState.replay?.ball?.context_scope || null,
    ball_position: sceneState.ball?.visible ? {
      x: sceneState.ball.position.x,
      y: sceneState.ball.position.y,
      z: sceneState.ball.position.z,
    } : null,
    selected_target_position: sceneState.selectedShot?.target_point
      ? (() => {
        const target = worldPoint(sceneState.selectedShot.target_point);
        return { x: target.x, y: target.y, z: target.z };
      })()
      : null,
    replay_timeline: sceneState.replay?.timeline || null,
    court_scope: dimensions.scope,
    coordinate_space: dimensions.coordinateSpace,
    court_dimensions: {
      width_ft: dimensions.width,
      length_ft: dimensions.length,
    },
    active_hoop_id: sceneState.activeHoopId,
    hoops: hoops.map((hoop) => ({
      id: hoop.id,
      x_ft: hoop.x_ft,
      y_ft: hoop.y_ft,
      z_ft: hoop.z_ft,
    })),
    basket_equipment: basketEquipment,
    camera_view: sceneState.currentView,
    source_camera: {
      status: sceneState.sourceCameraStatus,
      display_only_held: sceneState.sourceCameraDisplayHeld,
      display_reference_frame: sceneState.sourceCameraDisplayHeld ? sceneState.sourceFilmAnchor?.sample.frame_index ?? null : null,
      geometry_frame: sceneState.sourceCameraSample?.frame_index ?? null,
      segment_id: sceneState.sourceCameraSample?.segment_id ?? null,
      vertical_model: sceneState.sourceCameraSample?.vertical_model ?? null,
      interpolation: sceneState.sourceCameraSample?.interpolation ?? "geometry_sample",
      support_frames: sceneState.sourceCameraSample?.support_frames ?? null,
      height_prediction: Boolean(sceneState.sourceCameraSample?.height_prediction),
      coordinate_reflection_applied: false,
    },
    camera_position: sceneState.camera.position.toArray(),
    camera_aspect: sceneState.camera.aspect,
    camera_projection_matrix: sceneState.camera.projectionMatrix.toArray(),
    camera_world_matrix: sceneState.camera.matrixWorld.toArray(),
    renderer_canvas_size: [sceneState.renderer.domElement.width, sceneState.renderer.domElement.height],
    renderer_memory: { ...sceneState.renderer.info.memory },
    renderer_target_active: Boolean(sceneState.renderer.getRenderTarget()),
    camera_target: sceneState.controls.target.toArray(),
    camera_preset_active: sceneState.cameraPresetActive,
    orbit_camera: {
      mode: sceneState.orbitCameraMode,
      source_frame: sceneState.sourceOrbitAnchor?.sample.frame_index ?? null,
      source_time_s: sceneState.sourceOrbitAnchor?.timeS ?? null,
      source_camera_center_candidate: sceneState.sourceOrbitAnchor?.center ?? null,
      focus: sceneState.sourceOrbitAnchor?.focus ?? null,
      source_basis_preserved: sceneState.scene.scale.x === -1,
      coordinates_changed: false,
    },
    future_trajectory_visible: visibleFutureTrajectories.length > 0,
    future_trajectory_object_count: visibleFutureTrajectories.length,
    trajectory_render_mode: sceneState.replay
      ? (sceneState.fullTrajectoryVisible ? "full_analysis" : "elapsed_only")
      : "full_scene",
    elapsed_trajectory_visible: Boolean(sceneState.shotProgressLine?.visible),
    visible_ball_history_segments: sceneState.ballTrailSegments.filter(({ mesh }) => mesh.visible).length,
    visible_player_count: playerHeadGaps.length,
    player_head_gaps: playerHeadGaps,
    player_positions: playerPositions,
    annotation_mode: sceneState.annotationMode,
    annotation_count: sceneState.annotationStrokes.length,
    annotation_scope_key: sceneState.annotationHistory.scopeKey,
    annotation_can_undo: sceneState.annotationHistory.past.length > 0,
    annotation_can_redo: sceneState.annotationHistory.future.length > 0,
    annotation_point_count: sceneState.annotationStrokes.reduce((sum, stroke) => sum + stroke.points.length, 0),
    annotation_mesh_count: sceneState.annotationMeshes.size,
    annotation_pointer_active: sceneState.annotationPointerId !== null,
    camera_orbit_enabled: Boolean(sceneState.controls.enabled),
    presentation_theme: sceneState.courtGroup?.userData.presentationTheme ?? null,
    coaching: { ...sceneState.coachingState, graphics: sceneState.coachingGraphics ? {
      visible: Boolean(sceneState.coachingGroup?.visible),
      selected_ring_visible: sceneState.coachingGraphics.ring.visible,
      observed_ribbon_quads: sceneState.coachingGraphics.observed.count,
      observed_anchor_count: sceneState.coachingGraphics.anchors.count,
      estimated_ribbon_quads: sceneState.coachingGraphics.estimated.count,
      teammate_connection_quads: sceneState.coachingGraphics.teammates.count,
      nearest_connection_quads: sceneState.coachingGraphics.nearest.count,
      visible_distance_labels: sceneState.coachingGraphics.labels.filter(label => label.sprite.visible).length,
    } : null },
  };
}

function getPixelDiagnostics() {
  const renderer = sceneState.renderer;
  if (!renderer || !sceneState.scene || !sceneState.camera) return null;
  renderer.render(sceneState.scene, sceneState.camera);
  const context = renderer.getContext();
  const width = context.drawingBufferWidth;
  const height = context.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, pixels);
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 180));
  let sampled = 0;
  let opaque = 0;
  let nonBackground = 0;
  const colors = new Set();
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];
      sampled += 1;
      if (alpha > 0) opaque += 1;
      if (Math.abs(red - 24) + Math.abs(green - 32) + Math.abs(blue - 28) > 24) {
        nonBackground += 1;
      }
      colors.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
    }
  }
  return {
    width,
    height,
    sampled_pixels: sampled,
    opaque_pixels: opaque,
    non_background_pixels: nonBackground,
    quantized_color_count: colors.size,
  };
}

window.CourtVision3D = {
  init,
  update,
  updateReplay,
  clearReplay,
  setReplayTime,
  setPlayersVisible,
  play,
  setView,
  rotateCamera,
  zoomCamera,
  captureSnapshot,
  resize,
  getDiagnostics,
  getPixelDiagnostics,
  setAnnotationMode,
  setAnnotationColor,
  loadAnnotations,
  getAnnotations,
  undoAnnotation,
  redoAnnotation,
  clearAnnotations,
  configureCoaching,
  getCoachingState,
};
window.dispatchEvent(new CustomEvent("courtvision-3d-ready"));
