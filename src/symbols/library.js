// The symbol library.
//
// Every symbol is geometry in MODEL INCHES relative to its insertion point, so
// a receptacle plotted on a 1/4" = 1'-0" plan comes out about 1/8" across on
// paper — the size an electrician expects to see. Nothing here is drawn at a
// fixed pixel size, because a symbol that ignores the drawing scale is a
// decoration, not a construction note.
//
// Orientation convention: -y is the BACK of the symbol (the wall it hangs on,
// or the side it is served from) and +y is into the room. A fixture's `rot`
// turns the whole thing, so a symbol is authored once, facing "up".
//
// See ./render.js for the op format.

const TAU = Math.PI * 2;

/** Closed rectangle, given two corners. */
function rect(x0, y0, x1, y1) {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
}

/** Closed ellipse as a polyline — the shape most plumbing fixtures actually are. */
function oval(cx, cy, rx, ry, steps = 28) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * TAU;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

/** Rectangle with eased corners, for basins, tubs and counters. */
function roundRect(x0, y0, x1, y1, r, steps = 4) {
  const pts = [];
  const corner = (cx, cy, from) => {
    for (let i = 0; i <= steps; i += 1) {
      const a = from + (i / steps) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x1 - r, y0 + r, -Math.PI / 2);
  corner(x1 - r, y1 - r, 0);
  corner(x0 + r, y1 - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  pts.push(pts[0]);
  return pts;
}

const line = (pts, opts = {}) => ({ t: 'l', pts, ...opts });
const poly = (pts, opts = {}) => ({ t: 'l', pts, ...opts });
const fill = (pts, opts = {}) => ({ t: 'f', pts, ...opts });
const circle = (cx, cy, r, opts = {}) => ({ t: 'c', c: [cx, cy], r, ...opts });
const arc = (cx, cy, r, a0, a1, opts = {}) => ({ t: 'a', c: [cx, cy], r, a0, a1, ...opts });
const label = (x, y, s, h = 4.5, opts = {}) => ({ t: 'x', p: [x, y], s, h, ...opts });

/** Diagonal slashes inside a box — the register/grille convention. */
function slashes(x0, y0, x1, y1, count = 3) {
  const out = [];
  const span = x1 - x0;
  for (let i = 1; i <= count; i += 1) {
    const x = x0 + (span * i) / (count + 1);
    const d = (y1 - y0) * 0.55;
    out.push(line([
      [x - d / 2, y1],
      [x + d / 2, y0],
    ], { w: 0.75 }));
  }
  return out;
}

function sym(id, discipline, name, widthIn, heightIn, mount, ops, extra = {}) {
  return { id, discipline, name, widthIn, heightIn, mount, ops, ...extra };
}

// ---------------------------------------------------------------------------
// Electrical
// ---------------------------------------------------------------------------

const RECEPTACLE_BODY = [
  circle(0, 0, 3),
  line([
    [-3, 0],
    [3, 0],
  ]),
];

const prongs = (xs, len = 4.5) =>
  xs.map((x) =>
    line([
      [x, 0],
      [x, -len],
    ])
  );

const ELECTRICAL = [
  sym('e-recep', 'electrical', 'Duplex receptacle', 6, 7.5, 'wall',
    [...RECEPTACLE_BODY, ...prongs([-1.5, 1.5])],
    { tagPrefix: 'R', countAs: 'receptacle' }),

  sym('e-recep-quad', 'electrical', 'Quadruplex receptacle', 6, 7.5, 'wall',
    [...RECEPTACLE_BODY, ...prongs([-2.25, -0.75, 0.75, 2.25])],
    { tagPrefix: 'R', countAs: 'receptacle' }),

  sym('e-recep-gfci', 'electrical', 'GFCI receptacle', 10, 12, 'wall',
    [...RECEPTACLE_BODY, ...prongs([-1.5, 1.5]), label(0, 6.5, 'GFI', 4)],
    { tagPrefix: 'R', countAs: 'receptacle' }),

  sym('e-recep-wp', 'electrical', 'Weatherproof receptacle', 10, 12, 'wall',
    [...RECEPTACLE_BODY, ...prongs([-1.5, 1.5]), label(0, 6.5, 'WP', 4)],
    { tagPrefix: 'R', countAs: 'receptacle' }),

  sym('e-recep-240', 'electrical', '240 V receptacle', 11, 12, 'wall',
    [...RECEPTACLE_BODY, ...prongs([-1.5, 1.5]), label(0, 6.5, '240', 4)],
    { tagPrefix: 'R', countAs: 'receptacle' }),

  sym('e-recep-floor', 'electrical', 'Floor receptacle', 8, 8, 'floor',
    [poly(rect(-4, -4, 4, 4)), circle(0, 0, 2.6), line([[-2.6, 0], [2.6, 0]])],
    { tagPrefix: 'R', countAs: 'receptacle' }),

  sym('e-switch', 'electrical', 'Switch', 5, 6, 'wall',
    [label(0, 0, 'S', 6)], { tagPrefix: 'S', countAs: 'switch' }),

  sym('e-switch-3way', 'electrical', 'Three-way switch', 8, 6, 'wall',
    [label(0, 0, 'S3', 6)], { tagPrefix: 'S', countAs: 'switch' }),

  sym('e-switch-4way', 'electrical', 'Four-way switch', 8, 6, 'wall',
    [label(0, 0, 'S4', 6)], { tagPrefix: 'S', countAs: 'switch' }),

  sym('e-switch-dimmer', 'electrical', 'Dimmer switch', 9, 6, 'wall',
    [label(0, 0, 'SD', 6)], { tagPrefix: 'S', countAs: 'switch' }),

  sym('e-switch-occ', 'electrical', 'Occupancy sensor switch', 10, 6, 'wall',
    [label(0, 0, 'SOS', 6)], { tagPrefix: 'S', countAs: 'switch' }),

  sym('e-light-ceiling', 'electrical', 'Ceiling light outlet', 14, 14, 'ceiling',
    [
      circle(0, 0, 3.5),
      line([[-4.95, -4.95], [4.95, 4.95]]),
      line([[-4.95, 4.95], [4.95, -4.95]]),
    ],
    { tagPrefix: 'L', countAs: 'fixture' }),

  sym('e-light-recessed', 'electrical', 'Recessed downlight', 9, 9, 'ceiling',
    [circle(0, 0, 4.5), circle(0, 0, 2.6)], { tagPrefix: 'L', countAs: 'fixture' }),

  sym('e-light-wall', 'electrical', 'Wall sconce', 8, 5, 'wall',
    [arc(0, 0, 4, 0, Math.PI), line([[-4, 0], [4, 0]])],
    { tagPrefix: 'L', countAs: 'fixture' }),

  sym('e-light-strip', 'electrical', 'Linear / strip fixture 48"', 48, 6, 'ceiling',
    [poly(rect(-24, -3, 24, 3)), line([[-24, 0], [24, 0]], { w: 0.7 })],
    { tagPrefix: 'L', countAs: 'fixture' }),

  sym('e-light-under-cab', 'electrical', 'Under-cabinet light', 24, 4, 'wall',
    [poly(rect(-12, -2, 12, 2), { d: [3, 2] })], { tagPrefix: 'L', countAs: 'fixture' }),

  sym('e-light-pendant', 'electrical', 'Pendant', 10, 10, 'ceiling',
    [circle(0, 0, 4.5), circle(0, 0, 1.2, { fill: true })],
    { tagPrefix: 'L', countAs: 'fixture' }),

  sym('e-fan-ceiling', 'electrical', 'Ceiling fan', 52, 52, 'ceiling',
    [
      circle(0, 0, 4),
      line([[0, -4], [0, -26]]),
      line([[0, 4], [0, 26]]),
      line([[-4, 0], [-26, 0]]),
      line([[4, 0], [26, 0]]),
      circle(0, 0, 26, { d: [4, 3], w: 0.6 }),
    ],
    { tagPrefix: 'F', countAs: 'fixture' }),

  sym('e-fan-exhaust', 'electrical', 'Exhaust fan with light', 11, 11, 'ceiling',
    [poly(rect(-5.5, -5.5, 5.5, 5.5)), circle(0, 0, 3.4), line([[-3.4, 0], [3.4, 0]])],
    { tagPrefix: 'EF', countAs: 'fixture' }),

  sym('e-smoke', 'electrical', 'Smoke alarm', 9, 9, 'ceiling',
    [circle(0, 0, 4.5), label(0, 0.3, 'SD', 4)], { tagPrefix: 'SD', countAs: 'alarm' }),

  sym('e-co', 'electrical', 'Carbon monoxide alarm', 9, 9, 'ceiling',
    [circle(0, 0, 4.5), label(0, 0.3, 'CO', 4)], { tagPrefix: 'CO', countAs: 'alarm' }),

  sym('e-smoke-co', 'electrical', 'Combination smoke / CO alarm', 11, 11, 'ceiling',
    [circle(0, 0, 5.5), label(0, 0.3, 'SD/CO', 3.4)], { tagPrefix: 'SD', countAs: 'alarm' }),

  sym('e-panel', 'electrical', 'Electrical panel', 30, 10, 'wall',
    [
      poly(rect(-15, -4, 15, 4)),
      ...slashes(-15, -4, 15, 4, 4),
      label(0, 8, 'PANEL', 4),
    ],
    { tagPrefix: 'P', countAs: 'equipment' }),

  sym('e-disconnect', 'electrical', 'Disconnect', 9, 9, 'wall',
    [poly(rect(-4.5, -4.5, 4.5, 4.5)), line([[-4.5, 4.5], [4.5, -4.5]])],
    { countAs: 'equipment' }),

  sym('e-jbox', 'electrical', 'Junction box', 7, 7, 'ceiling',
    [circle(0, 0, 3.5), label(0, 0.3, 'J', 4)], { countAs: 'device' }),

  sym('e-data', 'electrical', 'Data outlet', 8, 8, 'wall',
    [poly([[-3.6, 3], [3.6, 3], [0, -3.6], [-3.6, 3]]), label(0, 6.8, 'D', 3.6)],
    { countAs: 'device' }),

  sym('e-tv', 'electrical', 'TV / coax outlet', 9, 9, 'wall',
    [poly([[-3.6, 3], [3.6, 3], [0, -3.6], [-3.6, 3]]), label(0, 6.8, 'TV', 3.6)],
    { countAs: 'device' }),

  sym('e-phone', 'electrical', 'Telephone outlet', 8, 7, 'wall',
    [fill([[-3.6, 3], [3.6, 3], [0, -3.6]])], { countAs: 'device' }),

  sym('e-chime', 'electrical', 'Door chime', 9, 9, 'wall',
    [circle(0, 0, 4.5), label(0, 0.3, 'CH', 4)], { countAs: 'device' }),

  sym('e-meter', 'electrical', 'Electric meter', 12, 12, 'wall',
    [circle(0, 0, 6), label(0, 0.3, 'M', 5)], { countAs: 'equipment' }),
];

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

const PLUMBING = [
  sym('p-wc', 'plumbing', 'Water closet', 20, 28, 'wall',
    [
      poly(rect(-10, 0, 10, 8)),
      poly(oval(0, 17.5, 7.5, 9.5)),
      poly(oval(0, 17.5, 5.2, 6.8), { w: 0.7 }),
    ],
    { tagPrefix: 'WC', countAs: 'fixture' }),

  sym('p-bidet', 'plumbing', 'Bidet', 15, 24, 'wall',
    [poly(oval(0, 12, 7.5, 12)), poly(oval(0, 12, 5, 8.5), { w: 0.7 })],
    { countAs: 'fixture' }),

  sym('p-lav', 'plumbing', 'Lavatory', 22, 21, 'wall',
    [
      poly(roundRect(-11, 0, 11, 21, 1.5)),
      poly(oval(0, 10.5, 8, 6.5)),
      circle(0, 10.5, 0.9),
    ],
    { tagPrefix: 'LAV', countAs: 'fixture' }),

  sym('p-lav-pedestal', 'plumbing', 'Pedestal lavatory', 20, 19, 'wall',
    [poly(oval(0, 9.5, 10, 9.5)), poly(oval(0, 9.5, 6.5, 6)), circle(0, 9.5, 0.9)],
    { tagPrefix: 'LAV', countAs: 'fixture' }),

  sym('p-vanity-48', 'plumbing', 'Vanity 48" with lavatory', 48, 21, 'wall',
    [
      poly(rect(-24, 0, 24, 21)),
      poly(oval(0, 10.5, 8, 6.5)),
      circle(0, 10.5, 0.9),
    ],
    { countAs: 'casework' }),

  sym('p-vanity-72', 'plumbing', 'Vanity 72" with double lavatory', 72, 21, 'wall',
    [
      poly(rect(-36, 0, 36, 21)),
      poly(oval(-17, 10.5, 8, 6.5)),
      circle(-17, 10.5, 0.9),
      poly(oval(17, 10.5, 8, 6.5)),
      circle(17, 10.5, 0.9),
    ],
    { countAs: 'casework' }),

  sym('p-sink-kitchen', 'plumbing', 'Kitchen sink — double bowl', 33, 22, 'wall',
    [
      poly(rect(-16.5, 0, 16.5, 22)),
      poly(roundRect(-15.2, 1.5, -0.8, 20.5, 1)),
      poly(roundRect(0.8, 1.5, 15.2, 20.5, 1)),
      circle(-8, 11, 0.9),
      circle(8, 11, 0.9),
    ],
    { tagPrefix: 'S', countAs: 'fixture' }),

  sym('p-sink-single', 'plumbing', 'Kitchen sink — single bowl', 25, 22, 'wall',
    [poly(rect(-12.5, 0, 12.5, 22)), poly(roundRect(-11, 1.5, 11, 20.5, 1)), circle(0, 11, 0.9)],
    { tagPrefix: 'S', countAs: 'fixture' }),

  sym('p-sink-utility', 'plumbing', 'Utility sink', 24, 22, 'wall',
    [poly(rect(-12, 0, 12, 22)), poly(rect(-10.5, 1.5, 10.5, 20.5)), circle(0, 11, 0.9)],
    { countAs: 'fixture' }),

  sym('p-tub', 'plumbing', 'Bathtub 60" × 30"', 60, 30, 'wall',
    [
      poly(rect(-30, 0, 30, 30)),
      poly(roundRect(-27.5, 2.5, 27.5, 27.5, 5)),
      circle(-22, 15, 1.2),
      line([[-30, 10], [-27.5, 10]], { w: 0.7 }),
    ],
    { tagPrefix: 'T', countAs: 'fixture' }),

  sym('p-tub-shower', 'plumbing', 'Tub / shower 60" × 30"', 60, 30, 'wall',
    [
      poly(rect(-30, 0, 30, 30)),
      poly(roundRect(-27.5, 2.5, 27.5, 27.5, 5)),
      circle(-22, 15, 1.2),
      circle(-26, 15, 2.4, { d: [2, 1.5], w: 0.7 }),
    ],
    { tagPrefix: 'T', countAs: 'fixture' }),

  sym('p-shower-36', 'plumbing', 'Shower 36" × 36"', 36, 36, 'wall',
    [
      poly(rect(-18, 0, 18, 36)),
      line([[-18, 0], [18, 36]], { w: 0.7 }),
      line([[-18, 36], [18, 0]], { w: 0.7 }),
      circle(0, 18, 1.6),
    ],
    { tagPrefix: 'SH', countAs: 'fixture' }),

  sym('p-shower-60', 'plumbing', 'Shower 60" × 36"', 60, 36, 'wall',
    [
      poly(rect(-30, 0, 30, 36)),
      line([[-30, 0], [30, 36]], { w: 0.7 }),
      line([[-30, 36], [30, 0]], { w: 0.7 }),
      circle(0, 18, 1.6),
    ],
    { tagPrefix: 'SH', countAs: 'fixture' }),

  sym('p-wh', 'plumbing', 'Water heater', 22, 22, 'floor',
    [circle(0, 11, 11), label(0, 11.3, 'WH', 5)], { tagPrefix: 'WH', countAs: 'equipment' }),

  sym('p-wh-tankless', 'plumbing', 'Tankless water heater', 16, 12, 'wall',
    [poly(rect(-8, 0, 8, 12)), label(0, 6.3, 'TWH', 4)], { countAs: 'equipment' }),

  sym('p-fd', 'plumbing', 'Floor drain', 8, 8, 'floor',
    [circle(0, 0, 3.2), line([[-3.2, 0], [3.2, 0]]), line([[0, -3.2], [0, 3.2]])],
    { tagPrefix: 'FD', countAs: 'drain' }),

  sym('p-co', 'plumbing', 'Cleanout', 12, 8, 'floor',
    [circle(0, 0, 2.6), line([[-2.6, 0], [2.6, 0]]), label(0, 6.5, 'CO', 4)],
    { countAs: 'drain' }),

  sym('p-hb', 'plumbing', 'Hose bibb', 8, 10, 'wall',
    [line([[0, 0], [0, 4]]), circle(0, 5.6, 1.8), label(0, 10, 'HB', 3.6)],
    { countAs: 'device' }),

  sym('p-sump', 'plumbing', 'Sump pit and pump', 26, 26, 'floor',
    [circle(0, 0, 13, { d: [4, 3] }), circle(0, 0, 4), label(0, 8.5, 'SUMP', 4)],
    { countAs: 'equipment' }),

  sym('p-washer', 'plumbing', 'Clothes washer', 27, 27, 'wall',
    [poly(rect(-13.5, 0, 13.5, 27)), circle(0, 14, 7), label(0, 14.3, 'W', 5)],
    { countAs: 'appliance' }),

  sym('p-washer-box', 'plumbing', 'Washer supply box', 14, 8, 'wall',
    [poly(rect(-7, -4, 7, 4)), label(0, 0.3, 'WB', 4)], { countAs: 'device' }),

  sym('p-vtr', 'plumbing', 'Vent through roof', 9, 9, 'ceiling',
    [circle(0, 0, 3), label(0, 7, 'VTR', 3.6)], { countAs: 'vent' }),

  sym('p-meter', 'plumbing', 'Water meter / main shutoff', 10, 12, 'wall',
    [circle(0, 0, 4), label(0, 0.3, 'WM', 4)], { countAs: 'equipment' }),
];

// ---------------------------------------------------------------------------
// Mechanical
// ---------------------------------------------------------------------------

const MECHANICAL = [
  sym('m-furnace', 'mechanical', 'Furnace', 26, 32, 'floor',
    [poly(rect(-13, 0, 13, 32)), label(0, 16.3, 'FURN', 5)],
    { tagPrefix: 'F', countAs: 'equipment' }),

  sym('m-ahu', 'mechanical', 'Air handler', 26, 26, 'floor',
    [poly(rect(-13, 0, 13, 26)), label(0, 13.3, 'AHU', 5)],
    { tagPrefix: 'AHU', countAs: 'equipment' }),

  sym('m-condenser', 'mechanical', 'Condensing unit', 30, 30, 'floor',
    [poly(rect(-15, 0, 15, 30)), circle(0, 15, 11), label(0, 15.3, 'A/C', 5)],
    { tagPrefix: 'CU', countAs: 'equipment' }),

  sym('m-hrv', 'mechanical', 'HRV / ERV', 24, 20, 'ceiling',
    [poly(rect(-12, 0, 12, 20)), label(0, 10.3, 'HRV', 5)], { countAs: 'equipment' }),

  sym('m-supply-wall', 'mechanical', 'Supply register 10" × 4"', 10, 4, 'wall',
    [poly(rect(-5, -2, 5, 2)), ...slashes(-5, -2, 5, 2, 3)], { countAs: 'register' }),

  sym('m-supply-floor', 'mechanical', 'Supply register 12" × 6"', 12, 6, 'floor',
    [poly(rect(-6, -3, 6, 3)), ...slashes(-6, -3, 6, 3, 4)], { countAs: 'register' }),

  sym('m-diffuser', 'mechanical', 'Ceiling diffuser', 12, 12, 'ceiling',
    [
      poly(rect(-6, -6, 6, 6)),
      poly(rect(-2.5, -2.5, 2.5, 2.5)),
      line([[-6, -6], [-2.5, -2.5]], { w: 0.7 }),
      line([[6, -6], [2.5, -2.5]], { w: 0.7 }),
      line([[6, 6], [2.5, 2.5]], { w: 0.7 }),
      line([[-6, 6], [-2.5, 2.5]], { w: 0.7 }),
    ],
    { countAs: 'register' }),

  sym('m-return', 'mechanical', 'Return air grille 24" × 12"', 24, 12, 'wall',
    [
      poly(rect(-12, -6, 12, 6)),
      line([[-12, -2], [12, -2]], { w: 0.7 }),
      line([[-12, 2], [12, 2]], { w: 0.7 }),
      label(0, 10.5, 'RA', 4),
    ],
    { countAs: 'register' }),

  sym('m-exhaust-fan', 'mechanical', 'Bath exhaust fan', 11, 11, 'ceiling',
    [poly(rect(-5.5, -5.5, 5.5, 5.5)), circle(0, 0, 3.4), label(0, 9.5, 'EF', 3.6)],
    { tagPrefix: 'EF', countAs: 'equipment' }),

  sym('m-range-hood', 'mechanical', 'Range hood', 30, 14, 'wall',
    [
      poly([[-15, 0], [15, 0], [11, 13], [-11, 13], [-15, 0]]),
      line([[-11, 13], [11, 13]], { w: 0.7 }),
    ],
    { countAs: 'equipment' }),

  sym('m-mini-split', 'mechanical', 'Mini-split head', 32, 9, 'wall',
    [poly(rect(-16, 0, 16, 8)), ...slashes(-16, 0, 16, 8, 5)], { countAs: 'equipment' }),

  sym('m-thermostat', 'mechanical', 'Thermostat', 8, 8, 'wall',
    [circle(0, 0, 3.6), label(0, 0.3, 'T', 4.4)], { tagPrefix: 'T', countAs: 'device' }),

  sym('m-duct-up', 'mechanical', 'Duct riser up', 12, 12, 'floor',
    [poly(rect(-6, -6, 6, 6)), line([[0, 5], [0, -4]]), fill([[-2.2, -3], [2.2, -3], [0, -6]])],
    { countAs: 'duct' }),

  sym('m-duct-down', 'mechanical', 'Duct riser down', 12, 12, 'floor',
    [poly(rect(-6, -6, 6, 6)), line([[0, -5], [0, 4]]), fill([[-2.2, 3], [2.2, 3], [0, 6]])],
    { countAs: 'duct' }),

  sym('m-dryer-vent', 'mechanical', 'Dryer vent', 10, 10, 'wall',
    [circle(0, 0, 2.6), label(0, 7, 'DV', 3.6)], { countAs: 'vent' }),
];

// ---------------------------------------------------------------------------
// Appliances and casework, which live on the architectural plan
// ---------------------------------------------------------------------------

const ARCHITECTURAL = [
  sym('a-fridge', 'architectural', 'Refrigerator', 36, 30, 'wall',
    [poly(rect(-18, 0, 18, 30)), line([[-18, 24], [18, 24]], { w: 0.7 }), label(0, 12, 'REF', 5)],
    { countAs: 'appliance' }),

  sym('a-range', 'architectural', 'Range', 30, 25, 'wall',
    [
      poly(rect(-15, 0, 15, 25)),
      circle(-7, 8, 3),
      circle(7, 8, 3),
      circle(-7, 18, 3),
      circle(7, 18, 3),
    ],
    { countAs: 'appliance' }),

  sym('a-cooktop', 'architectural', 'Cooktop', 30, 21, 'wall',
    [poly(rect(-15, 0, 15, 21)), circle(-7, 7, 3), circle(7, 7, 3), circle(-7, 15, 3), circle(7, 15, 3)],
    { countAs: 'appliance' }),

  sym('a-dishwasher', 'architectural', 'Dishwasher', 24, 24, 'wall',
    [poly(rect(-12, 0, 12, 24), { d: [4, 3] }), label(0, 12.3, 'DW', 5)],
    { countAs: 'appliance' }),

  sym('a-microwave', 'architectural', 'Microwave', 30, 16, 'wall',
    [poly(rect(-15, 0, 15, 16), { d: [4, 3] }), label(0, 8.3, 'MW', 4.5)],
    { countAs: 'appliance' }),

  sym('a-dryer', 'architectural', 'Clothes dryer', 27, 27, 'wall',
    [poly(rect(-13.5, 0, 13.5, 27)), circle(0, 14, 7), label(0, 14.3, 'D', 5)],
    { countAs: 'appliance' }),

  sym('a-base-cab-24', 'architectural', 'Base cabinet 24" deep', 36, 24, 'wall',
    [poly(rect(-18, 0, 18, 24))], { countAs: 'casework' }),

  sym('a-wall-cab-12', 'architectural', 'Wall cabinet 12" deep', 36, 12, 'wall',
    [poly(rect(-18, 0, 18, 12), { d: [4, 3] })], { countAs: 'casework' }),

  sym('a-shelving', 'architectural', 'Shelving', 36, 16, 'wall',
    [poly(rect(-18, 0, 18, 16)), line([[-18, 8], [18, 8]], { w: 0.7 })],
    { countAs: 'casework' }),

  sym('a-attic-access', 'architectural', 'Attic access', 30, 22, 'ceiling',
    [poly(rect(-15, -11, 15, 11), { d: [5, 3] }), label(0, 0.3, 'ATTIC', 4)],
    { countAs: 'access' }),

  sym('a-water-closet-grab', 'architectural', 'Grab bar', 36, 3, 'wall',
    [poly(rect(-18, 0, 18, 2)), circle(-18, 1, 1.4), circle(18, 1, 1.4)],
    { countAs: 'accessory' }),
];

// ---------------------------------------------------------------------------
// Structural and foundation
// ---------------------------------------------------------------------------

const STRUCTURAL = [
  sym('s-post-4x4', 'structural', 'Post 4x4', 3.5, 3.5, 'floor',
    [poly(rect(-1.75, -1.75, 1.75, 1.75)), line([[-1.75, -1.75], [1.75, 1.75]]), line([[-1.75, 1.75], [1.75, -1.75]])],
    { tagPrefix: 'P', countAs: 'post' }),

  sym('s-post-6x6', 'structural', 'Post 6x6', 5.5, 5.5, 'floor',
    [poly(rect(-2.75, -2.75, 2.75, 2.75)), line([[-2.75, -2.75], [2.75, 2.75]]), line([[-2.75, 2.75], [2.75, -2.75]])],
    { tagPrefix: 'P', countAs: 'post' }),

  sym('s-column-steel', 'structural', 'Steel column 3-1/2"ø', 3.5, 3.5, 'floor',
    [circle(0, 0, 1.75, { fill: true })], { tagPrefix: 'C', countAs: 'post' }),

  sym('s-column-lally', 'structural', 'Adjustable column', 3.5, 3.5, 'floor',
    [circle(0, 0, 1.75), line([[-1.75, 0], [1.75, 0]]), line([[0, -1.75], [0, 1.75]])],
    { tagPrefix: 'C', countAs: 'post' }),

  sym('s-hold-down', 'structural', 'Hold-down anchor', 6, 6, 'floor',
    [circle(0, 0, 1.4, { fill: true }), circle(0, 0, 3)], { countAs: 'connector' }),

  sym('s-joist-hanger', 'structural', 'Joist hanger', 6, 4, 'floor',
    [poly([[-3, -2], [-3, 2], [3, 2], [3, -2]])], { countAs: 'connector' }),

  sym('f-pad-24', 'foundation', 'Pad footing 24" × 24"', 24, 24, 'floor',
    [poly(rect(-12, -12, 12, 12), { d: [5, 3] }), poly(rect(-3, -3, 3, 3))],
    { tagPrefix: 'PF', countAs: 'footing' }),

  sym('f-pad-30', 'foundation', 'Pad footing 30" × 30"', 30, 30, 'floor',
    [poly(rect(-15, -15, 15, 15), { d: [5, 3] }), poly(rect(-3, -3, 3, 3))],
    { tagPrefix: 'PF', countAs: 'footing' }),

  sym('f-window-well', 'foundation', 'Window well', 42, 24, 'wall',
    [arc(0, 0, 21, 0, Math.PI), line([[-21, 0], [21, 0]])], { countAs: 'access' }),

  sym('f-beam-pocket', 'foundation', 'Beam pocket', 12, 8, 'wall',
    [poly([[-6, 0], [-6, 8], [6, 8], [6, 0]], { d: [4, 3] })], { countAs: 'opening' }),

  sym('f-crawl-access', 'foundation', 'Crawl space access', 24, 18, 'wall',
    [poly(rect(-12, 0, 12, 18), { d: [5, 3] }), label(0, 9.3, 'CRAWL', 4)],
    { countAs: 'access' }),

  sym('f-sump', 'foundation', 'Sump pit', 26, 26, 'floor',
    [circle(0, 0, 13, { d: [4, 3] }), circle(0, 0, 4), label(0, 8.5, 'SUMP', 4)],
    { countAs: 'equipment' }),
];

export const SYMBOLS = {};
for (const list of [ELECTRICAL, PLUMBING, MECHANICAL, ARCHITECTURAL, STRUCTURAL]) {
  for (const s of list) SYMBOLS[s.id] = s;
}

export const SYMBOL_LIST = Object.values(SYMBOLS);

export function getSymbol(id) {
  return SYMBOLS[id] || null;
}

export function symbolsFor(discipline) {
  return SYMBOL_LIST.filter((s) => s.discipline === discipline);
}

/** Groups for the placement palette, in the order a set is drawn. */
export const SYMBOL_GROUPS = [
  { discipline: 'architectural', label: 'Appliances & casework' },
  { discipline: 'electrical', label: 'Electrical' },
  { discipline: 'plumbing', label: 'Plumbing' },
  { discipline: 'mechanical', label: 'Mechanical' },
  { discipline: 'structural', label: 'Structural' },
  { discipline: 'foundation', label: 'Foundation' },
];

/** The layer a symbol belongs on, so placing one never lands on the wrong layer. */
export const DISCIPLINE_LAYER = {
  architectural: 'furniture',
  electrical: 'electrical',
  plumbing: 'plumbing',
  mechanical: 'mechanical',
  structural: 'structure',
  foundation: 'foundation',
};

export function layerForSymbol(id) {
  const symbol = getSymbol(id);
  return (symbol && DISCIPLINE_LAYER[symbol.discipline]) || 'furniture';
}

/**
 * Which disciplines a page kind shows. A plumbing plan draws the walls in
 * background weight and the plumbing in full, which is exactly what a plumber
 * wants and an architect does not.
 */
export const PAGE_DISCIPLINES = {
  plan: ['architectural'],
  foundation: ['foundation', 'structural'],
  framing: ['structural'],
  roof: [],
  electrical: ['electrical'],
  plumbing: ['plumbing'],
  mechanical: ['mechanical'],
  site: [],
  elevation: [],
  section: [],
  detail: [],
  layout: ['architectural'],
};

export function disciplinesForPage(kind) {
  return PAGE_DISCIPLINES[kind] || ['architectural'];
}
