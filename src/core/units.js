// Unit handling. The internal model unit is the INCH (float) everywhere.
// Display and input conversion for imperial (feet/inches with fractions) and
// metric (millimetres / centimetres / metres) live here.

export const MM_PER_IN = 25.4;
export const IN_PER_FT = 12;

export const DENOMINATORS = [2, 4, 8, 16, 32, 64];

const FEET_MARKS = /[’′']/g;
const INCH_MARKS = /[”″"]/g;

export function mmToIn(mm) {
  return mm / MM_PER_IN;
}

export function inToMm(inches) {
  return inches * MM_PER_IN;
}

function parseImperial(raw) {
  let s = raw.replace(FEET_MARKS, "'").replace(INCH_MARKS, '"').trim();
  let sign = 1;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1).trim();
  }
  // "4'-6" and "4'6" both mean four feet six inches.
  s = s.replace(/'\s*-\s*/, "' ");
  // The whole-inches group must be followed by whitespace, an inch mark or the
  // end of the string, otherwise `15/16"` would read as `1` plus `5/16`.
  const m = s.match(
    /^(?:(\d+(?:\.\d+)?)\s*')?\s*(?:(\d+(?:\.\d+)?)(?=\s|"|$))?\s*(?:(\d+)\s*\/\s*(\d+))?\s*"?$/
  );
  if (!m) return null;
  const [, ft, whole, num, den] = m;
  if (ft === undefined && whole === undefined && num === undefined) return null;
  if (den !== undefined && Number(den) === 0) return null;
  let total = 0;
  if (ft !== undefined) total += Number(ft) * IN_PER_FT;
  if (whole !== undefined) total += Number(whole);
  if (num !== undefined) total += Number(num) / Number(den);
  return sign * total;
}

function parseMetric(raw) {
  const s = raw.trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m|in|ft)?$/);
  if (!m) return null;
  const value = Number(m[1]);
  switch (m[2]) {
    case 'm':
      return mmToIn(value * 1000);
    case 'cm':
      return mmToIn(value * 10);
    case 'in':
      return value;
    case 'ft':
      return value * IN_PER_FT;
    default:
      return mmToIn(value);
  }
}

/**
 * Parse a user-entered length into inches.
 * Imperial accepts: 12, 12", 4', 4'6", 4'-6 1/2", 6 1/2, 1/2
 * Metric accepts: 1200, 1200mm, 120cm, 1.2m (and explicit in/ft)
 * Returns null when the text cannot be understood.
 */
export function parseLength(input, system = 'imperial') {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (system === 'metric' && !/['"’″′”]/.test(s)) return parseMetric(s);
  const imperial = parseImperial(s);
  if (imperial !== null) return imperial;
  return system === 'metric' ? null : parseMetric(s);
}

function reduceFraction(num, den) {
  let a = num;
  let b = den;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  const g = a || 1;
  return [num / g, den / g];
}

/**
 * Format inches for display.
 * opts: { denominator, decimals, forceInches, metricUnit }
 */
export function formatLength(inches, system = 'imperial', opts = {}) {
  if (!Number.isFinite(inches)) return '—';
  if (system === 'metric') {
    const unit = opts.metricUnit || 'mm';
    const decimals = opts.decimals ?? (unit === 'mm' ? 0 : unit === 'cm' ? 1 : 3);
    const mm = inToMm(inches);
    const value = unit === 'm' ? mm / 1000 : unit === 'cm' ? mm / 10 : mm;
    return `${value.toFixed(decimals)} ${unit}`;
  }

  const denominator = opts.denominator || 16;
  const negative = inches < 0;
  const totalTicks = Math.round(Math.abs(inches) * denominator);
  let wholeInches = Math.floor(totalTicks / denominator);
  const remainder = totalTicks - wholeInches * denominator;

  const feet = opts.forceInches ? 0 : Math.floor(wholeInches / IN_PER_FT);
  if (!opts.forceInches) wholeInches -= feet * IN_PER_FT;

  let fraction = '';
  if (remainder > 0) {
    const [n, d] = reduceFraction(remainder, denominator);
    fraction = `${n}/${d}`;
  }

  let inchPart;
  if (wholeInches === 0 && fraction) inchPart = `${fraction}"`;
  else if (fraction) inchPart = `${wholeInches} ${fraction}"`;
  else inchPart = `${wholeInches}"`;

  const text = feet > 0 ? `${feet}'-${inchPart}` : inchPart;
  return negative ? `-${text}` : text;
}

/** Compact form used for on-canvas dimension text. */
export function formatDimension(inches, system, opts = {}) {
  return formatLength(inches, system, opts);
}

export function formatArea(squareInches, system = 'imperial') {
  if (!Number.isFinite(squareInches)) return '—';
  if (system === 'metric') {
    const m2 = (squareInches * MM_PER_IN * MM_PER_IN) / 1e6;
    return `${m2.toFixed(2)} m²`;
  }
  return `${(squareInches / 144).toFixed(1)} sq ft`;
}

export function formatVolumeBoardFeet(boardFeet) {
  return `${boardFeet.toFixed(2)} bd ft`;
}

/** Board feet for a part measured in inches. */
export function boardFeet(thicknessIn, widthIn, lengthIn, qty = 1) {
  return (thicknessIn * widthIn * lengthIn * qty) / 144;
}

export function formatAngle(radians) {
  let deg = (radians * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return `${deg.toFixed(1)}°`;
}

/** Sensible default grid spacing in inches for a unit system. */
export function defaultGrid(system) {
  return system === 'metric' ? mmToIn(100) : 6;
}

export function unitSuffix(system) {
  return system === 'metric' ? 'mm' : 'in';
}
