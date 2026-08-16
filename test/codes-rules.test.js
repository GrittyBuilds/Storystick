import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, activePage } from '../src/core/document.js';
import { makeWall, makeOpening, makeRoom } from '../src/core/entities.js';
import { buildContext } from '../src/codes/context.js';
import { runChecks, STATUS } from '../src/codes/engine.js';
import { ALL_RULES, DRAWING_RULES, THRESHOLD_RULES } from '../src/codes/rules.js';
import {
  MICHIGAN,
  createJurisdiction,
  getThreshold,
  valueOf,
  confirm,
  isConfirmed,
  confirmedCount,
  outstanding,
} from '../src/codes/jurisdiction.js';
import { SPECIES, isConfirmed as speciesConfirmed, missingValues } from '../src/engineering/species.js';

function project({ roomUse = 'bedroom', windowWidth = 36, windowHeight = 48, sill = 36, withWindow = true } = {}) {
  const p = createProject({ name: 'Rules' });
  p.wallHeight = 96;
  const page = activePage(p);
  const south = makeWall({ x: 0, y: 0 }, { x: 144, y: 0 }, 'walls', 5.5, 'new');
  const east = makeWall({ x: 144, y: 0 }, { x: 144, y: 120 }, 'walls', 5.5, 'new');
  page.entities.push(south, east);
  page.entities.push(
    makeRoom(
      [{ x: 3, y: 3 }, { x: 141, y: 3 }, { x: 141, y: 117 }, { x: 3, y: 117 }],
      'rooms',
      'Bedroom',
      roomUse
    )
  );
  page.entities.push(makeOpening(south.id, 0.3, 'openings', 'door', 32, { tag: 'D1', height: 80 }));
  if (withWindow) {
    page.entities.push(
      makeOpening(east.id, 0.5, 'openings', 'window', windowWidth, {
        tag: 'W1',
        sill,
        height: windowHeight,
      })
    );
  }
  return p;
}

function check(p) {
  const ctx = buildContext(p);
  ctx.code = p.jurisdiction;
  return runChecks(ALL_RULES, ctx);
}

const byId = (findings, id) => findings.filter((f) => f.ruleId === id);

// --- the jurisdiction record ----------------------------------------------

test('Michigan ships with every threshold unconfirmed', () => {
  const j = createJurisdiction();
  const counts = confirmedCount(j);
  assert.equal(counts.confirmed, 0, 'no code value is shipped as authoritative');
  assert.ok(counts.total > 20, 'the requirements themselves are catalogued');
  assert.equal(outstanding(j).length, counts.total);
});

test('every threshold names where to look it up', () => {
  for (const record of Object.values(MICHIGAN.thresholds)) {
    assert.ok(record.citation && record.citation.length > 3, `${record.id} has no citation`);
    assert.ok(record.label && record.label.length > 3, `${record.id} has no label`);
    assert.equal(record.value, null, `${record.id} must ship without a value`);
  }
});

test('the edition itself is recorded as unknown, not guessed', () => {
  const j = createJurisdiction();
  assert.equal(j.edition.residential, null);
  assert.equal(j.edition.energy, null);
  assert.match(j.edition.note, /could not be confirmed/i);
});

test('no statewide snow default is offered', () => {
  const j = createJurisdiction();
  assert.deepEqual(j.groundSnow.byJurisdiction, {});
  assert.match(j.groundSnow.note, /per city, village or township/i);
});

test('confirming a value records its source and date', () => {
  const j = createJurisdiction();
  assert.equal(valueOf(j, 'stair.maxRiserIn'), null);
  j.thresholds['stair.maxRiserIn'] = confirm(j.thresholds['stair.maxRiserIn'], 8.25, {
    source: 'Read from the code book',
    by: 'RA',
    on: '2026-08-16',
  });
  assert.equal(valueOf(j, 'stair.maxRiserIn'), 8.25);
  assert.equal(isConfirmed(getThreshold(j, 'stair.maxRiserIn')), true);
  assert.equal(confirmedCount(j).confirmed, 1);
});

test('a value without a confirmation date does not count as confirmed', () => {
  const record = { ...MICHIGAN.thresholds['stair.maxRiserIn'], value: 8.25, confirmedOn: null };
  assert.equal(isConfirmed(record), false, 'a number alone is not a confirmation');
});

// --- drawing rules give real answers with no code data --------------------

test('a sleeping room with no openings at all fails outright', () => {
  const p = createProject({ name: 'Sealed' });
  const page = activePage(p);
  page.entities.push(makeWall({ x: 0, y: 0 }, { x: 144, y: 0 }, 'walls', 5.5, 'new'));
  page.entities.push(
    makeRoom([{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 100 }, { x: 0, y: 100 }], 'rooms', 'Bed', 'bedroom')
  );
  const { findings } = check(p);
  const result = byId(findings, 'draw.bedroom-has-opening')[0];
  assert.equal(result.status, STATUS.FAIL);
  assert.equal(result.verified, true, 'this needs no code lookup to be true');
  assert.match(result.message, /no door and no window/);
});

test('a sleeping room with a door but no window needs a look, not a verdict', () => {
  const { findings } = check(project({ withWindow: false }));
  const result = byId(findings, 'draw.bedroom-has-opening')[0];
  assert.equal(result.status, STATUS.REVIEW);
  assert.ok(result.fix);
});

test('a sleeping room with a window and a door passes the drawing check', () => {
  const { findings } = check(project());
  const result = byId(findings, 'draw.bedroom-has-opening')[0];
  assert.equal(result.status, STATUS.PASS);
});

test('an opening taller than its wall is a definite failure', () => {
  const p = project({ sill: 60, windowHeight: 60 });
  const { findings } = check(p);
  const result = byId(findings, 'draw.opening-fits-wall-height')[0];
  assert.equal(result.status, STATUS.FAIL);
  assert.match(result.message, /reaches/);
});

test('the scope limit is always stated', () => {
  const { findings } = check(project());
  const scope = byId(findings, 'draw.local-scope')[0];
  assert.equal(scope.status, STATUS.REVIEW);
  assert.match(scope.message, /zoning|local/i);
});

test('rooms with no use set are surfaced rather than silently skipped', () => {
  const { findings } = check(project({ roomUse: 'other' }));
  const result = byId(findings, 'draw.rooms-have-use')[0];
  assert.equal(result.status, STATUS.REVIEW);
});

// --- threshold rules never invent a number --------------------------------

test('with nothing confirmed, no threshold rule returns pass or fail', () => {
  const { findings } = check(project());
  const thresholdIds = new Set(THRESHOLD_RULES.map((r) => r.id));
  const decided = findings.filter(
    (f) => thresholdIds.has(f.ruleId) && (f.status === STATUS.PASS || f.status === STATUS.FAIL)
  );
  assert.deepEqual(
    decided.map((f) => `${f.ruleId}:${f.status}`),
    [],
    'a threshold rule must not decide without a confirmed value'
  );
});

test('an unconfirmed threshold still reports the measurement and the section', () => {
  const { findings } = check(project());
  const result = byId(findings, 'code.room-dimension')[0];
  assert.equal(result.status, STATUS.REVIEW);
  assert.ok(result.measured, 'the drawing was still measured');
  assert.match(result.fix, /R304|Code settings/i, 'it says where to look');
});

test('confirming a value turns the same check into a determination', () => {
  const p = project();
  const before = byId(check(p).findings, 'code.room-dimension')[0];
  assert.equal(before.status, STATUS.REVIEW);

  p.jurisdiction.thresholds['room.minHorizontalDimensionIn'] = confirm(
    p.jurisdiction.thresholds['room.minHorizontalDimensionIn'],
    84,
    { source: 'code book', on: '2026-08-16' }
  );
  const after = byId(check(p).findings, 'code.room-dimension')[0];
  assert.equal(after.status, STATUS.PASS, 'a 114" wide room clears an 84" minimum');
  // Lengths are shown the way the rest of the app shows them: 84" is 7'-0".
  assert.match(after.required, /7'-0"/);
  assert.match(after.measured, /9'-6"/);
});

test('a confirmed value can also produce a real failure', () => {
  const p = project();
  p.jurisdiction.thresholds['room.minAreaSqFt'] = confirm(
    p.jurisdiction.thresholds['room.minAreaSqFt'],
    500,
    { source: 'test', on: '2026-08-16' }
  );
  const result = byId(check(p).findings, 'code.room-area')[0];
  assert.equal(result.status, STATUS.FAIL);
  assert.ok(result.fix);
});

test('a rough opening smaller than the confirmed minimum is a definite failure', () => {
  // Even the rough opening bounds what any unit can give, so if that is short
  // the answer is certain regardless of which window gets installed.
  const p = project({ windowWidth: 20, windowHeight: 20 });
  p.jurisdiction.thresholds['eero.minNetClearAreaSqFt'] = confirm(
    p.jurisdiction.thresholds['eero.minNetClearAreaSqFt'],
    5.7,
    { source: 'test', on: '2026-08-16' }
  );
  const result = byId(check(p).findings, 'code.eero-area')[0];
  assert.equal(result.status, STATUS.FAIL);
  assert.match(result.message, /before any frame or sash/);
});

test('a rough opening large enough is still only a review, because the unit decides', () => {
  const p = project({ windowWidth: 36, windowHeight: 48 });
  p.jurisdiction.thresholds['eero.minNetClearAreaSqFt'] = confirm(
    p.jurisdiction.thresholds['eero.minNetClearAreaSqFt'],
    5.7,
    { source: 'test', on: '2026-08-16' }
  );
  const result = byId(check(p).findings, 'code.eero-area')[0];
  assert.equal(result.status, STATUS.REVIEW, 'a big rough opening does not prove the unit opens far enough');
  assert.match(result.fix, /manufacturer/i);
});

test('threshold rules are flagged unverified and drawing rules are not', () => {
  for (const rule of DRAWING_RULES) assert.notEqual(rule.verified, false, `${rule.id}`);
  for (const rule of THRESHOLD_RULES) assert.equal(rule.verified, false, `${rule.id}`);
});

test('every rule has an id, a title, a citation and a severity', () => {
  const seen = new Set();
  for (const rule of ALL_RULES) {
    assert.ok(rule.id && !seen.has(rule.id), `duplicate or missing id: ${rule.id}`);
    seen.add(rule.id);
    assert.ok(rule.title);
    assert.ok(rule.citation);
    assert.ok(rule.severity);
    assert.equal(typeof rule.check, 'function');
  }
});

test('the whole rule set runs on an empty project without throwing', () => {
  const { findings } = check(createProject({}));
  assert.ok(findings.length > 0);
  assert.equal(findings.filter((f) => f.status === STATUS.FAIL).length, 0);
});

// --- lumber design values --------------------------------------------------

test('no species ships with design values', () => {
  for (const record of Object.values(SPECIES)) {
    assert.equal(speciesConfirmed(record), false, `${record.id} must not ship confirmed`);
    for (const key of ['fb', 'fv', 'fcPerp', 'e']) {
      assert.equal(record[key], null, `${record.id}.${key} must be empty`);
    }
    assert.equal(record.verified, false);
  }
});

test('missing design values are named so the prompt can be specific', () => {
  const missing = missingValues(SPECIES['spf-2']);
  assert.equal(missing.length, 4);
  assert.ok(missing.some((m) => m.includes('Fb')));
  assert.ok(missing.some((m) => m.includes('E')));
});

test('Southern Pine is marked as not taking the size factor', () => {
  assert.equal(SPECIES['syp-2'].usesSizeFactor, false);
  assert.equal(SPECIES['spf-2'].usesSizeFactor, true);
});

test('confirmed code values survive a save and load round trip', async () => {
  const { normalizeProject } = await import('../src/core/document.js');
  const p = project();
  p.jurisdiction.thresholds['stair.maxRiserIn'] = confirm(
    p.jurisdiction.thresholds['stair.maxRiserIn'],
    8.25,
    { source: 'my code book', by: 'RA', on: '2026-08-16' }
  );
  p.speciesValues['spf-2'].fb = 875;
  p.speciesValues['spf-2'].confirmedOn = '2026-08-16';

  const round = normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.equal(valueOf(round.jurisdiction, 'stair.maxRiserIn'), 8.25);
  assert.equal(getThreshold(round.jurisdiction, 'stair.maxRiserIn').source, 'my code book');
  assert.equal(round.speciesValues['spf-2'].fb, 875);
});

test('an imported file cannot introduce unknown thresholds', async () => {
  const { normalizeProject } = await import('../src/core/document.js');
  const p = project();
  const raw = JSON.parse(JSON.stringify(p));
  raw.jurisdiction.thresholds['evil.injected'] = { value: 1, confirmedOn: '2026-01-01' };
  const round = normalizeProject(raw);
  assert.equal(getThreshold(round.jurisdiction, 'evil.injected'), null);
});
