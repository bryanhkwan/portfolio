import { GLTFLoader } from "./GLTFLoader.js";

let cached;
// This original Blender mesh is presentation beneath the playing surface.
// The existing court dimensions, floor, lines, baskets and calibration stay authoritative.
export function attachCourtPlinth(parent, dimensions) {
  cached ||= new GLTFLoader().loadAsync(new URL("./constellation-court-v1.glb", import.meta.url).href)
    .then(gltf => gltf.scene).catch(() => null);
  cached.then(template => {
    if (!template || !parent.parent) return;
    const model = template.clone(true);
    model.name = "Blender Constellation court plinth";
    model.traverse(node => {
      if (!node.isMesh) return;
      node.geometry = node.geometry.clone();
      node.material = Array.isArray(node.material) ? node.material.map(m => m.clone()) : node.material.clone();
    });
    model.scale.set(dimensions.width / 50, 1, dimensions.length / 94);
    model.position.z = dimensions.length / 2;
    parent.add(model);
  });
}
