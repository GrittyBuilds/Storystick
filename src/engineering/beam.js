// Simple-span beam mechanics for uniformly loaded residential framing.
//
// This is textbook statics, not code text: a simply supported member carrying a
// uniform load w over span L has M = wL²/8 at midspan, V = wL/2 at the supports
// and Δ = 5wL⁴/(384EI). Everything the analysis module does is built from these
// three relationships plus the allowable stresses from the species data.
//
// Units: pounds and inches throughout. Loads arrive as pounds per square foot
// because that is how the code states them, and are converted once, here.

/**
 * Uniform line load on a member from an area load and a tributary width.
 * @param psf pounds per square foot
 * @param tributaryIn tributary width in inches
 * @returns pounds per inch of span
 */
export function lineLoad(psf, tributaryIn) {
  // psf x (tributary_in / 12) gives lb/ft; divide by 12 again for lb/in.
  return (psf * tributaryIn) / 144;
}

/** Pounds per linear foot, the unit people actually quote. */
export function plf(wPerInch) {
  return wPerInch * 12;
}

export function maxMoment(w, span) {
  return (w * span * span) / 8;
}

export function maxShear(w, span) {
  return (w * span) / 2;
}

export function maxDeflection(w, span, e, momentOfInertia) {
  if (e <= 0 || momentOfInertia <= 0) return Infinity;
  return (5 * w * span ** 4) / (384 * e * momentOfInertia);
}

/** Bending stress in a member of the given section modulus. */
export function bendingStress(moment, sectionModulus) {
  return sectionModulus > 0 ? moment / sectionModulus : Infinity;
}

/** Horizontal shear stress in a rectangular section: fv = 3V / 2A. */
export function shearStress(shear, area) {
  return area > 0 ? (1.5 * shear) / area : Infinity;
}

/** Bearing stress where a member sits on its support. */
export function bearingStress(reaction, width, bearingLength) {
  const contact = width * bearingLength;
  return contact > 0 ? reaction / contact : Infinity;
}

/** Required bearing length to stay within the allowable perpendicular stress. */
export function requiredBearingLength(reaction, width, allowableFcPerp) {
  if (width <= 0 || allowableFcPerp <= 0) return Infinity;
  return reaction / (width * allowableFcPerp);
}

// --- solving for span -----------------------------------------------------
// Each limit state, rearranged to give the longest span that still passes.

export function spanLimitedByBending(w, allowableFb, sectionModulus) {
  if (w <= 0) return Infinity;
  return Math.sqrt((8 * allowableFb * sectionModulus) / w);
}

export function spanLimitedByShear(w, allowableFv, area) {
  if (w <= 0) return Infinity;
  return (4 * allowableFv * area) / (3 * w);
}

/**
 * Deflection limits are stated as a fraction of span (L/360, L/240), so the
 * span cancels down to a cube root.
 */
export function spanLimitedByDeflection(w, e, momentOfInertia, denominator) {
  if (w <= 0 || denominator <= 0) return Infinity;
  return Math.cbrt((384 * e * momentOfInertia) / (5 * w * denominator));
}

/** Deflection limits in common use. Source: IRC Table R301.7. */
export const DEFLECTION_LIMITS = {
  floorLive: { denominator: 360, label: 'L/360', applies: 'live load' },
  roofLive: { denominator: 180, label: 'L/180', applies: 'live load' },
  ceilingPlaster: { denominator: 360, label: 'L/360', applies: 'live load' },
  ceilingDrywall: { denominator: 240, label: 'L/240', applies: 'live load' },
  rafterNoCeiling: { denominator: 180, label: 'L/180', applies: 'live load' },
  totalLoad: { denominator: 240, label: 'L/240', applies: 'total load' },
};

/**
 * Ratio of actual to allowable. Below 1.0 passes; the largest ratio across the
 * limit states is what governs the member.
 */
export function utilisation(actual, allowable) {
  if (!Number.isFinite(allowable) || allowable <= 0) return Infinity;
  return actual / allowable;
}

export function formatSpan(inches) {
  if (!Number.isFinite(inches)) return '—';
  const feet = Math.floor(inches / 12);
  const remainder = Math.round((inches - feet * 12) * 2) / 2;
  return remainder ? `${feet}'-${remainder}"` : `${feet}'-0"`;
}
