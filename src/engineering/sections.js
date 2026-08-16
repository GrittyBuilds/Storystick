// Section properties for sawn lumber.
//
// Dressed ("S4S") dry sizes come from the American Softwood Lumber Standard
// PS 20 — a nominal 2x8 is actually 1-1/2" x 7-1/4". Everything downstream works
// in these real dimensions, never the nominal ones, because using 8" instead of
// 7.25" overstates a joist's section modulus by about 22%.
//
// Units throughout the engineering modules: inches, pounds, psi.

export const DRESSED = {
  '1x2': [0.75, 1.5],
  '1x3': [0.75, 2.5],
  '1x4': [0.75, 3.5],
  '1x6': [0.75, 5.5],
  '1x8': [0.75, 7.25],
  '1x10': [0.75, 9.25],
  '1x12': [0.75, 11.25],
  '2x2': [1.5, 1.5],
  '2x3': [1.5, 2.5],
  '2x4': [1.5, 3.5],
  '2x6': [1.5, 5.5],
  '2x8': [1.5, 7.25],
  '2x10': [1.5, 9.25],
  '2x12': [1.5, 11.25],
  '4x4': [3.5, 3.5],
  '4x6': [3.5, 5.5],
  '4x8': [3.5, 7.25],
  '4x10': [3.5, 9.25],
  '4x12': [3.5, 11.25],
  '6x6': [5.5, 5.5],
  '6x8': [5.5, 7.5],
  '6x10': [5.5, 9.5],
  '6x12': [5.5, 11.5],
};

/** Sizes that carry bending in residential framing, shallowest first. */
export const JOIST_SIZES = ['2x4', '2x6', '2x8', '2x10', '2x12'];

export const SIZE_LABELS = Object.keys(DRESSED);

export function isKnownSize(size) {
  return Object.prototype.hasOwnProperty.call(DRESSED, size);
}

/**
 * Section properties for a member, optionally built up from several plies
 * nailed or bolted side by side (a "3-ply 2x10" header).
 *
 * @returns {{ b, d, plies, area, sectionModulus, momentOfInertia, nominalDepth }}
 */
export function sectionProperties(size, plies = 1) {
  const dressed = DRESSED[size];
  if (!dressed) throw new Error(`Unknown lumber size: ${size}`);
  const count = Math.max(1, Math.round(plies));
  const b = dressed[0] * count;
  const d = dressed[1];
  return {
    size,
    plies: count,
    b,
    d,
    area: b * d,
    sectionModulus: (b * d * d) / 6,
    momentOfInertia: (b * d * d * d) / 12,
    nominalDepth: Number(size.split('x')[1]),
  };
}

/** Board feet in a length of this member. */
export function boardFeetOf(size, lengthIn, plies = 1) {
  const [b, d] = DRESSED[size];
  return (b * d * lengthIn * Math.max(1, plies)) / 144;
}

/**
 * NDS size factor CF for bending in visually graded dimension lumber
 * (No. 1, No. 2, No. 3 and Stud grades). Southern Pine publishes size-specific
 * design values instead and takes CF = 1.0 — the species record says which.
 *
 * Source: NDS Supplement Table 4A adjustment factors.
 */
export function sizeFactorBending(size, appliesCF = true) {
  if (!appliesCF) return 1;
  const depth = Number(size.split('x')[1]);
  if (!Number.isFinite(depth)) return 1;
  if (depth <= 4) return 1.5;
  if (depth <= 5) return 1.4;
  if (depth <= 6) return 1.3;
  if (depth <= 8) return 1.2;
  if (depth <= 10) return 1.1;
  if (depth <= 12) return 1.0;
  return 0.9;
}

/**
 * Repetitive member factor Cr: 1.15 for bending members no wider than 4",
 * spaced 24" on centre or less, at least three in a row, joined by a
 * load-distributing element such as sheathing. Source: NDS 4.3.9.
 */
export function repetitiveFactor({ plies = 1, spacing = 16, count = 3, size = '2x8' } = {}) {
  const [b] = DRESSED[size] || [1.5];
  const width = b * Math.max(1, plies);
  const qualifies = width <= 4 && spacing <= 24 && count >= 3;
  return qualifies ? 1.15 : 1;
}

/**
 * Load duration factor CD. Source: NDS Table 2.3.2.
 * Wood carries more load for a shorter time; the governing case for a floor is
 * the ten-year "occupancy" duration at 1.0.
 */
export const LOAD_DURATION = {
  permanent: 0.9,
  occupancy: 1.0,
  snow: 1.15,
  construction: 1.25,
  wind: 1.6,
  impact: 2.0,
};

export function loadDurationFactor(kind = 'occupancy') {
  return LOAD_DURATION[kind] ?? 1.0;
}
