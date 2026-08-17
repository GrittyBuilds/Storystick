// Wall, floor and roof assemblies: the layers a wall is actually built from.
//
// A wall in a plan is not a 5.5-inch line. It is 1/2" sheathing, 5-1/2" of studs
// and insulation, and 1/2" of gypsum board — and each of those layers is a
// material somebody has to buy, hang and finish. Modelling the assembly rather
// than a bare thickness means the drawn wall, the poché, the drywall takeoff and
// the finish schedule all come from one place and cannot drift apart.
//
// Thicknesses are nominal-dressed inches: 1/2" gypsum really is 1/2".

export const LAYER_KINDS = {
  finish: { label: 'Finish', poche: false },
  board: { label: 'Board', poche: false },
  sheathing: { label: 'Sheathing', poche: false },
  structure: { label: 'Structure', poche: true },
  insulation: { label: 'Insulation', poche: false },
  air: { label: 'Air gap', poche: false },
  masonry: { label: 'Masonry', poche: true },
  concrete: { label: 'Concrete', poche: true },
  membrane: { label: 'Membrane', poche: false },
};

/**
 * @param kind    one of LAYER_KINDS
 * @param name    what it is, as a builder would say it
 * @param thickness inches
 * @param opts    { material, hatch, takeoff }
 *   takeoff: 'sheet' counts in 4x8 sheets, 'area' counts in square feet,
 *            'volume' counts in cubic yards, null is not taken off.
 */
function layer(kind, name, thickness, opts = {}) {
  return {
    kind,
    name,
    thickness,
    material: opts.material || null,
    hatch: opts.hatch || kind,
    takeoff: opts.takeoff ?? (kind === 'board' || kind === 'sheathing' ? 'sheet' : 'area'),
    sheetCoverageSqFt: opts.sheetCoverageSqFt ?? 32,
  };
}

export const GYPSUM_HALF = () => layer('board', '1/2" gypsum board', 0.5, { material: 'gyp-1/2' });
export const GYPSUM_FIVE_EIGHTHS = () =>
  layer('board', '5/8" type X gypsum board', 0.625, { material: 'gyp-5/8x' });

/**
 * The assemblies a residential project actually uses. Each is a list of layers
 * ordered from EXTERIOR (or the "A" side) to INTERIOR (the "B" side).
 */
export const ASSEMBLIES = {
  'int-2x4': {
    id: 'int-2x4',
    name: 'Interior partition — 2x4',
    use: 'interior',
    layers: [
      GYPSUM_HALF(),
      layer('structure', '2x4 studs @ 16" o.c.', 3.5, { material: 'spf-2x4' }),
      GYPSUM_HALF(),
    ],
  },
  'int-2x6': {
    id: 'int-2x6',
    name: 'Interior partition — 2x6 (plumbing wall)',
    use: 'interior',
    layers: [
      GYPSUM_HALF(),
      layer('structure', '2x6 studs @ 16" o.c.', 5.5, { material: 'spf-2x6' }),
      GYPSUM_HALF(),
    ],
  },
  'int-2x4-fire': {
    id: 'int-2x4-fire',
    name: 'Garage separation — 2x4 with 5/8" type X',
    use: 'interior',
    layers: [
      GYPSUM_FIVE_EIGHTHS(),
      layer('structure', '2x4 studs @ 16" o.c.', 3.5, { material: 'spf-2x4' }),
      GYPSUM_FIVE_EIGHTHS(),
    ],
  },
  'ext-2x6': {
    id: 'ext-2x6',
    name: 'Exterior wall — 2x6, siding',
    use: 'exterior',
    layers: [
      layer('finish', 'Lap siding', 0.5, { material: 'siding-lap' }),
      layer('air', 'Rainscreen / WRB', 0.25, { takeoff: 'area', material: 'wrb' }),
      layer('sheathing', '7/16" OSB sheathing', 0.4375, { material: 'osb-7/16' }),
      layer('structure', '2x6 studs @ 16" o.c. with R-21 batt', 5.5, { material: 'spf-2x6' }),
      GYPSUM_HALF(),
    ],
  },
  'ext-2x4': {
    id: 'ext-2x4',
    name: 'Exterior wall — 2x4, siding',
    use: 'exterior',
    layers: [
      layer('finish', 'Lap siding', 0.5, { material: 'siding-lap' }),
      layer('air', 'Rainscreen / WRB', 0.25, { material: 'wrb' }),
      layer('sheathing', '7/16" OSB sheathing', 0.4375, { material: 'osb-7/16' }),
      layer('structure', '2x4 studs @ 16" o.c. with R-13 batt', 3.5, { material: 'spf-2x4' }),
      GYPSUM_HALF(),
    ],
  },
  'ext-2x6-brick': {
    id: 'ext-2x6-brick',
    name: 'Exterior wall — 2x6, brick veneer',
    use: 'exterior',
    layers: [
      layer('masonry', 'Brick veneer', 3.625, { material: 'brick' }),
      layer('air', '1" air space', 1, { material: null }),
      layer('sheathing', '7/16" OSB sheathing', 0.4375, { material: 'osb-7/16' }),
      layer('structure', '2x6 studs @ 16" o.c. with R-21 batt', 5.5, { material: 'spf-2x6' }),
      GYPSUM_HALF(),
    ],
  },
  'found-8-conc': {
    id: 'found-8-conc',
    name: 'Foundation wall — 8" poured concrete',
    use: 'foundation',
    layers: [
      layer('membrane', 'Damp-proofing', 0.125, { material: null, takeoff: 'area' }),
      layer('concrete', '8" poured concrete', 8, { material: 'concrete', takeoff: 'volume' }),
    ],
  },
  'found-8-conc-finished': {
    id: 'found-8-conc-finished',
    name: 'Foundation wall — 8" concrete, finished basement',
    use: 'foundation',
    layers: [
      layer('membrane', 'Damp-proofing', 0.125, { material: null, takeoff: 'area' }),
      layer('concrete', '8" poured concrete', 8, { material: 'concrete', takeoff: 'volume' }),
      layer('insulation', 'R-13 rigid / framed insulation', 2, { material: 'rigid-2' }),
      layer('structure', '2x4 furring @ 16" o.c.', 3.5, { material: 'spf-2x4' }),
      GYPSUM_HALF(),
    ],
  },
  'found-12-cmu': {
    id: 'found-12-cmu',
    name: 'Foundation wall — 12" CMU',
    use: 'foundation',
    layers: [
      layer('membrane', 'Damp-proofing', 0.125, { material: null, takeoff: 'area' }),
      layer('masonry', '12" concrete masonry unit', 11.625, { material: 'cmu-12', takeoff: 'area' }),
    ],
  },
};

export const ASSEMBLY_LIST = Object.values(ASSEMBLIES);

export function getAssembly(project, id) {
  const custom = project && project.assemblies && project.assemblies[id];
  return custom || ASSEMBLIES[id] || null;
}

/** Total built thickness of an assembly. */
export function assemblyThickness(assembly) {
  if (!assembly) return 0;
  return assembly.layers.reduce((sum, l) => sum + l.thickness, 0);
}

/** Offsets of each layer from the "A" face, for drawing the layers in plan. */
export function layerOffsets(assembly) {
  const out = [];
  let cursor = 0;
  for (const l of assembly.layers) {
    out.push({ layer: l, from: cursor, to: cursor + l.thickness });
    cursor += l.thickness;
  }
  return out;
}

/** The structural core, which is what a framing plan and a span check care about. */
export function structuralLayer(assembly) {
  if (!assembly) return null;
  return (
    assembly.layers.find((l) => l.kind === 'structure') ||
    assembly.layers.find((l) => l.kind === 'concrete' || l.kind === 'masonry') ||
    null
  );
}

/**
 * Finish layers exposed on each face, which is what gets painted and what a
 * finish schedule lists.
 */
export function exposedFaces(assembly) {
  if (!assembly || !assembly.layers.length) return { a: null, b: null };
  return { a: assembly.layers[0], b: assembly.layers[assembly.layers.length - 1] };
}

export function createAssemblies() {
  return JSON.parse(JSON.stringify(ASSEMBLIES));
}

/** Room finish slots a finish schedule reports. */
export const FINISH_SLOTS = ['floor', 'base', 'walls', 'ceiling'];

export const DEFAULT_FINISHES = {
  floor: '',
  base: '',
  walls: '',
  ceiling: '',
  ceilingHeight: null,
  notes: '',
};
