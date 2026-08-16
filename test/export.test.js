import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, activePage, normalizeProject } from '../src/core/document.js';
import { makeWall, makeOpening, makeRoom, makeText, makeDim, makePart } from '../src/core/entities.js';
import { pageToSvg, toCsv, cutListCsv, scheduleCsv, estimateCsv } from '../src/features/export.js';
import { History } from '../src/core/history.js';
import { TEMPLATES, buildTemplate } from '../src/features/templates.js';
import { buildCutList } from '../src/features/cutlist.js';

function richProject() {
  const project = createProject({ name: 'Export Test' });
  const page = activePage(project);
  const wall = makeWall({ x: 0, y: 0 }, { x: 120, y: 0 }, 'walls', 5.5, 'new');
  page.entities.push(
    wall,
    makeOpening(wall.id, 0.5, 'openings', 'door', 36, { tag: 'D1' }),
    makeRoom([{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 96 }, { x: 0, y: 96 }], 'rooms', 'Shop'),
    makeDim({ x: 0, y: 0 }, { x: 120, y: 0 }, 'dimensions', -18),
    makeText({ x: 0, y: 120 }, 'Note <with> "markup" & symbols', 'notes', 6),
    makePart({ x: 0, y: 140 }, { x: 48, y: 164 }, 'parts', { name: 'Top', material: 'ply-3/4', qty: 2 })
  );
  return project;
}

test('pageToSvg emits a well-formed standalone document', () => {
  const project = richProject();
  const svg = pageToSvg(project, activePage(project));
  assert.ok(svg.startsWith('<?xml'));
  assert.ok(svg.includes('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.trim().endsWith('</svg>'));
  assert.ok(svg.includes('viewBox='));
  assert.ok(svg.includes('Export Test'), 'title block carries the project name');
});

test('svg export escapes text content', () => {
  const project = richProject();
  const svg = pageToSvg(project, activePage(project));
  assert.ok(svg.includes('Note &lt;with&gt; &quot;markup&quot; &amp; symbols'));
  assert.ok(!svg.includes('<with>'));
});

test('svg export never emits NaN coordinates', () => {
  const project = richProject();
  const svg = pageToSvg(project, activePage(project));
  assert.ok(!/NaN/.test(svg));
});

test('svg export handles an empty sheet', () => {
  const project = createProject({});
  const svg = pageToSvg(project, activePage(project));
  assert.ok(svg.includes('<svg'));
  assert.ok(!/NaN/.test(svg));
});

test('csv quoting protects commas and quotes', () => {
  const csv = toCsv([
    ['a', 'b'],
    ['plain', 'has, comma'],
    ['has "quotes"', 'line\nbreak'],
  ]);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'a,b');
  assert.equal(lines[1], 'plain,"has, comma"');
  assert.ok(csv.includes('"has ""quotes"""'));
});

test('report CSVs have headers and data rows', () => {
  const project = richProject();
  const cut = cutListCsv(project);
  assert.ok(cut.startsWith('Material,Part,Qty'));
  assert.ok(cut.includes('Top'));

  const sched = scheduleCsv(project);
  assert.ok(sched.includes('Door'));
  assert.ok(sched.includes('Room'));

  const est = estimateCsv(project);
  assert.ok(est.includes('Subtotal'));
  assert.ok(est.includes('Total'));
});

test('every template builds, survives a round trip and reports sane totals', () => {
  for (const template of TEMPLATES) {
    const project = buildTemplate(template.id);
    assert.ok(project, `${template.id} builds`);
    assert.ok(project.pages.length >= 1);

    const round = normalizeProject(JSON.parse(JSON.stringify(project)));
    const before = project.pages.reduce((n, p) => n + p.entities.length, 0);
    const after = round.pages.reduce((n, p) => n + p.entities.length, 0);
    assert.equal(after, before, `${template.id} loses no entities on save/load`);

    const list = buildCutList(project);
    assert.ok(list.totals.stock >= 0);
    assert.equal(list.totals.oversize, 0, `${template.id} has no oversize parts`);

    const svg = pageToSvg(project, project.pages[0]);
    assert.ok(!/NaN/.test(svg), `${template.id} exports clean SVG`);
  }
});

test('the bookshelf template produces a real cut list', () => {
  const list = buildCutList(buildTemplate('bookshelf'));
  assert.ok(list.groups.length >= 2);
  assert.ok(list.totals.parts >= 11);
  assert.ok(list.totals.boardFeet > 0);
});

test('history supports undo and redo of document snapshots', () => {
  const history = new History(5);
  const project = createProject({ name: 'v0' });
  history.reset(project);
  assert.equal(history.canUndo, false);

  project.name = 'v1';
  history.commit(project, 'Rename');
  project.name = 'v2';
  history.commit(project, 'Rename again');

  assert.equal(history.canUndo, true);
  assert.equal(history.undo().name, 'v1');
  assert.equal(history.undo().name, 'v0');
  assert.equal(history.canUndo, false);
  assert.equal(history.redo().name, 'v1');
  assert.equal(history.redo().name, 'v2');
  assert.equal(history.canRedo, false);
});

test('history snapshots are detached from the live document', () => {
  const history = new History();
  const project = createProject({ name: 'base' });
  history.reset(project);
  project.name = 'changed';
  history.commit(project, 'Edit');
  project.name = 'changed again';
  assert.equal(history.undo().name, 'base');
});

test('history drops the oldest states past its limit', () => {
  const history = new History(3);
  const project = createProject({ name: 'n0' });
  history.reset(project);
  for (let i = 1; i <= 6; i += 1) {
    project.name = `n${i}`;
    history.commit(project, 'step');
  }
  let steps = 0;
  while (history.canUndo) {
    history.undo();
    steps += 1;
  }
  assert.ok(steps <= 4);
});
