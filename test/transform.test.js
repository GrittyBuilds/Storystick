// Nudging and rotating: the two ways to move something you have already drawn
// without dragging it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAngle, toRadians, toDegrees, normalizeDegrees, formatAngle, mmToIn } from '../src/core/units.js';
import {
  makeWall,
  makeLine,
  makeBeam,
  makeRect,
  makePart,
  makeRoom,
  makeSlab,
  makeRoofPlane,
  makeFooting,
  makePadFooting,
  makeCircle,
  makeArc,
  makeFixture,
  makeText,
  makeDim,
  makeOpening,
  entityAngle,
  entityLength,
  setEntityLength,
  setEntityAngle,
  rotateEntity,
  rotationPivot,
  canRotate,
  UNROTATABLE,
  translate,
  wallLength,
} from '../src/core/entities.js';
import { History } from '../src/core/history.js';

const pt = (x, y) => ({ x, y });
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// --- parsing an angle ------------------------------------------------------

test('an angle has to say it is an angle', () => {
  // A bare number stays a length; reading it as a bearing would rotate a wall
  // when somebody meant to move it 45 inches.
  assert.equal(parseAngle('45'), null);
  assert.equal(parseAngle('8\'-6"'), null);
  assert.equal(parseAngle(''), null);
  assert.equal(parseAngle('  '), null);
  assert.equal(parseAngle(null), null);
});

test('the degree sign, deg and a leading caret all mark an angle', () => {
  for (const text of ['45°', '45 deg', '45deg', '45degrees', '45d', '<45', '< 45']) {
    const a = parseAngle(text);
    assert.ok(a, `"${text}" was not read as an angle`);
    assert.equal(a.degrees, 45, `"${text}" gave ${a && a.degrees}`);
    assert.equal(a.relative, false, `"${text}" should be absolute`);
  }
});

test('a sign makes an angle relative', () => {
  assert.deepEqual(parseAngle('<+15'), { degrees: 15, relative: true });
  assert.deepEqual(parseAngle('<-30'), { degrees: -30, relative: true });
  assert.deepEqual(parseAngle('+90°'), { degrees: 90, relative: true });
  assert.deepEqual(parseAngle('-90°'), { degrees: -90, relative: true });
});

test('decimals and case are accepted', () => {
  assert.equal(parseAngle('22.5°').degrees, 22.5);
  assert.equal(parseAngle('<22.5').degrees, 22.5);
  assert.equal(parseAngle('45DEG').degrees, 45);
});

test('nonsense is rejected rather than guessed at', () => {
  for (const text of ['abc', '<', '°', '45x', '4 5°', '<45mm']) {
    assert.equal(parseAngle(text), null, `"${text}" should not parse`);
  }
});

test('degrees and radians convert both ways', () => {
  assert.ok(near(toRadians(180), Math.PI));
  assert.ok(near(toDegrees(Math.PI), 180));
  assert.equal(normalizeDegrees(-90), 270);
  assert.equal(normalizeDegrees(450), 90);
  assert.equal(normalizeDegrees(NaN), 0);
});

// --- which entities can turn ----------------------------------------------

test('a rectangle and a part are the only things that cannot rotate', () => {
  // They are stored as two opposite corners, which can only describe an
  // axis-aligned box. Rotating the corners would silently reshape them.
  assert.deepEqual([...UNROTATABLE].sort(), ['part', 'rect']);
  assert.equal(canRotate(makeRect(pt(0, 0), pt(10, 5), 'sketch')), false);
  assert.equal(canRotate(makePart(pt(0, 0), pt(10, 5), 'parts')), false);
  assert.equal(rotateEntity(makeRect(pt(0, 0), pt(10, 5), 'sketch'), 1, pt(0, 0)), false);
  assert.equal(canRotate(makeWall(pt(0, 0), pt(10, 0), 'walls')), true);
});

test('a rectangle refused rotation is left exactly as it was', () => {
  const rect = makeRect(pt(0, 0), pt(10, 5), 'sketch');
  const before = JSON.stringify(rect);
  rotateEntity(rect, Math.PI / 3, pt(0, 0));
  assert.equal(JSON.stringify(rect), before);
});

// --- reading an angle ------------------------------------------------------

test('a wall knows which way it points', () => {
  assert.equal(entityAngle(makeWall(pt(0, 0), pt(10, 0), 'walls')), 0);
  assert.ok(near(entityAngle(makeWall(pt(0, 0), pt(0, 10), 'walls')), Math.PI / 2));
  assert.ok(near(entityAngle(makeLine(pt(0, 0), pt(10, 10), 'sketch')), Math.PI / 4));
  assert.ok(near(entityAngle(makeBeam(pt(0, 0), pt(-10, 0), 'structure', {})), Math.PI));
});

test('a placed symbol reports its own rotation', () => {
  const fx = makeFixture('e-recep', pt(5, 5), 'electrical', { rot: Math.PI / 2 });
  assert.ok(near(entityAngle(fx), Math.PI / 2));
  assert.ok(near(entityAngle(makeText(pt(0, 0), 'note', 'notes')), 0));
});

test('a continuous footing has a direction and a pad footing does not', () => {
  assert.equal(entityAngle(makeFooting(pt(0, 0), pt(10, 0), 'footings', {})), 0);
  assert.equal(entityAngle(makePadFooting(pt(0, 0), 'footings', {})), null);
});

test('shapes with no direction report none rather than zero', () => {
  // Zero would read as "pointing east", which is a different claim from
  // "this shape has no angle".
  assert.equal(entityAngle(makeRoom([pt(0, 0), pt(10, 0), pt(10, 10)], 'rooms')), null);
  assert.equal(entityAngle(makeCircle(pt(0, 0), 5, 'sketch')), null);
  assert.equal(entityAngle(makeSlab([pt(0, 0), pt(10, 0), pt(10, 10)], 'slab', {})), null);
  assert.equal(entityAngle(null), null);
});

// --- setting an angle ------------------------------------------------------

test('setting a wall angle turns it about the end it starts from', () => {
  const wall = makeWall(pt(100, 100), pt(200, 100), 'walls');
  const length = wallLength(wall);
  assert.ok(setEntityAngle(wall, toRadians(90), { entities: [] }));
  // The start end stays put.
  assert.deepEqual(wall.a, { x: 100, y: 100 });
  // The length is unchanged.
  assert.ok(near(wallLength(wall), length, 1e-9));
  assert.ok(near(entityAngle(wall), Math.PI / 2));
  assert.ok(near(wall.b.x, 100, 1e-9));
  assert.ok(near(wall.b.y, 200, 1e-9));
});

test('setting an angle twice lands on the same place, not a compounded one', () => {
  const wall = makeWall(pt(0, 0), pt(100, 0), 'walls');
  setEntityAngle(wall, toRadians(30), { entities: [] });
  const once = { ...wall.b };
  setEntityAngle(wall, toRadians(30), { entities: [] });
  assert.ok(near(wall.b.x, once.x, 1e-9));
  assert.ok(near(wall.b.y, once.y, 1e-9));
});

test('setting a symbol angle turns it in place', () => {
  const fx = makeFixture('e-recep', pt(50, 50), 'electrical', { rot: 0 });
  assert.ok(setEntityAngle(fx, toRadians(90), { entities: [] }));
  assert.deepEqual(fx.p, { x: 50, y: 50 });
  assert.ok(near(fx.rot, Math.PI / 2));
});

test('an angle cannot be set on a shape that has none', () => {
  const room = makeRoom([pt(0, 0), pt(10, 0), pt(10, 10)], 'rooms');
  assert.equal(setEntityAngle(room, toRadians(45), { entities: [] }), false);
});

// --- setting a length ------------------------------------------------------

test('a wall, line, beam and dimension all report a length', () => {
  assert.equal(entityLength(makeWall(pt(0, 0), pt(100, 0), 'walls')), 100);
  assert.equal(entityLength(makeLine(pt(0, 0), pt(0, 30), 'sketch')), 30);
  assert.equal(entityLength(makeBeam(pt(0, 0), pt(144, 0), 'structure', {})), 144);
  assert.equal(entityLength(makeDim(pt(0, 0), pt(48, 0), 'dimensions')), 48);
  assert.equal(entityLength(makeFooting(pt(0, 0), pt(60, 0), 'footings', {})), 60);
});

test('shapes with no single length say so rather than offering a wrong one', () => {
  // A room has a perimeter and a slab has an area; neither is a length you
  // could type one number into.
  assert.equal(entityLength(makeRoom([pt(0, 0), pt(10, 0), pt(10, 10)], 'rooms')), null);
  assert.equal(entityLength(makeSlab([pt(0, 0), pt(10, 0), pt(10, 10)], 'slab', {})), null);
  assert.equal(entityLength(makeCircle(pt(0, 0), 5, 'sketch')), null);
  assert.equal(entityLength(makePadFooting(pt(0, 0), 'footings', {})), null);
  assert.equal(entityLength(makeFixture('e-recep', pt(0, 0), 'electrical', {})), null);
  assert.equal(entityLength(null), null);
});

test('setting a length holds the start end still and keeps the direction', () => {
  const wall = makeWall(pt(50, 50), pt(50, 150), 'walls');
  const before = entityAngle(wall);
  assert.ok(setEntityLength(wall, 240));
  assert.deepEqual(wall.a, { x: 50, y: 50 });
  assert.equal(entityLength(wall), 240);
  assert.ok(near(entityAngle(wall), before));
  assert.ok(near(wall.b.y, 290));
});

test('a diagonal keeps its angle exactly when it is resized', () => {
  const line = makeLine(pt(0, 0), pt(30, 40), 'sketch'); // 50 long, 3-4-5
  const before = entityAngle(line);
  setEntityLength(line, 100);
  assert.ok(near(entityLength(line), 100, 1e-9));
  assert.ok(near(entityAngle(line), before, 1e-12));
  assert.ok(near(line.b.x, 60, 1e-9));
  assert.ok(near(line.b.y, 80, 1e-9));
});

test('a length that makes no sense is refused, leaving the entity alone', () => {
  const wall = makeWall(pt(0, 0), pt(100, 0), 'walls');
  for (const bad of [0, -50, NaN, Infinity, null, undefined]) {
    assert.equal(setEntityLength(wall, bad), false, `${bad} should be refused`);
    assert.equal(entityLength(wall), 100);
  }
});

test('a zero-length entity cannot be stretched, because it points nowhere', () => {
  const degenerate = makeLine(pt(10, 10), pt(10, 10), 'sketch');
  assert.equal(setEntityLength(degenerate, 50), false);
});

test('a length cannot be set on a shape that has none', () => {
  const room = makeRoom([pt(0, 0), pt(10, 0), pt(10, 10)], 'rooms');
  const before = JSON.stringify(room);
  assert.equal(setEntityLength(room, 100), false);
  assert.equal(JSON.stringify(room), before);
});

test('openings ride a resized wall and stay inside it', () => {
  const wall = makeWall(pt(0, 0), pt(200, 0), 'walls');
  const door = makeOpening(wall.id, 0.9, 'openings', 'door', 36);
  const page = { entities: [wall, door] };

  // Shortening the wall must not leave the door hanging off the end.
  setEntityLength(wall, 50, page);
  const half = door.width / 2 / 50;
  assert.ok(door.t >= half - 1e-9 && door.t <= 1 - half + 1e-9, `t is ${door.t}`);
  const centre = door.t * 50;
  assert.ok(centre - door.width / 2 >= -1e-9, 'door starts before the wall does');
  assert.ok(centre + door.width / 2 <= 50 + 1e-9, 'door runs past the end of the wall');
});

test('an opening that already fits is left where it was', () => {
  const wall = makeWall(pt(0, 0), pt(200, 0), 'walls');
  const door = makeOpening(wall.id, 0.5, 'openings', 'door', 36);
  const page = { entities: [wall, door] };
  setEntityLength(wall, 400, page);
  assert.equal(door.t, 0.5, 'a door in the middle should not have been moved');
});

test('a wall too short for its opening centres it rather than going negative', () => {
  const wall = makeWall(pt(0, 0), pt(200, 0), 'walls');
  const door = makeOpening(wall.id, 0.9, 'openings', 'door', 36);
  const page = { entities: [wall, door] };
  setEntityLength(wall, 12, page); // narrower than the 36" door
  assert.equal(door.t, 0.5);
  assert.ok(Number.isFinite(door.t));
});

test('length and angle compose: setting one does not disturb the other', () => {
  const wall = makeWall(pt(20, 20), pt(120, 20), 'walls');
  setEntityLength(wall, 180);
  setEntityAngle(wall, toRadians(30), { entities: [] });
  assert.ok(near(entityLength(wall), 180, 1e-9), `length drifted to ${entityLength(wall)}`);
  assert.ok(near(toDegrees(entityAngle(wall)), 30, 1e-9));
  // Both operations pivot about the same end, so it never moves.
  assert.deepEqual(wall.a, { x: 20, y: 20 });
});

// --- turning by a delta ----------------------------------------------------

test('turning a polygon moves every vertex about the pivot', () => {
  const room = makeRoom([pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)], 'rooms');
  rotateEntity(room, toRadians(90), pt(0, 0));
  // (10,0) rotated 90 degrees in a y-down system lands on (0,10).
  assert.ok(near(room.pts[1].x, 0, 1e-9));
  assert.ok(near(room.pts[1].y, 10, 1e-9));
});

test('turning about a shape centre leaves the centre where it was', () => {
  const slab = makeSlab([pt(0, 0), pt(100, 0), pt(100, 60), pt(0, 60)], 'slab', {});
  const pivot = rotationPivot(slab, { entities: [] });
  rotateEntity(slab, toRadians(37), pivot);
  const after = rotationPivot(slab, { entities: [] });
  assert.ok(near(after.x, pivot.x, 1e-6));
  assert.ok(near(after.y, pivot.y, 1e-6));
});

test('an arc carries its sweep round with it', () => {
  const arc = makeArc(pt(10, 0), 5, 0, Math.PI / 2, 'sketch');
  rotateEntity(arc, toRadians(90), pt(0, 0));
  assert.ok(near(arc.a0, Math.PI / 2));
  assert.ok(near(arc.a1, Math.PI));
  assert.ok(near(arc.c.x, 0, 1e-9));
  assert.ok(near(arc.c.y, 10, 1e-9));
});

test('an arc keeps its sweep when the rotation wraps past zero', () => {
  // Wrapping start and end independently would turn a 30 degree arc into a
  // 330 degree one the first time it crossed the seam.
  const arc = makeArc(pt(0, 0), 5, toRadians(350), toRadians(20), 'sketch');
  const sweep = arc.a1 - arc.a0;
  rotateEntity(arc, toRadians(40), pt(0, 0));
  assert.ok(near(arc.a1 - arc.a0, sweep, 1e-9), `sweep became ${arc.a1 - arc.a0}`);
  assert.ok(arc.a0 >= 0 && arc.a0 < Math.PI * 2, `start not normalised: ${arc.a0}`);
});

test('turning a symbol many times does not let its rotation grow unbounded', () => {
  const fx = makeFixture('e-recep', pt(0, 0), 'electrical', { rot: 0 });
  for (let i = 0; i < 50; i += 1) rotateEntity(fx, toRadians(90), pt(0, 0));
  assert.ok(fx.rot >= 0 && fx.rot < Math.PI * 2, `rot drifted to ${fx.rot}`);
  // 50 quarter turns is 12.5 full turns: half a turn short of the start.
  assert.ok(near(fx.rot, Math.PI, 1e-9), `rot is ${fx.rot}`);
});

test('a circle keeps its radius when it moves round a pivot', () => {
  const circle = makeCircle(pt(10, 0), 5, 'sketch');
  rotateEntity(circle, toRadians(180), pt(0, 0));
  assert.equal(circle.r, 5);
  assert.ok(near(circle.c.x, -10, 1e-9));
});

/** Every coordinate an entity is made of, in a stable order. */
function coords(ent) {
  const out = [];
  const push = (p) => out.push(p.x, p.y);
  if (ent.a) push(ent.a);
  if (ent.b) push(ent.b);
  if (ent.c) push(ent.c);
  if (ent.p) push(ent.p);
  if (Array.isArray(ent.pts)) ent.pts.forEach(push);
  // Angles are compared wrapped: a full turn is the same heading, and the
  // stored value is normalised so it cannot grow without bound.
  const wrap = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (Number.isFinite(ent.rot)) out.push(wrap(ent.rot));
  if (Number.isFinite(ent.a0)) out.push(wrap(ent.a0), ent.a1 - ent.a0);
  return out;
}

test('a full turn returns everything to where it started', () => {
  const cases = [
    makeWall(pt(3, 7), pt(50, 20), 'walls'),
    makeRoom([pt(0, 0), pt(30, 5), pt(20, 40)], 'rooms'),
    makeRoofPlane([pt(0, 0), pt(60, 0), pt(60, 40), pt(0, 40)], 'roof', {}),
    makeFooting(pt(-5, -5), pt(60, 12), 'footings', {}),
    makeBeam(pt(0, 0), pt(120, 0), 'structure', {}),
    makeDim(pt(0, 0), pt(48, 0), 'dimensions'),
    makeSlab([pt(0, 0), pt(90, 0), pt(90, 50), pt(0, 50)], 'slab', {}),
    makeFixture('p-wc', pt(20, 30), 'plumbing', { rot: 0.4 }),
    makeCircle(pt(9, 4), 6, 'sketch'),
  ];
  for (const ent of cases) {
    const before = coords(ent);
    // Four quarter turns is a full turn: back where it started.
    for (let i = 0; i < 4; i += 1) rotateEntity(ent, Math.PI / 2, pt(11, 13));
    const after = coords(ent);
    assert.equal(after.length, before.length, `${ent.type} changed shape`);
    for (let i = 0; i < after.length; i += 1) {
      assert.ok(
        near(after[i], before[i], 1e-6),
        `${ent.type} drifted at ${i}: ${after[i]} vs ${before[i]}`
      );
    }
  }
});

test('turning a wall does not change how long it is', () => {
  const wall = makeWall(pt(10, 10), pt(130, 40), 'walls');
  const before = wallLength(wall);
  rotateEntity(wall, toRadians(23.5), pt(0, 0));
  assert.ok(near(wallLength(wall), before, 1e-9));
});

test('an opening is left alone because it rides its host wall', () => {
  // Its position is a fraction along the wall, so turning the wall carries it.
  const wall = makeWall(pt(0, 0), pt(100, 0), 'walls');
  const opening = { id: 'o', type: 'opening', host: wall.id, t: 0.5, width: 32 };
  const before = JSON.stringify(opening);
  assert.equal(rotateEntity(opening, toRadians(45), pt(0, 0)), true);
  assert.equal(JSON.stringify(opening), before);
});

// --- the nudge step --------------------------------------------------------

/** The rule the app applies: one arrow press is one unit of display precision. */
const nudgeStep = (project) =>
  project.unitSystem === 'metric' ? mmToIn(1) : 1 / (project.denominator || 16);

test('one nudge is exactly one step of the displayed precision', () => {
  assert.equal(nudgeStep({ unitSystem: 'imperial', denominator: 16 }), 1 / 16);
  assert.equal(nudgeStep({ unitSystem: 'imperial', denominator: 8 }), 1 / 8);
  assert.equal(nudgeStep({ unitSystem: 'imperial', denominator: 64 }), 1 / 64);
  assert.ok(near(nudgeStep({ unitSystem: 'metric' }), mmToIn(1)));
});

test('a missing precision falls back rather than dividing by zero', () => {
  assert.equal(nudgeStep({ unitSystem: 'imperial', denominator: 0 }), 1 / 16);
  assert.equal(nudgeStep({ unitSystem: 'imperial' }), 1 / 16);
});

test('sixteen nudges at 1/16 move exactly one inch, with no drift', () => {
  const wall = makeWall(pt(0, 0), pt(100, 0), 'walls');
  const step = nudgeStep({ unitSystem: 'imperial', denominator: 16 });
  for (let i = 0; i < 16; i += 1) translate(wall, { x: step, y: 0 });
  assert.ok(near(wall.a.x, 1, 1e-9), `landed on ${wall.a.x}`);
  assert.ok(near(wall.b.x, 101, 1e-9));
});

// --- undo grouping ---------------------------------------------------------

test('a run of nudges collapses into one undo step', () => {
  const history = new History();
  const doc = { n: 0 };
  history.reset(doc, 'Start');
  for (let i = 1; i <= 20; i += 1) {
    doc.n = i;
    history.commit(doc, 'Nudge', 'run-1');
  }
  assert.equal(history.past.length, 1);
  const back = history.undo();
  assert.equal(back.n, 0, 'one undo should return to before the whole run');
});

test('a pause between runs makes them separate undo steps', () => {
  const history = new History();
  const doc = { n: 0 };
  history.reset(doc, 'Start');
  doc.n = 1;
  history.commit(doc, 'Nudge', 'run-1');
  history.endGroup(); // what the app's timer does when the user pauses
  doc.n = 2;
  history.commit(doc, 'Nudge', 'run-2');
  assert.equal(history.past.length, 2);
  assert.equal(history.undo().n, 1);
  assert.equal(history.undo().n, 0);
});

test('undoing ends the run, so the next nudge does not rewrite history', () => {
  const history = new History();
  const doc = { n: 0 };
  history.reset(doc, 'Start');
  doc.n = 1;
  history.commit(doc, 'Nudge', 'run-1');
  history.undo();
  doc.n = 5;
  history.commit(doc, 'Nudge', 'run-1');
  assert.equal(history.past.length, 1);
  assert.equal(history.undo().n, 0);
});

test('an ungrouped commit still stacks normally', () => {
  const history = new History();
  const doc = { n: 0 };
  history.reset(doc, 'Start');
  for (let i = 1; i <= 3; i += 1) {
    doc.n = i;
    history.commit(doc, 'Edit');
  }
  assert.equal(history.past.length, 3);
});

// --- what the user sees ----------------------------------------------------

test('a bearing reads back in 0-360 degrees', () => {
  const wall = makeWall(pt(0, 0), pt(-100, 0), 'walls');
  assert.equal(formatAngle(entityAngle(wall)), '180.0°');
  const up = makeWall(pt(0, 0), pt(0, -100), 'walls');
  assert.equal(formatAngle(entityAngle(up)), '270.0°');
});
