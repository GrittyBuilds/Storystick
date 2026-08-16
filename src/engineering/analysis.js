// Member analysis: takes a framing member and its loads, applies the NDS
// adjustment factors, and reports every limit state with its margin.
//
// What this is: the same allowable-stress arithmetic behind a published span
// table, run on your actual geometry so you can see which check governs and by
// how much.
//
// What this is not: engineering. It covers simply supported, uniformly loaded,
// single-span sawn lumber and nothing else. It does not know about point loads,
// cantilevers, continuous spans, notches, holes, uplift, lateral bracing,
// concentrated loads from a beam landing mid-span, or anything to do with the
// load path below the member. Every result carries its source so it can be
// checked against the published table, and anything outside the assumptions
// says so rather than guessing.

import { sectionProperties, sizeFactorBending, repetitiveFactor, loadDurationFactor, JOIST_SIZES } from './sections.js';
import {
  lineLoad,
  plf,
  maxMoment,
  maxShear,
  maxDeflection,
  bendingStress,
  shearStress,
  requiredBearingLength,
  spanLimitedByBending,
  spanLimitedByShear,
  spanLimitedByDeflection,
  utilisation,
  DEFLECTION_LIMITS,
} from './beam.js';

/** Assumptions every result is only valid under. Shown with the output. */
export const ASSUMPTIONS = [
  'Simply supported single span, uniformly loaded.',
  'Sawn lumber, dry service (moisture content 19% or less), normal temperature.',
  'No point loads, cantilevers, notches or holes in the member.',
  'Adequate lateral support of the compression edge (sheathing or blocking).',
  'Bearing at both ends onto adequate support below.',
];

function adjustedValues(species, spec) {
  const duration = loadDurationFactor(spec.duration || 'occupancy');
  const sizeFactor = sizeFactorBending(spec.size, species.usesSizeFactor !== false);
  const repetitive = repetitiveFactor({
    size: spec.size,
    plies: spec.plies || 1,
    spacing: spec.spacing ?? 16,
    count: spec.memberCount ?? (spec.plies > 1 ? 1 : 3),
  });
  // CM: dry service is the residential norm; wet service knocks the values back.
  const wet = spec.wetService ? { fb: 0.85, fv: 0.97, e: 0.9, fcPerp: 0.67 } : { fb: 1, fv: 1, e: 1, fcPerp: 1 };

  return {
    fb: species.fb * duration * sizeFactor * repetitive * wet.fb,
    fv: species.fv * duration * wet.fv,
    fcPerp: species.fcPerp * wet.fcPerp,
    e: species.e * wet.e,
    factors: { duration, sizeFactor, repetitive, wetService: spec.wetService ? wet : null },
  };
}

function check(name, actual, allowable, unit, basis) {
  const ratio = utilisation(actual, allowable);
  return {
    name,
    actual,
    allowable,
    ratio,
    unit,
    basis,
    passes: Number.isFinite(ratio) && ratio <= 1.0000001,
  };
}

/**
 * Analyse one member.
 *
 * @param spec {{ size, plies, spacing, span, deadPsf, livePsf, duration,
 *                deflectionLimit, memberCount, wetService, bearingLength }}
 *   span, spacing and bearingLength are inches; loads are psf.
 * @param species reference design values, from src/engineering/species.js
 */
export function analyseMember(spec, species) {
  const section = sectionProperties(spec.size, spec.plies || 1);
  const adjusted = adjustedValues(species, spec);
  const spacing = spec.spacing ?? 16;
  const span = spec.span;
  const dead = spec.deadPsf ?? 10;
  const live = spec.livePsf ?? 40;

  const wLive = lineLoad(live, spacing);
  const wDead = lineLoad(dead, spacing);
  const wTotal = wLive + wDead;

  const liveLimit = DEFLECTION_LIMITS[spec.deflectionLimit || 'floorLive'] || DEFLECTION_LIMITS.floorLive;
  const totalLimit = DEFLECTION_LIMITS.totalLoad;

  const moment = maxMoment(wTotal, span);
  const shear = maxShear(wTotal, span);
  const deflectionLive = maxDeflection(wLive, span, adjusted.e, section.momentOfInertia);
  const deflectionTotal = maxDeflection(wTotal, span, adjusted.e, section.momentOfInertia);

  const checks = [
    check(
      'Bending',
      bendingStress(moment, section.sectionModulus),
      adjusted.fb,
      'psi',
      "fb = M/S with M = wL²/8; allowable is Fb x CD x CF x Cr"
    ),
    check(
      'Shear',
      shearStress(shear, section.area),
      adjusted.fv,
      'psi',
      'fv = 3V/2A with V = wL/2'
    ),
    check(
      `Live load deflection (${liveLimit.label})`,
      deflectionLive,
      span / liveLimit.denominator,
      'in',
      'Δ = 5wL⁴/384EI under live load only'
    ),
    check(
      `Total load deflection (${totalLimit.label})`,
      deflectionTotal,
      span / totalLimit.denominator,
      'in',
      'Δ = 5wL⁴/384EI under dead plus live load'
    ),
  ];

  if (spec.bearingLength) {
    const reaction = shear;
    checks.push(
      check(
        'Bearing',
        reaction / (section.b * spec.bearingLength),
        adjusted.fcPerp,
        'psi',
        'reaction over the bearing area'
      )
    );
  }

  const maxSpans = {
    bending: spanLimitedByBending(wTotal, adjusted.fb, section.sectionModulus),
    shear: spanLimitedByShear(wTotal, adjusted.fv, section.area),
    liveDeflection: spanLimitedByDeflection(wLive, adjusted.e, section.momentOfInertia, liveLimit.denominator),
    totalDeflection: spanLimitedByDeflection(wTotal, adjusted.e, section.momentOfInertia, totalLimit.denominator),
  };
  const maxSpan = Math.min(...Object.values(maxSpans));
  const governingSpan = Object.entries(maxSpans).sort((a, b) => a[1] - b[1])[0][0];

  const governing = checks.reduce((worst, c) => (c.ratio > worst.ratio ? c : worst), checks[0]);

  return {
    spec: { ...spec, spacing, deadPsf: dead, livePsf: live },
    species: { id: species.id, name: species.name, source: species.source, verified: !!species.verified },
    section,
    adjusted,
    loads: { wLive, wDead, wTotal, plfTotal: plf(wTotal), plfLive: plf(wLive) },
    checks,
    passes: checks.every((c) => c.passes),
    governing,
    maxSpan,
    governingSpan,
    requiredBearing: requiredBearingLength(shear, section.b, adjusted.fcPerp),
    assumptions: ASSUMPTIONS,
  };
}

/**
 * Smallest member from `sizes` that carries the span, or null when none do.
 * Returns the analysis for the chosen size plus every size it rejected.
 */
export function sizeMember(spec, species, sizes = JOIST_SIZES) {
  const tried = [];
  for (const size of sizes) {
    const result = analyseMember({ ...spec, size }, species);
    tried.push({ size, passes: result.passes, ratio: result.governing.ratio, maxSpan: result.maxSpan });
    if (result.passes) return { chosen: size, result, tried };
  }
  return { chosen: null, result: null, tried };
}

/**
 * Longest span each size can carry, for a table the user can read like the
 * published one. Spans are rounded down to the nearest inch — never up.
 */
export function spanTable(spec, species, sizes = JOIST_SIZES, spacings = [12, 16, 19.2, 24]) {
  return sizes.map((size) => ({
    size,
    spans: spacings.map((spacing) => {
      const result = analyseMember({ ...spec, size, spacing, span: 120 }, species);
      return {
        spacing,
        maxSpan: Math.floor(result.maxSpan),
        governing: result.governingSpan,
      };
    }),
  }));
}

/**
 * Tributary width for a member.
 * A joist carries half the bay each side, which for equal spacing is simply the
 * spacing. A beam carries half of each span framing into it.
 */
export function tributaryWidth({ spacingBefore = 0, spacingAfter = 0 } = {}) {
  return spacingBefore / 2 + spacingAfter / 2;
}

export function beamTributaryWidth(spanLeft = 0, spanRight = 0) {
  return spanLeft / 2 + spanRight / 2;
}
