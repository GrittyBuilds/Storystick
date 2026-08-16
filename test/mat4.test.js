import test from 'node:test';
import assert from 'node:assert/strict';
import * as m4 from '../src/model3d/mat4.js';

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const nearVec = (a, b, tol = 1e-6) => a.every((v, i) => near(v, b[i], tol));

test('identity is the multiplicative identity', () => {
  const i = m4.identity();
  const a = m4.perspective(1, 1.5, 0.1, 100);
  const out = m4.multiply(a, i, new Float32Array(16));
  assert.ok([...out].every((v, idx) => near(v, a[idx])));
});

test('multiply applies the right-hand matrix first', () => {
  // Translation-by-view composed with projection must equal transforming the
  // point through each in turn.
  const view = m4.lookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
  const proj = m4.perspective(Math.PI / 3, 1, 0.1, 100);
  const combined = m4.multiply(proj, view);
  const point = [1, 2, 0];
  assert.ok(nearVec(m4.transformPoint(combined, point), m4.transformPoint(proj, m4.transformPoint(view, point)), 1e-5));
});

test('multiply is safe when the output aliases an input', () => {
  const a = m4.perspective(1, 1.2, 0.5, 50);
  const b = m4.lookAt([1, 2, 3], [0, 0, 0], [0, 1, 0]);
  const expected = m4.multiply(a, b, new Float32Array(16));
  const aliased = new Float32Array(a);
  m4.multiply(aliased, b, aliased);
  assert.ok([...aliased].every((v, i) => near(v, expected[i], 1e-5)));
});

test('lookAt puts the eye at the origin of view space', () => {
  const eye = [10, 20, 30];
  const view = m4.lookAt(eye, [0, 0, 0], [0, 1, 0]);
  assert.ok(nearVec(m4.transformPoint(view, eye), [0, 0, 0], 1e-4));
});

test('lookAt places the target down the negative z axis', () => {
  const view = m4.lookAt([0, 0, 25], [0, 0, 0], [0, 1, 0]);
  const target = m4.transformPoint(view, [0, 0, 0]);
  assert.ok(near(target[0], 0) && near(target[1], 0));
  assert.ok(target[2] < 0, 'the target is in front of the camera');
});

test('lookAt survives a straight-down view where the up vector is parallel', () => {
  const view = m4.lookAt([0, 50, 0], [0, 0, 0], [0, 1, 0]);
  assert.ok([...view].every(Number.isFinite), 'no NaNs in a degenerate basis');
  const target = m4.transformPoint(view, [0, 0, 0]);
  assert.ok(target[2] < 0);
});

test('perspective maps the near and far planes to -1 and 1', () => {
  const proj = m4.perspective(Math.PI / 3, 1, 1, 100);
  assert.ok(near(m4.transformPoint(proj, [0, 0, -1])[2], -1, 1e-5));
  assert.ok(near(m4.transformPoint(proj, [0, 0, -100])[2], 1, 1e-5));
});

test('perspective respects the aspect ratio', () => {
  const wide = m4.perspective(Math.PI / 3, 2, 1, 100);
  const square = m4.perspective(Math.PI / 3, 1, 1, 100);
  const p = [1, 1, -10];
  assert.ok(Math.abs(m4.transformPoint(wide, p)[0]) < Math.abs(m4.transformPoint(square, p)[0]));
});

test('orthographic maps its box corners to the unit cube', () => {
  const ortho = m4.orthographic(-2, 2, -1, 1, 1, 11);
  assert.ok(nearVec(m4.transformPoint(ortho, [-2, -1, -1]), [-1, -1, -1], 1e-6));
  assert.ok(nearVec(m4.transformPoint(ortho, [2, 1, -11]), [1, 1, 1], 1e-6));
});

test('vector helpers behave', () => {
  assert.deepEqual(m4.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  assert.equal(m4.dot([1, 2, 3], [4, 5, 6]), 32);
  assert.equal(m4.length([3, 4, 0]), 5);
  assert.deepEqual(m4.normalize([0, 0, 0]), [0, 0, 0]);
  assert.ok(near(m4.length(m4.normalize([3, 4, 5])), 1));
});

test('orbitEye stays at the requested distance from the target', () => {
  const target = [10, 5, -3];
  for (const pitch of [-1.2, -0.3, 0, 0.4, 1.2]) {
    for (const yaw of [0, 1, 2.5, 5]) {
      const eye = m4.orbitEye(target, 120, yaw, pitch);
      assert.ok(near(m4.length(m4.subtract(eye, target)), 120, 1e-4));
    }
  }
});

test('orbitEye rises as pitch increases', () => {
  const low = m4.orbitEye([0, 0, 0], 100, 0, 0.1);
  const high = m4.orbitEye([0, 0, 0], 100, 0, 1.0);
  assert.ok(high[1] > low[1]);
});

test('pitch is clamped short of straight up or down', () => {
  assert.ok(m4.clampPitch(99) < Math.PI / 2);
  assert.ok(m4.clampPitch(-99) > -Math.PI / 2);
  assert.equal(m4.clampPitch(0.3), 0.3);
});

test('fitDistance grows with the model and shrinks with a wider field of view', () => {
  const small = m4.fitDistance(10, Math.PI / 3, 1.5);
  const big = m4.fitDistance(100, Math.PI / 3, 1.5);
  assert.ok(big > small * 9);
  const narrow = m4.fitDistance(50, Math.PI / 8, 1.5);
  const wide = m4.fitDistance(50, Math.PI / 2, 1.5);
  assert.ok(narrow > wide);
});

test('fitDistance accounts for a narrow viewport by pulling back', () => {
  const landscape = m4.fitDistance(50, Math.PI / 3, 2);
  const portrait = m4.fitDistance(50, Math.PI / 3, 0.5);
  assert.ok(portrait > landscape, 'a tall thin viewport needs more distance');
});

test('bounds helpers centre and size a model', () => {
  const box = { minX: -10, minY: 0, minZ: -4, maxX: 10, maxY: 8, maxZ: 4 };
  assert.deepEqual(m4.boundsCenter(box), [0, 4, 0]);
  assert.ok(near(m4.boundsRadius(box), Math.hypot(20, 8, 8) / 2));
  assert.ok(m4.boundsRadius({ minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }) >= 1);
});
