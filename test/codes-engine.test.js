import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, activePage } from '../src/core/document.js';
import { makeWall, makeOpening, makeRoom } from '../src/core/entities.js';
import { buildContext, HABITABLE_USES, SLEEPING_USES } from '../src/codes/context.js';
import {
  runChecks,
  groupFindings,
  pass,
  fail,
  review,
  notApplicable,
  STATUS,
  SEVERITY,
} from '../src/codes/engine.js';
import { convexHull, minimumWidth } from '../src/core/geometry.js';

function house() {
  const project = createProject({ name: 'Code test' });
  project.wallHeight = 96;
  const page = activePage(project);

  // A 12' x 10' bedroom with a door and one window.
  const south = makeWall({ x: 0, y: 0 }, { x: 144, y: 0 }, 'walls', 5.5, 'new');
  const east = makeWall({ x: 144, y: 0 }, { x: 144, y: 120 }, 'walls', 5.5, 'new');
  const north = makeWall({ x: 144, y: 120 }, { x: 0, y: 120 }, 'walls', 5.5, 'new');
  const west = makeWall({ x: 0, y: 120 }, { x: 0, y: 0 }, 'walls', 5.5, 'new');
  page.entities.push(south, east, north, west);

  const bedroom = makeRoom(
    [{ x: 3, y: 3 }, { x: 141, y: 3 }, { x: 141, y: 117 }, { x: 3, y: 117 }],
    'rooms',
    'Bedroom 1',
    'bedroom'
  );
  page.entities.push(bedroom);

  const door = makeOpening(south.id, 0.3, 'openings', 'door', 32, { tag: 'D1', height: 80 });
  const window = makeOpening(east.id, 0.5, 'openings', 'window', 36, {
    tag: 'W1',
    sill: 30,
    height: 78,
  });
  page.entities.push(door, window);

  return { project, page, bedroom, door, window };
}

// --- geometry the context depends on --------------------------------------

test('minimum width beats the bounding box for a non-rectangular room', () => {
  const rectangle = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 }, { x: 0, y: 80 }];
  assert.equal(minimumWidth(rectangle), 80);

  // An L-shaped room: the bounding box says 200 in each direction, but the
  // narrowest way across the shape is much less.
  const ell = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 60 },
    { x: 60, y: 60 },
    { x: 60, y: 200 },
    { x: 0, y: 200 },
  ];
  assert.ok(minimumWidth(ell) < 200);

  // A bar rotated 45°: the box is 110 square, the real width is about 14.
  const diagonal = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 90, y: 110 }, { x: -10, y: 10 }];
  assert.ok(Math.abs(minimumWidth(diagonal) - Math.hypot(10, 10)) < 0.01);
});

test('convex hull wraps the points and drops interior ones', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 5, y: 5 },
  ];
  const hull = convexHull(pts);
  assert.equal(hull.length, 4);
  assert.ok(!hull.some((p) => p.x === 5 && p.y === 5));
});

// --- context --------------------------------------------------------------

test('rooms are measured with area, perimeter and narrowest dimension', () => {
  const { project } = house();
  const ctx = buildContext(project);
  assert.equal(ctx.rooms.length, 1);
  const room = ctx.rooms[0];
  assert.equal(room.name, 'Bedroom 1');
  assert.equal(room.use, 'bedroom');
  assert.equal(room.sleeping, true);
  assert.equal(room.habitable, true);
  assert.ok(Math.abs(room.areaSqFt - (138 * 114) / 144) < 1e-6);
  assert.equal(room.minWidthIn, 114);
});

test('openings carry their real clear height and sill', () => {
  const { project } = house();
  const ctx = buildContext(project);
  const window = ctx.openings.find((o) => o.kind === 'window');
  // Created as a 3'0" x 6'6" unit with a 2'6" sill.
  assert.equal(window.sillIn, 30);
  assert.equal(window.unitHeightIn, 78);
  assert.equal(window.clearHeightIn, 78, 'the clear height is the unit height');
  assert.equal(window.headIn, 108, 'the head is sill plus unit height');
  assert.ok(Math.abs(window.roughOpeningSqFt - (36 * 78) / 144) < 1e-9);
});

test('a default window does not report a 12-inch opening', () => {
  // Reading `height` as an absolute head elevation made every default window
  // 48 - 36 = 12 inches of clear opening, which would fail every egress rule.
  const project = createProject({});
  const page = activePage(project);
  const wall = makeWall({ x: 0, y: 0 }, { x: 120, y: 0 }, 'walls', 5.5, 'new');
  page.entities.push(wall, makeOpening(wall.id, 0.5, 'openings', 'window', 36, {}));
  const opening = buildContext(project).openings[0];
  assert.equal(opening.clearHeightIn, 48);
  assert.ok(Math.abs(opening.roughOpeningSqFt - 12) < 1e-9, '3ft x 4ft is 12 sq ft, not 3');
});

test('the rough opening is never mistaken for the net clear opening', () => {
  const { project } = house();
  const ctx = buildContext(project);
  const window = ctx.openings.find((o) => o.kind === 'window');
  assert.equal(window.netClearKnown, false, 'the plan cannot know what the unit opens to');
  assert.ok(window.roughOpeningSqIn > 0);
});

test('openings are matched to the rooms they serve', () => {
  const { project, bedroom } = house();
  const ctx = buildContext(project);
  const served = ctx.openingsByRoom.get(bedroom.id) || [];
  assert.equal(served.length, 2, 'the bedroom has a door and a window');
});

test('the context lists what the drawing cannot answer', () => {
  const { project } = house();
  const ctx = buildContext(project);
  assert.equal(ctx.unknowns.stairs, true);
  assert.equal(ctx.unknowns.smokeAlarms, true);
  assert.equal(ctx.unknowns.windowUnitTypes, true);
});

test('the context can be limited to one sheet', () => {
  const { project, page } = house();
  project.pages.push({ id: 'other', name: 'Other', kind: 'plan', scale: '', entities: [] });
  assert.equal(buildContext(project, { pageId: 'other' }).rooms.length, 0);
  assert.equal(buildContext(project, { pageId: page.id }).rooms.length, 1);
});

test('an empty project produces an empty but valid context', () => {
  const ctx = buildContext(createProject({}));
  assert.deepEqual(ctx.rooms, []);
  assert.deepEqual(ctx.openings, []);
  assert.equal(ctx.totalFloorAreaSqFt, 0);
});

test('use sets stay in step with the room use list', () => {
  assert.ok(HABITABLE_USES.has('bedroom'));
  assert.ok(SLEEPING_USES.has('bedroom'));
  assert.ok(!SLEEPING_USES.has('kitchen'));
});

// --- engine ---------------------------------------------------------------

const stubRule = (over = {}) => ({
  id: 'test-rule',
  title: 'Test rule',
  citation: 'TEST R1.1',
  severity: SEVERITY.MAJOR,
  check: () => [],
  ...over,
});

test('findings carry the citation and verification state', () => {
  const rule = stubRule({ citation: 'MRC R310.1', codeEdition: '2015 MRC', verified: true });
  const f = pass(rule, 'Fine.');
  assert.equal(f.citation, 'MRC R310.1');
  assert.equal(f.codeEdition, '2015 MRC');
  assert.equal(f.verified, true);
  assert.equal(f.status, STATUS.PASS);
});

test('a rule marked unverified produces unverified findings', () => {
  const rule = stubRule({ verified: false });
  assert.equal(fail(rule, 'Nope').verified, false);
});

test('rules that do not apply are recorded, not dropped', () => {
  const rule = stubRule({ applies: () => false, notApplicableMessage: 'No basement.' });
  const { findings, summary } = runChecks([rule], {});
  assert.equal(findings.length, 1);
  assert.equal(findings[0].status, STATUS.NA);
  assert.equal(summary.notApplicable, 1);
});

test('a rule that throws becomes a review, never a silent pass', () => {
  const rule = stubRule({
    check: () => {
      throw new Error('bad data');
    },
  });
  const { findings, summary } = runChecks([rule], {});
  assert.equal(findings[0].status, STATUS.REVIEW);
  assert.match(findings[0].message, /could not run/);
  assert.equal(summary.pass, 0, 'a crashed check must never count as a pass');
});

test('findings sort failures first, then reviews, and critical before advisory', () => {
  const rules = [
    stubRule({ id: 'a', check: (c) => [pass(stubRule({ id: 'a' }), 'ok')] }),
    stubRule({ id: 'b', check: () => [review(stubRule({ id: 'b' }), 'look')] }),
    stubRule({
      id: 'c',
      check: () => [fail(stubRule({ id: 'c' }), 'bad', { severity: SEVERITY.ADVISORY })],
    }),
    stubRule({
      id: 'd',
      check: () => [fail(stubRule({ id: 'd' }), 'worse', { severity: SEVERITY.CRITICAL })],
    }),
  ];
  const { findings } = runChecks(rules, {});
  assert.deepEqual(
    findings.map((f) => f.ruleId),
    ['d', 'c', 'b', 'a']
  );
});

test('the summary counts critical failures separately', () => {
  const rules = [
    stubRule({ id: 'x', check: () => [fail(stubRule({ id: 'x' }), 'life safety', { severity: SEVERITY.CRITICAL })] }),
    stubRule({ id: 'y', check: () => [fail(stubRule({ id: 'y' }), 'minor', { severity: SEVERITY.ADVISORY })] }),
  ];
  const { summary } = runChecks(rules, {});
  assert.equal(summary.fail, 2);
  assert.equal(summary.criticalFailures, 1);
});

test('groupFindings splits the four outcomes', () => {
  const rule = stubRule();
  const grouped = groupFindings([
    pass(rule, 'a'),
    fail(rule, 'b'),
    review(rule, 'c'),
    notApplicable(rule, 'd'),
  ]);
  assert.equal(grouped.passes.length, 1);
  assert.equal(grouped.failures.length, 1);
  assert.equal(grouped.reviews.length, 1);
  assert.equal(grouped.notApplicable.length, 1);
});

test('a finding can carry what was measured against what is required', () => {
  const rule = stubRule();
  const f = fail(rule, 'Too small', {
    measured: '4.2 sq ft',
    required: '5.7 sq ft',
    fix: 'Use a wider unit.',
    subject: { type: 'opening', id: 'op1', label: 'W1' },
  });
  assert.equal(f.measured, '4.2 sq ft');
  assert.equal(f.required, '5.7 sq ft');
  assert.equal(f.fix, 'Use a wider unit.');
  assert.equal(f.subject.id, 'op1');
});
