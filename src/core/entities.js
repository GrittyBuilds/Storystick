// Entity model: factories, geometry queries, hit testing and edit handles.

import * as g from './geometry.js';

let counter = 0;
export function uid(prefix = 'e') {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export const ENTITY_LABELS = {
  line: 'Line',
  rect: 'Rectangle',
  circle: 'Circle',
  arc: 'Arc',
  polyline: 'Polyline',
  wall: 'Wall',
  opening: 'Opening',
  dim: 'Dimension',
  text: 'Text',
  room: 'Room',
  part: 'Part',
  fixture: 'Fixture',
  roofPlane: 'Roof plane',
  footing: 'Footing',
  slab: 'Slab',
  beam: 'Beam',
};

/** Disciplines a sheet and a fixture belong to. */
export const DISCIPLINES = [
  'architectural',
  'structural',
  'electrical',
  'plumbing',
  'mechanical',
  'foundation',
];

export const WALL_STATUS = ['new', 'existing', 'demo'];

export function makeLine(a, b, layer) {
  return { id: uid('ln'), type: 'line', layer, a: g.clone(a), b: g.clone(b) };
}

export function makeRect(a, b, layer) {
  return { id: uid('rc'), type: 'rect', layer, a: g.clone(a), b: g.clone(b) };
}

export function makeCircle(c, r, layer) {
  return { id: uid('ci'), type: 'circle', layer, c: g.clone(c), r };
}

export function makeArc(c, r, a0, a1, layer) {
  return { id: uid('ar'), type: 'arc', layer, c: g.clone(c), r, a0, a1 };
}

export function makePolyline(pts, layer, closed = false) {
  return { id: uid('pl'), type: 'polyline', layer, pts: pts.map(g.clone), closed };
}

export function makeWall(a, b, layer, thickness = 5.5, status = 'new') {
  return { id: uid('wl'), type: 'wall', layer, a: g.clone(a), b: g.clone(b), thickness, status };
}

/**
 * `height` is the UNIT height — the size a door or window schedule lists, e.g.
 * a 3'0" x 5'0" window. The elevation of its head above the floor is derived as
 * sill + height (see `openingHead`). Doors sit on the floor, so for them the two
 * are the same number.
 */
export function makeOpening(hostId, t, layer, kind = 'door', width = 32, opts = {}) {
  return {
    id: uid('op'),
    type: 'opening',
    layer,
    host: hostId,
    t,
    kind,
    width,
    swing: opts.swing || 'left',
    sill: opts.sill ?? (kind === 'window' ? 36 : 0),
    height: opts.height ?? (kind === 'window' ? 48 : 80),
    tag: opts.tag || '',
  };
}

/** Height of the opening itself, in inches. */
export function openingUnitHeight(opening) {
  return opening.height ?? (opening.kind === 'window' ? 48 : 80);
}

/** Sill elevation above the floor. Doors sit on it. */
export function openingSill(opening) {
  return opening.kind === 'window' ? opening.sill ?? 36 : 0;
}

/** Elevation of the top of the opening above the floor. */
export function openingHead(opening) {
  return openingSill(opening) + openingUnitHeight(opening);
}

export function makeDim(a, b, layer, offset = 18) {
  return { id: uid('dm'), type: 'dim', layer, a: g.clone(a), b: g.clone(b), offset };
}

export function makeText(p, text, layer, size = 8) {
  return { id: uid('tx'), type: 'text', layer, p: g.clone(p), text, size, rot: 0 };
}

/** Room uses that code rules key off — bedrooms need escape openings, and so on. */
export const ROOM_USES = [
  'bedroom',
  'living',
  'kitchen',
  'bathroom',
  'hall',
  'stair',
  'storage',
  'garage',
  'basement',
  'other',
];

export function makeRoom(pts, layer, name = 'Room', use = 'other') {
  return { id: uid('rm'), type: 'room', layer, pts: pts.map(g.clone), name, use };
}

/**
 * A plan symbol placed in the drawing — a receptacle, a toilet, a furnace, a
 * post. One entity type covers every discipline; the symbol library supplies
 * the geometry, so adding a symbol never means adding an entity type.
 */
export function makeFixture(symbol, p, layer, opts = {}) {
  return {
    id: uid('fx'),
    type: 'fixture',
    layer,
    symbol,
    p: g.clone(p),
    rot: opts.rot ?? 0,
    scale: opts.scale ?? 1,
    discipline: opts.discipline || 'architectural',
    tag: opts.tag || '',
    mirrored: !!opts.mirrored,
    notes: opts.notes || '',
  };
}

/**
 * One plane of a roof, drawn as its outline in plan.
 *
 * `eave` is the index of the outline edge that sits at the low side; the plane
 * rises from there at `pitch` rise per 12 of run. Height at any point is
 * eaveHeight + pitch/12 x (perpendicular distance from the eave line). Gables,
 * hips, sheds and dormers are all just several of these.
 */
export function makeRoofPlane(pts, layer, opts = {}) {
  return {
    id: uid('rf'),
    type: 'roofPlane',
    layer,
    pts: pts.map(g.clone),
    eave: opts.eave ?? 0,
    pitch: opts.pitch ?? 6,
    eaveHeight: opts.eaveHeight ?? 96,
    overhang: opts.overhang ?? 0,
    name: opts.name || '',
  };
}

/** Continuous footing under a wall, or a pad footing under a post. */
export function makeFooting(a, b, layer, opts = {}) {
  return {
    id: uid('ft'),
    type: 'footing',
    layer,
    a: g.clone(a),
    b: g.clone(b),
    width: opts.width ?? 20,
    thickness: opts.thickness ?? 10,
    depthBelowGrade: opts.depthBelowGrade ?? 42,
    kind: opts.kind || 'continuous',
    notes: opts.notes || '',
  };
}

/** A pad footing is a footing whose two ends coincide. */
export function makePadFooting(p, layer, opts = {}) {
  const footing = makeFooting(p, p, layer, { ...opts, kind: 'pad' });
  footing.length = opts.length ?? opts.width ?? 24;
  return footing;
}

/** A concrete slab: basement floor, garage floor, patio. */
export function makeSlab(pts, layer, opts = {}) {
  return {
    id: uid('sl'),
    type: 'slab',
    layer,
    pts: pts.map(g.clone),
    thickness: opts.thickness ?? 4,
    topElevation: opts.topElevation ?? 0,
    name: opts.name || 'Slab',
    reinforcement: opts.reinforcement || '',
    notes: opts.notes || '',
  };
}

/** A structural line member: girder, header, ridge, joist band. */
export function makeBeam(a, b, layer, opts = {}) {
  return {
    id: uid('bm'),
    type: 'beam',
    layer,
    a: g.clone(a),
    b: g.clone(b),
    size: opts.size || '2x10',
    plies: opts.plies ?? 2,
    material: opts.material || 'spf-2',
    elevation: opts.elevation ?? 96,
    tag: opts.tag || '',
    notes: opts.notes || '',
  };
}

export function makePart(a, b, layer, opts = {}) {
  return {
    id: uid('pt'),
    type: 'part',
    layer,
    a: g.clone(a),
    b: g.clone(b),
    name: opts.name || 'Part',
    thickness: opts.thickness ?? 0.75,
    material: opts.material || 'plywood-3/4',
    qty: opts.qty ?? 1,
    notes: opts.notes || '',
  };
}

/** The eave edge of a roof plane, as a segment. */
export function roofEaveEdge(plane) {
  const i = Math.max(0, Math.min(plane.eave || 0, plane.pts.length - 1));
  return [plane.pts[i], plane.pts[(i + 1) % plane.pts.length]];
}

/**
 * Height of a roof plane above the floor at a plan point. The plane rises
 * perpendicular to its eave edge at the given pitch.
 */
export function roofHeightAt(plane, point) {
  const [a, b] = roofEaveEdge(plane);
  const edge = g.sub(b, a);
  const length = g.len(edge);
  if (length < g.EPS) return plane.eaveHeight;
  // Perpendicular distance from the eave line, taken positive into the plane.
  const signed = g.cross(edge, g.sub(point, a)) / length;
  const centroid = g.polygonCentroid(plane.pts);
  const inward = Math.sign(g.cross(edge, g.sub(centroid, a)) / length) || 1;
  const run = signed * inward;
  return plane.eaveHeight + (Math.max(0, run) * (plane.pitch || 0)) / 12;
}

/** Ridge height of a plane: the highest point of its outline. */
export function roofRidgeHeight(plane) {
  return plane.pts.reduce((max, p) => Math.max(max, roofHeightAt(plane, p)), plane.eaveHeight);
}

/** Footprint of a roof plane, as it covers the ground. */
export function roofPlanArea(plane) {
  return Math.abs(g.polygonArea(plane.pts));
}

/**
 * Surface area of a roof plane, which is what you buy shingles by. Named for
 * the slope on purpose: the plan area and the sloped area differ by the pitch,
 * and a takeoff that confuses them under-orders the roof.
 */
export function roofSlopedArea(plane) {
  const pitch = plane.pitch || 0;
  return roofPlanArea(plane) * Math.sqrt(1 + (pitch / 12) ** 2);
}

export function footingLength(footing) {
  return footing.kind === 'pad' ? footing.length || footing.width : g.dist(footing.a, footing.b);
}

export function findEntity(page, id) {
  return page.entities.find((e) => e.id === id) || null;
}

export function wallLength(wall) {
  return g.dist(wall.a, wall.b);
}

/** Openings hosted on a wall, ordered along the wall. */
export function openingsForWall(page, wallId) {
  return page.entities
    .filter((e) => e.type === 'opening' && e.host === wallId)
    .sort((p, q) => p.t - q.t);
}

/** Solid spans of a wall as [start,end] distances along its centreline. */
export function wallSpans(wall, page) {
  const total = wallLength(wall);
  if (total < g.EPS) return [];
  const holes = openingsForWall(page, wall.id).map((o) => {
    const center = o.t * total;
    return [center - o.width / 2, center + o.width / 2];
  });
  return g.subtractIntervals(total, holes);
}

/** Centre point and direction of an opening in model space. */
export function openingFrame(opening, page) {
  const wall = findEntity(page, opening.host);
  if (!wall || wall.type !== 'wall') return null;
  const total = wallLength(wall);
  if (total < g.EPS) return null;
  const dir = g.norm(g.sub(wall.b, wall.a));
  const center = g.add(wall.a, g.mul(dir, opening.t * total));
  const half = opening.width / 2;
  return {
    wall,
    dir,
    normal: g.perp(dir),
    center,
    start: g.sub(center, g.mul(dir, half)),
    end: g.add(center, g.mul(dir, half)),
    thickness: wall.thickness,
  };
}

/**
 * Stroked outlines used for hit testing, bounds and rendering fallbacks.
 * Returns [{ pts, closed }].
 */
export function outlines(ent, page) {
  switch (ent.type) {
    case 'line':
      return [{ pts: [ent.a, ent.b], closed: false }];
    case 'rect':
    case 'part':
      return [{ pts: g.rectCorners(ent.a, ent.b), closed: true }];
    case 'circle':
      return [{ pts: g.arcPoints(ent.c, ent.r, 0, Math.PI * 2, 48).slice(0, -1), closed: true }];
    case 'arc':
      return [{ pts: g.arcPoints(ent.c, ent.r, ent.a0, ent.a1, 32), closed: false }];
    case 'polyline':
      return [{ pts: ent.pts, closed: !!ent.closed }];
    case 'room':
      return [{ pts: ent.pts, closed: true }];
    case 'wall': {
      const spans = wallSpans(ent, page);
      const total = wallLength(ent) || 1;
      return spans.map((s) => ({
        pts: g.thickSegmentQuad(ent.a, ent.b, ent.thickness, s[0] / total, s[1] / total),
        closed: true,
      }));
    }
    case 'opening': {
      const f = openingFrame(ent, page);
      if (!f) return [];
      const half = g.mul(f.normal, f.thickness / 2);
      return [
        {
          pts: [
            g.add(f.start, half),
            g.add(f.end, half),
            g.sub(f.end, half),
            g.sub(f.start, half),
          ],
          closed: true,
        },
      ];
    }
    case 'dim':
      return [{ pts: [ent.a, ent.b], closed: false }];
    case 'text':
      return [{ pts: [ent.p], closed: false }];
    case 'roofPlane':
    case 'slab':
      return [{ pts: ent.pts, closed: true }];
    case 'footing':
      if (ent.kind === 'pad') {
        const half = (ent.length || ent.width) / 2;
        const halfW = ent.width / 2;
        return [
          {
            pts: g.rectCorners(
              g.vec(ent.a.x - halfW, ent.a.y - half),
              g.vec(ent.a.x + halfW, ent.a.y + half)
            ),
            closed: true,
          },
        ];
      }
      return [{ pts: g.thickSegmentQuad(ent.a, ent.b, ent.width), closed: true }];
    case 'beam':
      return [{ pts: g.thickSegmentQuad(ent.a, ent.b, beamWidth(ent)), closed: true }];
    case 'fixture': {
      const half = 0;
      void half;
      return [{ pts: [ent.p], closed: false }];
    }
    default:
      return [];
  }
}

/** Plotted width of a beam in plan, from its size and ply count. */
export function beamWidth(beam) {
  const plies = Math.max(1, beam.plies || 1);
  const nominal = String(beam.size || '2x10').split('x')[0];
  const dressed = Number(nominal) >= 4 ? Number(nominal) - 0.5 : 1.5;
  return dressed * plies;
}

export function bboxOf(ent, page) {
  if (ent.type === 'fixture') {
    // Without the symbol library a fixture is a point; the renderer passes a
    // real footprint when it has one.
    const reach = (ent.footprint || 12) * (ent.scale || 1);
    return g.bboxOfPoints([
      g.vec(ent.p.x - reach, ent.p.y - reach),
      g.vec(ent.p.x + reach, ent.p.y + reach),
    ]);
  }
  if (ent.type === 'text') {
    const w = ent.text.length * ent.size * 0.6;
    return g.bboxOfPoints([ent.p, g.vec(ent.p.x + w, ent.p.y - ent.size)]);
  }
  if (ent.type === 'dim') {
    const dir = g.norm(g.sub(ent.b, ent.a));
    const n = g.mul(g.perp(dir), ent.offset);
    return g.bboxOfPoints([ent.a, ent.b, g.add(ent.a, n), g.add(ent.b, n)]);
  }
  const paths = outlines(ent, page);
  let box = null;
  for (const path of paths) box = g.bboxUnion(box, g.bboxOfPoints(path.pts));
  return box || g.emptyBox();
}

export function bboxOfMany(entities, page) {
  let box = null;
  for (const ent of entities) {
    const b = bboxOf(ent, page);
    if (g.bboxValid(b)) box = g.bboxUnion(box, b);
  }
  return box;
}

const FILLED = new Set(['room', 'wall', 'part', 'opening', 'slab', 'roofPlane', 'footing', 'beam']);

export function hitTest(ent, page, pt, tol) {
  if (ent.type === 'fixture') {
    const reach = Math.max(tol, ((ent.footprint || 12) * (ent.scale || 1)) / 2);
    return g.dist(ent.p, pt) <= reach;
  }
  if (ent.type === 'text') {
    const box = g.bboxExpand(bboxOf(ent, page), tol);
    return g.bboxContainsPoint(box, pt);
  }
  const paths = outlines(ent, page);
  for (const path of paths) {
    const { pts, closed } = path;
    if (pts.length === 1) {
      if (g.dist(pts[0], pt) <= tol) return true;
      continue;
    }
    if (closed && FILLED.has(ent.type) && g.pointInPolygon(pt, pts)) return true;
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i += 1) {
      if (g.distToSegment(pt, pts[i], pts[(i + 1) % pts.length]) <= tol) return true;
    }
  }
  if (ent.type === 'dim') {
    const dir = g.norm(g.sub(ent.b, ent.a));
    const n = g.mul(g.perp(dir), ent.offset);
    return g.distToSegment(pt, g.add(ent.a, n), g.add(ent.b, n)) <= tol;
  }
  return false;
}

/** Snap candidates contributed by an entity. */
export function snapPoints(ent, page) {
  const out = [];
  const push = (p, kind) => out.push({ p, kind });
  switch (ent.type) {
    case 'line':
    case 'dim':
      push(ent.a, 'endpoint');
      push(ent.b, 'endpoint');
      push(g.lerp(ent.a, ent.b, 0.5), 'midpoint');
      break;
    case 'wall':
      push(ent.a, 'endpoint');
      push(ent.b, 'endpoint');
      push(g.lerp(ent.a, ent.b, 0.5), 'midpoint');
      break;
    case 'rect':
    case 'part': {
      const c = g.rectCorners(ent.a, ent.b);
      c.forEach((p) => push(p, 'endpoint'));
      for (let i = 0; i < 4; i += 1) push(g.lerp(c[i], c[(i + 1) % 4], 0.5), 'midpoint');
      push(g.lerp(ent.a, ent.b, 0.5), 'center');
      break;
    }
    case 'circle':
      push(ent.c, 'center');
      push(g.vec(ent.c.x + ent.r, ent.c.y), 'quadrant');
      push(g.vec(ent.c.x - ent.r, ent.c.y), 'quadrant');
      push(g.vec(ent.c.x, ent.c.y + ent.r), 'quadrant');
      push(g.vec(ent.c.x, ent.c.y - ent.r), 'quadrant');
      break;
    case 'arc':
      push(ent.c, 'center');
      push(g.vec(ent.c.x + Math.cos(ent.a0) * ent.r, ent.c.y + Math.sin(ent.a0) * ent.r), 'endpoint');
      push(g.vec(ent.c.x + Math.cos(ent.a1) * ent.r, ent.c.y + Math.sin(ent.a1) * ent.r), 'endpoint');
      break;
    case 'polyline':
    case 'room':
    case 'slab':
    case 'roofPlane': {
      const pts = ent.pts;
      pts.forEach((p) => push(p, 'endpoint'));
      const closed = ent.closed || ent.type !== 'polyline';
      const n = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i += 1) push(g.lerp(pts[i], pts[(i + 1) % pts.length], 0.5), 'midpoint');
      break;
    }
    case 'footing':
    case 'beam':
      push(ent.a, 'endpoint');
      push(ent.b, 'endpoint');
      push(g.lerp(ent.a, ent.b, 0.5), 'midpoint');
      break;
    case 'fixture':
      push(ent.p, 'center');
      break;
    case 'text':
      push(ent.p, 'endpoint');
      break;
    case 'opening': {
      const f = openingFrame(ent, page);
      if (f) {
        push(f.start, 'endpoint');
        push(f.end, 'endpoint');
        push(f.center, 'center');
      }
      break;
    }
    default:
      break;
  }
  return out;
}

export function translate(ent, d) {
  const move = (p) => ({ x: p.x + d.x, y: p.y + d.y });
  switch (ent.type) {
    case 'line':
    case 'rect':
    case 'part':
    case 'dim':
    case 'wall':
    case 'footing':
    case 'beam':
      ent.a = move(ent.a);
      ent.b = move(ent.b);
      break;
    case 'circle':
    case 'arc':
      ent.c = move(ent.c);
      break;
    case 'polyline':
    case 'room':
    case 'slab':
    case 'roofPlane':
      ent.pts = ent.pts.map(move);
      break;
    case 'text':
    case 'fixture':
      ent.p = move(ent.p);
      break;
    case 'opening':
      break;
    default:
      break;
  }
  return ent;
}

/**
 * Entities whose geometry states a direction: they run from a to b, so "what
 * angle is this?" has an answer and can be set outright.
 */
const DIRECTIONAL = new Set(['line', 'wall', 'beam', 'dim']);

/**
 * Entities that carry no rotation at all. A rect and a part are stored as two
 * opposite corners, which can only describe an axis-aligned box — rotating one
 * would need a field the rest of the app (outlines, hit testing, the cut list,
 * the 3D build) does not read. Rather than silently rotate the corner points
 * and hand back a differently-shaped rectangle, these are refused by name.
 */
export const UNROTATABLE = new Set(['rect', 'part']);

export function canRotate(ent) {
  return !UNROTATABLE.has(ent.type);
}

/** The direction an entity points, in radians, or null if it has no direction. */
export function entityAngle(ent) {
  if (!ent) return null;
  if (DIRECTIONAL.has(ent.type)) return g.angleOf(g.sub(ent.b, ent.a));
  if (ent.type === 'footing' && ent.kind !== 'pad') return g.angleOf(g.sub(ent.b, ent.a));
  if (ent.type === 'fixture' || ent.type === 'text') return ent.rot || 0;
  return null;
}

/** The point a set-the-angle turn pivots about: where the entity starts. */
export function rotationPivot(ent, page) {
  if (!ent) return null;
  if (DIRECTIONAL.has(ent.type)) return g.clone(ent.a);
  if (ent.type === 'footing') return ent.kind === 'pad' ? g.clone(ent.a) : g.clone(ent.a);
  if (ent.type === 'fixture' || ent.type === 'text') return g.clone(ent.p);
  if (ent.type === 'circle' || ent.type === 'arc') return g.clone(ent.c);
  if (Array.isArray(ent.pts) && ent.pts.length) return g.polygonCentroid(ent.pts);
  const box = bboxOf(ent, page);
  return box && g.bboxValid(box) ? g.bboxCenter(box) : null;
}

/**
 * Turn an entity by `delta` radians about `pivot`.
 * @returns true if it turned, false if this kind of entity cannot.
 */
export function rotateEntity(ent, delta, pivot) {
  if (!canRotate(ent)) return false;
  const turn = (p) => g.rotate(p, delta, pivot);
  switch (ent.type) {
    case 'line':
    case 'dim':
    case 'wall':
    case 'beam':
      ent.a = turn(ent.a);
      ent.b = turn(ent.b);
      return true;
    case 'footing':
      ent.a = turn(ent.a);
      if (ent.kind !== 'pad') ent.b = turn(ent.b);
      return true;
    case 'circle':
      ent.c = turn(ent.c);
      return true;
    case 'arc': {
      ent.c = turn(ent.c);
      // Normalise the start but shift the end by the same amount, so the sweep
      // between them survives. Wrapping them independently would turn a 30°
      // arc into a 330° one.
      const start = g.normalizeAngle(ent.a0 + delta);
      ent.a1 = start + (ent.a1 - ent.a0);
      ent.a0 = start;
      return true;
    }
    case 'polyline':
    case 'room':
    case 'slab':
    case 'roofPlane':
      ent.pts = ent.pts.map(turn);
      return true;
    case 'text':
    case 'fixture':
      ent.p = turn(ent.p);
      // Wrapped, so turning something a hundred times does not accumulate an
      // ever-growing number that eventually loses precision.
      ent.rot = g.normalizeAngle((ent.rot || 0) + delta);
      return true;
    // An opening rides its host wall; turning the wall turns the opening.
    case 'opening':
      return true;
    default:
      return false;
  }
}

/**
 * Point an entity at an absolute angle, turning about where it starts so the
 * end a user grabbed stays put. Only entities that have an angle can be set to
 * one — everything else has to be turned by a delta instead.
 * @returns true if it was set.
 */
export function setEntityAngle(ent, radians, page) {
  const current = entityAngle(ent);
  if (current === null) return false;
  const pivot = rotationPivot(ent, page);
  if (!pivot) return false;
  return rotateEntity(ent, radians - current, pivot);
}

/** Grips shown when a single entity is selected. */
export function handlesOf(ent, page) {
  switch (ent.type) {
    case 'line':
    case 'wall':
    case 'dim':
    case 'footing':
    case 'beam':
      return [
        { name: 'a', p: ent.a },
        { name: 'b', p: ent.b },
      ];
    case 'rect':
    case 'part': {
      const c = g.rectCorners(ent.a, ent.b);
      return [
        { name: 'a', p: c[0] },
        { name: 'bx', p: c[1] },
        { name: 'b', p: c[2] },
        { name: 'ay', p: c[3] },
      ];
    }
    case 'circle':
      return [
        { name: 'c', p: ent.c },
        { name: 'r', p: g.vec(ent.c.x + ent.r, ent.c.y) },
      ];
    case 'arc':
      return [{ name: 'c', p: ent.c }];
    case 'polyline':
    case 'room':
    case 'slab':
    case 'roofPlane':
      return ent.pts.map((p, i) => ({ name: `p${i}`, p }));
    case 'text':
    case 'fixture':
      return [{ name: 'p', p: ent.p }];
    case 'opening': {
      const f = openingFrame(ent, page);
      return f ? [{ name: 'center', p: f.center }] : [];
    }
    default:
      return [];
  }
}

export function moveHandle(ent, name, target, page) {
  switch (ent.type) {
    case 'line':
    case 'wall':
    case 'dim':
    case 'footing':
    case 'beam':
      if (name === 'a') ent.a = g.clone(target);
      if (name === 'b') ent.b = g.clone(target);
      break;
    case 'rect':
    case 'part':
      if (name === 'a') ent.a = g.clone(target);
      else if (name === 'b') ent.b = g.clone(target);
      else if (name === 'bx') {
        ent.b = g.vec(target.x, ent.b.y);
        ent.a = g.vec(ent.a.x, target.y);
      } else if (name === 'ay') {
        ent.a = g.vec(target.x, ent.a.y);
        ent.b = g.vec(ent.b.x, target.y);
      }
      break;
    case 'circle':
      if (name === 'c') ent.c = g.clone(target);
      else ent.r = Math.max(g.EPS, g.dist(ent.c, target));
      break;
    case 'arc':
      if (name === 'c') ent.c = g.clone(target);
      break;
    case 'polyline':
    case 'room':
    case 'slab':
    case 'roofPlane': {
      const i = Number(name.slice(1));
      if (Number.isInteger(i) && ent.pts[i]) ent.pts[i] = g.clone(target);
      break;
    }
    case 'text':
    case 'fixture':
      ent.p = g.clone(target);
      break;
    case 'opening': {
      const wall = findEntity(page, ent.host);
      if (wall) {
        const total = wallLength(wall);
        const proj = g.closestPointOnSegment(target, wall.a, wall.b);
        const half = ent.width / 2 / (total || 1);
        ent.t = Math.max(half, Math.min(1 - half, proj.t ?? 0.5));
      }
      break;
    }
    default:
      break;
  }
  return ent;
}

/** Human-readable summary used by the properties panel and schedules. */
export function describe(ent) {
  return ENTITY_LABELS[ent.type] || ent.type;
}
