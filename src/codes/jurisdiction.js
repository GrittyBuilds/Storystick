// Code requirements as data, with provenance attached to every single number.
//
// WHY THIS SHAPE
//
// Building-code values are safety-relevant and they move: editions change,
// states amend the model code, and Michigan's residential edition is, at the
// time of writing, the subject of active litigation. A value with no source and
// no date is worse than no value at all, because it looks like an answer.
//
// So a threshold here is never a bare number. It is a record that carries where
// it came from, who confirmed it and when. Until someone confirms it against
// the published code, `value` is null and every rule that needs it returns
// "review" — the drawing gets measured, the requirement gets named, and the
// user is told exactly which section to look up. The product never guesses.
//
// This is deliberately more work than hardcoding a table. It is the difference
// between a tool that helps someone check their plan and a tool that tells them
// their basement bedroom is fine when nobody has read the code.

/** A single code requirement whose value must be confirmed before use. */
export function threshold({ id, label, unit, citation, note = '', value = null }) {
  return {
    id,
    label,
    unit,
    citation,
    note,
    value,
    source: null,
    confirmedBy: null,
    confirmedOn: null,
  };
}

export function isConfirmed(record) {
  return !!record && record.value !== null && record.value !== undefined && !!record.confirmedOn;
}

/** Record a confirmed value against its source. */
export function confirm(record, value, { source, by, on }) {
  return {
    ...record,
    value,
    source: source || null,
    confirmedBy: by || null,
    confirmedOn: on || new Date().toISOString().slice(0, 10),
  };
}

/**
 * Michigan.
 *
 * What is stated here is structural, not numeric: how Michigan administers its
 * code, and which sections to look in. Every threshold value is null because
 * none could be confirmed against a primary source — see the note below.
 */
export const MICHIGAN = {
  id: 'mi',
  name: 'Michigan',
  administrator: 'Bureau of Construction Codes, Michigan Department of Licensing and Regulatory Affairs',
  statute: 'Stille-DeRossett-Hale Single State Construction Code Act (1972 PA 230)',
  where: 'https://www.michigan.gov/lara/bureau-list/bcc',

  // Michigan is a single-state-code state: local units elect enforcement, not
  // content. That does NOT mean nothing local applies — zoning, floodplain,
  // historic districts, soil erosion and local fire ordinances are separate and
  // are not checked here.
  singleStateCode: true,
  localScopeWarning:
    'Storystick checks construction-code items only. Zoning setbacks, floodplain, historic district, ' +
    'soil erosion and local fire requirements are administered separately and are not checked.',

  // Enforcement is assigned per discipline and can differ; four independent
  // slots is the conservative shape.
  authorities: { building: null, electrical: null, mechanical: null, plumbing: null },

  edition: {
    residential: null,
    energy: null,
    confirmedOn: null,
    note:
      'Which edition of the Michigan Residential Code is in force could not be confirmed. ' +
      'Sources disagree between a 2015 IRC basis and a 2021 IRC basis, and the question has been ' +
      'the subject of litigation. Confirm with the Bureau of Construction Codes or your building ' +
      'official before relying on any section number or table.',
  },

  // Snow load in Michigan is assigned per local jurisdiction, not per county,
  // and varies sharply with lake effect. A regional "typical" is not safe: a
  // 50 psf default in a 70 psf township under-designs a roof by 40 per cent.
  groundSnow: {
    byJurisdiction: {},
    note:
      'Ground snow load is assigned per city, village or township. Ask your building official for ' +
      'the value at your address — there is no safe statewide default.',
  },

  thresholds: {
    // --- egress -----------------------------------------------------------
    'eero.minNetClearAreaSqFt': threshold({
      id: 'eero.minNetClearAreaSqFt',
      label: 'Emergency escape opening — minimum net clear area',
      unit: 'sq ft',
      citation: 'IRC/MRC R310 (verify section number for your edition)',
      note: 'Sources differ on whether a grade-floor or below-grade opening may be smaller. Confirm both values.',
    }),
    'eero.minNetClearAreaGradeFloorSqFt': threshold({
      id: 'eero.minNetClearAreaGradeFloorSqFt',
      label: 'Emergency escape opening — minimum net clear area, grade floor',
      unit: 'sq ft',
      citation: 'IRC/MRC R310 (verify)',
    }),
    'eero.minNetClearHeightIn': threshold({
      id: 'eero.minNetClearHeightIn',
      label: 'Emergency escape opening — minimum net clear height',
      unit: 'in',
      citation: 'IRC/MRC R310 (verify)',
    }),
    'eero.minNetClearWidthIn': threshold({
      id: 'eero.minNetClearWidthIn',
      label: 'Emergency escape opening — minimum net clear width',
      unit: 'in',
      citation: 'IRC/MRC R310 (verify)',
    }),
    'eero.maxSillHeightIn': threshold({
      id: 'eero.maxSillHeightIn',
      label: 'Emergency escape opening — maximum sill height above floor',
      unit: 'in',
      citation: 'IRC/MRC R310 (verify)',
    }),

    // --- habitability -----------------------------------------------------
    'room.minCeilingHeightIn': threshold({
      id: 'room.minCeilingHeightIn',
      label: 'Habitable room — minimum ceiling height',
      unit: 'in',
      citation: 'IRC/MRC R305 (verify)',
    }),
    'room.minHorizontalDimensionIn': threshold({
      id: 'room.minHorizontalDimensionIn',
      label: 'Habitable room — minimum horizontal dimension',
      unit: 'in',
      citation: 'IRC/MRC R304 (verify)',
    }),
    'room.minAreaSqFt': threshold({
      id: 'room.minAreaSqFt',
      label: 'Habitable room — minimum floor area',
      unit: 'sq ft',
      citation: 'IRC/MRC R304 (verify)',
    }),
    'light.glazingFractionOfFloorArea': threshold({
      id: 'light.glazingFractionOfFloorArea',
      label: 'Natural light — glazing as a fraction of floor area',
      unit: 'fraction',
      citation: 'IRC/MRC R303 (verify)',
      note: 'Commonly quoted as one-eighth; some sources say one-tenth for adjoining rooms. Confirm.',
    }),
    'ventilation.openableFractionOfFloorArea': threshold({
      id: 'ventilation.openableFractionOfFloorArea',
      label: 'Natural ventilation — openable area as a fraction of floor area',
      unit: 'fraction',
      citation: 'IRC/MRC R303 (verify)',
    }),

    // --- doors and circulation -------------------------------------------
    'door.requiredExitClearWidthIn': threshold({
      id: 'door.requiredExitClearWidthIn',
      label: 'Required exit door — minimum clear width',
      unit: 'in',
      citation: 'IRC/MRC R311 (verify)',
      note: 'Michigan may state a nominal leaf size rather than a clear dimension. These are different tests.',
    }),
    'door.requiredExitClearHeightIn': threshold({
      id: 'door.requiredExitClearHeightIn',
      label: 'Required exit door — minimum clear height',
      unit: 'in',
      citation: 'IRC/MRC R311 (verify)',
    }),
    'hall.minWidthIn': threshold({
      id: 'hall.minWidthIn',
      label: 'Hallway — minimum width',
      unit: 'in',
      citation: 'IRC/MRC R311 (verify)',
    }),

    // --- stairs, guards, handrails ---------------------------------------
    'stair.maxRiserIn': threshold({
      id: 'stair.maxRiserIn',
      label: 'Stairway — maximum riser height',
      unit: 'in',
      citation: 'IRC/MRC R311.7 (verify)',
      note: 'Michigan is reported to amend the model value. Confirm the Michigan number specifically.',
    }),
    'stair.minTreadIn': threshold({
      id: 'stair.minTreadIn',
      label: 'Stairway — minimum tread depth',
      unit: 'in',
      citation: 'IRC/MRC R311.7 (verify)',
      note: 'Michigan is reported to amend the model value. Confirm the Michigan number specifically.',
    }),
    'stair.minWidthIn': threshold({
      id: 'stair.minWidthIn',
      label: 'Stairway — minimum width',
      unit: 'in',
      citation: 'IRC/MRC R311.7 (verify)',
    }),
    'stair.minHeadroomIn': threshold({
      id: 'stair.minHeadroomIn',
      label: 'Stairway — minimum headroom',
      unit: 'in',
      citation: 'IRC/MRC R311.7 (verify)',
    }),
    'guard.minHeightIn': threshold({
      id: 'guard.minHeightIn',
      label: 'Guard — minimum height',
      unit: 'in',
      citation: 'IRC/MRC R312 (verify)',
    }),
    'guard.requiredAboveDropIn': threshold({
      id: 'guard.requiredAboveDropIn',
      label: 'Guard — required where the drop exceeds',
      unit: 'in',
      citation: 'IRC/MRC R312 (verify)',
    }),
    'guard.maxOpeningSphereIn': threshold({
      id: 'guard.maxOpeningSphereIn',
      label: 'Guard — maximum opening (sphere that must not pass)',
      unit: 'in',
      citation: 'IRC/MRC R312 (verify)',
    }),

    // --- structure --------------------------------------------------------
    'load.floorLivePsf': threshold({
      id: 'load.floorLivePsf',
      label: 'Floor live load — habitable rooms',
      unit: 'psf',
      citation: 'IRC/MRC Table R301.5 (verify)',
    }),
    'load.floorLiveSleepingPsf': threshold({
      id: 'load.floorLiveSleepingPsf',
      label: 'Floor live load — sleeping rooms',
      unit: 'psf',
      citation: 'IRC/MRC Table R301.5 (verify)',
    }),
    'load.deckLivePsf': threshold({
      id: 'load.deckLivePsf',
      label: 'Deck live load',
      unit: 'psf',
      citation: 'IRC/MRC Table R301.5 (verify)',
    }),
    'deflection.floorLiveDenominator': threshold({
      id: 'deflection.floorLiveDenominator',
      label: 'Floor deflection limit under live load (L/n)',
      unit: 'n',
      citation: 'IRC/MRC Table R301.7 (verify)',
    }),
    'foundation.frostDepthIn': threshold({
      id: 'foundation.frostDepthIn',
      label: 'Minimum footing depth below grade (frost)',
      unit: 'in',
      citation: 'IRC/MRC R403 and the local jurisdiction',
      note: 'Varies across Michigan and can be set locally. Ask your building official for your address.',
    }),
    'soil.presumptiveBearingPsf': threshold({
      id: 'soil.presumptiveBearingPsf',
      label: 'Presumptive soil bearing capacity',
      unit: 'psf',
      citation: 'IRC/MRC Table R401.4.1 (verify)',
    }),
  },
};

/** A fresh, unconfirmed copy — the record is per project so it can be edited. */
export function createJurisdiction(base = MICHIGAN) {
  return JSON.parse(JSON.stringify(base));
}

/** Look a threshold up. Returns the record, never a bare number. */
export function getThreshold(jurisdiction, id) {
  return (jurisdiction && jurisdiction.thresholds && jurisdiction.thresholds[id]) || null;
}

/** The confirmed value, or null when nobody has confirmed it. */
export function valueOf(jurisdiction, id) {
  const record = getThreshold(jurisdiction, id);
  return isConfirmed(record) ? record.value : null;
}

export function confirmedCount(jurisdiction) {
  const all = Object.values((jurisdiction && jurisdiction.thresholds) || {});
  return { confirmed: all.filter(isConfirmed).length, total: all.length };
}

/** Everything still needing a value, for the "what do I have to look up" list. */
export function outstanding(jurisdiction) {
  return Object.values((jurisdiction && jurisdiction.thresholds) || {}).filter((t) => !isConfirmed(t));
}
