import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/core/geometry.js';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

test('vector basics', () => {
  assert.deepEqual(g.add(g.vec(1, 2), g.vec(3, 4)), { x: 4, y: 6 });
  assert.deepEqual(g.sub(g.vec(3, 4), g.vec(1, 2)), { x: 2, y: 2 });
  assert.equal(g.len(g.vec(3, 4)), 5);
  assert.equal(g.dist(g.vec(0, 0), g.vec(0, 7)), 7);
  assert.deepEqual(g.norm(g.vec(0, 0)), { x: 0, y: 0 });
});

test('closest point on a segment clamps to the ends', () => {
  const a = g.vec(0, 0);
  const b = g.vec(10, 0);
  assert.equal(g.closestPointOnSegment(g.vec(5, 5), a, b).x, 5);
  assert.equal(g.closestPointOnSegment(g.vec(-5, 2), a, b).x, 0);
  assert.equal(g.closestPointOnSegment(g.vec(50, 2), a, b).x, 10);
  assert.equal(g.distToSegment(g.vec(5, 3), a, b), 3);
});

test('segment intersection only reports real crossings', () => {
  const hit = g.segmentIntersect(g.vec(0, 0), g.vec(10, 0), g.vec(5, -5), g.vec(5, 5));
  assert.ok(hit && near(hit.x, 5) && near(hit.y, 0));
  assert.equal(g.segmentIntersect(g.vec(0, 0), g.vec(10, 0), g.vec(20, -5), g.vec(20, 5)), null);
  assert.equal(g.segmentIntersect(g.vec(0, 0), g.vec(10, 0), g.vec(0, 3), g.vec(10, 3)), null);
});

test('polygon area, perimeter, centroid and containment', () => {
  const square = [g.vec(0, 0), g.vec(10, 0), g.vec(10, 10), g.vec(0, 10)];
  assert.equal(Math.abs(g.polygonArea(square)), 100);
  assert.equal(g.polygonPerimeter(square), 40);
  const c = g.polygonCentroid(square);
  assert.ok(near(c.x, 5) && near(c.y, 5));
  assert.equal(g.pointInPolygon(g.vec(5, 5), square), true);
  assert.equal(g.pointInPolygon(g.vec(15, 5), square), false);
});

test('bounding box helpers', () => {
  const box = g.bboxOfPoints([g.vec(1, 2), g.vec(5, -3)]);
  assert.deepEqual(box, { minX: 1, minY: -3, maxX: 5, maxY: 2 });
  assert.equal(g.bboxValid(box), true);
  assert.equal(g.bboxValid(g.emptyBox()), false);
  assert.equal(g.bboxContainsPoint(box, g.vec(2, 0)), true);
  assert.equal(g.bboxIntersects(box, { minX: 4, minY: 0, maxX: 9, maxY: 9 }), true);
  assert.equal(g.bboxContainsBox(box, { minX: 2, minY: -1, maxX: 3, maxY: 1 }), true);
});

test('ortho constraint snaps to the nearest axis and keeps the length', () => {
  const from = g.vec(0, 0);
  const to = g.constrainAngle(from, g.vec(10, 1), Math.PI / 2);
  assert.ok(near(to.y, 0, 1e-9));
  assert.ok(near(g.len(to), Math.hypot(10, 1)));
});

test('thick segment quad is centred on the line', () => {
  const quad = g.thickSegmentQuad(g.vec(0, 0), g.vec(10, 0), 4);
  assert.equal(quad.length, 4);
  const box = g.bboxOfPoints(quad);
  assert.deepEqual(box, { minX: 0, minY: -2, maxX: 10, maxY: 2 });
});

test('interval subtraction leaves the solid spans of a wall', () => {
  assert.deepEqual(g.subtractIntervals(100, [[20, 40]]), [
    [0, 20],
    [40, 100],
  ]);
  assert.deepEqual(g.subtractIntervals(100, [[0, 100]]), []);
  // Overlapping openings collapse rather than producing negative spans.
  assert.deepEqual(g.subtractIntervals(100, [[10, 50], [30, 60]]), [
    [0, 10],
    [60, 100],
  ]);
  assert.deepEqual(g.subtractIntervals(100, []), [[0, 100]]);
});

test('arc sampling includes both endpoints', () => {
  const pts = g.arcPoints(g.vec(0, 0), 10, 0, Math.PI / 2, 4);
  assert.equal(pts.length, 5);
  assert.ok(near(pts[0].x, 10) && near(pts[0].y, 0));
  assert.ok(near(pts[4].x, 0, 1e-9) && near(pts[4].y, 10));
});

test('roundTo snaps to a grid step', () => {
  assert.equal(g.roundTo(13, 6), 12);
  assert.equal(g.roundTo(-13, 6), -12);
  assert.equal(g.roundTo(13, 0), 13);
});
