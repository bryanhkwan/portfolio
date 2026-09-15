// A source projection changes the view only. Court-space evidence is immutable.
const SOURCE_TIME_EPSILON_S = 0.0001; // Existing geometry stamps round to 4 decimals.
export function sourceProjectionAt(timeline, timeS) {
  const samples = timeline?.samples || [];
  if (!samples.length || !Number.isFinite(timeS)) return null;
  const sourceIntervals = timeline?.source_intervals;
  let sourceInterval = null;
  if (sourceIntervals != null) {
    if (!Array.isArray(sourceIntervals) || !sourceIntervals.every(span => span
      && Number.isFinite(span.start_s) && Number.isFinite(span.end_s)
      && span.start_s >= 0 && span.start_s <= span.end_s)) return null;
    sourceInterval = sourceIntervals.find(span => timeS >= span.start_s - SOURCE_TIME_EPSILON_S
      && timeS <= span.end_s + SOURCE_TIME_EPSILON_S);
    if (!sourceInterval) return null;
  }
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (samples[middle].time_s < timeS) low = middle + 1;
    else high = middle;
  }
  const candidates = samples.slice(Math.max(0, low - 1), Math.min(samples.length, low + 1))
    .filter(sample => !sourceInterval || (sample.time_s >= sourceInterval.start_s - SOURCE_TIME_EPSILON_S
      && sample.time_s <= sourceInterval.end_s + SOURCE_TIME_EPSILON_S));
  if (!candidates.length) return null;
  const [left, right] = candidates;
  candidates.sort((a, b) => Math.abs(a.time_s - timeS) - Math.abs(b.time_s - timeS));
  const sample = candidates[0];
  const delta = Math.abs(sample.time_s - timeS);
  if (delta > Number(timeline.maximum_delta_s ?? 5 / 30) + SOURCE_TIME_EPSILON_S) return null;
  if (candidates[1] && candidates[1].segment_id !== sample.segment_id
    && Math.abs(Math.abs(candidates[1].time_s - timeS) - delta) < 1e-9) return null;
  if (left && right && left.segment_id === right.segment_id
    && right.time_s - left.time_s <= Number(timeline.maximum_interpolation_gap_s ?? 10 / 30 + 1e-6) + SOURCE_TIME_EPSILON_S
    && left.time_s < timeS && timeS < right.time_s
    && left.projection_matrix && right.projection_matrix) {
    const fraction = (timeS - left.time_s) / (right.time_s - left.time_s);
    const interpolate = (key) => left[key].map((row,r)=>row.map((v,c)=>v+(right[key][r][c]-v)*fraction));
    return {...sample, time_s:timeS,
      projection_matrix:interpolate('projection_matrix'),
      court_to_image_homography:interpolate('court_to_image_homography'),
      interpolation:'same_segment_supported_projective_interpolation',
      support_frames:[left.frame_index,right.frame_index], interpolation_fraction:fraction,
      height_prediction:Boolean(left.height_prediction || right.height_prediction)};
  }
  return sample;
}

// Display framing only: this never supplies current projection evidence. Keep
// short explicit scoped gaps visually still while all source layers abstain.
export function sourceGapDisplaySample(replay, timeS, anchor) {
  const spans = replay?.floor_support_intervals;
  if (!Array.isArray(spans) || !anchor?.sample || anchor.replay !== replay || !Number.isFinite(timeS)) return null;
  if (!spans.every((span,index) => span && Number.isFinite(span.start_s) && Number.isFinite(span.end_s)
    && span.start_s >= 0 && span.start_s <= span.end_s
    && (index === 0 || spans[index-1].end_s < span.start_s))) return null;
  for (let index = 1; index < spans.length; index++) {
    const left = spans[index - 1], right = spans[index];
    if (!(timeS > left.end_s && timeS < right.start_s && right.start_s - left.end_s <= .25)) continue;
    if (![left,right].some(span => anchor.sample.time_s >= span.start_s - SOURCE_TIME_EPSILON_S
      && anchor.sample.time_s <= span.end_s + SOURCE_TIME_EPSILON_S)) return null;
    const cut = [...(replay.floor_registration?.samples || []), ...(replay.source_projection?.samples || [])]
      .some(row => row.cut_before === true && row.time_s > left.end_s && row.time_s <= right.start_s);
    return cut ? null : anchor.sample;
  }
  return null;
}

export function sourceClipMatrix(sample, viewportWidth, viewportHeight) {
  const p = sample?.projection_matrix;
  const width = Number(sample?.image_size?.width);
  const height = Number(sample?.image_size?.height);
  if (!p || p.length !== 3 || p.some((row) => row.length !== 4 || row.some((v) => !Number.isFinite(v)))
    || !(width > 0 && height > 0 && viewportWidth > 0 && viewportHeight > 0)) return null;
  const sourceAspect = width / height;
  const viewportAspect = viewportWidth / viewportHeight;
  const sx = Math.min(1, sourceAspect / viewportAspect);
  const sy = Math.min(1, viewportAspect / sourceAspect);
  const near = 0.01;
  const far = 100;
  // The engine uses [x-25, height, longitudinal]. Undo only that presentation
  // basis before projecting; never reflect or rewrite any tracked coordinate.
  const world = p.map((row) => [row[0], row[2], row[1], row[3] + 25 * row[0]]);
  const x = world[0].map((v, i) => sx * (2 * v / width - world[2][i]));
  const y = world[1].map((v, i) => sy * (world[2][i] - 2 * v / height));
  const z = world[2].map((v, i) => (far + near) / (far - near) * v - (i === 3 ? 2 * far * near / (far - near) : 0));
  return [...x, ...y, ...z, ...world[2]];
}

// This is the optical center of the existing candidate projection, not a new
// metric camera measurement. It lets a virtual orbit inherit the same view.
export function sourceCameraCenter(sample) {
  const p = sample?.projection_matrix;
  if (!p || p.length !== 3 || p.some(row => row.length !== 4 || row.some(value => !Number.isFinite(value)))) return null;
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const rows = p.map(row => row.slice(0,3));
  const products = [cross(rows[1],rows[2]),cross(rows[2],rows[0]),cross(rows[0],rows[1])];
  const determinant = rows[0].reduce((sum,value,index)=>sum+value*products[0][index],0);
  const scale = Math.hypot(...rows[0])*Math.hypot(...rows[1])*Math.hypot(...rows[2]);
  if (!scale || Math.abs(determinant) < scale*1e-9) return null;
  const center = [0,1,2].map(index => -products.reduce((sum,row,r)=>sum+p[r][3]*row[index],0)/determinant);
  if (center.some(value=>!Number.isFinite(value)||Math.abs(value)>100000) || center[2] <= 0) return null;
  return {x_ft:center[0],y_ft:center[1],z_ft:center[2]};
}

export function sourceFloorScreenRight(sample, point) {
  const p = sample?.projection_matrix;
  if (!p || p.length !== 3 || p.some(row => row.length !== 4 || row.some(value => !Number.isFinite(value)))
    || !Number.isFinite(point?.x_ft) || !Number.isFinite(point?.y_ft)) return null;
  const denominator = p[2][0]*point.x_ft+p[2][1]*point.y_ft+p[2][3];
  const numerator = p[0][0]*point.x_ft+p[0][1]*point.y_ft+p[0][3];
  if (Math.abs(denominator)<1e-9) return null;
  const gradient = [0,1].map(index=>(p[0][index]*denominator-numerator*p[2][index])/(denominator*denominator));
  const length = Math.hypot(...gradient);
  return length>1e-9 ? {x_ft:gradient[0]/length,y_ft:gradient[1]/length} : null;
}
