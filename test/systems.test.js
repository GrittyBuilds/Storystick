// Symbols, assemblies, finishes, and the entities that make up everything
// other than the architectural floor plan.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SYMBOLS,
  SYMBOL_LIST,
  SYMBOL_GROUPS,
  getSymbol,
  symbolsFor,
  layerForSymbol,
  disciplinesForPage,
} from '../src/symbols/library.js';
import { place, symbolPoints, drawSymbolSvg, symbolPreviewSvg } from '../src/symbols/render.js';
import {
  ASSEMBLIES,
  ASSEMBLY_LIST,
  assemblyThickness,
  layerOffsets,
  structuralLayer,
  exposedFaces,
  FINISH_SLOTS,
} from '../src/core/assemblies.js';
import {
  makeRoofPlane,
  makeFooting,
  makePadFooting,
  makeSlab,
  makeBeam,
  makeFixture,
  roofHeightAt,
  roofRidgeHeight,
  roofEaveEdge,
  roofPlanArea,
  roofSlopedArea,
  beamWidth,
  outlines,
  hitTest,
  DISCIPLINES,
} from '../src/core/entities.js';
import { DEFAULT_LAYERS, PAGE_KINDS, makePage, basePageOf } from '../src/core/document.js';
import { finishSchedule, missingFinishes, assemblyTakeoff, fixtureSchedule, roofTakeoff, structureTakeoff } from '../src/features/schedule.js';
import { buildTemplate } from '../src/features/templates.js';
import { buildBuildingModel, massingPages, pageElevation } from '../src/model3d/build.js';

// --- symbol library --------------------------------------------------------

test('every symbol has the fields the renderer and the schedule need', () => {
  for (const s of SYMBOL_LIST) {
    assert.equal(typeof s.id, 'string', `${s.name} has no id`);
    assert.ok(s.name, `${s.id} has no name`);
    assert.ok(DISCIPLINES.includes(s.discipline), `${s.id} has discipline "${s.discipline}"`);
    assert.ok(s.widthIn > 0 && s.heightIn > 0, `${s.id} has no footprint`);
    assert.ok(Array.isArray(s.ops) && s.ops.length, `${s.id} draws nothing`);
  }
});

test('symbol ids are unique and match their key', () => {
  for (const [key, s] of Object.entries(SYMBOLS)) assert.equal(key, s.id);
  assert.equal(new Set(SYMBOL_LIST.map((s) => s.id)).size, SYMBOL_LIST.length);
});

test('every symbol op is a shape the renderers know how to draw', () => {
  const known = new Set(['l', 'f', 'c', 'a', 'x']);
  for (const s of SYMBOL_LIST) {
    for (const op of s.ops) {
      assert.ok(known.has(op.t), `${s.id} has an op of type "${op.t}"`);
      if (op.t === 'l' || op.t === 'f') {
        assert.ok(op.pts.length >= 2, `${s.id} has a path with ${op.pts.length} points`);
        for (const p of op.pts) {
          assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), `${s.id} has a bad point`);
        }
      }
      if (op.t === 'c' || op.t === 'a') assert.ok(op.r > 0, `${s.id} has a zero-radius circle`);
      if (op.t === 'x') assert.ok(op.s, `${s.id} has empty text`);
    }
  }
});

test('symbol geometry stays inside its declared footprint', () => {
  const fixture = { p: { x: 0, y: 0 }, rot: 0, scale: 1 };
  for (const s of SYMBOL_LIST) {
    const pts = symbolPoints(s, fixture);
    const maxX = Math.max(...pts.map((p) => Math.abs(p.x)));
    const maxY = Math.max(...pts.map((p) => Math.abs(p.y)));
    // Text sits at a point, so allow a little slack past the nominal box.
    assert.ok(maxX <= s.widthIn, `${s.id} draws ${maxX}" wide but declares ${s.widthIn}"`);
    assert.ok(maxY <= s.heightIn * 1.2, `${s.id} draws ${maxY}" tall but declares ${s.heightIn}"`);
  }
});

test('every group in the palette has symbols in it', () => {
  for (const group of SYMBOL_GROUPS) {
    assert.ok(symbolsFor(group.discipline).length > 0, `${group.label} is empty`);
  }
});

test('every symbol lands on a layer that exists', () => {
  const ids = new Set(DEFAULT_LAYERS.map((l) => l.id));
  for (const s of SYMBOL_LIST) assert.ok(ids.has(layerForSymbol(s.id)), `${s.id} has no layer`);
});

test('an unknown symbol is null rather than a broken object', () => {
  assert.equal(getSymbol('nope'), null);
  assert.equal(drawSymbolSvg(null, { p: { x: 0, y: 0 } }, { color: '#000', weight: 1 }), '');
});

test('placing a symbol applies rotation about its insertion point', () => {
  const at = { p: { x: 100, y: 50 }, rot: Math.PI / 2, scale: 1 };
  // Local +y (into the room) rotates to -x under a +90 degree y-down rotation.
  const p = place([0, 10], at);
  assert.ok(Math.abs(p.x - 90) < 1e-9, `x was ${p.x}`);
  assert.ok(Math.abs(p.y - 50) < 1e-9, `y was ${p.y}`);
});

test('mirroring a symbol flips it across its own axis, not the drawing', () => {
  const at = { p: { x: 0, y: 0 }, rot: 0, scale: 1, mirrored: true };
  assert.equal(place([5, 3], at).x, -5);
  assert.equal(place([5, 3], at).y, 3);
});

test('a symbol plots with a scaling stroke so it is never a hairline', () => {
  const svg = drawSymbolSvg(getSymbol('e-recep'), { p: { x: 0, y: 0 }, rot: 0, scale: 1 }, {
    color: '#000',
    weight: 0.5,
    font: 'sans-serif',
  });
  assert.ok(svg.length > 0);
  assert.ok(!svg.includes('non-scaling-stroke'), 'a non-scaling stroke plots as an invisible hairline');
  assert.ok(!/NaN/.test(svg));
});

test('every symbol previews without throwing or emitting NaN', () => {
  for (const s of SYMBOL_LIST) {
    const svg = symbolPreviewSvg(s, 40, '#000');
    assert.ok(svg.startsWith('<svg'), `${s.id} produced no preview`);
    assert.ok(!/NaN/.test(svg), `${s.id} previewed with NaN`);
  }
});

test('every page kind knows which disciplines it shows', () => {
  for (const kind of PAGE_KINDS) assert.ok(Array.isArray(disciplinesForPage(kind)));
});

// --- assemblies ------------------------------------------------------------

test('an assembly thickness is the sum of its real layers', () => {
  // 1/2 + 3-1/2 + 1/2
  assert.equal(assemblyThickness(ASSEMBLIES['int-2x4']), 4.5);
  // siding + WRB + sheathing + studs + gypsum
  assert.equal(assemblyThickness(ASSEMBLIES['ext-2x6']), 0.5 + 0.25 + 0.4375 + 5.5 + 0.5);
});

test('layer offsets run face to face without gaps', () => {
  for (const a of ASSEMBLY_LIST) {
    const offsets = layerOffsets(a);
    assert.equal(offsets[0].from, 0);
    for (let i = 1; i < offsets.length; i += 1) {
      assert.equal(offsets[i].from, offsets[i - 1].to, `${a.id} has a gap at layer ${i}`);
    }
    assert.ok(Math.abs(offsets[offsets.length - 1].to - assemblyThickness(a)) < 1e-9);
  }
});

test('every assembly has a structural core a span check can use', () => {
  for (const a of ASSEMBLY_LIST) {
    assert.ok(structuralLayer(a), `${a.id} has nothing structural in it`);
  }
});

test('the exposed faces are the outermost layers', () => {
  const faces = exposedFaces(ASSEMBLIES['ext-2x6']);
  assert.equal(faces.a.name, 'Lap siding');
  assert.equal(faces.b.name, '1/2" gypsum board');
});

test('an empty assembly reports no faces rather than throwing', () => {
  assert.deepEqual(exposedFaces({ layers: [] }), { a: null, b: null });
  assert.equal(assemblyThickness(null), 0);
});

// --- the new entities ------------------------------------------------------

const square = [
  { x: 0, y: 0 },
  { x: 120, y: 0 },
  { x: 120, y: 120 },
  { x: 0, y: 120 },
];

test('a roof plane rises from its eave edge at its pitch', () => {
  const plane = makeRoofPlane(square, 'roof', { eave: 0, pitch: 6, eaveHeight: 96 });
  const [a, b] = roofEaveEdge(plane);
  assert.deepEqual([a.y, b.y], [0, 0]);
  // On the eave the roof is at eave height.
  assert.equal(roofHeightAt(plane, { x: 60, y: 0 }), 96);
  // 120" of run at 6:12 is 60" of rise.
  assert.equal(roofHeightAt(plane, { x: 60, y: 120 }), 156);
  assert.equal(roofRidgeHeight(plane), 156);
});

test('a flat roof plane stays flat', () => {
  const plane = makeRoofPlane(square, 'roof', { eave: 0, pitch: 0, eaveHeight: 120 });
  assert.equal(roofHeightAt(plane, { x: 60, y: 120 }), 120);
  assert.equal(roofRidgeHeight(plane), 120);
});

test('a roof plane never dips below its eave, whichever way it is drawn', () => {
  for (const eave of [0, 1, 2, 3]) {
    const plane = makeRoofPlane(square, 'roof', { eave, pitch: 8, eaveHeight: 100 });
    for (const p of square.concat([{ x: 60, y: 60 }])) {
      assert.ok(roofHeightAt(plane, p) >= 100 - 1e-9, `eave ${eave} dipped below the eave`);
    }
  }
});

test('roof plan area is the plan area, and the takeoff adds the slope', () => {
  const project = buildTemplate('sample-house');
  const take = roofTakeoff(project);
  assert.equal(take.rows.length, 2);
  for (const row of take.rows) {
    assert.ok(row.slopedArea > row.planArea, 'a 6:12 roof has more surface than footprint');
    // 6:12 is a slope factor of sqrt(144+36)/12 = 1.118.
    assert.ok(Math.abs(row.slopedArea / row.planArea - 1.118) < 0.001);
  }
  assert.ok(take.totals.squares > 10 && take.totals.squares < 30);
  // The two areas are distinct: the footprint, and the surface over it.
  const flat = makeRoofPlane(square, 'roof', { pitch: 0 });
  assert.equal(roofPlanArea(flat), 14400);
  assert.equal(roofSlopedArea(flat), 14400);
  const steep = makeRoofPlane(square, 'roof', { pitch: 12 });
  assert.equal(roofPlanArea(steep), 14400);
  assert.ok(Math.abs(roofSlopedArea(steep) - 14400 * Math.SQRT2) < 1e-9);
});

test('a footing outlines as a solid the width it is drawn at', () => {
  const f = makeFooting({ x: 0, y: 0 }, { x: 100, y: 0 }, 'footings', { width: 20 });
  const [path] = outlines(f, { entities: [] });
  const ys = path.pts.map((p) => p.y);
  assert.equal(Math.max(...ys) - Math.min(...ys), 20);
});

test('a pad footing is square unless told otherwise', () => {
  const pad = makePadFooting({ x: 50, y: 50 }, 'footings', { width: 30 });
  const [path] = outlines(pad, { entities: [] });
  const xs = path.pts.map((p) => p.x);
  const ys = path.pts.map((p) => p.y);
  assert.equal(Math.max(...xs) - Math.min(...xs), 30);
  assert.equal(Math.max(...ys) - Math.min(...ys), 30);
});

test('beam width comes from its size and ply count', () => {
  assert.equal(beamWidth(makeBeam({ x: 0, y: 0 }, { x: 1, y: 0 }, 's', { size: '2x10', plies: 3 })), 4.5);
  assert.equal(beamWidth(makeBeam({ x: 0, y: 0 }, { x: 1, y: 0 }, 's', { size: '6x8', plies: 1 })), 5.5);
});

test('the new entities are all hit testable, so they can be selected', () => {
  const page = { entities: [] };
  const cases = [
    [makeSlab(square, 'slab', {}), { x: 60, y: 60 }],
    [makeFooting({ x: 0, y: 0 }, { x: 100, y: 0 }, 'footings', { width: 20 }), { x: 50, y: 2 }],
    [makeBeam({ x: 0, y: 0 }, { x: 100, y: 0 }, 'structure', { size: '2x10', plies: 2 }), { x: 50, y: 0 }],
    [makeRoofPlane(square, 'roof', {}), { x: 60, y: 60 }],
    [makeFixture('p-wc', { x: 10, y: 10 }, 'plumbing', {}), { x: 10, y: 10 }],
  ];
  for (const [ent, pt] of cases) {
    assert.ok(hitTest(ent, page, pt, 3), `${ent.type} could not be picked`);
  }
});

// --- finishes and takeoff --------------------------------------------------

const house = buildTemplate('sample-house');

test('the finish schedule reports every room with its quantities', () => {
  const rows = finishSchedule(house);
  assert.ok(rows.length >= 8);
  for (const row of rows) {
    assert.ok(row.floorArea > 0, `${row.name} has no floor area`);
    assert.ok(row.wallArea > 0, `${row.name} has no wall area`);
    assert.ok(row.ceilingHeight > 0);
    // wall area is perimeter x ceiling height
    assert.ok(Math.abs(row.wallArea - row.baseLength * row.ceilingHeight) < 1e-6);
  }
});

test('a room with no finishes is reported as missing, never filled in', () => {
  const project = buildTemplate('shed');
  const missing = missingFinishes(project);
  assert.ok(missing.length > 0, 'a room with no finishes was silently defaulted');
  assert.deepEqual(missing[0].missing.sort(), [...FINISH_SLOTS].sort());
  for (const row of finishSchedule(project)) {
    assert.equal(row.floor, '');
    assert.equal(row.complete, false);
  }
});

test('the sample house has a complete finish schedule', () => {
  assert.deepEqual(missingFinishes(house), []);
});

test('the assembly takeoff counts gypsum on both faces of a partition', () => {
  const take = assemblyTakeoff(house);
  const partition = take.rows.find((r) => r.assembly.startsWith('Interior partition — 2x4'));
  const studs = take.rows.find(
    (r) => r.assembly.startsWith('Interior partition — 2x4') && r.kind === 'structure'
  );
  assert.ok(partition && studs);
  // Two faces of board for one thickness of studs.
  assert.ok(Math.abs(partition.area - studs.area * 2) < 1);
  assert.ok(partition.sheets > 0);
});

test('the assembly takeoff reports walls it cannot count rather than zeroing them', () => {
  const project = buildTemplate('shed');
  const take = assemblyTakeoff(project);
  assert.ok(take.unassigned.length > 0, 'walls without an assembly were silently counted as nothing');
  assert.equal(take.rows.length, 0);
});

test('concrete comes out in cubic yards, board in sheets', () => {
  const take = assemblyTakeoff(house);
  const concrete = take.rows.find((r) => r.unit === 'volume');
  assert.ok(concrete && concrete.volume > 0 && concrete.volume < 200);
  const board = take.rows.find((r) => r.unit === 'sheet');
  assert.ok(board && board.sheets === Math.ceil(board.area / 32));
});

test('the fixture schedule counts every symbol placed', () => {
  const rows = fixtureSchedule(house);
  const total = rows.reduce((n, r) => n + r.qty, 0);
  const placed = house.pages.reduce(
    (n, p) => n + p.entities.filter((e) => e.type === 'fixture').length,
    0
  );
  assert.equal(total, placed);
  assert.ok(fixtureSchedule(house, 'plumbing').every((r) => r.discipline === 'plumbing'));
});

test('the structure takeoff prices footings, slab and beams', () => {
  const take = structureTakeoff(house);
  assert.ok(take.footings.length > 0);
  assert.equal(take.slabs.length, 1);
  assert.ok(take.beams.length > 0);
  assert.ok(take.totals.footingVolume > 0);
  assert.ok(take.totals.slabVolume > 0);
  // A 40x28 basement slab at 4" is roughly 13 cubic yards.
  assert.ok(take.totals.slabVolume > 10 && take.totals.slabVolume < 16);
});

// --- discipline sheets -----------------------------------------------------

test('a discipline sheet traces the plan instead of copying its walls', () => {
  const plan = house.pages.find((p) => p.kind === 'plan');
  for (const kind of ['electrical', 'plumbing', 'mechanical', 'framing']) {
    const page = house.pages.find((p) => p.kind === kind);
    assert.equal(page.basePageId, plan.id, `${kind} does not trace the plan`);
    assert.equal(
      page.entities.filter((e) => e.type === 'wall').length,
      0,
      `${kind} owns a duplicate copy of the walls`
    );
    assert.equal(basePageOf(house, page), plan);
  }
});

test('a base-page link to nothing resolves to nothing rather than throwing', () => {
  const page = makePage('Orphan', 'electrical', { basePageId: 'gone' });
  assert.equal(basePageOf(house, page), null);
  const selfRef = makePage('Self', 'electrical');
  selfRef.basePageId = selfRef.id;
  assert.equal(basePageOf({ pages: [selfRef] }, selfRef), null);
});

// --- 3D --------------------------------------------------------------------

test('only the massing sheets are built in 3D', () => {
  const pages = massingPages(house).map((p) => p.kind);
  assert.deepEqual(pages.sort(), ['foundation', 'plan', 'roof']);
});

test('the foundation sheet sits a basement below the floor', () => {
  const found = house.pages.find((p) => p.kind === 'foundation');
  const plan = house.pages.find((p) => p.kind === 'plan');
  assert.equal(pageElevation(house, plan), 0);
  assert.ok(pageElevation(house, found) < 0);
});

test('the whole building model stacks basement, floor and roof', () => {
  const model = buildBuildingModel(house, {});
  assert.equal(model.stats.sheets.length, 3);
  assert.ok(model.stats.walls > 10);
  assert.ok(model.stats.substructure.slabs === 1);
  assert.ok(model.stats.substructure.beams >= 1);
  assert.ok(model.stats.substructure.footings > 0);
  // Basement floor below the datum, ridge well above it.
  assert.ok(model.bounds.minY < -90, `lowest point is ${model.bounds.minY}`);
  assert.ok(model.bounds.maxY > 150, `highest point is ${model.bounds.maxY}`);
  assert.ok(model.stats.triangles > 100);
});

test('a drawn roof is used instead of the generated gable', () => {
  const model = buildBuildingModel(house, {});
  assert.equal(model.stats.roof.style, 'drawn');
  assert.equal(model.stats.roof.planes, 2);
});

test('a project with no drawn roof still gets one generated', () => {
  const shed = buildTemplate('shed');
  const model = buildBuildingModel(shed, {});
  assert.equal(model.stats.roof.style, 'gable');
});

test('every mesh vertex is a finite number', () => {
  const model = buildBuildingModel(house, {});
  for (const mesh of model.meshes) {
    for (const v of mesh.positions) assert.ok(Number.isFinite(v), `${mesh.material} has a bad vertex`);
    for (const v of mesh.normals) assert.ok(Number.isFinite(v), `${mesh.material} has a bad normal`);
  }
});
