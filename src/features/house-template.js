// A complete sample: a 40' × 28' single-storey house on a full basement,
// drawn as a real permit set rather than one pretty floor plan.
//
// Seven sheets come out of this: foundation, floor plan, framing, roof,
// electrical, plumbing and mechanical. The discipline sheets do not own copies
// of the walls — they trace the floor plan through `basePageId`, so moving a
// wall moves it on every sheet at once, which is the whole reason a set is
// drawn from one model.
//
// Every number here is a design decision, not a code requirement. Storystick
// ships no confirmed Michigan code values, so nothing in this template should
// be read as compliant until the jurisdiction's thresholds are entered and the
// code check is run.

import { createProject, makePage } from '../core/document.js';
import {
  makeWall,
  makeOpening,
  makeRoom,
  makeDim,
  makeText,
  makeFixture,
  makeRoofPlane,
  makeFooting,
  makePadFooting,
  makeSlab,
  makeBeam,
} from '../core/entities.js';
import { assemblyThickness, ASSEMBLIES, DEFAULT_FINISHES } from '../core/assemblies.js';

const pt = (x, y) => ({ x, y });
const FT = 12;

// Overall framing dimensions, centreline to centreline of the exterior walls.
const W = 40 * FT;
const H = 28 * FT;

const EXT = 'ext-2x6';
const INT = 'int-2x4';
const WET = 'int-2x6';
const FOUND = 'found-8-conc-finished';

const EXT_T = assemblyThickness(ASSEMBLIES[EXT]); // 7.1875"
const INT_T = assemblyThickness(ASSEMBLIES[INT]); // 4.5"
const WET_T = assemblyThickness(ASSEMBLIES[WET]); // 6.5"
const FOUND_T = assemblyThickness(ASSEMBLIES[FOUND]); // 14.125"

const WALL_HEIGHT = 97.125; // 8'-1-1/8", a 92-5/8 stud with plates
const BSMT_HEIGHT = 96;

/** Interior face offset from an exterior wall centreline. */
const EI = EXT_T / 2;

function wall(page, a, b, assembly, thickness, layer = 'walls') {
  const ent = makeWall(a, b, layer, thickness, 'new');
  ent.assembly = assembly;
  ent.height = layer === 'foundation' ? BSMT_HEIGHT : WALL_HEIGHT;
  page.entities.push(ent);
  return ent;
}

function room(page, x0, y0, x1, y1, name, use, finishes) {
  const ent = makeRoom([pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)], 'rooms', name, use);
  ent.finishes = { ...DEFAULT_FINISHES, ceilingHeight: 96, ...finishes };
  page.entities.push(ent);
  return ent;
}

function fixture(page, symbol, x, y, layer, opts = {}) {
  const ent = makeFixture(symbol, pt(x, y), layer, opts);
  page.entities.push(ent);
  return ent;
}

/**
 * The wall grid. Interior partition centrelines are chosen so the rooms come
 * out at usable sizes; the bearing wall at mid-depth lands on the basement
 * beam, which is why it is where it is.
 */
const GRID = {
  bearing: 14 * FT, // H1 — carries the ceiling/roof load down to the beam
  hall: 10.5 * FT, // H2 — back wall of the bedroom corridor
  bed: 16 * FT, // V1 — between the two bedrooms
  wing: 28 * FT, // V2 — between bedroom 2 and the bath/stair wing
  bath: 7 * FT, // H3 — between the bath and the stair hall
  living: 20 * FT, // V3
  kitchen: 31 * FT, // V4
};

/**
 * Rotations that put a symbol's back against a wall. Symbols are authored with
 * their back at -y and their body extending into the room at +y, so "which wall
 * is this thing on" is the only question a placement has to answer.
 */
const FACE = {
  north: 0, // wall above, room below
  south: Math.PI, // wall below, room above
  west: -Math.PI / 2, // wall to the left, room to the right
  east: Math.PI / 2, // wall to the right, room to the left
};

/**
 * Where along a wall a point falls, as the fraction `makeOpening` wants.
 * Placing openings by position instead of by a hand-computed fraction is the
 * difference between a door in the bedroom and a door in the kitchen.
 */
function at(host, x, y) {
  const dx = host.b.x - host.a.x;
  const dy = host.b.y - host.a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return 0.5;
  const t = ((x - host.a.x) * dx + (y - host.a.y) * dy) / len2;
  return Math.min(1, Math.max(0, t));
}

function floorPlan(project) {
  const page = project.pages[0];
  page.name = 'Main Floor Plan';
  page.kind = 'plan';
  page.notes = [
    'Wall dimensions are to the framing centreline unless noted otherwise.',
    'Exterior walls: 2x6 studs @ 16" o.c. with R-21 batt, 7/16" OSB sheathing.',
    'Interior partitions: 2x4 studs @ 16" o.c. with 1/2" gypsum board each face.',
    'Plumbing wall at the bath is framed 2x6 to carry the drain stack.',
    'Verify every rough opening against the ordered unit before framing.',
  ];

  // Exterior shell.
  const ext = [
    wall(page, pt(0, 0), pt(W, 0), EXT, EXT_T),
    wall(page, pt(W, 0), pt(W, H), EXT, EXT_T),
    wall(page, pt(W, H), pt(0, H), EXT, EXT_T),
    wall(page, pt(0, H), pt(0, 0), EXT, EXT_T),
  ];

  // Interior partitions. The bedrooms open off a corridor rather than off the
  // living room, which is the difference between a house and a floor plan.
  const bearing = wall(page, pt(0, GRID.bearing), pt(W, GRID.bearing), INT, INT_T);
  const hall = wall(page, pt(0, GRID.hall), pt(GRID.wing, GRID.hall), INT, INT_T);
  wall(page, pt(GRID.bed, 0), pt(GRID.bed, GRID.hall), INT, INT_T);
  wall(page, pt(GRID.wing, 0), pt(GRID.wing, GRID.bearing), INT, INT_T);
  const bathWall = wall(page, pt(GRID.wing, GRID.bath), pt(W, GRID.bath), WET, WET_T);
  wall(page, pt(GRID.living, GRID.bearing), pt(GRID.living, H), INT, INT_T);
  wall(page, pt(GRID.kitchen, GRID.bearing), pt(GRID.kitchen, H), INT, INT_T);

  const door = (host, x, y, tag, width = 32, opts = {}) =>
    page.entities.push(
      makeOpening(host.id, at(host, x, y), 'openings', opts.kind || 'door', width, {
        tag,
        height: opts.height || 80,
        swing: opts.swing,
      })
    );

  door(ext[2], 10 * FT, H, 'D1', 36, { swing: 'left' }); // front entry, living room
  door(ext[1], W, 24 * FT, 'D2', 36, { swing: 'left' }); // rear service, dining
  door(hall, 6 * FT, GRID.hall, 'D3', 32); // bedroom 1
  door(hall, 22 * FT, GRID.hall, 'D4', 32); // bedroom 2
  door(bathWall, 34 * FT, GRID.bath, 'D5', 30); // bath off the stair hall
  door(bearing, 8 * FT, GRID.bearing, 'D6', 48, { kind: 'cased', height: 84 }); // hall to living
  door(bearing, 34 * FT, GRID.bearing, 'D7', 40, { kind: 'cased', height: 84 }); // dining to stair hall

  // Windows: one per bedroom wall, plus the living, kitchen, dining and bath.
  const win = (host, x, y, tag, width = 36) =>
    page.entities.push(
      makeOpening(host.id, at(host, x, y), 'openings', 'window', width, {
        tag,
        sill: 36,
        height: 48,
      })
    );
  win(ext[0], 6 * FT, 0, 'W1', 60); // bedroom 1 — egress
  win(ext[0], 22 * FT, 0, 'W2', 48); // bedroom 2 — egress
  win(ext[0], 34 * FT, 0, 'W3', 36); // bath
  win(ext[3], 0, 5 * FT, 'W4', 48); // bedroom 1, side wall
  win(ext[2], 5 * FT, H, 'W5', 60); // living room
  win(ext[2], 25 * FT, H, 'W6', 48); // kitchen, over the sink
  win(ext[2], 35 * FT, H, 'W7', 48); // dining
  win(ext[1], W, 4 * FT, 'W8', 30); // bath, obscure glass

  // Rooms and their finishes.
  const CARPET_BEDROOM = {
    floor: 'Carpet',
    base: 'Painted wood base',
    walls: 'Painted gypsum board',
    ceiling: 'Painted gypsum board',
  };
  room(page, EI, EI, GRID.bed - INT_T / 2, GRID.hall - INT_T / 2, 'Bedroom 1', 'bedroom', CARPET_BEDROOM);
  room(
    page,
    GRID.bed + INT_T / 2,
    EI,
    GRID.wing - INT_T / 2,
    GRID.hall - INT_T / 2,
    'Bedroom 2',
    'bedroom',
    CARPET_BEDROOM
  );
  room(page, GRID.wing + INT_T / 2, EI, W - EI, GRID.bath - WET_T / 2, 'Bath', 'bathroom', {
    floor: 'Ceramic tile',
    base: 'Tile base',
    walls: 'Painted gypsum board',
    ceiling: 'Painted gypsum board',
    notes: 'Tile wainscot to 6\'-0" at the tub surround',
  });
  room(
    page,
    EI,
    GRID.hall + INT_T / 2,
    GRID.wing - INT_T / 2,
    GRID.bearing - INT_T / 2,
    'Hall',
    'hallway',
    {
      floor: 'Luxury vinyl plank',
      base: 'Painted wood base',
      walls: 'Painted gypsum board',
      ceiling: 'Painted gypsum board',
    }
  );
  room(
    page,
    GRID.wing + INT_T / 2,
    GRID.bath + WET_T / 2,
    W - EI,
    GRID.bearing - INT_T / 2,
    'Stair Hall',
    'hallway',
    {
      floor: 'Luxury vinyl plank',
      base: 'Painted wood base',
      walls: 'Painted gypsum board',
      ceiling: 'Painted gypsum board',
      notes: 'Stair down to the basement, 14 risers',
    }
  );
  room(page, EI, GRID.bearing + INT_T / 2, GRID.living - INT_T / 2, H - EI, 'Living Room', 'living', {
    floor: 'Engineered wood',
    base: 'Painted wood base',
    walls: 'Painted gypsum board',
    ceiling: 'Painted gypsum board',
  });
  room(
    page,
    GRID.living + INT_T / 2,
    GRID.bearing + INT_T / 2,
    GRID.kitchen - INT_T / 2,
    H - EI,
    'Kitchen',
    'kitchen',
    {
      floor: 'Luxury vinyl plank',
      base: 'Vinyl cove base',
      walls: 'Painted gypsum board',
      ceiling: 'Painted gypsum board',
    }
  );
  room(page, GRID.kitchen + INT_T / 2, GRID.bearing + INT_T / 2, W - EI, H - EI, 'Dining', 'dining', {
    floor: 'Engineered wood',
    base: 'Painted wood base',
    walls: 'Painted gypsum board',
    ceiling: 'Painted gypsum board',
  });

  // Casework and appliances live on the architectural sheet.
  fixture(page, 'a-fridge', GRID.living + INT_T / 2 + 18, GRID.bearing + INT_T / 2, 'furniture');
  fixture(page, 'a-range', GRID.kitchen - INT_T / 2 - 15, GRID.bearing + INT_T / 2, 'furniture');
  fixture(page, 'a-dishwasher', GRID.living + INT_T / 2 + 66, GRID.bearing + INT_T / 2, 'furniture');
  fixture(page, 'a-base-cab-24', GRID.living + INT_T / 2 + 108, GRID.bearing + INT_T / 2, 'furniture');

  // Dimension strings on two sides, the way a plan is read: a string of
  // partition-to-partition dimensions, then the overall below it.
  page.entities.push(makeDim(pt(0, 0), pt(GRID.bed, 0), 'dimensions', -30));
  page.entities.push(makeDim(pt(GRID.bed, 0), pt(GRID.wing, 0), 'dimensions', -30));
  page.entities.push(makeDim(pt(GRID.wing, 0), pt(W, 0), 'dimensions', -30));
  page.entities.push(makeDim(pt(0, 0), pt(W, 0), 'dimensions', -54));
  page.entities.push(makeDim(pt(W, 0), pt(W, GRID.bath), 'dimensions', -30));
  page.entities.push(makeDim(pt(W, GRID.bath), pt(W, GRID.bearing), 'dimensions', -30));
  page.entities.push(makeDim(pt(W, GRID.bearing), pt(W, H), 'dimensions', -30));
  page.entities.push(makeDim(pt(W, 0), pt(W, H), 'dimensions', -54));

  page.entities.push(
    makeText(pt(0, H + 66), 'Bearing wall over basement beam — do not remove.', 'notes', 5)
  );
  return page;
}

function foundationPlan(project, plan) {
  const page = makePage('Foundation / Basement Plan', 'foundation', {
    notes: [
      'Foundation walls 8" poured concrete on continuous footings.',
      'Footing depth below grade is a placeholder — confirm the frost depth for the jurisdiction before pouring.',
      'Slab 4" concrete over 4" compacted granular fill with a vapour retarder.',
      'Damp-proof the exterior face of all foundation walls and drain to daylight or to the sump.',
      'Beam pockets and column pads shown are sized for the design loads entered in Structural.',
    ],
  });
  project.pages.push(page);

  // Foundation walls on the same centrelines as the framing above, so the
  // framing lands on concrete and not on air.
  const corners = [pt(0, 0), pt(W, 0), pt(W, H), pt(0, H)];
  for (let i = 0; i < 4; i += 1) {
    wall(page, corners[i], corners[(i + 1) % 4], FOUND, FOUND_T, 'foundation');
  }

  // Continuous footings under every foundation wall.
  for (let i = 0; i < 4; i += 1) {
    page.entities.push(
      makeFooting(corners[i], corners[(i + 1) % 4], 'footings', {
        width: 20,
        thickness: 10,
        depthBelowGrade: 42,
      })
    );
  }

  // Basement slab, inside the foundation walls, one storey down.
  const fi = FOUND_T / 2;
  page.entities.push(
    makeSlab([pt(fi, fi), pt(W - fi, fi), pt(W - fi, H - fi), pt(fi, H - fi)], 'slab', {
      thickness: 4,
      topElevation: -BSMT_HEIGHT,
      reinforcement: '6x6 W1.4/W1.4 welded wire mesh',
    })
  );

  // Centre beam under the bearing wall above, on three columns.
  const beam = makeBeam(pt(0, GRID.bearing), pt(W, GRID.bearing), 'structure', {
    size: '4x10',
    plies: 1,
    material: 'spf-2x6',
    tag: 'B1',
    elevation: BSMT_HEIGHT,
  });
  page.entities.push(beam);
  for (const x of [10 * FT, 20 * FT, 30 * FT]) {
    page.entities.push(
      makePadFooting(pt(x, GRID.bearing), 'footings', { width: 30, length: 30, thickness: 12 })
    );
    fixture(page, 's-column-steel', x, GRID.bearing, 'structure', { discipline: 'structural' });
  }

  // Basement equipment and the things that make a basement habitable.
  fixture(page, 'm-furnace', 33 * FT, 3 * FT, 'mechanical', { discipline: 'mechanical', tag: 'F1' });
  fixture(page, 'p-wh', 36 * FT, 8 * FT, 'plumbing', { discipline: 'plumbing', tag: 'WH1' });
  fixture(page, 'f-sump', 2 * FT, 2 * FT, 'foundation', { discipline: 'foundation' });
  fixture(page, 'p-fd', 20 * FT, 4 * FT, 'plumbing', { discipline: 'plumbing', tag: 'FD1' });
  fixture(page, 'e-panel', 31 * FT, EI + 4, 'electrical', { discipline: 'electrical', tag: 'P1' });
  fixture(page, 'f-window-well', 6 * FT, 0, 'foundation', { discipline: 'foundation' });

  page.entities.push(makeDim(pt(0, 0), pt(W, 0), 'dimensions', -42));
  page.entities.push(makeDim(pt(W, 0), pt(W, H), 'dimensions', -42));
  page.entities.push(makeDim(pt(0, 0), pt(0, GRID.bearing), 'dimensions', 30));
  page.entities.push(
    makeText(
      pt(0, H + 66),
      'Egress window well at Bedroom 1 — verify the opening against the adopted code before ordering.',
      'notes',
      5
    )
  );
  void plan;
  return page;
}

function framingPlan(project, plan) {
  const page = makePage('Main Floor Framing Plan', 'framing', {
    basePageId: plan.id,
    notes: [
      'Floor joists 2x10 @ 16" o.c. bearing on the exterior wall and the centre beam.',
      'Double joists under all parallel partitions.',
      'Headers over openings wider than 4\'-0" are (2) 2x10 with a 1/2" plywood flitch unless noted.',
      'Run the span check in Structural once the species design values have been entered.',
    ],
  });
  project.pages.push(page);

  const beam = makeBeam(pt(0, GRID.bearing), pt(W, GRID.bearing), 'structure', {
    size: '4x10',
    plies: 1,
    tag: 'B1',
    elevation: 0,
  });
  page.entities.push(beam);

  // Header beams over the wide openings.
  page.entities.push(
    makeBeam(pt(W - 12 * FT - 36, H), pt(W - 12 * FT + 36, H), 'structure', {
      size: '2x10',
      plies: 2,
      tag: 'H1',
    })
  );
  page.entities.push(
    makeBeam(pt(W, H - 6 * FT), pt(W, H - 3 * FT), 'structure', {
      size: '2x10',
      plies: 2,
      tag: 'H2',
    })
  );

  page.entities.push(
    makeText(pt(0, H + 66), 'Joists 2x10 @ 16" o.c. · span 14\'-0" each side of B1', 'notes', 5)
  );
  return page;
}

function roofPlan(project) {
  const page = makePage('Roof Plan', 'roof', {
    notes: [
      'Gable roof at 6:12 with a 12" overhang at the eaves and rakes.',
      'Ridge runs the long way, over the bearing wall below.',
      'Asphalt shingles over synthetic underlayment; ice and water shield at the eaves and valleys.',
      'Ventilate with continuous soffit vents and a ridge vent.',
    ],
  });
  project.pages.push(page);

  const O = 12; // overhang
  const ridge = GRID.bearing;
  // Two planes meeting at the ridge. The eave index tells the model which edge
  // is low, and every height in 3D follows from that.
  page.entities.push(
    makeRoofPlane(
      [pt(-O, -O), pt(W + O, -O), pt(W + O, ridge), pt(-O, ridge)],
      'roof',
      { eave: 0, pitch: 6, eaveHeight: WALL_HEIGHT, overhang: O }
    )
  );
  page.entities.push(
    makeRoofPlane(
      [pt(-O, ridge), pt(W + O, ridge), pt(W + O, H + O), pt(-O, H + O)],
      'roof',
      { eave: 2, pitch: 6, eaveHeight: WALL_HEIGHT, overhang: O }
    )
  );

  fixture(page, 'p-vtr', 34 * FT, 4 * FT, 'plumbing', { discipline: 'plumbing' });
  fixture(page, 'p-vtr', 30 * FT, 20 * FT, 'plumbing', { discipline: 'plumbing' });
  page.entities.push(makeDim(pt(-O, -O), pt(W + O, -O), 'dimensions', -30));
  page.entities.push(
    makeText(pt(-O, H + O + 48), 'Ridge height 7\'-0" above the eave · 6:12 both slopes', 'notes', 5)
  );
  return page;
}

function electricalPlan(project, plan) {
  const page = makePage('Electrical Plan', 'electrical', {
    basePageId: plan.id,
    notes: [
      'Receptacle and lighting layout is a design intent drawing, not a circuit design.',
      'Spacing, GFCI, AFCI and arc-fault locations must be confirmed against the adopted electrical code.',
      'All bedroom and living-area receptacles shown are 15 A general purpose unless noted.',
      'Smoke and carbon monoxide alarms shown are interconnected with battery backup.',
    ],
  });
  project.pages.push(page);
  const L = 'electrical';
  const D = { discipline: 'electrical' };

  // Receptacles are not tagged: a plan that numbers every outlet is unreadable,
  // and the count that matters comes off the drawing, not off a label.
  const N = { ...D, rot: FACE.north };
  const S = { ...D, rot: FACE.south };

  // Bedroom 1.
  fixture(page, 'e-recep', 3 * FT, EI, L, N);
  fixture(page, 'e-recep', 12 * FT, EI, L, N);
  fixture(page, 'e-recep', EI, 6 * FT, L, { ...D, rot: FACE.west });
  fixture(page, 'e-light-ceiling', 8 * FT, 7 * FT, L, D);
  fixture(page, 'e-switch', 8 * FT, GRID.hall - INT_T / 2, L, { ...D, rot: FACE.south });
  fixture(page, 'e-smoke', 4 * FT, 3 * FT, L, D);

  // Bedroom 2.
  fixture(page, 'e-recep', 19 * FT, EI, L, N);
  fixture(page, 'e-recep', 26 * FT, EI, L, N);
  fixture(page, 'e-light-ceiling', 22 * FT, 7 * FT, L, D);
  fixture(page, 'e-switch', 24 * FT, GRID.hall - INT_T / 2, L, { ...D, rot: FACE.south });
  fixture(page, 'e-smoke', 18 * FT, 3 * FT, L, D);

  // Bath.
  fixture(page, 'e-recep-gfci', 33 * FT, EI, L, N);
  fixture(page, 'e-light-recessed', 36 * FT, 2 * FT, L, D);
  fixture(page, 'e-fan-exhaust', 38 * FT, 5 * FT, L, D);
  fixture(page, 'e-switch-dimmer', 30 * FT, GRID.bath - WET_T / 2, L, { ...D, rot: FACE.south });

  // Hall and stair hall.
  fixture(page, 'e-light-ceiling', 6 * FT, GRID.hall + 21, L, D);
  fixture(page, 'e-light-ceiling', 20 * FT, GRID.hall + 21, L, D);
  fixture(page, 'e-smoke-co', 13 * FT, GRID.hall + 21, L, D);
  fixture(page, 'e-light-ceiling', 34 * FT, 12 * FT, L, D);
  fixture(page, 'e-switch-3way', GRID.wing + 12, GRID.bearing - INT_T / 2, L, {
    ...D,
    rot: FACE.south,
  });

  // Living room.
  fixture(page, 'e-recep', 5 * FT, H - EI, L, S);
  fixture(page, 'e-recep', 16 * FT, H - EI, L, S);
  fixture(page, 'e-recep', EI, 22 * FT, L, { ...D, rot: FACE.west });
  fixture(page, 'e-light-ceiling', 8 * FT, 22 * FT, L, D);
  fixture(page, 'e-tv', 11 * FT, H - EI, L, S);
  fixture(page, 'e-switch', 18 * FT, GRID.bearing + INT_T / 2, L, N);

  // Kitchen — small-appliance receptacles along the counter run, spaced so no
  // point along the counter is more than 2'-0" from one.
  for (let i = 0; i < 4; i += 1) {
    fixture(page, 'e-recep-gfci', (22 + i * 2.5) * FT, GRID.bearing + INT_T / 2, L, N);
  }
  fixture(page, 'e-recep-240', 28.5 * FT, GRID.bearing + INT_T / 2, L, N);
  fixture(page, 'e-light-recessed', 23 * FT, 22 * FT, L, D);
  fixture(page, 'e-light-recessed', 29 * FT, 22 * FT, L, D);
  fixture(page, 'e-light-under-cab', 25 * FT, GRID.bearing + INT_T / 2 + 14, L, D);

  // Dining.
  fixture(page, 'e-light-pendant', 36 * FT, 20 * FT, L, D);
  fixture(page, 'e-recep', 37 * FT, H - EI, L, S);
  fixture(page, 'e-switch-dimmer', GRID.kitchen + 12, GRID.bearing + INT_T / 2, L, N);

  // Exterior and control.
  fixture(page, 'e-recep-wp', 33 * FT, H - EI, L, S);
  fixture(page, 'e-light-wall', 11.5 * FT, H, L, S);
  fixture(page, 'e-chime', 13 * FT, H - EI, L, S);
  // The thermostat lives on the mechanical sheet — showing it on both would
  // count one device twice in the fixture schedule.
  return page;
}

function plumbingPlan(project, plan) {
  const page = makePage('Plumbing Plan', 'plumbing', {
    basePageId: plan.id,
    notes: [
      'Fixture locations only. Pipe sizing, venting and trap arms are the plumber\'s design.',
      'The bath wall is framed 2x6 to carry a 3" stack.',
      'All hot and cold supply runs are PEX from a manifold in the basement.',
      'Provide accessible shutoffs at every fixture.',
    ],
  });
  project.pages.push(page);
  const L = 'plumbing';
  const D = { discipline: 'plumbing' };

  // Bath, laid out as a three-piece: tub across the north end, water closet on
  // the wet wall, lavatory under the window.
  fixture(page, 'p-tub', 31 * FT, EI, L, { ...D, rot: FACE.north, tag: 'T1' });
  fixture(page, 'p-wc', GRID.wing + WET_T / 2, 5 * FT, L, { ...D, rot: FACE.west, tag: 'WC1' });
  fixture(page, 'p-lav', 36 * FT, GRID.bath - WET_T / 2, L, {
    ...D,
    rot: FACE.south,
    tag: 'LAV1',
  });

  // Kitchen sink under the window on the exterior wall.
  fixture(page, 'p-sink-kitchen', 25 * FT, H - EI, L, { ...D, rot: FACE.south, tag: 'S1' });

  // Laundry and mechanical are in the basement; the stack and the main run
  // through the stair hall, called out here.
  fixture(page, 'p-co', 34 * FT, 12 * FT, L, D);
  fixture(page, 'p-hb', 0, 22 * FT, L, { ...D, rot: FACE.east });
  fixture(page, 'p-hb', W, 20 * FT, L, { ...D, rot: FACE.west });

  page.entities.push(
    makeText(pt(0, H + 66), 'Water service and manifold in the basement — see the foundation plan.', 'notes', 5)
  );
  return page;
}

function mechanicalPlan(project, plan) {
  const page = makePage('Mechanical Plan', 'mechanical', {
    basePageId: plan.id,
    notes: [
      'Forced-air system, furnace and air handler in the basement.',
      'Supply registers shown at the exterior walls, returns high in the central hall.',
      'Duct sizes and the load calculation are not part of this drawing — have the system sized before installation.',
      'Bath and range exhaust ducted to the exterior, never into the attic.',
    ],
  });
  project.pages.push(page);
  const L = 'mechanical';
  const D = { discipline: 'mechanical' };

  // Supply registers under the windows, which is where they belong.
  const supplies = [
    [6 * FT, EI, FACE.north],
    [22 * FT, EI, FACE.north],
    [34 * FT, EI, FACE.north],
    [EI, 6 * FT, FACE.west],
    [8 * FT, H - EI, FACE.south],
    [25 * FT, H - EI, FACE.south],
    [35 * FT, H - EI, FACE.south],
  ];
  for (const [x, y, rot] of supplies) fixture(page, 'm-supply-floor', x, y, L, { ...D, rot });

  // Returns, high in the central hall where the air actually wants to go.
  fixture(page, 'm-return', 14 * FT, GRID.bearing, L, { ...D, tag: 'RA1' });
  fixture(page, 'm-return', 34 * FT, GRID.bearing, L, { ...D, tag: 'RA2' });

  // Exhaust and control.
  fixture(page, 'm-exhaust-fan', 38 * FT, 5 * FT, L, { ...D, tag: 'EF1' });
  fixture(page, 'm-range-hood', 28 * FT, GRID.bearing + INT_T / 2, L, { ...D, rot: FACE.north });
  fixture(page, 'm-thermostat', GRID.living + INT_T / 2, 20 * FT, L, {
    ...D,
    rot: FACE.west,
    tag: 'T1',
  });
  fixture(page, 'm-dryer-vent', W, 12 * FT, L, { ...D, rot: FACE.west });

  page.entities.push(
    makeText(pt(0, H + 66), 'Furnace, A-coil and the trunk run are in the basement.', 'notes', 5)
  );
  return page;
}

export function sampleHouse() {
  const project = createProject({ name: 'Sample House — 40 × 28 on a Basement', kind: 'building' });
  project.defaultWallThickness = EXT_T;
  project.wallHeight = WALL_HEIGHT;
  project.meta.client = 'Sample project';
  project.meta.designer = 'Storystick';
  project.meta.address = 'Michigan';
  project.meta.notes =
    'A worked example: three bedrooms, one bath, full basement. Every dimension is a design decision — none of it is a code determination. Enter the jurisdiction thresholds and run the code check before relying on any of it.';

  const plan = floorPlan(project);
  foundationPlan(project, plan);
  framingPlan(project, plan);
  roofPlan(project);
  electricalPlan(project, plan);
  plumbingPlan(project, plan);
  mechanicalPlan(project, plan);

  // Sheets read in set order: foundation and structure first, then the
  // architectural plan, then the systems that run through it.
  const order = [
    'Foundation / Basement Plan',
    'Main Floor Plan',
    'Main Floor Framing Plan',
    'Roof Plan',
    'Electrical Plan',
    'Plumbing Plan',
    'Mechanical Plan',
  ];
  project.pages.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  project.activePageId = project.pages.find((p) => p.name === 'Main Floor Plan').id;
  return project;
}
