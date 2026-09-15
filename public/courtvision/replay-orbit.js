// Pure camera command math. Source/Film projection is deliberately excluded.
export function orbitCameraPose(position, target, { yaw = 0, pitch = 0, factor = 1, minDistance = 18, maxDistance = 155, minPolarAngle = 0.025, maxPolarAngle = Math.PI / 2.04 } = {}) {
  if (!Array.isArray(position) || !Array.isArray(target) || position.length !== 3 || target.length !== 3
    || ![...position, ...target, yaw, pitch, factor, minDistance, maxDistance, minPolarAngle, maxPolarAngle].every(Number.isFinite)
    || factor <= 0 || minDistance <= 0 || maxDistance < minDistance || maxPolarAngle < minPolarAngle) return null;
  const [x, y, z] = position.map((value, index) => value - target[index]);
  const radius = Math.hypot(x, y, z);
  if (radius < 0.001) return null;
  const theta = Math.atan2(x, z) + yaw;
  const phi = Math.max(minPolarAngle, Math.min(maxPolarAngle, Math.acos(Math.max(-1, Math.min(1, y / radius))) + pitch));
  const distance = Math.max(minDistance, Math.min(maxDistance, radius * factor));
  return {
    position: [target[0] + distance * Math.sin(phi) * Math.sin(theta), target[1] + distance * Math.cos(phi), target[2] + distance * Math.sin(phi) * Math.cos(theta)],
    target: [...target],
    distance,
  };
}
