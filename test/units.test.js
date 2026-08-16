import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLength,
  formatLength,
  formatArea,
  boardFeet,
  mmToIn,
  inToMm,
} from '../src/core/units.js';

test('parses imperial feet-and-inches notation', () => {
  assert.equal(parseLength('4\'-6 1/2"', 'imperial'), 54.5);
  assert.equal(parseLength("4'6", 'imperial'), 54);
  assert.equal(parseLength("4'", 'imperial'), 48);
  assert.equal(parseLength('12"', 'imperial'), 12);
  assert.equal(parseLength('12', 'imperial'), 12);
  assert.equal(parseLength('6 1/2', 'imperial'), 6.5);
  assert.equal(parseLength('1/2', 'imperial'), 0.5);
  assert.equal(parseLength('12.75', 'imperial'), 12.75);
  assert.equal(parseLength('-6', 'imperial'), -6);
});

test('accepts curly feet and inch marks', () => {
  assert.equal(parseLength('4’-6”', 'imperial'), 54);
  assert.equal(parseLength('3′', 'imperial'), 36);
});

test('rejects text that is not a length', () => {
  assert.equal(parseLength('banana', 'imperial'), null);
  assert.equal(parseLength('', 'imperial'), null);
  assert.equal(parseLength('1/0', 'imperial'), null);
  assert.equal(parseLength(null, 'imperial'), null);
});

test('parses metric input', () => {
  assert.equal(parseLength('1200', 'metric'), mmToIn(1200));
  assert.equal(parseLength('1200mm', 'metric'), mmToIn(1200));
  assert.equal(parseLength('120cm', 'metric'), mmToIn(1200));
  assert.equal(parseLength('1.2m', 'metric'), mmToIn(1200));
  // Imperial notation still works when the user types it in a metric project.
  assert.equal(parseLength("4'", 'metric'), 48);
});

test('metric projects still understand explicit imperial units', () => {
  assert.equal(parseLength('1200mm', 'imperial'), mmToIn(1200));
});

test('formats imperial lengths with feet and fractions', () => {
  assert.equal(formatLength(54.5, 'imperial'), '4\'-6 1/2"');
  assert.equal(formatLength(48, 'imperial'), '4\'-0"');
  assert.equal(formatLength(6.5, 'imperial'), '6 1/2"');
  assert.equal(formatLength(0.5, 'imperial'), '1/2"');
  assert.equal(formatLength(0, 'imperial'), '0"');
  assert.equal(formatLength(-6, 'imperial'), '-6"');
  assert.equal(formatLength(54.5, 'imperial', { forceInches: true }), '54 1/2"');
});

test('rounds to the requested fraction denominator', () => {
  assert.equal(formatLength(6.26, 'imperial', { denominator: 4 }), '6 1/4"');
  assert.equal(formatLength(6.26, 'imperial', { denominator: 2 }), '6 1/2"');
  assert.equal(formatLength(6.03, 'imperial', { denominator: 2 }), '6"');
});

test('round-trips parse and format', () => {
  for (const value of ['4\'-6 1/2"', '2\'-0"', '7 3/8"', '15/16"']) {
    assert.equal(formatLength(parseLength(value, 'imperial'), 'imperial'), value);
  }
});

test('formats metric lengths', () => {
  assert.equal(formatLength(inToMm(1) * 0 + mmToIn(1200), 'metric'), '1200 mm');
  assert.equal(formatLength(mmToIn(1200), 'metric', { metricUnit: 'm' }), '1.200 m');
});

test('formats areas per unit system', () => {
  assert.equal(formatArea(144, 'imperial'), '1.0 sq ft');
  assert.equal(formatArea(mmToIn(1000) * mmToIn(1000), 'metric'), '1.00 m²');
});

test('computes board feet', () => {
  // 1" x 12" x 12" is exactly one board foot.
  assert.equal(boardFeet(1, 12, 12, 1), 1);
  assert.equal(boardFeet(0.75, 6, 96, 2), (0.75 * 6 * 96 * 2) / 144);
});
