// Small 2D geometry kernel. Model space is y-down to match canvas space.

export const EPS = 1e-9;

export const vec = (x, y) => ({ x, y });
export const add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y });
export const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
export const mul = (p, s) => ({ x: p.x * s, y: p.y * s });
export const dot = (p, q) => p.x * q.x + p.y * q.y;
export const cross = (p, q) => p.x * q.y - p.y * q.x;
export const len = (p) => Math.hypot(p.x, p.y);
export const dist = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);
export const perp = (p) => ({ x: -p.y, y: p.x });
export const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
export const angleOf = (p) => Math.atan2(p.y, p.x);
export const clone = (p) => ({ x: p.x, y: p.y });

export function norm(p) {
  const l = len(p);
  return l < EPS ? { x: 0, y: 0 } : { x: p.x / l, y: p.y / l };
}

export function rotate(p, angle, origin = { x: 0, y: 0 }) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

export function normalizeAngle(a) {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}

export function closestPointOnSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return clone(a);
  let t = dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + ab.x * t, y: a.y + ab.y * t, t };
}

export function distToSegment(p, a, b) {
  return dist(p, closestPointOnSegment(p, a, b));
}

/** Intersection of two infinite lines, or null when parallel. */
export function lineIntersect(a, b, c, d) {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const t = cross(sub(c, a), s) / denom;
  return { x: a.x + r.x * t, y: a.y + r.y * t };
}

/** Intersection of two segments, or null. */
export function segmentIntersect(a, b, c, d) {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const t = cross(sub(c, a), s) / denom;
  const u = cross(sub(c, a), r) / denom;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { x: a.x + r.x * t, y: a.y + r.y * t };
}

/** Signed area; positive for clockwise winding in y-down space. */
export function polygonArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

export function polygonPerimeter(pts, closed = true) {
  let sum = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i += 1) sum += dist(pts[i], pts[(i + 1) % pts.length]);
  return sum;
}

export function polygonCentroid(pts) {
  const area = polygonArea(pts);
  if (Math.abs(area) < EPS) {
    const acc = pts.reduce((a, p) => add(a, p), vec(0, 0));
    return pts.length ? mul(acc, 1 / pts.length) : vec(0, 0);
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return vec(cx / (6 * area), cy / (6 * area));
}

export function pointInPolygon(pt, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[i];
    const b = pts[j];
    const straddles = a.y > pt.y !== b.y > pt.y;
    if (straddles && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function emptyBox() {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function bboxOfPoints(pts) {
  const box = emptyBox();
  for (const p of pts) {
    if (p.x < box.minX) box.minX = p.x;
    if (p.y < box.minY) box.minY = p.y;
    if (p.x > box.maxX) box.maxX = p.x;
    if (p.y > box.maxY) box.maxY = p.y;
  }
  return box;
}

export function bboxUnion(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function bboxExpand(box, amount) {
  return {
    minX: box.minX - amount,
    minY: box.minY - amount,
    maxX: box.maxX + amount,
    maxY: box.maxY + amount,
  };
}

export function bboxValid(box) {
  return !!box && Number.isFinite(box.minX) && box.maxX >= box.minX;
}

export function bboxContainsPoint(box, p) {
  return p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
}

export function bboxIntersects(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

export function bboxContainsBox(outer, inner) {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  );
}

export function bboxCenter(box) {
  return vec((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2);
}

/** Constrain `to` relative to `from` onto the nearest multiple of `step` radians. */
export function constrainAngle(from, to, step = Math.PI / 2) {
  const d = sub(to, from);
  const l = len(d);
  if (l < EPS) return clone(to);
  const snapped = Math.round(angleOf(d) / step) * step;
  return { x: from.x + Math.cos(snapped) * l, y: from.y + Math.sin(snapped) * l };
}

/** Sample an arc into points (inclusive of both ends). */
export function arcPoints(center, radius, a0, a1, segments = 32) {
  const pts = [];
  const sweep = a1 - a0;
  for (let i = 0; i <= segments; i += 1) {
    const a = a0 + (sweep * i) / segments;
    pts.push(vec(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius));
  }
  return pts;
}

export function rectCorners(a, b) {
  return [vec(a.x, a.y), vec(b.x, a.y), vec(b.x, b.y), vec(a.x, b.y)];
}

/** Corners of a rectangle centred on segment a→b with the given thickness. */
export function thickSegmentQuad(a, b, thickness, from = 0, to = 1) {
  const d = norm(sub(b, a));
  const n = mul(perp(d), thickness / 2);
  const total = dist(a, b);
  const p0 = add(a, mul(d, total * from));
  const p1 = add(a, mul(d, total * to));
  return [add(p0, n), add(p1, n), sub(p1, n), sub(p0, n)];
}

/** Subtract sorted [start,end] intervals from [0,length]; returns remaining spans. */
export function subtractIntervals(length, intervals) {
  const spans = [];
  const sorted = intervals
    .map((i) => [Math.max(0, Math.min(i[0], i[1])), Math.min(length, Math.max(i[0], i[1]))])
    .filter((i) => i[1] > i[0])
    .sort((p, q) => p[0] - q[0]);
  let cursor = 0;
  for (const [start, end] of sorted) {
    if (start > cursor) spans.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < length) spans.push([cursor, length]);
  return spans;
}

export function roundTo(value, step) {
  if (!step) return value;
  return Math.round(value / step) * step;
}
