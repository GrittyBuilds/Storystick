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
import { wallSpans, wallLength, openingsForWall } from '../core/entities.js';
import { MeshBuilder, extrudePolygon, boxFromRect, meshBounds, boundsValid } from './mesh.js';

export const MATERIALS = {
  wallNew: { color: [0.86, 0.85, 0.81], label: 'New wall' },
  wallExisting: { color: [0.72, 0.74, 0.77], label: 'Existing wall' },
  wallDemo: { color: [0.73, 0.21, 0.21], opacity: 0.45, label: 'To be removed' },
  floor: { color: [0.62, 0.58, 0.52], label: 'Floor' },
  ceiling: { color: [0.9, 0.9, 0.88], label: 'Ceiling' },
  roof: { color: [0.30, 0.34, 0.39], label: 'Roof' },
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
function wallSlice(wall, from, to) {
  const total = wallLength(wall) || 1;
  return g.thickSegmentQuad(wall.a, wall.b, wall.thickness, from / total, to / total);
}

function addWall(scene, wall, page, opts) {
  const total = wallLength(wall);
  if (total < 1e-6) return { openings: 0 };
  const material = wallMaterial(wall.status);
  const builder = scene.for(material);
  const height = opts.wallHeight;

  // Full-height sections between the openings.
  for (const [from, to] of wallSpans(wall, page)) {
    extrudePolygon(builder, wallSlice(wall, from, to), 0, height);
  }

  // Headers above every opening, sills below every window.
  const openings = openingsForWall(page, wall.id);
  for (const opening of openings) {
    const center = opening.t * total;
    const from = Math.max(0, center - opening.width / 2);
    const to = Math.min(total, center + opening.width / 2);
    if (to <= from) continue;
    const quad = wallSlice(wall, from, to);

    const head = Math.min(height, opening.height ?? (opening.kind === 'window' ? 48 : 80));
    const sill = opening.kind === 'window' ? Math.max(0, opening.sill ?? 36) : 0;

    if (head < height) extrudePolygon(builder, quad, head, height);
    if (sill > 0) extrudePolygon(builder, quad, 0, Math.min(sill, head));

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
      extrudePolygon(scene.for('glass'), pane, sill, head);
    }
  }
  return { openings: openings.length };
}

function addRoomSlabs(scene, page, opts) {
  let floorArea = 0;
  for (const ent of page.entities) {
    if (ent.type !== 'room' || ent.pts.length < 3) continue;
    floorArea += Math.abs(g.polygonArea(ent.pts));
    if (opts.includeFloors) {
      extrudePolygon(scene.for('floor'), ent.pts, -opts.floorThickness, 0);
    }
    if (opts.includeCeilings) {
      extrudePolygon(scene.for('ceiling'), ent.pts, opts.wallHeight, opts.wallHeight + 1);
    }
  }
  return floorArea;
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
  const opts = {
    ...DEFAULTS,
    wallHeight: project.wallHeight ?? DEFAULTS.wallHeight,
    ...options,
  };
  const scene = new Scene();
  const layers = new Map(project.layers.map((l) => [l.id, l]));
  const visible = page.entities.filter((e) => {
    const layer = layers.get(e.layer);
    return !layer || layer.visible;
  });
  const visiblePage = { ...page, entities: visible };

  let walls = 0;
  let openings = 0;
  for (const ent of visible) {
    if (ent.type !== 'wall') continue;
    walls += 1;
    openings += addWall(scene, ent, visiblePage, opts).openings;
  }

  const floorArea = addRoomSlabs(scene, visiblePage, opts);
  const parts = opts.includeParts ? addParts(scene, visiblePage) : 0;

  const footprint = wallFootprint(visiblePage);
  const roof = opts.includeRoof && walls > 0 ? addRoof(scene, footprint, opts) : null;

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
      triangles: meshes.reduce((n, m) => n + m.triangleCount, 0),
      empty: meshes.length === 0,
    },
    options: opts,
  };
}

export const MODEL_DEFAULTS = DEFAULTS;
