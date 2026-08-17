// Turn a 2D Storystick sheet into 3D solids.
//
// This is deliberately renderer-agnostic and DOM-free: it takes a project and a
// page and returns plain typed-array meshes, so it can be unit tested in Node
// and consumed by the WebGL viewer or any exporter.
//
// The massing is honest rather than photographic: walls get real thickness and
// height, openings are real voids, rooms become floor slabs, and the roof is a
// simple gable or hip generated from the footprint. Nothing here is a
// construction document — it is a way to see what you have drawn.

import * as g from '../core/geometry.js';
import {
  wallSpans,
  wallLength,
  openingsForWall,
  openingSill,
  openingHead,
  roofHeightAt,
  roofRidgeHeight,
  beamWidth,
} from '../core/entities.js';
import {
  MeshBuilder,
  extrudePolygon,
  boxFromRect,
  meshBounds,
  boundsValid,
  triangulate,
} from './mesh.js';

/** Plotted depth of a beam, from its nominal size. */
function beamDepth(beam) {
  const nominal = Number(String(beam.size || '2x10').split('x')[1]);
  if (!Number.isFinite(nominal)) return 9.25;
  return nominal >= 8 ? nominal - 0.75 : nominal - 0.5;
}

export const MATERIALS = {
  wallNew: { color: [0.86, 0.85, 0.81], label: 'New wall' },
  wallExisting: { color: [0.72, 0.74, 0.77], label: 'Existing wall' },
  wallDemo: { color: [0.73, 0.21, 0.21], opacity: 0.45, label: 'To be removed' },
  floor: { color: [0.62, 0.58, 0.52], label: 'Floor' },
  ceiling: { color: [0.9, 0.9, 0.88], label: 'Ceiling' },
  roof: { color: [0.30, 0.34, 0.39], label: 'Roof' },
  concrete: { color: [0.68, 0.68, 0.66], label: 'Concrete' },
  steel: { color: [0.42, 0.45, 0.49], label: 'Beam' },
  glass: { color: [0.42, 0.62, 0.78], opacity: 0.38, label: 'Glazing' },
  part: { color: [0.72, 0.60, 0.42], label: 'Woodworking part' },
  trim: { color: [0.95, 0.95, 0.93], label: 'Trim' },
};

const DEFAULTS = {
  wallHeight: 96,
  floorThickness: 10,
  roofPitch: 6, // rise per 12 of run
  roofOverhang: 12,
  roofStyle: 'gable', // 'gable' | 'hip' | 'flat' | 'none'
  includeFloors: true,
  includeCeilings: false,
  includeRoof: true,
  includeParts: true,
  glassThickness: 0.75,
};

class Scene {
  constructor() {
    this.builders = new Map();
  }

  for(material) {
    if (!this.builders.has(material)) this.builders.set(material, new MeshBuilder(material));
    return this.builders.get(material);
  }

  build() {
    return [...this.builders.values()].filter((b) => b.triangleCount > 0).map((b) => b.build());
  }
}

function wallMaterial(status) {
  if (status === 'demo') return 'wallDemo';
  if (status === 'existing') return 'wallExisting';
  return 'wallNew';
}

/** Plan-space quad for a slice of a wall, as {x,y} points. */
function wallSlice(wall, from, to, extend = { start: 0, end: 0 }) {
  const total = wallLength(wall) || 1;
  const stretched = total + extend.start + extend.end;
  const a = g.add(wall.a, g.mul(g.norm(g.sub(wall.a, wall.b)), extend.start));
  const b = g.add(wall.b, g.mul(g.norm(g.sub(wall.b, wall.a)), extend.end));
  return g.thickSegmentQuad(a, b, wall.thickness, (from + extend.start) / stretched, (to + extend.start) / stretched);
}

/**
 * How far each end of a wall should run past its own endpoint so the outside of
 * a corner is filled in. Each wall box stops at its centreline endpoint, which
 * leaves a notch of half the neighbour's thickness at every corner; extending
 * into the neighbour closes it. Only the full-height end spans are extended —
 * an opening near the end must not grow with it.
 */
function cornerExtensions(wall, walls) {
  const tol = 1e-6;
  const reach = (point) => {
    let best = 0;
    for (const other of walls) {
      if (other === wall) continue;
      const near = g.dist(other.a, point) < tol + 0.5 || g.dist(other.b, point) < tol + 0.5;
      if (near) best = Math.max(best, other.thickness / 2);
    }
    return best;
  };
  return { start: reach(wall.a), end: reach(wall.b) };
}

function addWall(scene, wall, page, opts, neighbours = [], base = 0) {
  const total = wallLength(wall);
  if (total < 1e-6) return { openings: 0 };
  const material = wall.layer === 'foundation' ? 'concrete' : wallMaterial(wall.status);
  const builder = scene.for(material);
  // A wall carries its own height when it has one — a basement wall and the
  // wall above it are not the same height, and the model has to say so.
  const height = wall.height ?? opts.wallHeight;
  const corners = opts.mitreCorners === false ? { start: 0, end: 0 } : cornerExtensions(wall, neighbours);

  // Full-height sections between the openings; the first and last also fill in
  // the corner where they meet another wall.
  const spans = wallSpans(wall, page);
  for (let i = 0; i < spans.length; i += 1) {
    const [from, to] = spans[i];
    const extend = {
      start: from < 1e-6 ? corners.start : 0,
      end: to > total - 1e-6 ? corners.end : 0,
    };
    extrudePolygon(builder, wallSlice(wall, from, to, extend), base, base + height);
  }

  // Headers above every opening, sills below every window.
  const openings = openingsForWall(page, wall.id);
  for (const opening of openings) {
    const center = opening.t * total;
    const from = Math.max(0, center - opening.width / 2);
    const to = Math.min(total, center + opening.width / 2);
    if (to <= from) continue;
    const quad = wallSlice(wall, from, to);

    // `height` is the unit height; the head sits that far above the sill.
    const sill = Math.max(0, openingSill(opening));
    const head = Math.min(height, openingHead(opening));

    if (head < height) extrudePolygon(builder, quad, base + head, base + height);
    if (sill > 0) extrudePolygon(builder, quad, base, base + Math.min(sill, head));

    if (opening.kind === 'window' && head > sill) {
      // A pane centred in the wall thickness.
      const dir = g.norm(g.sub(wall.b, wall.a));
      const normal = g.perp(dir);
      const half = opts.glassThickness / 2;
      const start = g.add(wall.a, g.mul(dir, from));
      const end = g.add(wall.a, g.mul(dir, to));
      const pane = [
        g.add(start, g.mul(normal, half)),
        g.add(end, g.mul(normal, half)),
        g.sub(end, g.mul(normal, half)),
        g.sub(start, g.mul(normal, half)),
      ];
      extrudePolygon(scene.for('glass'), pane, base + sill, base + head);
    }
  }
  return { openings: openings.length };
}

function addRoomSlabs(scene, page, opts, base = 0) {
  let floorArea = 0;
  for (const ent of page.entities) {
    if (ent.type !== 'room' || ent.pts.length < 3) continue;
    floorArea += Math.abs(g.polygonArea(ent.pts));
    if (opts.includeFloors) {
      extrudePolygon(scene.for('floor'), ent.pts, base - opts.floorThickness, base);
    }
    if (opts.includeCeilings) {
      const top = base + opts.wallHeight;
      extrudePolygon(scene.for('ceiling'), ent.pts, top, top + 1);
    }
  }
  return floorArea;
}

/**
 * Everything below the floor: footings, slabs and the beams that carry the
 * bearing walls. Each carries its own elevation, so a basement lands where it
 * is drawn rather than where the viewer guesses.
 */
function addSubstructure(scene, page) {
  const stats = { footings: 0, slabs: 0, beams: 0 };
  for (const ent of page.entities) {
    if (ent.type === 'footing') {
      const top = -(ent.depthBelowGrade ?? 42);
      const bottom = top - (ent.thickness || 8);
      if (ent.kind === 'pad') {
        const halfW = ent.width / 2;
        const halfL = (ent.length || ent.width) / 2;
        boxFromRect(
          scene.for('concrete'),
          ent.a.x - halfW,
          ent.a.y - halfL,
          ent.a.x + halfW,
          ent.a.y + halfL,
          bottom,
          top
        );
      } else {
        extrudePolygon(
          scene.for('concrete'),
          g.thickSegmentQuad(ent.a, ent.b, ent.width),
          bottom,
          top
        );
      }
      stats.footings += 1;
    } else if (ent.type === 'slab' && ent.pts.length >= 3) {
      const top = ent.topElevation ?? 0;
      extrudePolygon(scene.for('concrete'), ent.pts, top - (ent.thickness || 4), top);
      stats.slabs += 1;
    } else if (ent.type === 'beam') {
      const depth = beamDepth(ent);
      const top = ent.elevation ?? 0;
      extrudePolygon(
        scene.for('steel'),
        g.thickSegmentQuad(ent.a, ent.b, beamWidth(ent)),
        top - depth,
        top
      );
      stats.beams += 1;
    }
  }
  return stats;
}

/**
 * Roof planes exactly as drawn: each vertex is lifted to the height the pitch
 * puts it at, so a hand-drawn roof in plan becomes the roof in 3D instead of
 * being replaced by a guessed gable.
 */
function addDrawnRoof(scene, page, thickness = 6) {
  const builder = scene.for('roof');
  let planes = 0;
  let ridgeHeight = 0;
  for (const ent of page.entities) {
    if (ent.type !== 'roofPlane' || ent.pts.length < 3) continue;
    const lift = (p) => roofHeightAt(ent, p);
    const tris = triangulate(ent.pts);
    for (const [ia, ib, ic] of tris) {
      const a = ent.pts[ia];
      const b = ent.pts[ib];
      const c = ent.pts[ic];
      const A = [a.x, lift(a), a.y];
      const B = [b.x, lift(b), b.y];
      const C = [c.x, lift(c), c.y];
      const At = [a.x, lift(a) + thickness, a.y];
      const Bt = [b.x, lift(b) + thickness, b.y];
      const Ct = [c.x, lift(c) + thickness, c.y];
      builder.triangle(At, Bt, Ct);
      builder.triangle(C, B, A);
    }
    // Fascia around the perimeter, so the roof reads as a solid from the side.
    for (let i = 0; i < ent.pts.length; i += 1) {
      const a = ent.pts[i];
      const b = ent.pts[(i + 1) % ent.pts.length];
      const ha = lift(a);
      const hb = lift(b);
      builder.quad(
        [a.x, ha, a.y],
        [b.x, hb, b.y],
        [b.x, hb + thickness, b.y],
        [a.x, ha + thickness, a.y]
      );
    }
    planes += 1;
    ridgeHeight = Math.max(ridgeHeight, roofRidgeHeight(ent));
  }
  return planes ? { style: 'drawn', planes, ridgeHeight } : null;
}

function addParts(scene, page) {
  let count = 0;
  for (const ent of page.entities) {
    if (ent.type !== 'part') continue;
    const thickness = Math.max(0.125, ent.thickness || 0.75);
    boxFromRect(scene.for('part'), ent.a.x, ent.a.y, ent.b.x, ent.b.y, 0, thickness);
    count += 1;
  }
  return count;
}

/** Outer footprint of every wall on the sheet, in plan space. */
export function wallFootprint(page) {
  let box = null;
  for (const ent of page.entities) {
    if (ent.type !== 'wall') continue;
    const total = wallLength(ent);
    if (total < 1e-6) continue;
    box = g.bboxUnion(box, g.bboxOfPoints(g.thickSegmentQuad(ent.a, ent.b, ent.thickness)));
  }
  return box;
}

/** Double-sided quad, so a roof plane reads from above and below. */
function roofQuad(builder, a, b, c, d) {
  builder.quad(a, b, c, d);
  builder.quad(d, c, b, a);
}

function addRoof(scene, footprint, opts) {
  if (!footprint || opts.roofStyle === 'none') return null;
  const builder = scene.for('roof');
  const o = opts.roofOverhang;
  const eave = {
    minX: footprint.minX - o,
    maxX: footprint.maxX + o,
    minZ: footprint.minY - o,
    maxZ: footprint.maxY + o,
  };
  const wallTop = opts.wallHeight;

  if (opts.roofStyle === 'flat') {
    const t = 6;
    boxFromRect(builder, eave.minX, eave.minZ, eave.maxX, eave.maxZ, wallTop, wallTop + t);
    return { style: 'flat', ridgeHeight: wallTop + t };
  }

  const spanX = eave.maxX - eave.minX;
  const spanZ = eave.maxZ - eave.minZ;
  const ridgeAlongX = spanX >= spanZ;
  const run = (ridgeAlongX ? spanZ : spanX) / 2;
  const rise = (run * opts.roofPitch) / 12;
  const ridgeY = wallTop + rise;

  if (opts.roofStyle === 'hip') {
    const hipInset = Math.min(run, (ridgeAlongX ? spanX : spanZ) / 2);
    if (ridgeAlongX) {
      const midZ = (eave.minZ + eave.maxZ) / 2;
      const r0 = [eave.minX + hipInset, ridgeY, midZ];
      const r1 = [eave.maxX - hipInset, ridgeY, midZ];
      roofQuad(
        builder,
        [eave.minX, wallTop, eave.minZ],
        [eave.maxX, wallTop, eave.minZ],
        r1,
        r0
      );
      roofQuad(builder, [eave.maxX, wallTop, eave.maxZ], [eave.minX, wallTop, eave.maxZ], r0, r1);
      builder.triangle([eave.minX, wallTop, eave.minZ], r0, [eave.minX, wallTop, eave.maxZ]);
      builder.triangle([eave.minX, wallTop, eave.maxZ], r0, [eave.minX, wallTop, eave.minZ]);
      builder.triangle([eave.maxX, wallTop, eave.maxZ], r1, [eave.maxX, wallTop, eave.minZ]);
      builder.triangle([eave.maxX, wallTop, eave.minZ], r1, [eave.maxX, wallTop, eave.maxZ]);
    } else {
      const midX = (eave.minX + eave.maxX) / 2;
      const r0 = [midX, ridgeY, eave.minZ + hipInset];
      const r1 = [midX, ridgeY, eave.maxZ - hipInset];
      roofQuad(builder, [eave.minX, wallTop, eave.minZ], [eave.minX, wallTop, eave.maxZ], r1, r0);
      roofQuad(builder, [eave.maxX, wallTop, eave.maxZ], [eave.maxX, wallTop, eave.minZ], r0, r1);
      builder.triangle([eave.minX, wallTop, eave.minZ], r0, [eave.maxX, wallTop, eave.minZ]);
      builder.triangle([eave.maxX, wallTop, eave.minZ], r0, [eave.minX, wallTop, eave.minZ]);
      builder.triangle([eave.maxX, wallTop, eave.maxZ], r1, [eave.minX, wallTop, eave.maxZ]);
      builder.triangle([eave.minX, wallTop, eave.maxZ], r1, [eave.maxX, wallTop, eave.maxZ]);
    }
    return { style: 'hip', ridgeHeight: ridgeY, rise };
  }

  // Gable: two sloped planes plus a triangular gable wall at each end.
  const gable = scene.for('wallNew');
  if (ridgeAlongX) {
    const midZ = (eave.minZ + eave.maxZ) / 2;
    roofQuad(
      builder,
      [eave.minX, wallTop, eave.minZ],
      [eave.maxX, wallTop, eave.minZ],
      [eave.maxX, ridgeY, midZ],
      [eave.minX, ridgeY, midZ]
    );
    roofQuad(
      builder,
      [eave.maxX, wallTop, eave.maxZ],
      [eave.minX, wallTop, eave.maxZ],
      [eave.minX, ridgeY, midZ],
      [eave.maxX, ridgeY, midZ]
    );
    for (const x of [footprint.minX, footprint.maxX]) {
      const apex = [x, ridgeY, midZ];
      gable.triangle([x, wallTop, footprint.minY], [x, wallTop, footprint.maxY], apex);
      gable.triangle([x, wallTop, footprint.maxY], [x, wallTop, footprint.minY], apex);
    }
  } else {
    const midX = (eave.minX + eave.maxX) / 2;
    roofQuad(
      builder,
      [eave.minX, wallTop, eave.maxZ],
      [eave.minX, wallTop, eave.minZ],
      [midX, ridgeY, eave.minZ],
      [midX, ridgeY, eave.maxZ]
    );
    roofQuad(
      builder,
      [eave.maxX, wallTop, eave.minZ],
      [eave.maxX, wallTop, eave.maxZ],
      [midX, ridgeY, eave.maxZ],
      [midX, ridgeY, eave.minZ]
    );
    for (const z of [footprint.minY, footprint.maxY]) {
      const apex = [midX, ridgeY, z];
      gable.triangle([footprint.minX, wallTop, z], [footprint.maxX, wallTop, z], apex);
      gable.triangle([footprint.maxX, wallTop, z], [footprint.minX, wallTop, z], apex);
    }
  }
  return { style: 'gable', ridgeHeight: ridgeY, rise };
}

/**
 * Build the 3D model for one sheet.
 * @returns {{ meshes, bounds, stats }}
 */
export function buildModel(project, page, options = {}) {
  return buildFromPages(project, [page], options);
}

/** The floor level a sheet's work sits at, in model inches above the datum. */
export function pageElevation(project, page) {
  if (Number.isFinite(page.elevation)) return page.elevation;
  if (page.kind !== 'foundation') return 0;
  // A foundation sheet sits one basement below, deep enough for the walls
  // drawn on it. Taking the depth from the walls rather than a constant means
  // a 7-foot crawl space and a 9-foot basement both land correctly.
  const heights = page.entities
    .filter((e) => e.type === 'wall')
    .map((e) => e.height ?? project.wallHeight ?? DEFAULTS.wallHeight);
  return -(heights.length ? Math.max(...heights) : project.wallHeight ?? DEFAULTS.wallHeight);
}

/**
 * The sheets that describe the building itself, as opposed to the systems that
 * run through it. An electrical sheet has no geometry of its own — it traces
 * the plan — so including it would model the same walls twice.
 */
const MASSING_KINDS = new Set(['plan', 'foundation', 'roof']);

export function massingPages(project) {
  return project.pages.filter((p) => MASSING_KINDS.has(p.kind) && !p.basePageId);
}

/** The whole building: every massing sheet stacked at its own elevation. */
export function buildBuildingModel(project, options = {}) {
  const pages = massingPages(project);
  return buildFromPages(project, pages.length ? pages : [project.pages[0]], options);
}

function buildFromPages(project, pages, options = {}) {
  const opts = {
    ...DEFAULTS,
    wallHeight: project.wallHeight ?? DEFAULTS.wallHeight,
    ...options,
  };
  const scene = new Scene();
  const layers = new Map(project.layers.map((l) => [l.id, l]));

  let walls = 0;
  let openings = 0;
  let parts = 0;
  let floorArea = 0;
  let drawnRoof = null;
  const substructure = { footings: 0, slabs: 0, beams: 0 };
  let footprint = null;

  for (const page of pages) {
    const visible = page.entities.filter((e) => {
      const layer = layers.get(e.layer);
      return !layer || layer.visible;
    });
    const visiblePage = { ...page, entities: visible };
    const base = pageElevation(project, page);

    const wallEntities = visible.filter((e) => e.type === 'wall');
    for (const ent of wallEntities) {
      openings += addWall(scene, ent, visiblePage, opts, wallEntities, base).openings;
    }
    walls += wallEntities.length;

    floorArea += addRoomSlabs(scene, visiblePage, opts, base);
    if (opts.includeParts) parts += addParts(scene, visiblePage);

    const sub = addSubstructure(scene, visiblePage);
    substructure.footings += sub.footings;
    substructure.slabs += sub.slabs;
    substructure.beams += sub.beams;

    if (opts.includeRoof) {
      const drawn = addDrawnRoof(scene, visiblePage);
      if (drawn) {
        drawnRoof = drawnRoof
          ? {
              ...drawnRoof,
              planes: drawnRoof.planes + drawn.planes,
              ridgeHeight: Math.max(drawnRoof.ridgeHeight, drawn.ridgeHeight),
            }
          : drawn;
      }
    }
    if (page.kind !== 'foundation') footprint = g.bboxUnion(footprint, wallFootprint(visiblePage));
  }

  // Only guess a roof when nobody drew one. A drawn roof always wins — the
  // point of drawing it is that the generated gable was not what was meant.
  const roof =
    drawnRoof || (opts.includeRoof && walls > 0 ? addRoof(scene, footprint, opts) : null);

  const meshes = scene.build();
  const bounds = meshBounds(meshes);

  return {
    meshes,
    bounds: boundsValid(bounds) ? bounds : { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
    stats: {
      walls,
      openings,
      parts,
      floorArea,
      roof,
      substructure,
      sheets: pages.map((p) => p.name),
      triangles: meshes.reduce((n, m) => n + m.triangleCount, 0),
      empty: meshes.length === 0,
    },
    options: opts,
  };
}

export const MODEL_DEFAULTS = DEFAULTS;
