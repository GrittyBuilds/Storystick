// Sheet layout: putting a drawing on paper the way a drawing set does.
//
// The difference between a picture of a floor plan and a blueprint is almost
// entirely this module. A blueprint is a fixed sheet size, with a border, a
// title block, a sheet number, and — the part that actually matters — a drawing
// placed at a TRUE architectural scale, so a scale rule laid on the print gives
// real dimensions. A drawing scaled to "whatever fits" is not a construction
// document, however tidy it looks.
//
// Everything here works in paper inches. The model is in model inches, and the
// scale factor between them is the drawing scale.

export const SHEET_SIZES = {
  'ARCH-A': { label: 'ARCH A — 9 × 12', w: 12, h: 9 },
  'ARCH-B': { label: 'ARCH B — 12 × 18', w: 18, h: 12 },
  'ARCH-C': { label: 'ARCH C — 18 × 24', w: 24, h: 18 },
  'ARCH-D': { label: 'ARCH D — 24 × 36', w: 36, h: 24 },
  'ARCH-E1': { label: 'ARCH E1 — 30 × 42', w: 42, h: 30 },
  'ANSI-A': { label: 'Letter — 8.5 × 11', w: 11, h: 8.5 },
  'ANSI-B': { label: 'Tabloid — 11 × 17', w: 17, h: 11 },
  TABLOID: { label: 'Tabloid — 11 × 17', w: 17, h: 11 },
};

/**
 * Architectural scales, as the number of model inches per paper inch.
 * A 1/4" = 1'-0" drawing puts 48 model inches on every paper inch.
 */
export const SCALES = [
  { label: '3" = 1\'-0"', ratio: 4, denom: 4 },
  { label: '1 1/2" = 1\'-0"', ratio: 8, denom: 8 },
  { label: '1" = 1\'-0"', ratio: 12, denom: 12 },
  { label: '3/4" = 1\'-0"', ratio: 16, denom: 16 },
  { label: '1/2" = 1\'-0"', ratio: 24, denom: 24 },
  { label: '3/8" = 1\'-0"', ratio: 32, denom: 32 },
  { label: '1/4" = 1\'-0"', ratio: 48, denom: 48 },
  { label: '3/16" = 1\'-0"', ratio: 64, denom: 64 },
  { label: '1/8" = 1\'-0"', ratio: 96, denom: 96 },
  { label: '3/32" = 1\'-0"', ratio: 128, denom: 128 },
  { label: '1/16" = 1\'-0"', ratio: 192, denom: 192 },
  { label: '1" = 10\'', ratio: 120, denom: 120 },
  { label: '1" = 20\'', ratio: 240, denom: 240 },
  { label: '1" = 30\'', ratio: 360, denom: 360 },
  { label: '1" = 40\'', ratio: 480, denom: 480 },
];

/** Scales a given kind of drawing is normally produced at, best first. */
export const PREFERRED_SCALES = {
  plan: ['1/4" = 1\'-0"', '3/16" = 1\'-0"', '1/8" = 1\'-0"'],
  foundation: ['1/4" = 1\'-0"', '3/16" = 1\'-0"', '1/8" = 1\'-0"'],
  framing: ['1/4" = 1\'-0"', '3/16" = 1\'-0"', '1/8" = 1\'-0"'],
  electrical: ['1/4" = 1\'-0"', '3/16" = 1\'-0"', '1/8" = 1\'-0"'],
  plumbing: ['1/4" = 1\'-0"', '3/16" = 1\'-0"', '1/8" = 1\'-0"'],
  mechanical: ['1/4" = 1\'-0"', '3/16" = 1\'-0"', '1/8" = 1\'-0"'],
  roof: ['1/4" = 1\'-0"', '1/8" = 1\'-0"'],
  elevation: ['1/4" = 1\'-0"', '3/16" = 1\'-0"', '1/8" = 1\'-0"'],
  section: ['1/2" = 1\'-0"', '1/4" = 1\'-0"'],
  detail: ['1 1/2" = 1\'-0"', '1" = 1\'-0"', '3/4" = 1\'-0"'],
  site: ['1" = 20\'', '1" = 30\'', '1" = 40\''],
  layout: ['1/2" = 1\'-0"', '1/4" = 1\'-0"', '1" = 1\'-0"'],
};

/**
 * Larger scales a drawing may step up to when the conventional scale would
 * leave it swimming on the sheet. A 12x16 shed at 1/4" = 1'-0" is a postage
 * stamp in the middle of an ARCH-D sheet; a drafter would have drawn it at
 * 1/2". These are the steps up that stay conventional for each kind — the list
 * is a ceiling, so a house never ends up at 1 1/2".
 */
export const UPGRADE_SCALES = {
  plan: ['3/8" = 1\'-0"', '1/2" = 1\'-0"'],
  foundation: ['3/8" = 1\'-0"', '1/2" = 1\'-0"'],
  framing: ['3/8" = 1\'-0"', '1/2" = 1\'-0"'],
  electrical: ['3/8" = 1\'-0"', '1/2" = 1\'-0"'],
  plumbing: ['3/8" = 1\'-0"', '1/2" = 1\'-0"'],
  mechanical: ['3/8" = 1\'-0"', '1/2" = 1\'-0"'],
  roof: ['3/8" = 1\'-0"'],
  elevation: ['3/8" = 1\'-0"', '1/2" = 1\'-0"'],
  section: ['3/4" = 1\'-0"', '1" = 1\'-0"'],
  detail: ['3" = 1\'-0"'],
  site: ['1" = 10\''],
  layout: ['1" = 1\'-0"', '1 1/2" = 1\'-0"'],
};

/** Below this share of the drawing area, step up to a larger scale. */
export const MIN_FILL = 0.33;

export const MARGIN = 0.5;
export const BINDING_MARGIN = 1.0;
export const TITLE_BLOCK_WIDTH = 5.0;
export const TITLE_BLOCK_HEIGHT = 2.6;

export function sheetSize(id, orientation = 'landscape') {
  const base = SHEET_SIZES[id] || SHEET_SIZES['ARCH-D'];
  return orientation === 'portrait'
    ? { ...base, w: Math.min(base.w, base.h), h: Math.max(base.w, base.h) }
    : { ...base, w: Math.max(base.w, base.h), h: Math.min(base.w, base.h) };
}

export function findScale(label) {
  return SCALES.find((s) => s.label === label) || null;
}

/**
 * The area of the sheet the drawing itself may occupy, after the border, the
 * binding edge and the title block.
 */
export function drawingArea(sheet, titleBlock = 'right', reserve = {}) {
  const left = BINDING_MARGIN;
  const right = sheet.w - MARGIN - (titleBlock === 'right' ? TITLE_BLOCK_WIDTH : 0);
  const top = MARGIN;
  const bottom =
    sheet.h - MARGIN - (titleBlock === 'bottom' ? TITLE_BLOCK_HEIGHT : 0) - (reserve.bottom || 0);
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
}

/**
 * Pick the largest standard scale at which the model fits the drawing area.
 * Never invents a scale: if nothing standard fits, it says so and the caller
 * decides — a drawing at "1:37" is not a drawing anyone can measure.
 */
export function chooseScale(modelBox, area, kind = 'plan', padding = 0.75) {
  const modelW = Math.max(modelBox.maxX - modelBox.minX, 1);
  const modelH = Math.max(modelBox.maxY - modelBox.minY, 1);
  const availW = Math.max(0.1, area.w - padding * 2);
  const availH = Math.max(0.1, area.h - padding * 2);

  const fill = (scale) => Math.max(modelW / scale.ratio / availW, modelH / scale.ratio / availH);
  const fits = (scale) => fill(scale) <= 1;
  const preferred = (PREFERRED_SCALES[kind] || PREFERRED_SCALES.plan)
    .map(findScale)
    .filter(Boolean);

  for (const scale of preferred) {
    if (!fits(scale)) continue;
    if (fill(scale) >= MIN_FILL) return { scale, standard: true, preferred: true };
    // The conventional scale fits but leaves the drawing lost on the sheet, so
    // step up as far as the kind allows.
    const bigger = (UPGRADE_SCALES[kind] || [])
      .map(findScale)
      .filter((s) => s && fits(s))
      .sort((a, b) => a.ratio - b.ratio);
    return { scale: bigger[0] || scale, standard: true, preferred: !bigger.length };
  }
  // Ordered coarse-to-fine so the first standard scale that fits is the largest.
  for (const scale of [...SCALES].sort((a, b) => a.ratio - b.ratio)) {
    if (fits(scale)) return { scale, standard: true, preferred: false };
  }
  const needed = Math.max(modelW / availW, modelH / availH);
  return {
    scale: { label: `1" = ${(needed / 12).toFixed(1)}'`, ratio: needed, denom: needed },
    standard: false,
    preferred: false,
  };
}

/**
 * Where the drawing sits on the sheet, and how to get from model to paper.
 * Model point -> paper: (model - origin) / ratio + offset
 */
export function layout({
  modelBox,
  sheet,
  titleBlock = 'right',
  kind = 'plan',
  scaleLabel = null,
  reserve = {},
}) {
  const area = drawingArea(sheet, titleBlock, reserve);
  const chosen = scaleLabel ? { scale: findScale(scaleLabel), standard: true, preferred: true } : null;
  const picked = chosen && chosen.scale ? chosen : chooseScale(modelBox, area, kind);
  const ratio = picked.scale.ratio;

  const paperW = (modelBox.maxX - modelBox.minX) / ratio;
  const paperH = (modelBox.maxY - modelBox.minY) / ratio;

  return {
    area,
    scale: picked.scale,
    standardScale: picked.standard,
    ratio,
    paperW,
    paperH,
    // Centre the drawing in its area; a drawing jammed into a corner reads as
    // an accident rather than a decision.
    offsetX: area.x + (area.w - paperW) / 2,
    offsetY: area.y + (area.h - paperH) / 2,
    modelOrigin: { x: modelBox.minX, y: modelBox.minY },
    toPaper(point) {
      return {
        x: this.offsetX + (point.x - this.modelOrigin.x) / this.ratio,
        y: this.offsetY + (point.y - this.modelOrigin.y) / this.ratio,
      };
    },
  };
}

/** Sheet number from a discipline prefix and an index, e.g. A-101. */
export function sheetNumber(prefix, index) {
  return `${prefix}-${100 + index}`;
}

/**
 * Number every sheet in a set the way a permit set is numbered: grouped by
 * discipline, in the order the disciplines appear in a set.
 */
export const DISCIPLINE_ORDER = ['G', 'C', 'A', 'S', 'M', 'E', 'P'];

export function numberSheets(pages, prefixFor) {
  const counters = new Map();
  const ordered = [...pages].sort((a, b) => {
    const pa = DISCIPLINE_ORDER.indexOf(prefixFor(a));
    const pb = DISCIPLINE_ORDER.indexOf(prefixFor(b));
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
  const numbers = new Map();
  for (const page of ordered) {
    const prefix = prefixFor(page) || 'A';
    const index = counters.get(prefix) || 0;
    counters.set(prefix, index + 1);
    numbers.set(page.id, sheetNumber(prefix, index + 1));
  }
  return numbers;
}

/**
 * Ticks for a graphic scale bar: a bar the reader can measure against, which is
 * the only thing that still works after a print is photocopied or resized.
 */
export function scaleBar(ratio, maxPaperWidth = 3) {
  // Pick a round number of feet that fits the available width.
  const candidates = [1, 2, 4, 5, 8, 10, 16, 20, 30, 40, 50, 100];
  let feet = 1;
  for (const c of candidates) {
    if ((c * 12) / ratio <= maxPaperWidth) feet = c;
  }
  const divisions = feet >= 8 ? 4 : 2;
  return {
    totalFeet: feet,
    divisions,
    paperWidth: (feet * 12) / ratio,
    ticks: Array.from({ length: divisions + 1 }, (_, i) => ({
      at: ((feet * 12) / ratio) * (i / divisions),
      label: String(Math.round((feet * i) / divisions)),
    })),
  };
}

/** Sheet furniture proportions, in paper inches. */
export const FURNITURE = {
  // Band under the drawing that holds the view title, scale and scale bar.
  bottomBand: 1.05,
  borderWeight: 0.02,
  innerBorderInset: 0.06,
  titleRuleWeight: 0.014,
  viewTitleHeight: 0.16,
  viewSubtitleHeight: 0.1,
  northArrowSize: 0.62,
  scaleBarHeight: 0.09,
  labelHeight: 0.075,
  fieldHeight: 0.11,
  projectTitleHeight: 0.2,
  sheetNumberHeight: 0.34,
};
