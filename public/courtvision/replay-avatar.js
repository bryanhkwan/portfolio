import * as THREE from "three";
import { GLTFLoader } from "./GLTFLoader.js";
import { clone as cloneSkeleton } from "./SkeletonUtils.js";

// One compact, original Blender asset per browser. Its animation is entirely
// driven by the existing bounded source-time pose; no idle/gait clips run here.
export const AVATAR_ASSET_URL = new URL("./constellation-player-v1.glb", import.meta.url).href;
let template = null;
let pending = null;
let loadError = null;
const up = new THREE.Vector3(0, 1, 0);
const unitScale = new THREE.Vector3(1, 1, 1);

export function avatarAssetStatus() {
  return { status: template ? "ready" : loadError ? "fallback" : pending ? "loading" : "idle",
    geometry: template ? "blender-skinned-constellation-v1" : "solid-articulated-v2",
    error: loadError, url: AVATAR_ASSET_URL };
}

export function preloadPlayerAvatar() {
  if (pending) return pending;
  pending = new GLTFLoader().loadAsync(AVATAR_ASSET_URL).then(gltf => {
    let metadata = null;
    gltf.scene.traverse(node => { if (node.userData.cv_bones_json) metadata = node.userData; });
    const specs = JSON.parse(metadata?.cv_bones_json || "null");
    if (metadata?.cv_schema !== "courtvision.constellation-rig.v1" || !Array.isArray(specs)
      || specs.length < 16) throw Error("Player asset has an unsupported skeleton");
    gltf.scene.updateMatrixWorld(true);
    for (const spec of specs) {
      const bone = gltf.scene.getObjectByName(spec.name);
      if (!bone?.isBone || ![...spec.center, ...spec.direction, spec.length].every(Number.isFinite)
        || spec.length <= 0) throw Error(`Invalid player bone ${spec.name}`);
    }
    template = { scene: gltf.scene, specs };
    return avatarAssetStatus();
  }).catch(error => {
    // A network/device/asset failure keeps the existing articulated mannequin.
    // It must never make film, camera controls or annotations unavailable.
    loadError = String(error?.message || error);
    return avatarAssetStatus();
  });
  return pending;
}

function restFrame(spec) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...spec.center),
    new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(...spec.direction).normalize()), unitScale);
}

export function createSkinnedPlayer(player) {
  if (!template) return null;
  const root = cloneSkeleton(template.scene);
  root.name = "Constellation source-pose athlete";
  const evidenceMaterials = [];
  const materials = new Map();
  const focus = player.role === "shooter";
  // Team/profile colour remains a trim cue. No ethnicity, face or real uniform
  // is guessed from a P-number. The selected shooter remains Rocket Gold.
  const accent = new THREE.Color(focus ? 0xffd200 : player.color || "#78dcf5");
  root.traverse(node => {
    if (node.isMesh) {
      node.geometry = node.geometry.clone(); // Independent disposal from other players/cache.
      const adapt = original => {
        if (materials.has(original)) return materials.get(original);
        const material = original.clone();
        if (material.name.includes("jersey")) {
          material.color.set(focus ? 0xffd200 : 0x053365);
          material.emissive.copy(accent).multiplyScalar(.07);
        }
        if (material.name.includes("seam")) {
          material.color.copy(accent);
          material.emissive.copy(accent);
          material.emissiveIntensity = .35;
        }
        material.userData.observedOpacity = material.opacity;
        materials.set(original, material);
        evidenceMaterials.push(material);
        return material;
      };
      node.material = Array.isArray(node.material) ? node.material.map(adapt) : adapt(node.material);
      node.castShadow = true;
      node.receiveShadow = true;
      // Poses change beyond the bind-pose bounds. Avoid GPU skinning being
      // culled using a stale rest-pose bounding sphere.
      node.frustumCulled = false;
    }
  });
  root.updateMatrixWorld(true);
  const bones = template.specs.map(spec => {
    const bone = root.getObjectByName(spec.name);
    const targetName = spec.name.slice(3);
    const partGroup = targetName.endsWith("_hand") ? "hands" : targetName.endsWith("_shoe") ? "shoes" : null;
    return { spec, bone, inverseRestFrame: restFrame(spec).invert(),
      restBone: bone.matrixWorld.clone(), parentRest: bone.parent.matrixWorld.clone(),
      parentName: bone.parent.isBone ? bone.parent.name : null,
      targetName, partGroup, partKey: partGroup ? (targetName.startsWith("left") ? "left" : "right") : targetName,
      targetMatrix: new THREE.Matrix4(), targetScale: new THREE.Vector3(1, 1, 1) };
  });
  const indexed = new Map(bones.map((row, index) => [row.spec.name, index]));
  bones.forEach((row, index) => {
    const parentIndex = row.parentName ? indexed.get(row.parentName) : null;
    row.parentRow = parentIndex != null && parentIndex < index ? bones[parentIndex] : null;
  });
  return { root, bones, evidenceMaterials, geometry: "blender-skinned-constellation-v1" };
}

function targetFor(row, rig) {
  const { spec } = row;
  const name = row.targetName;
  const part = row.partGroup ? rig[row.partGroup]?.[row.partKey] : rig.segments[name] || rig[name];
  if (!part) return null;
  const scale = row.targetScale.set(1, 1, 1);
  if (name === "torso") scale.set(part.scale.x, part.scale.y / spec.length, 1);
  else if (name === "neck" || rig.segments[name]) scale.y = part.scale.y / spec.length;
  // Small screen-foreshortened limbs stay tied to observed endpoints. Do not
  // lengthen them toward invented depth or animate beyond the source clock.
  scale.y = Math.max(.006, scale.y);
  return row.targetMatrix.compose(part.position, part.quaternion, scale);
}

export function retargetSkinnedPlayer(avatar, rig) {
  for (const row of avatar.bones) {
    const target = targetFor(row, rig);
    if (!target) return false;
    const absolute = target.multiply(row.inverseRestFrame).multiply(row.restBone);
    const parent = row.parentName ? row.parentRow?.targetMatrix : row.parentRest;
    if (!parent) return false;
    // Retarget absolute part frames through the actual hierarchical skeleton.
    // Keep matrices directly: decomposing a scaled parent can introduce shear
    // drift when a foreshortened upper limb and forearm point differently.
    row.bone.matrix.copy(parent).invert().multiply(absolute);
    row.bone.matrixAutoUpdate = false;
    row.bone.matrixWorldNeedsUpdate = true;
  }
  avatar.root.updateMatrixWorld(true);
  return true;
}
