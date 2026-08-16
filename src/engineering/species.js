// Reference design values for sawn lumber.
//
// These are NDS Supplement values (Table 4A and friends) and they are specific
// to species, grade, size class and edition. They could not be confirmed from a
// primary source here, so nothing ships with a value: `fb`, `fv`, `fcPerp` and
// `e` are null until someone enters them from the NDS Supplement, a span table
// published by a lumber association, or the grade stamp on the actual material.
//
// Storystick's structural output is therefore explicitly "the arithmetic on the
// values you gave me", not "the answer". That is the only honest framing for a
// calculation whose inputs the tool cannot verify — and it is also the more
// useful one, because a designer who has the real Fb for the lumber in the yard
// gets a better answer than any built-in table would give them.

export const GRADES = ['Select Structural', 'No. 1', 'No. 2', 'No. 3', 'Stud'];

function species({ id, name, grade, usesSizeFactor = true, note = '' }) {
  return {
    id,
    name,
    grade,
    // Reference design values, psi. Null until confirmed.
    fb: null, // bending
    fv: null, // horizontal shear
    fcPerp: null, // compression perpendicular to grain
    e: null, // modulus of elasticity
    // Southern Pine publishes size-specific values and takes CF = 1.
    usesSizeFactor,
    source: null,
    confirmedOn: null,
    verified: false,
    note,
  };
}

export const SPECIES = {
  'spf-2': species({ id: 'spf-2', name: 'Spruce-Pine-Fir', grade: 'No. 2' }),
  'spf-1': species({ id: 'spf-1', name: 'Spruce-Pine-Fir', grade: 'No. 1' }),
  'hf-2': species({ id: 'hf-2', name: 'Hem-Fir', grade: 'No. 2' }),
  'dfl-2': species({ id: 'dfl-2', name: 'Douglas Fir-Larch', grade: 'No. 2' }),
  'dfl-1': species({ id: 'dfl-1', name: 'Douglas Fir-Larch', grade: 'No. 1' }),
  'syp-2': species({
    id: 'syp-2',
    name: 'Southern Pine',
    grade: 'No. 2',
    usesSizeFactor: false,
    note: 'Southern Pine publishes size-specific design values, so the size factor CF does not apply.',
  }),
};

export const SPECIES_LIST = Object.values(SPECIES);

export function isConfirmed(record) {
  return (
    !!record &&
    ['fb', 'fv', 'fcPerp', 'e'].every((k) => Number.isFinite(record[k]) && record[k] > 0) &&
    !!record.confirmedOn
  );
}

/** Which values are still missing, for the "what do I need" prompt. */
export function missingValues(record) {
  const labels = { fb: 'Fb (bending)', fv: 'Fv (shear)', fcPerp: 'Fc⊥ (bearing)', e: 'E (stiffness)' };
  return Object.keys(labels).filter((k) => !Number.isFinite(record && record[k]) || record[k] <= 0)
    .map((k) => labels[k]);
}

export function confirmSpecies(record, values, { source, on } = {}) {
  return {
    ...record,
    ...values,
    source: source || record.source,
    confirmedOn: on || new Date().toISOString().slice(0, 10),
    verified: true,
  };
}

export function createSpeciesTable() {
  return JSON.parse(JSON.stringify(SPECIES));
}

/**
 * Where to get the numbers. Shown next to the empty fields rather than buried
 * in documentation, because the whole feature depends on the user filling them.
 */
export const VALUE_SOURCES = [
  'NDS Supplement, Table 4A — visually graded dimension lumber (2 in to 4 in thick).',
  'The grading agency published for your lumber: WWPA, SPIB, NELMA, WCLIB.',
  'The grade stamp on the material itself gives species and grade; the values follow from those.',
  'A span table from the lumber association covering your species, grade and load case.',
];
