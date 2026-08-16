import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sectionProperties,
  DRESSED,
  sizeFactorBending,
  repetitiveFactor,
  loadDurationFactor,
  boardFeetOf,
  isKnownSize,
} from '../src/engineering/sections.js';
import {
  lineLoad,
  plf,
  maxMoment,
  maxShear,
  maxDeflection,
  bendingStress,
  shearStress,
  bearingStress,
  requiredBearingLength,
  spanLimitedByBending,
  spanLimitedByShear,
  spanLimitedByDeflection,
  utilisation,
  formatSpan,
  DEFLECTION_LIMITS,
} from '../src/engineering/beam.js';

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// --- sections -------------------------------------------------------------

test('lumber uses dressed sizes, not nominal ones', () => {
  assert.deepEqual(DRESSED['2x8'], [1.5, 7.25]);
  assert.deepEqual(DRESSED['2x4'], [1.5, 3.5]);
  assert.deepEqual(DRESSED['2x12'], [1.5, 11.25]);
  assert.equal(isKnownSize('2x8'), true);
  assert.equal(isKnownSize('2x13'), false);
});

test('section properties follow the rectangle formulas', () => {
  const s = sectionProperties('2x10');
  assert.equal(s.b, 1.5);
  assert.equal(s.d, 9.25);
  assert.ok(near(s.area, 1.5 * 9.25));
  assert.ok(near(s.sectionModulus, (1.5 * 9.25 ** 2) / 6));
  assert.ok(near(s.momentOfInertia, (1.5 * 9.25 ** 3) / 12));
});

test('a published section modulus is reproduced', () => {
  // A 2x10 has S = 21.39 in^3 and I = 98.93 in^4 in the NDS section property
  // tables; the formulas must land on those numbers.
  const s = sectionProperties('2x10');
  assert.ok(Math.abs(s.sectionModulus - 21.39) < 0.01, `S was ${s.sectionModulus}`);
  assert.ok(Math.abs(s.momentOfInertia - 98.93) < 0.01, `I was ${s.momentOfInertia}`);
});

test('plies multiply width, so stiffness scales linearly', () => {
  const one = sectionProperties('2x10', 1);
  const three = sectionProperties('2x10', 3);
  assert.equal(three.b, 4.5);
  assert.equal(three.d, one.d);
  assert.ok(near(three.momentOfInertia, one.momentOfInertia * 3));
  assert.ok(near(three.sectionModulus, one.sectionModulus * 3));
});

test('depth is far more valuable than width', () => {
  // Doubling the depth gives four times the section modulus; doubling the width
  // only doubles it. This is why joists are set on edge.
  const deep = sectionProperties('2x12');
  const wide = sectionProperties('4x6');
  assert.ok(deep.sectionModulus > wide.sectionModulus);
});

test('unknown sizes fail loudly rather than silently', () => {
  assert.throws(() => sectionProperties('2x13'), /Unknown lumber size/);
});

test('size factor decreases with depth and switches off for Southern Pine', () => {
  assert.equal(sizeFactorBending('2x4'), 1.5);
  assert.equal(sizeFactorBending('2x6'), 1.3);
  assert.equal(sizeFactorBending('2x8'), 1.2);
  assert.equal(sizeFactorBending('2x10'), 1.1);
  assert.equal(sizeFactorBending('2x12'), 1.0);
  assert.equal(sizeFactorBending('2x8', false), 1, 'species with size-specific values take CF = 1');
});

test('the repetitive member factor needs all three conditions', () => {
  assert.equal(repetitiveFactor({ size: '2x10', spacing: 16, count: 8 }), 1.15);
  assert.equal(repetitiveFactor({ size: '2x10', spacing: 32, count: 8 }), 1, 'too far apart');
  assert.equal(repetitiveFactor({ size: '2x10', spacing: 16, count: 2 }), 1, 'not enough members');
  assert.equal(
    repetitiveFactor({ size: '2x10', plies: 3, spacing: 16, count: 8 }),
    1,
    'a built-up beam is not a repetitive member'
  );
});

test('load duration factors match the NDS table', () => {
  assert.equal(loadDurationFactor('permanent'), 0.9);
  assert.equal(loadDurationFactor('occupancy'), 1.0);
  assert.equal(loadDurationFactor('snow'), 1.15);
  assert.equal(loadDurationFactor('wind'), 1.6);
  assert.equal(loadDurationFactor('nonsense'), 1.0);
});

test('board feet of a framing member', () => {
  assert.ok(near(boardFeetOf('2x10', 96), (1.5 * 9.25 * 96) / 144));
});

// --- loads and mechanics --------------------------------------------------

test('area load converts to a line load through tributary width', () => {
  // 40 psf on joists at 16" o.c. is 53.3 lb per foot of joist.
  const w = lineLoad(40, 16);
  assert.ok(near(plf(w), (40 * 16) / 12, 1e-9));
  assert.ok(Math.abs(plf(w) - 53.333) < 0.01);
});

test('doubling the spacing doubles the load a joist carries', () => {
  assert.ok(near(lineLoad(40, 24), lineLoad(40, 12) * 2));
});

test('simple span moment, shear and deflection', () => {
  const w = 100 / 12; // 100 plf expressed per inch
  const span = 120;
  assert.ok(near(maxMoment(w, span), (w * span * span) / 8));
  assert.ok(near(maxShear(w, span), (w * span) / 2));
  assert.ok(near(maxDeflection(w, span, 1.4e6, 98.93), (5 * w * span ** 4) / (384 * 1.4e6 * 98.93)));
});

test('moment grows with the square of span and deflection with the fourth power', () => {
  const w = 5;
  assert.ok(near(maxMoment(w, 200) / maxMoment(w, 100), 4));
  const short = maxDeflection(w, 100, 1.4e6, 100);
  const long = maxDeflection(w, 200, 1.4e6, 100);
  assert.ok(near(long / short, 16, 1e-6));
});

test('deflection is zero-safe for a nonsense section', () => {
  assert.equal(maxDeflection(5, 100, 0, 100), Infinity);
  assert.equal(maxDeflection(5, 100, 1.4e6, 0), Infinity);
});

test('stresses follow from the section', () => {
  const s = sectionProperties('2x10');
  assert.ok(near(bendingStress(21390, s.sectionModulus), 21390 / s.sectionModulus));
  assert.ok(near(shearStress(500, s.area), (1.5 * 500) / s.area));
  assert.ok(near(bearingStress(900, 1.5, 3), 900 / 4.5));
});

test('required bearing length rises with reaction', () => {
  const short = requiredBearingLength(600, 1.5, 425);
  const long = requiredBearingLength(1200, 1.5, 425);
  assert.ok(near(long, short * 2));
  assert.ok(near(short, 600 / (1.5 * 425)));
});

// --- solving for span -----------------------------------------------------

test('span solvers invert the stress checks exactly', () => {
  const s = sectionProperties('2x10');
  const w = lineLoad(50, 16);
  const fb = 1200;
  const fv = 135;

  const bendingSpan = spanLimitedByBending(w, fb, s.sectionModulus);
  assert.ok(near(bendingStress(maxMoment(w, bendingSpan), s.sectionModulus), fb, 1e-6));

  const shearSpan = spanLimitedByShear(w, fv, s.area);
  assert.ok(near(shearStress(maxShear(w, shearSpan), s.area), fv, 1e-6));

  const deflectionSpan = spanLimitedByDeflection(w, 1.4e6, s.momentOfInertia, 360);
  assert.ok(
    near(maxDeflection(w, deflectionSpan, 1.4e6, s.momentOfInertia), deflectionSpan / 360, 1e-6)
  );
});

test('a heavier load shortens every allowable span', () => {
  const s = sectionProperties('2x8');
  const light = lineLoad(30, 16);
  const heavy = lineLoad(60, 16);
  assert.ok(spanLimitedByBending(heavy, 1200, s.sectionModulus) < spanLimitedByBending(light, 1200, s.sectionModulus));
  assert.ok(spanLimitedByShear(heavy, 135, s.area) < spanLimitedByShear(light, 135, s.area));
  assert.ok(
    spanLimitedByDeflection(heavy, 1.4e6, s.momentOfInertia, 360) <
      spanLimitedByDeflection(light, 1.4e6, s.momentOfInertia, 360)
  );
});

test('a deeper joist spans further', () => {
  const w = lineLoad(50, 16);
  const spans = ['2x6', '2x8', '2x10', '2x12'].map((size) =>
    spanLimitedByDeflection(w, 1.4e6, sectionProperties(size).momentOfInertia, 360)
  );
  for (let i = 1; i < spans.length; i += 1) assert.ok(spans[i] > spans[i - 1]);
});

test('deflection governs a typical residential floor joist, not bending', () => {
  // The reason floors feel bouncy long before they are close to breaking.
  const s = sectionProperties('2x10');
  const w = lineLoad(50, 16);
  const bending = spanLimitedByBending(w, 1200 * 1.1 * 1.15, s.sectionModulus);
  const deflection = spanLimitedByDeflection(lineLoad(40, 16), 1.4e6, s.momentOfInertia, 360);
  assert.ok(deflection < bending, 'the L/360 live-load limit runs out first');
});

test('zero load leaves the span unbounded rather than dividing by zero', () => {
  assert.equal(spanLimitedByBending(0, 1200, 21), Infinity);
  assert.equal(spanLimitedByShear(0, 135, 13), Infinity);
  assert.equal(spanLimitedByDeflection(0, 1.4e6, 98, 360), Infinity);
});

test('utilisation reports the margin and flags the impossible', () => {
  assert.ok(near(utilisation(600, 1200), 0.5));
  assert.equal(utilisation(600, 0), Infinity);
});

test('deflection limits carry their label and denominator', () => {
  assert.equal(DEFLECTION_LIMITS.floorLive.denominator, 360);
  assert.equal(DEFLECTION_LIMITS.floorLive.label, 'L/360');
  assert.equal(DEFLECTION_LIMITS.totalLoad.denominator, 240);
});

test('spans format as feet and inches', () => {
  assert.equal(formatSpan(144), "12'-0\"");
  assert.equal(formatSpan(150), "12'-6\"");
  assert.equal(formatSpan(Infinity), '—');
});
