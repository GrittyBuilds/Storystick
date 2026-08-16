import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, activePage } from '../src/core/document.js';
import { makeWall, makeOpening, makeRoom } from '../src/core/entities.js';
import {
  doorSchedule,
  windowSchedule,
  roomSchedule,
  wallTakeoff,
  totalFloorArea,
  scheduleSummary,
} from '../src/features/schedule.js';
import { buildEstimate } from '../src/features/estimate.js';

function sampleProject() {
  const project = createProject({ name: 'Cabin' });
  project.wallHeight = 96;
  const page = activePage(project);

  const south = makeWall({ x: 0, y: 0 }, { x: 120, y: 0 }, 'walls', 5.5, 'new');
  const east = makeWall({ x: 120, y: 0 }, { x: 120, y: 96 }, 'walls', 5.5, 'new');
  const old = makeWall({ x: 0, y: 96 }, { x: 120, y: 96 }, 'existing', 5.5, 'existing');
  const gone = makeWall({ x: 0, y: 0 }, { x: 0, y: 96 }, 'demo', 4.5, 'demo');
  page.entities.push(south, east, old, gone);

  page.entities.push(
    makeOpening(south.id, 0.5, 'openings', 'door', 36, { tag: 'D1', height: 80 }),
    makeOpening(east.id, 0.5, 'openings', 'window', 24, { tag: 'W1', height: 36, sill: 36 })
  );
  page.entities.push(
    makeRoom([{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 96 }, { x: 0, y: 96 }], 'rooms', 'Main')
  );
  return project;
}

test('door and window schedules pick up tags and sizes', () => {
  const project = sampleProject();
  const doors = doorSchedule(project);
  const windows = windowSchedule(project);
  assert.equal(doors.length, 1);
  assert.equal(doors[0].tag, 'D1');
  assert.equal(doors[0].width, 36);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].sill, 36);
});

test('room schedule reports area and perimeter', () => {
  const project = sampleProject();
  const rooms = roomSchedule(project);
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].area, 120 * 96);
  assert.equal(rooms[0].perimeter, (120 + 96) * 2);
  assert.equal(totalFloorArea(project), 120 * 96);
});

test('wall takeoff splits by status and subtracts openings', () => {
  const project = sampleProject();
  const rows = wallTakeoff(project);
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r]));

  assert.equal(byStatus.new.count, 2);
  assert.equal(byStatus.new.length, 120 + 96);
  assert.equal(byStatus.new.grossArea, (120 + 96) * 96);
  // A 36x80 door and a 24x36 window come out of the gross area.
  assert.equal(byStatus.new.netArea, (120 + 96) * 96 - 36 * 80 - 24 * 36);
  assert.equal(byStatus.existing.count, 1);
  assert.equal(byStatus.demo.count, 1);
});

test('schedule summary totals line up with the individual tables', () => {
  const s = scheduleSummary(sampleProject());
  assert.equal(s.totals.doors, 1);
  assert.equal(s.totals.windows, 1);
  assert.equal(s.totals.rooms, 1);
  assert.equal(s.totals.floorArea, 120 * 96);
});

test('estimate produces sections, a subtotal and a contingency', () => {
  const est = buildEstimate(sampleProject());
  const titles = est.sections.map((s) => s.title);
  assert.ok(titles.includes('Framing'));
  assert.ok(titles.includes('Finishes'));
  assert.ok(titles.includes('Doors & Windows'));
  assert.ok(titles.includes('Demolition'));

  const summed = est.sections.reduce(
    (total, section) => total + section.items.reduce((t, i) => t + i.total, 0),
    0
  );
  assert.ok(Math.abs(summed - est.subtotal) < 1e-6);
  assert.ok(est.total > est.subtotal);
  assert.ok(est.metrics.floorAreaSqFt > 0);
  assert.ok(est.metrics.wallLinearFt > 0);
});

test('an empty project estimates to zero without throwing', () => {
  const est = buildEstimate(createProject({}));
  assert.equal(est.sections.length, 0);
  assert.equal(est.subtotal, 0);
  assert.equal(est.total, 0);
});

test('waste allowance increases quantities', () => {
  const project = sampleProject();
  const lean = buildEstimate(project, { waste: 0 });
  const generous = buildEstimate(project, { waste: 0.5 });
  assert.ok(generous.subtotal > lean.subtotal);
});
