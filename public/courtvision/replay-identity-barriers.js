// Explicit source-review abstentions are stronger than generic occlusion holds.
// Coordinates remain in anonymous source markers; named traces stop at the gap.
const TIME_EPSILON = 0.0001; // Existing CSV source clocks round to 0.1 ms.
const compiled = new WeakMap();
const visibilityCompiled = new WeakMap();
const finite = value => typeof value === 'number' && Number.isFinite(value);

function intervals(player) {
  if (!player?.profile_id || player.identity_barriers == null) return [];
  const source = player.identity_barriers;
  let cached = compiled.get(player);
  if (cached?.source === source) return cached.intervals;
  const valid = Array.isArray(source) && source.every(barrier => barrier && finite(barrier.start_s)
    && finite(barrier.end_s) && barrier.start_s >= 0 && barrier.end_s >= barrier.start_s);
  const result = valid ? source.map(barrier => [barrier.start_s, barrier.end_s]) : null;
  compiled.set(player, {source, intervals: result});
  return result;
}

export function identityIntervalBlocked(player, firstTime, lastTime = firstTime) {
  if (!identityAbstentionVisible(player, firstTime, lastTime)) return true;
  const ranges = intervals(player);
  if (ranges === null) return true; // Malformed explicit review never restores a name.
  if (!ranges.length) return false;
  if (!finite(firstTime) || !finite(lastTime)) return true;
  const start = Math.min(firstTime, lastTime), end = Math.max(firstTime, lastTime);
  return ranges.some(([left, right]) => start <= right + TIME_EPSILON && end >= left - TIME_EPSILON);
}

export function identityAbstentionVisible(player, firstTime, lastTime = firstTime) {
  const source = player?.identity_abstention_intervals;
  if (source == null) return true;
  if (!finite(firstTime) || !finite(lastTime)) return false;
  let cached = visibilityCompiled.get(player);
  if (cached?.source !== source) {
    const valid = Array.isArray(source) && source.every(interval => interval && finite(interval.start_s)
      && finite(interval.end_s) && interval.start_s >= 0 && interval.end_s >= interval.start_s);
    cached = {source, intervals: valid ? source.map(interval => [interval.start_s, interval.end_s]) : []};
    visibilityCompiled.set(player, cached);
  }
  const first = Math.min(firstTime, lastTime), last = Math.max(firstTime, lastTime);
  return cached.intervals.some(([start, end]) => first >= start - TIME_EPSILON && last <= end + TIME_EPSILON);
}
