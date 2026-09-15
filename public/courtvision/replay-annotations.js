// Coaching notes are presentation data in the existing global court frame.
// These helpers never alter a replay, player position, or camera calibration.
export const ANNOTATION_LIMITS = Object.freeze({ strokes: 160, pointsPerStroke: 1024, totalPoints: 24000, history: 40 });
const DEFAULT_COLOR = "#ffd200";
const KINDS = new Set(["pen", "arrow", "circle"]);
const cloneStroke = (stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) });

export function validAnnotationPoint(point, { width = 50, length = 94 } = {}) {
  return Boolean(point && typeof point.x_ft === "number" && Number.isFinite(point.x_ft)
    && typeof point.y_ft === "number" && Number.isFinite(point.y_ft)
    && point.x_ft >= 0 && point.x_ft <= width && point.y_ft >= 0 && point.y_ft <= length);
}

export function normalizeAnnotations(strokes, dimensions = {}) {
  if (!Array.isArray(strokes)) return [];
  const result = [];
  const ids = new Set();
  let totalPoints = 0;
  for (const candidate of strokes.slice(0, ANNOTATION_LIMITS.strokes)) {
    if (!candidate || !Array.isArray(candidate.points)) continue;
    // Old saved paths had implicit arrowheads. New freehand paths explicitly use pen.
    const kind = candidate.kind == null ? "arrow" : candidate.kind;
    if (!KINDS.has(kind)) continue;
    let points = candidate.points.slice(0, ANNOTATION_LIMITS.pointsPerStroke)
      .filter((point) => validAnnotationPoint(point, dimensions))
      .map(({ x_ft, y_ft }) => ({ x_ft, y_ft }));
    points = points.filter((point, index) => !index || Math.hypot(
      point.x_ft - points[index - 1].x_ft, point.y_ft - points[index - 1].y_ft,
    ) > 0.001);
    if (points.length < 2) continue;
    if (kind === "circle") points = [points[0], points[points.length - 1]];
    const separation = Math.hypot(points.at(-1).x_ft - points[0].x_ft, points.at(-1).y_ft - points[0].y_ft);
    if (kind === "circle" && separation < 0.05) continue;
    if (kind === "circle") {
      const { width = 50, length = 94 } = dimensions;
      const center = points[0];
      if (center.x_ft - separation < 0 || center.x_ft + separation > width
        || center.y_ft - separation < 0 || center.y_ft + separation > length) continue;
    }
    if (totalPoints + points.length > ANNOTATION_LIMITS.totalPoints) break;
    const baseId = typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.slice(0, 128) : `annotation-${result.length}`;
    let id = baseId;
    for (let duplicate = 1; ids.has(id); duplicate += 1) id = `${baseId}-${duplicate}`;
    ids.add(id);
    const stroke = { id, kind, color: /^#[0-9a-f]{6}$/i.test(candidate.color) ? candidate.color.toLowerCase() : DEFAULT_COLOR, points };
    if (typeof candidate.time_s === "number" && Number.isFinite(candidate.time_s) && candidate.time_s >= 0) stroke.time_s = candidate.time_s;
    result.push(stroke);
    totalPoints += points.length;
  }
  return result;
}

export function annotationPolylines(stroke) {
  const points = stroke.points || [];
  if (points.length < 2) return [];
  const first = points[0];
  const last = points.at(-1);
  if (stroke.kind === "circle") {
    const radius = Math.hypot(last.x_ft - first.x_ft, last.y_ft - first.y_ft);
    const segments = Math.max(32, Math.min(128, Math.ceil(radius * 10)));
    return [Array.from({ length: segments + 1 }, (_, index) => ({
      x_ft: first.x_ft + Math.cos(index / segments * Math.PI * 2) * radius,
      y_ft: first.y_ft + Math.sin(index / segments * Math.PI * 2) * radius,
    }))];
  }
  if (stroke.kind === "pen") return [points];
  const previous = points[points.length - 2];
  const dx = last.x_ft - previous.x_ft;
  const dy = last.y_ft - previous.y_ft;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) return [];
  const pathLength = points.reduce((sum, point, index) => !index ? 0 : sum + Math.hypot(
    point.x_ft - points[index - 1].x_ft, point.y_ft - points[index - 1].y_ft,
  ), 0);
  const headLength = Math.min(2.2, pathLength * 0.4);
  const halfWidth = Math.min(1.0, pathLength * 0.2);
  const base = { x_ft: last.x_ft - dx / distance * headLength, y_ft: last.y_ft - dy / distance * headLength };
  return [points, [
    { x_ft: base.x_ft - dy / distance * halfWidth, y_ft: base.y_ft + dx / distance * halfWidth },
    last,
    { x_ft: base.x_ft + dy / distance * halfWidth, y_ft: base.y_ft - dx / distance * halfWidth },
  ]];
}

// Flat ribbons avoid spline overshoot beyond a user's floor points. Preview
// callers reuse a GPU buffer; only the active stroke's vertices are updated.
export function annotationRibbonVertices(stroke, width = 0.34) {
  const vertices = [];
  for (const points of annotationPolylines(stroke)) {
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1];
      const b = points[index];
      const distance = Math.hypot(b.x_ft - a.x_ft, b.y_ft - a.y_ft);
      if (distance < 0.001) continue;
      const ox = -(b.y_ft - a.y_ft) / distance * width / 2;
      const oy = (b.x_ft - a.x_ft) / distance * width / 2;
      const corners = [[a.x_ft + ox, a.y_ft + oy], [a.x_ft - ox, a.y_ft - oy], [b.x_ft + ox, b.y_ft + oy], [b.x_ft - ox, b.y_ft - oy]];
      for (const corner of [0, 1, 2, 2, 1, 3]) vertices.push(corners[corner][0] - 25, 0.14, corners[corner][1]);
    }
  }
  return vertices;
}

export function annotationDistance(stroke, point) {
  if (stroke.kind === "circle" && stroke.points?.length >= 2) {
    const [center, edge] = stroke.points;
    return Math.abs(Math.hypot(point.x_ft - center.x_ft, point.y_ft - center.y_ft)
      - Math.hypot(edge.x_ft - center.x_ft, edge.y_ft - center.y_ft));
  }
  let minimum = Infinity;
  for (const points of annotationPolylines(stroke)) {
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1];
      const b = points[index];
      const dx = b.x_ft - a.x_ft;
      const dy = b.y_ft - a.y_ft;
      const lengthSquared = dx * dx + dy * dy;
      const fraction = lengthSquared ? Math.max(0, Math.min(1, ((point.x_ft - a.x_ft) * dx + (point.y_ft - a.y_ft) * dy) / lengthSquared)) : 0;
      minimum = Math.min(minimum, Math.hypot(point.x_ft - a.x_ft - fraction * dx, point.y_ft - a.y_ft - fraction * dy));
    }
  }
  return minimum;
}

export function nearestAnnotationId(strokes, point, maximumDistance = 1.35) {
  let nearest = null;
  let distance = maximumDistance;
  for (const stroke of strokes) {
    const candidate = annotationDistance(stroke, point);
    if (candidate <= distance) { nearest = stroke.id; distance = candidate; }
  }
  return nearest;
}

export class AnnotationHistory {
  constructor(dimensions = {}) {
    this.dimensions = dimensions;
    this.scopeKey = "";
    this.strokes = [];
    this.past = [];
    this.future = [];
  }
  snapshot() {
    return { annotations: this.strokes.map(cloneStroke), canUndo: this.past.length > 0, canRedo: this.future.length > 0, scopeKey: this.scopeKey };
  }
  load(strokes, { scopeKey = this.scopeKey, dimensions = this.dimensions } = {}) {
    const normalized = normalizeAnnotations(strokes, dimensions);
    const changedScope = String(scopeKey) !== this.scopeKey;
    const changedContent = JSON.stringify(normalized) !== JSON.stringify(this.strokes);
    this.dimensions = dimensions;
    this.scopeKey = String(scopeKey);
    if (!changedScope && !changedContent) return false;
    this.strokes = normalized;
    this.past = [];
    this.future = [];
    return true;
  }
  commit(strokes) {
    const normalized = normalizeAnnotations(strokes, this.dimensions);
    if (JSON.stringify(normalized) === JSON.stringify(this.strokes)) return false;
    this.past.push(this.strokes);
    if (this.past.length > ANNOTATION_LIMITS.history) this.past.shift();
    this.strokes = normalized;
    this.future = [];
    return true;
  }
  undo() {
    if (!this.past.length) return false;
    this.future.push(this.strokes);
    this.strokes = this.past.pop();
    return true;
  }
  redo() {
    if (!this.future.length) return false;
    this.past.push(this.strokes);
    this.strokes = this.future.pop();
    return true;
  }
}
