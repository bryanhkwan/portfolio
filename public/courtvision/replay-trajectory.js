// Source-clock interpolation for reconstructed flight, independent of draw FPS.
// Geometry splines parameterized by point index change velocity when timestamps
// are uneven. Hermite tangents here are derivatives in feet per source second.
export function timedTrajectory(points) {
  const fields = ["x_ft", "y_ft", "z_ft"];
  const rows = (points || []).map((point) => ({
    t: Number(point.t_s), values: fields.map((field) => Number(point[field])),
  }));
  if (rows.length < 2 || rows.some((row, index) => (
    !Number.isFinite(row.t) || row.values.some((value) => !Number.isFinite(value))
    || (index > 0 && row.t <= rows[index - 1].t)
  ))) return null;
  const slopes = rows.slice(1).map((row, index) => row.values.map(
    (value, axis) => (value - rows[index].values[axis]) / (row.t - rows[index].t),
  ));
  const tangents = rows.map((row, index) => fields.map((_, axis) => {
    if (rows.length === 2) return slopes[0][axis];
    if (index === 0) {
      const h = rows[1].t - row.t;
      return slopes[0][axis] - h * (slopes[1][axis] - slopes[0][axis]) / (rows[2].t - row.t);
    }
    if (index === rows.length - 1) {
      const h = row.t - rows[index - 1].t;
      return slopes[index - 1][axis] + h * (slopes[index - 1][axis] - slopes[index - 2][axis]) / (row.t - rows[index - 2].t);
    }
    const left = row.t - rows[index - 1].t;
    const right = rows[index + 1].t - row.t;
    return (right * slopes[index - 1][axis] + left * slopes[index][axis]) / (left + right);
  }));
  return {
    start: rows[0].t,
    end: rows[rows.length - 1].t,
    at(time) {
      if (!Number.isFinite(time)) return null;
      const t = Math.max(rows[0].t, Math.min(rows[rows.length - 1].t, time));
      let low = 0;
      let high = rows.length - 1;
      while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (rows[middle].t <= t) low = middle; else high = middle;
      }
      const h = rows[high].t - rows[low].t;
      const u = (t - rows[low].t) / h;
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
      const h10 = u ** 3 - 2 * u ** 2 + u;
      const h01 = -2 * u ** 3 + 3 * u ** 2;
      const h11 = u ** 3 - u ** 2;
      return Object.fromEntries(fields.map((field, axis) => [field,
        h00 * rows[low].values[axis] + h10 * h * tangents[low][axis]
        + h01 * rows[high].values[axis] + h11 * h * tangents[high][axis],
      ]));
    },
  };
}

const BALL_AXES = ["x_ft", "y_ft", "z_ft"];
const finite = value => typeof value === "number" && Number.isFinite(value);
const BALL_TIME_EPSILON = .0001; // Existing CSV clocks are rounded to 0.1 ms.
const REACQUISITION_STATUS = "bounded_same_player_source_fragment_reacquisition_candidate_not_identity_truth";
const sameMetadata = (left, right, keys) => Boolean(left && right && keys.every(key => (
  left[key] === undefined && right[key] === undefined || left[key] === right[key]
)));

// A candidate certificate only relaxes a detector-ID boundary. It does not
// merge identities, remove camera/depth barriers, or create new missing frames.
function reacquisitionLinks(rows, maximumGap) {
  const byFrame = new Map();
  for (const row of rows) {
    if (Number.isInteger(row.frame_index)) byFrame.set(row.frame_index,
      byFrame.has(row.frame_index) ? null : row);
  }
  const keyOf = certificate => {
    if (!certificate || typeof certificate.id !== "string" || !certificate.id.trim()
      || certificate.status !== REACQUISITION_STATUS
      || typeof certificate.supporting_player_marker_id !== "string" || !certificate.supporting_player_marker_id.trim()
      || !Array.isArray(certificate.source_track_ids) || certificate.source_track_ids.length !== 2
      || certificate.source_track_ids.some(id => typeof id !== "string" || !id.trim() || id === "unassigned")
      || certificate.source_track_ids[0] === certificate.source_track_ids[1]
      || !Array.isArray(certificate.support_frames) || certificate.support_frames.length !== 2
      || !Array.isArray(certificate.neighbor_support_frames) || certificate.neighbor_support_frames.length !== 2
      || [...certificate.support_frames, ...certificate.neighbor_support_frames].some(frame => !Number.isInteger(frame) || frame < 0)
      || !(certificate.neighbor_support_frames[0] < certificate.support_frames[0]
        && certificate.support_frames[0] < certificate.support_frames[1]
        && certificate.support_frames[1] < certificate.neighbor_support_frames[1])) return null;
    return JSON.stringify([certificate.id, certificate.source_track_ids, certificate.support_frames,
      certificate.neighbor_support_frames, certificate.supporting_player_marker_id]);
  };
  const idKeys = new Map();
  for (const row of rows) {
    const certificate = row.reacquisition_candidate;
    if (!certificate || typeof certificate.id !== "string") continue;
    const key = keyOf(certificate);
    idKeys.set(certificate.id, idKeys.has(certificate.id) && idKeys.get(certificate.id) !== key ? null : key);
  }
  const accepted = new Map();
  for (const row of rows) {
    const certificate = row.reacquisition_candidate, key = keyOf(certificate);
    if (!key || accepted.has(key) || idKeys.get(certificate.id) !== key) continue;
    const [startFrame, endFrame] = certificate.support_frames;
    const first = byFrame.get(startFrame), last = byFrame.get(endFrame);
    const before = byFrame.get(certificate.neighbor_support_frames[0]);
    const after = byFrame.get(certificate.neighbor_support_frames[1]);
    const observed = point => point?.source_observed === true && point.is_predicted === false;
    const commonKeys = ["segment_id", "continuity_id", "height_source"];
    if (!observed(first) || !observed(last) || !observed(before) || !observed(after)
      || first.source_track_id !== certificate.source_track_ids[0] || last.source_track_id !== certificate.source_track_ids[1]
      || before.source_track_id !== first.source_track_id || after.source_track_id !== last.source_track_id
      || before.segment_id !== first.segment_id || after.segment_id !== last.segment_id
      || !finite(before.confidence) || !finite(after.confidence) || before.confidence < .4 || after.confidence < .4
      || first.time_s <= before.time_s || after.time_s <= last.time_s
      || first.time_s - before.time_s > .1 + BALL_TIME_EPSILON || after.time_s - last.time_s > .1 + BALL_TIME_EPSILON
      || last.time_s - first.time_s <= 0 || last.time_s - first.time_s > .45 + BALL_TIME_EPSILON
      || commonKeys.some(field => first[field] === undefined || first[field] === null)
      || !sameMetadata(first, last, commonKeys)
      || first.depth_anchor_marker_id !== certificate.supporting_player_marker_id
      || last.depth_anchor_marker_id !== certificate.supporting_player_marker_id
      || keyOf(first.reacquisition_candidate) !== key || keyOf(last.reacquisition_candidate) !== key) continue;
    const chain = rows.filter(point => point.time_s >= first.time_s && point.time_s <= last.time_s);
    const supported = chain.every((point, index) => {
      if (keyOf(point.reacquisition_candidate) !== key || !sameMetadata(first, point, commonKeys)
        || !certificate.source_track_ids.includes(point.source_track_id)
        || !Number.isInteger(point.frame_index) || point.frame_index < startFrame || point.frame_index > endFrame) return false;
      const previous = chain[index - 1];
      if (previous && (point.sourceIndex !== previous.sourceIndex + 1
        || point.frame_index <= previous.frame_index || point.time_s - previous.time_s > maximumGap + BALL_TIME_EPSILON)) return false;
      if (point === first || point === last) return true;
      return point.is_predicted === true && point.source_observed === false
        && point.supporting_player_marker_id === certificate.supporting_player_marker_id
        && Array.isArray(point.support_frames) && point.support_frames.length === 2
        && point.support_frames[0] === startFrame && point.support_frames[1] === endFrame;
    });
    if (supported) accepted.set(key, { first, last });
  }
  return (left, right) => {
    const key = keyOf(left?.reacquisition_candidate);
    if (!key || keyOf(right?.reacquisition_candidate) !== key) return false;
    const bounds = accepted.get(key);
    return Boolean(bounds && left.time_s >= bounds.first.time_s && right.time_s <= bounds.last.time_s);
  };
}

function floorContactLinks(rows, ball) {
  if (!ball.context_scope || ball.context_fit_status !== "validated_source_floor_contact_candidate") return () => false;
  const keyOf = certificate => {
    if (!certificate || certificate.status !== "source_reviewed_floor_contact_candidate"
      || typeof certificate.id !== "string" || !certificate.id.trim()
      || typeof certificate.context_fit_id !== "string" || !certificate.context_fit_id.trim()
      || !Array.isArray(certificate.source_track_ids) || certificate.source_track_ids.length !== 2
      || certificate.source_track_ids.some(id => typeof id !== "string" || !id.trim() || id === "unassigned")
      || certificate.source_track_ids[0] === certificate.source_track_ids[1]
      || !Array.isArray(certificate.support_frames) || certificate.support_frames.length !== 2
      || certificate.support_frames.some(frame => !Number.isInteger(frame) || frame < 0)
      || certificate.support_frames[1] !== certificate.support_frames[0] + 1) return null;
    return JSON.stringify([certificate.id, certificate.context_fit_id, certificate.source_track_ids, certificate.support_frames]);
  };
  const accepted = new Set();
  for (let index = 1; index < rows.length; index++) {
    const left = rows[index - 1], right = rows[index], certificate = left.floor_contact_candidate;
    const key = keyOf(certificate);
    if (!key || keyOf(right.floor_contact_candidate) !== key
      || right.sourceIndex !== left.sourceIndex + 1
      || left.frame_index !== certificate.support_frames[0] || right.frame_index !== certificate.support_frames[1]
      || left.source_track_id !== certificate.source_track_ids[0] || right.source_track_id !== certificate.source_track_ids[1]
      || right.time_s <= left.time_s || right.time_s - left.time_s > 1/30 + BALL_TIME_EPSILON
      || ["segment_id", "continuity_id", "height_source"].some(field => left[field] === undefined || left[field] === null)
      || !sameMetadata(left, right, ["segment_id", "continuity_id", "height_source"])) continue;
    const supported = [left, right].every(point => point.source_observed === true && point.is_predicted === false
      && point.context_fit_id === certificate.context_fit_id
      && Array.isArray(point.contact_support_frames) && point.contact_support_frames.length === 2
      && point.contact_support_frames[0] === certificate.support_frames[0] && point.contact_support_frames[1] === certificate.support_frames[1]
      && Array.isArray(point.height_interval_ft) && point.height_interval_ft.length === 2
      && point.height_interval_ft.every(finite) && point.height_interval_ft[0] >= 0
      && point.height_interval_ft[1] <= 16 && point.height_interval_ft[0] <= point.height_interval_ft[1]
      && point.z_ft >= point.height_interval_ft[0] - 1e-5 && point.z_ft <= point.height_interval_ft[1] + 1e-5);
    if (supported) accepted.add(left.sourceIndex);
  }
  // Only these exact two source observations can connect. The certificate is
  // never reused to extend the fitted segment or connect a later detector ID.
  return (left, right) => Boolean(left && right && accepted.has(left.sourceIndex) && right.sourceIndex === left.sourceIndex + 1);
}

/** Timestamp sampling for observed/context ball evidence, independent of flight. */
export function createBallSampler(ball = {}, { legacyEndpointHoldS = .2 } = {}) {
  const maximumGap = finite(ball.maximum_interpolation_gap_s) && ball.maximum_interpolation_gap_s > 0
    ? ball.maximum_interpolation_gap_s : .12;
  const nearestDelta = finite(ball.maximum_nearest_delta_s) && ball.maximum_nearest_delta_s >= 0
    ? ball.maximum_nearest_delta_s : maximumGap / 2;
  const rows = (Array.isArray(ball.samples) ? ball.samples : []).map((sample, sourceIndex) => (
    sample && finite(sample.time_s) && BALL_AXES.every(axis => finite(sample[axis])) && sample.z_ft >= 0
      ? { ...sample, sourceIndex } : null
  )).filter(Boolean);
  // Duplicate or reversed timestamps are ambiguous evidence, not a path to sort
  // into a plausible movement. Invalid rows also remain interpolation barriers.
  const valid = rows.every((row, index) => index === 0 || row.time_s > rows[index - 1].time_s);
  const reacquired = valid ? reacquisitionLinks(rows, maximumGap) : () => false;
  const floorContact = valid ? floorContactLinks(rows, ball) : () => false;
  const compatibleSupport = (left, right) => Boolean(sameMetadata(left, right,
    ["segment_id", "continuity_id", "height_source", "source_track_root", "track_id", "track_root"])
    && (left.source_track_id === right.source_track_id || reacquired(left, right) || floorContact(left, right)));
  const linked = (left, right) => Boolean(compatibleSupport(left, right)
    && right.sourceIndex === left.sourceIndex + 1
    && right.time_s > left.time_s && right.time_s - left.time_s <= maximumGap + 1e-7);
  const segments = valid ? rows.slice(1).flatMap((right, index) => linked(rows[index], right)
    ? [{ left: rows[index], right }] : []) : [];
  const resultAtSample = (sample, time, held = false, fade = 1) => ({
    ...sample, time_s: time, source_time_s: sample.time_s,
    provenance: sample.provenance || sample.position_source || "model_detection",
    temporal_gap_s: Math.abs(sample.time_s - time),
    source_observed: held ? false : sample.source_observed ?? !sample.is_predicted,
    is_predicted: held || Boolean(sample.is_predicted),
    interpolation: held ? "nearest_supported_sample" : "source_sample",
    is_stale: held, stale_fade: fade,
  });
  const slope = (left, right, axis) => (right[axis] - left[axis]) / (right.time_s - left.time_s);
  const tangent = (index, axis, fallback) => {
    const previous = rows[index - 1], current = rows[index], next = rows[index + 1];
    if (!linked(previous, current) || !linked(current, next)) return fallback;
    const before = slope(previous, current, axis), after = slope(current, next, axis);
    if (before * after <= 0) return 0;
    const leftSpan = current.time_s - previous.time_s, rightSpan = next.time_s - current.time_s;
    const firstWeight = 2 * rightSpan + leftSpan, secondWeight = rightSpan + 2 * leftSpan;
    return (firstWeight + secondWeight) / (firstWeight / before + secondWeight / after);
  };
  return {
    samples: valid ? rows : [], segments,
    at(time) {
      if (!valid || !rows.length || !finite(time)) return null;
      const first = rows[0], last = rows[rows.length - 1];
      if (time < first.time_s - BALL_TIME_EPSILON || time > last.time_s + BALL_TIME_EPSILON) {
        if (ball.no_extrapolation === true) return null;
        const nearest = time < first.time_s ? first : last;
        const gap = Math.abs(time - nearest.time_s);
        if (gap > legacyEndpointHoldS) return null;
        return resultAtSample(nearest, time, true, gap <= .055 ? 1 : Math.max(0, 1 - gap / legacyEndpointHoldS));
      }
      let low = 0, high = rows.length - 1;
      while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (rows[middle].time_s <= time) low = middle; else high = middle;
      }
      const left = rows[low], right = rows[high];
      if (Math.abs(time - left.time_s) <= BALL_TIME_EPSILON) return resultAtSample(left, time);
      if (Math.abs(time - right.time_s) <= BALL_TIME_EPSILON) return resultAtSample(right, time);
      if (!linked(left, right)) {
        // A cut, changed source track, depth ambiguity or invalid row is a hard
        // barrier. Even a nearby anchor cannot be carried across that boundary.
        if (ball.context_scope && (!compatibleSupport(left, right) || right.sourceIndex !== left.sourceIndex + 1)) return null;
        const nearest = Math.abs(time - left.time_s) <= Math.abs(time - right.time_s) ? left : right;
        return Math.abs(time - nearest.time_s) <= nearestDelta ? resultAtSample(nearest, time, true) : null;
      }
      const span = right.time_s - left.time_s;
      const u = Math.max(0, Math.min(1, (time - left.time_s) / span));
      const nearest = u < .5 ? left : right;
      const result = resultAtSample(nearest, time);
      for (const axis of BALL_AXES) {
        const segmentSlope = slope(left, right, axis);
        const startSlope = tangent(low, axis, segmentSlope), endSlope = tangent(high, axis, segmentSlope);
        const value = (2*u**3-3*u*u+1)*left[axis] + (u**3-2*u*u+u)*span*startSlope
          + (-2*u**3+3*u*u)*right[axis] + (u**3-u*u)*span*endSlope;
        // Shape-preserving tangents plus a numeric bound prevent invented
        // overshoots, floor penetrations, or a new bounce between observations.
        const boundedValue = finite(value) ? value : (1-u)*left[axis] + u*right[axis];
        result[axis] = Math.max(Math.min(left[axis], right[axis]), Math.min(Math.max(left[axis], right[axis]), boundedValue));
      }
      result.provenance = ball.context_scope ? "source_endpoint_interpolation" : "short_gap_interpolation";
      result.position_source = result.provenance;
      result.interpolation = "bounded_source_time_cubic";
      result.is_predicted = true;
      result.source_observed = false;
      result.is_stale = false;
      result.confidence = finite(left.confidence) && finite(right.confidence)
        ? Math.min(left.confidence, right.confidence) : null;
      result.support_start_s = left.support_start_s ?? left.time_s;
      result.support_end_s = right.support_end_s ?? right.time_s;
      result.support_frames = [...new Set([...(left.support_frames || [left.frame_index]), ...(right.support_frames || [right.frame_index])].filter(finite))];
      return result;
    },
  };
}
