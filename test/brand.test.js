import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  palette,
  layerColor,
  wallStatusColor,
  mmToPx,
  CANVAS_MODES,
  LINE_WEIGHT_MM,
  TOKEN,
} from '../src/render/theme.js';
import { DEFAULT_LAYERS, createProject, normalizeProject, activePage } from '../src/core/document.js';
import { pageToSvg } from '../src/features/export.js';
import { makeWall, makeDim, makeRoom } from '../src/core/entities.js';

const tokens = JSON.parse(readFileSync(new URL('../brand/tokens.json', import.meta.url)));

test('canvas palette tokens match the brand token file', () => {
  assert.equal(TOKEN.blueprint, tokens.color.blueprint.value);
  assert.equal(TOKEN.blue, tokens.color.blue.value);
  assert.equal(TOKEN.cedar, tokens.color.cedar.value);
  assert.equal(TOKEN.chalk, tokens.color.chalk.value);
  assert.equal(TOKEN.vellum, tokens.color.vellum.value);
  assert.equal(TOKEN.canvas, tokens.color.canvas.value);
});

test('line weights match the brand line weight table', () => {
  assert.deepEqual(
    LINE_WEIGHT_MM,
    Object.fromEntries(
      Object.entries(tokens['line-weights-mm']).map(([k, v]) => [
        k.replace(/-(.)/g, (_, c) => c.toUpperCase()),
        v,
      ])
    )
  );
  // 0.7 mm of plotted line is a touch under 3 screen pixels at 96 dpi.
  assert.ok(Math.abs(mmToPx(0.7) - 2.646) < 0.01);
});

test('both canvas modes ship and blueprint is the default', () => {
  assert.deepEqual(CANVAS_MODES, ['blueprint', 'paper']);
  assert.equal(palette('blueprint').background, TOKEN.canvas);
  assert.equal(palette('paper').background, TOKEN.vellum);
  assert.equal(palette('nonsense').id, 'blueprint');
});

test('the blueprint canvas follows the brand canvas spec', () => {
  const pal = palette('blueprint');
  assert.equal(pal.dimensionLine, TOKEN.sky, 'dimension lines are sky');
  assert.equal(pal.dimensionText, TOKEN.chalk, 'dimension text is chalk');
  assert.deepEqual(pal.dimensionDash, [3, 2]);
  assert.equal(pal.snap, TOKEN.green, 'snap is green');
  assert.equal(pal.selection, TOKEN.cedar, 'selection is cedar');
});

test('cedar is reserved for selection in both modes', () => {
  for (const mode of CANVAS_MODES) {
    const pal = palette(mode);
    assert.equal(pal.selection, TOKEN.cedar);
    assert.notEqual(pal.hover, TOKEN.cedar, 'hover must not compete with selection');
    assert.notEqual(pal.preview, TOKEN.cedar);
    assert.notEqual(pal.geometry, TOKEN.cedar);
  }
  // No default layer draws in cedar either.
  for (const layer of DEFAULT_LAYERS) {
    assert.notEqual(layer.color, TOKEN.cedar, `${layer.id} paper colour`);
    assert.notEqual(layer.colorDark, TOKEN.cedar, `${layer.id} blueprint colour`);
  }
});

test('every default layer carries both mode colours and a real line weight', () => {
  const allowed = new Set(Object.values(LINE_WEIGHT_MM));
  for (const layer of DEFAULT_LAYERS) {
    assert.match(layer.color, /^#[0-9A-F]{6}$/i, `${layer.id} needs a paper colour`);
    assert.match(layer.colorDark, /^#[0-9A-F]{6}$/i, `${layer.id} needs a blueprint colour`);
    assert.ok(allowed.has(layer.weight), `${layer.id} weight ${layer.weight} is not a brand weight`);
  }
});

test('layer colours switch with the canvas mode', () => {
  const layer = { color: '#0F2338', colorDark: '#A9C7E5' };
  assert.equal(layerColor(layer, 'paper'), '#0F2338');
  assert.equal(layerColor(layer, 'blueprint'), '#A9C7E5');
  // A layer with no blueprint colour falls back to chalk, the brand's geometry
  // colour on the dark canvas.
  assert.equal(layerColor({ color: '#123456' }, 'blueprint'), TOKEN.chalk);
});

test('wall status reads by shape as well as colour', () => {
  assert.equal(wallStatusColor('new', 'paper'), null, 'new walls use their layer');
  const demoPaper = wallStatusColor('demo', 'paper');
  const demoDark = wallStatusColor('demo', 'blueprint');
  assert.equal(demoPaper.color, TOKEN.redDeep, 'text-safe red on light');
  assert.equal(demoDark.color, TOKEN.red);
  assert.ok(Array.isArray(demoPaper.dash), 'demolition is dashed, not colour-only');
  assert.equal(wallStatusColor('existing', 'blueprint').dash, null);
});

test('legacy v1 files migrate their pixel line weights to brand millimetres', () => {
  const legacy = {
    version: 1,
    name: 'Old file',
    layers: [
      { id: 'walls', name: 'Walls — New', color: '#1f2933', weight: 1.6, visible: true },
      { id: 'custom', name: 'Custom', color: '#123456', weight: 1.0, visible: true },
    ],
    pages: [{ id: 'p1', name: 'Plan', entities: [] }],
  };
  const project = normalizeProject(legacy);
  assert.equal(project.version, 2);
  const walls = project.layers.find((l) => l.id === 'walls');
  assert.equal(walls.weight, 0.7, 'known layers take the brand weight');
  assert.equal(walls.colorDark, '#A9C7E5', 'known layers gain a blueprint colour');
  const custom = project.layers.find((l) => l.id === 'custom');
  assert.ok(custom.weight >= 0.18 && custom.weight <= 0.7, 'custom layers scale into range');
  assert.ok(custom.colorDark, 'custom layers still get a blueprint colour');
});

test('version 2 files keep their weights untouched', () => {
  const project = createProject({});
  const round = normalizeProject(JSON.parse(JSON.stringify(project)));
  for (const layer of round.layers) {
    const original = project.layers.find((l) => l.id === layer.id);
    assert.equal(layer.weight, original.weight);
    assert.equal(layer.colorDark, original.colorDark);
  }
});

test('exported sheets carry the branded title block', () => {
  const project = createProject({ name: 'Guest Bath' });
  project.meta.client = 'R. Vine';
  const page = activePage(project);
  const wall = makeWall({ x: 0, y: 0 }, { x: 120, y: 0 }, 'walls', 5.5, 'new');
  page.entities.push(
    wall,
    makeDim({ x: 0, y: 0 }, { x: 120, y: 0 }, 'dimensions', -18),
    makeRoom([{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 96 }, { x: 0, y: 96 }], 'rooms', 'Bath')
  );

  const svg = pageToSvg(project, page);
  assert.ok(svg.includes('STORYSTICK'), 'wordmark in the title block');
  assert.ok(svg.includes('Draw it before you build it.'), 'tagline in the title block');
  assert.ok(svg.includes('Guest Bath'), 'project name');
  assert.ok(svg.includes('CLIENT R. Vine'), 'client line');
  assert.ok(svg.includes(TOKEN.blueprint), 'title block band uses Blueprint');
  assert.ok(svg.includes(TOKEN.cedar), 'cedar rule on the title block');
  assert.ok(svg.includes('IBM Plex Mono'), 'measurements are set in mono');
  assert.ok(svg.includes('Space Grotesk'), 'the project name is set in the brand face');
  assert.ok(!/NaN/.test(svg));
});

test('exports are drawn in Paper mode regardless of the working canvas', () => {
  const project = createProject({ name: 'Modes' });
  const page = activePage(project);
  page.entities.push(makeWall({ x: 0, y: 0 }, { x: 100, y: 0 }, 'walls', 5.5, 'new'));
  const svg = pageToSvg(project, page);
  assert.ok(svg.includes(`fill="${TOKEN.paper}"`), 'white sheet ground');
  assert.ok(!svg.includes(TOKEN.canvas), 'never the dark canvas colour');
});
