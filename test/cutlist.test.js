import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, activePage, getMaterial } from '../src/core/document.js';
import { makePart } from '../src/core/entities.js';
import { collectParts, mergeParts, packSheets, packBoards, buildCutList } from '../src/features/cutlist.js';

function projectWithParts(specs) {
  const project = createProject({ name: 'Case' });
  const page = activePage(project);
  let y = 0;
  for (const spec of specs) {
    page.entities.push(
      makePart({ x: 0, y }, { x: spec.length, y: y + spec.width }, 'parts', {
        name: spec.name,
        material: spec.material,
        thickness: spec.thickness ?? 0.75,
        qty: spec.qty ?? 1,
      })
    );
    y += spec.width + 5;
  }
  return project;
}

test('collectParts reads part rectangles as length × width', () => {
  const project = projectWithParts([{ name: 'Side', length: 72, width: 11.25, material: 'ply-3/4', qty: 2 }]);
  const rows = collectParts(project);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, 72);
  assert.equal(rows[0].width, 11.25);
  assert.equal(rows[0].qty, 2);
});

test('collectParts ignores degenerate rectangles', () => {
  const project = createProject({});
  const page = activePage(project);
  page.entities.push(makePart({ x: 0, y: 0 }, { x: 0, y: 10 }, 'parts', {}));
  assert.equal(collectParts(project).length, 0);
});

test('identical parts merge and quantities add up', () => {
  const rows = mergeParts([
    { id: 'a', name: 'Shelf', length: 30, width: 11, thickness: 0.75, material: 'ply-3/4', qty: 2 },
    { id: 'b', name: 'Shelf', length: 30, width: 11, thickness: 0.75, material: 'ply-3/4', qty: 3 },
    { id: 'c', name: 'Shelf', length: 30, width: 12, thickness: 0.75, material: 'ply-3/4', qty: 1 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.width === 11).qty, 5);
});

test('sheet packing fits parts that share a shelf', () => {
  const material = { id: 'ply', form: 'sheet', thickness: 0.75, stockW: 48, stockL: 96, cost: 60 };
  const rows = [{ id: 'p', name: 'Panel', length: 24, width: 23, thickness: 0.75, qty: 4 }];
  const { sheets, oversize } = packSheets(rows, material, 0.125);
  assert.equal(oversize.length, 0);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].pieces.length, 4);
  assert.ok(sheets[0].utilization > 0.4 && sheets[0].utilization <= 1);
});

test('sheet packing never overhangs the stock', () => {
  const material = { id: 'ply', form: 'sheet', thickness: 0.75, stockW: 48, stockL: 96, cost: 60 };
  const rows = [
    { id: 'a', name: 'Long', length: 90, width: 20, thickness: 0.75, qty: 3 },
    { id: 'b', name: 'Small', length: 12, width: 12, thickness: 0.75, qty: 6 },
  ];
  const { sheets } = packSheets(rows, material, 0.125);
  for (const sheet of sheets) {
    for (const piece of sheet.pieces) {
      assert.ok(piece.x >= 0 && piece.y >= 0);
      assert.ok(piece.x + piece.l <= material.stockL + 1e-6, 'piece runs past the sheet length');
      assert.ok(piece.y + piece.w <= material.stockW + 1e-6, 'piece runs past the sheet width');
    }
  }
  const placed = sheets.reduce((n, s) => n + s.pieces.length, 0);
  assert.equal(placed, 9);
});

test('parts larger than the stock are reported, not silently dropped', () => {
  const material = { id: 'ply', form: 'sheet', thickness: 0.75, stockW: 48, stockL: 96, cost: 60 };
  const rows = [{ id: 'x', name: 'Oversize', length: 120, width: 60, thickness: 0.75, qty: 1 }];
  const { sheets, oversize } = packSheets(rows, material, 0.125);
  assert.equal(sheets.length, 0);
  assert.equal(oversize.length, 1);
});

test('board packing rips lanes and counts boards', () => {
  const material = { id: '2x4', form: 'board', thickness: 1.5, stockW: 3.5, stockL: 96, cost: 5 };
  const rows = [{ id: 'leg', name: 'Leg', length: 30, width: 3.5, thickness: 1.5, qty: 4 }];
  const { runs } = packBoards(rows, material, 0.125);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].ripsPerBoard, 1);
  assert.equal(runs[0].lanes.length, 2); // three per 96" lane, so four legs need two
  assert.equal(runs[0].boards, 2);
});

test('narrow parts get multiple rips from one board', () => {
  const material = { id: 'oak', form: 'board', thickness: 0.8125, stockW: 6, stockL: 96, cost: 38 };
  const rows = [{ id: 'trim', name: 'Trim', length: 90, width: 1.5, thickness: 0.75, qty: 4 }];
  const { runs } = packBoards(rows, material, 0.125);
  assert.equal(runs[0].ripsPerBoard, 3);
  assert.equal(runs[0].lanes.length, 4);
  assert.equal(runs[0].boards, 2);
});

test('board packing reports parts wider than the stock', () => {
  const material = { id: '2x4', form: 'board', thickness: 1.5, stockW: 3.5, stockL: 96, cost: 5 };
  const rows = [{ id: 'wide', name: 'Wide', length: 30, width: 9, thickness: 1.5, qty: 1 }];
  const { runs, oversize } = packBoards(rows, material, 0.125);
  assert.equal(runs.length, 0);
  assert.equal(oversize.length, 1);
});

test('buildCutList groups by material and totals cost and board feet', () => {
  const project = projectWithParts([
    { name: 'Side', length: 72, width: 11.25, material: 'ply-3/4', qty: 2 },
    { name: 'Shelf', length: 34.5, width: 11, material: 'ply-3/4', qty: 4 },
    { name: 'Leg', length: 30, width: 3.5, material: 'spf-2x4', thickness: 1.5, qty: 4 },
  ]);
  const list = buildCutList(project);

  assert.equal(list.groups.length, 2);
  assert.equal(list.totals.parts, 10);
  assert.ok(list.totals.stock >= 2);
  assert.ok(list.totals.boardFeet > 0);
  assert.ok(list.totals.cost > 0);

  const ply = list.groups.find((g) => g.material.id === 'ply-3/4');
  assert.ok(ply.sheets.length >= 1);
  assert.equal(ply.cost, ply.stockCount * getMaterial(project, 'ply-3/4').cost);

  const studs = list.groups.find((g) => g.material.id === 'spf-2x4');
  assert.ok(studs.runs.length >= 1);
});

test('parts referencing an unknown material are surfaced separately', () => {
  const project = projectWithParts([{ name: 'Mystery', length: 20, width: 10, material: 'unobtainium' }]);
  const list = buildCutList(project);
  assert.equal(list.groups.length, 0);
  assert.equal(list.unassigned.length, 1);
  assert.equal(list.totals.parts, 1);
});

test('an empty project yields an empty cut list', () => {
  const list = buildCutList(createProject({}));
  assert.deepEqual(list.groups, []);
  assert.equal(list.totals.parts, 0);
  assert.equal(list.totals.cost, 0);
});
