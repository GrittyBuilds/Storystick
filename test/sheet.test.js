// Sheet layout and blueprint plotting.
//
// The thing worth testing here is not that an SVG comes out — it is that the
// SVG is a construction document: a real paper size, a real architectural
// scale, and geometry placed where a scale rule would find it.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SHEET_SIZES,
  SCALES,
  sheetSize,
  findScale,
  drawingArea,
  chooseScale,
  layout,
  scaleBar,
  numberSheets,
  sheetNumber,
  MIN_FILL,
} from '../src/features/sheet.js';
import { renderSheet, renderSet } from '../src/features/blueprint.js';
import { buildTemplate } from '../src/features/templates.js';
import { SHEET_PREFIX } from '../src/core/document.js';

const box = (w, h) => ({ minX: 0, minY: 0, maxX: w, maxY: h });

test('sheet sizes honour the requested orientation', () => {
  const land = sheetSize('ARCH-D', 'landscape');
  const port = sheetSize('ARCH-D', 'portrait');
  assert.equal(land.w, 36);
  assert.equal(land.h, 24);
  assert.equal(port.w, 24);
  assert.equal(port.h, 36);
});

test('an unknown sheet size falls back rather than producing NaN', () => {
  const s = sheetSize('NOT-A-SIZE');
  assert.equal(s.w, SHEET_SIZES['ARCH-D'].w);
});

test('every scale ratio is model inches per paper inch', () => {
  // 1/4" = 1'-0" puts 48 model inches on one paper inch.
  assert.equal(findScale('1/4" = 1\'-0"').ratio, 48);
  assert.equal(findScale('1/2" = 1\'-0"').ratio, 24);
  assert.equal(findScale('1" = 1\'-0"').ratio, 12);
  for (const s of SCALES) assert.ok(s.ratio > 0, `${s.label} has no ratio`);
});

test('the drawing area leaves room for the binding edge and title block', () => {
  const area = drawingArea(sheetSize('ARCH-D'), 'right');
  assert.equal(area.x, 1); // binding margin
  assert.equal(area.x + area.w, 36 - 0.5 - 5); // margin + title block
});

test('a reserved band shrinks the drawing area, not the sheet', () => {
  const plain = drawingArea(sheetSize('ARCH-D'), 'right');
  const reserved = drawingArea(sheetSize('ARCH-D'), 'right', { bottom: 1.05 });
  assert.equal(reserved.w, plain.w);
  assert.ok(Math.abs(reserved.h - (plain.h - 1.05)) < 1e-9);
});

test('a house-sized plan lands on the conventional 1/4 inch scale', () => {
  const area = drawingArea(sheetSize('ARCH-D'), 'right', { bottom: 1.05 });
  const picked = chooseScale(box(40 * 12, 28 * 12), area, 'plan');
  assert.equal(picked.scale.label, '1/4" = 1\'-0"');
  assert.ok(picked.standard);
});

test('a small building steps up rather than swimming on the sheet', () => {
  const area = drawingArea(sheetSize('ARCH-D'), 'right', { bottom: 1.05 });
  const picked = chooseScale(box(16 * 12, 12 * 12), area, 'plan');
  assert.equal(picked.scale.label, '1/2" = 1\'-0"');
  assert.ok(picked.standard);
});

test('the step up is capped, so a shed never plots at a detail scale', () => {
  const area = drawingArea(sheetSize('ARCH-D'), 'right', { bottom: 1.05 });
  const picked = chooseScale(box(4 * 12, 4 * 12), area, 'plan');
  // Even a tiny footprint stops at 1/2" for a plan; going further would put a
  // shed on the sheet at a scale reserved for details.
  assert.equal(picked.scale.label, '1/2" = 1\'-0"');
});

test('a drawing too big for any standard scale is reported, never faked', () => {
  const area = drawingArea(sheetSize('ANSI-A'), 'right');
  const picked = chooseScale(box(4000 * 12, 4000 * 12), area, 'plan');
  assert.equal(picked.standard, false);
  assert.ok(picked.scale.label.length > 0);
});

test('the chosen scale actually fills a usable share of the sheet', () => {
  const area = drawingArea(sheetSize('ARCH-D'), 'right', { bottom: 1.05 });
  for (const [w, h] of [
    [40 * 12, 28 * 12],
    [16 * 12, 12 * 12],
    [60 * 12, 40 * 12],
  ]) {
    const picked = chooseScale(box(w, h), area, 'plan');
    const fill = Math.max(w / picked.scale.ratio / area.w, h / picked.scale.ratio / area.h);
    assert.ok(fill <= 1, `${w}x${h} overflows at ${picked.scale.label}`);
    assert.ok(fill >= MIN_FILL * 0.5, `${w}x${h} is lost on the sheet at ${picked.scale.label}`);
  }
});

test('toPaper maps model inches to paper inches at the drawing scale', () => {
  const L = layout({ modelBox: box(480, 336), sheet: sheetSize('ARCH-D'), kind: 'plan' });
  const a = L.toPaper({ x: 0, y: 0 });
  const b = L.toPaper({ x: 480, y: 0 });
  // 480 model inches at 1/4" = 1'-0" is 10 paper inches.
  assert.ok(Math.abs(b.x - a.x - 480 / L.ratio) < 1e-9);
  assert.equal(L.ratio, 48);
  assert.ok(Math.abs(b.x - a.x - 10) < 1e-9);
});

test('the drawing is centred in its area', () => {
  const L = layout({ modelBox: box(480, 336), sheet: sheetSize('ARCH-D'), kind: 'plan' });
  const left = L.offsetX - L.area.x;
  const right = L.area.x + L.area.w - (L.offsetX + L.paperW);
  assert.ok(Math.abs(left - right) < 1e-9);
});

test('an explicit scale label overrides the automatic choice', () => {
  const L = layout({
    modelBox: box(480, 336),
    sheet: sheetSize('ARCH-D'),
    kind: 'plan',
    scaleLabel: '1/8" = 1\'-0"',
  });
  assert.equal(L.ratio, 96);
});

test('the scale bar covers a round number of feet that fits', () => {
  const bar = scaleBar(48, 2.4);
  assert.ok(bar.paperWidth <= 2.4);
  assert.ok(Number.isInteger(bar.totalFeet));
  assert.equal(bar.ticks.length, bar.divisions + 1);
  assert.equal(bar.ticks[0].label, '0');
  assert.equal(bar.ticks[bar.ticks.length - 1].label, String(bar.totalFeet));
});

test('sheets are numbered by discipline, not by page order', () => {
  const pages = [
    { id: 'a', kind: 'electrical' },
    { id: 'b', kind: 'plan' },
    { id: 'c', kind: 'foundation' },
    { id: 'd', kind: 'plan' },
  ];
  const numbers = numberSheets(pages, (p) => SHEET_PREFIX[p.kind]);
  assert.equal(numbers.get('b'), 'A-101');
  assert.equal(numbers.get('d'), 'A-102');
  assert.equal(numbers.get('c'), 'S-101');
  assert.equal(numbers.get('a'), 'E-101');
});

test('sheet numbers start at 101', () => {
  assert.equal(sheetNumber('A', 1), 'A-101');
  assert.equal(sheetNumber('M', 12), 'M-112');
});

// --- the plot itself -------------------------------------------------------

const house = buildTemplate('sample-house');
const planPage = house.pages.find((p) => p.kind === 'plan');

test('a plotted sheet is sized in physical inches', () => {
  const out = renderSheet(house, planPage, {});
  assert.match(out.svg, /width="36in" height="24in"/);
  assert.match(out.svg, /viewBox="0 0 36 24"/);
});

test('a plotted sheet contains no NaN', () => {
  for (const page of house.pages) {
    const out = renderSheet(house, page, {});
    assert.ok(!/NaN|undefined/.test(out.svg), `${page.name} plotted a bad number`);
  }
});

test('every sheet in the sample set plots at a standard scale', () => {
  for (const page of house.pages) {
    const out = renderSheet(house, page, {});
    assert.ok(out.standardScale, `${page.name} fell off the standard scales`);
  }
});

test('a sheet number carries the discipline of its sheet', () => {
  const found = house.pages.find((p) => p.kind === 'foundation');
  const elec = house.pages.find((p) => p.kind === 'electrical');
  assert.match(renderSheet(house, found, {}).sheetNumber, /^S-/);
  assert.match(renderSheet(house, elec, {}).sheetNumber, /^E-/);
});

test('the geometry lands inside the drawing area, not over the title block', () => {
  const out = renderSheet(house, planPage, {});
  const area = drawingArea(out.sheet, 'right', { bottom: 1.05 });
  // Every polygon point in the body must fall inside the drawing area.
  const points = [...out.svg.matchAll(/<polygon points="([^"]+)"/g)].flatMap((m) =>
    m[1].split(' ').map((pair) => pair.split(',').map(Number))
  );
  assert.ok(points.length > 10, 'no geometry was plotted');
  const inside = points.filter(
    ([x, y]) => x >= area.x - 0.01 && x <= area.x + area.w + 0.01 && y >= area.y - 0.01
  );
  // The title block and scale bar are drawn as rects, not polygons, so every
  // polygon here is drawing content and belongs in the drawing area.
  assert.equal(inside.length, points.length);
});

test('a sheet with no entities still plots a title block rather than throwing', () => {
  const empty = buildTemplate('blank-building');
  const out = renderSheet(empty, empty.pages[0], {});
  assert.ok(out.svg.includes('STORYSTICK'));
  assert.ok(!/NaN/.test(out.svg));
});

test('the whole set renders as one printable document sized to the paper', () => {
  const html = renderSet(house, {});
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /@page \{ size: 36in 24in; margin: 0; \}/);
  // One section per sheet.
  assert.equal((html.match(/<section class="sheet">/g) || []).length, house.pages.length);
});

test('a discipline sheet plots the plan it traces underneath its own work', () => {
  const elec = house.pages.find((p) => p.kind === 'electrical');
  assert.ok(elec.basePageId, 'the electrical sheet does not trace anything');
  assert.equal(elec.entities.filter((e) => e.type === 'wall').length, 0);
  const out = renderSheet(house, elec, {});
  // The screened-back background fill only appears when a base page is drawn.
  assert.ok(out.svg.includes('#e6e9ec'), 'no background plan was plotted');
});
