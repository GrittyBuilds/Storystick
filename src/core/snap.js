// Snapping: object snaps (endpoint / midpoint / centre / quadrant / on-edge /
// intersection), grid snap and ortho constraint.

import * as g from './geometry.js';
import { snapPoints, outlines } from './entities.js';

export const SNAP_PRIORITY = {
  endpoint: 0,
  intersection: 1,
  center: 2,
  midpoint: 3,
  quadrant: 4,
  perpendicular: 5,
  edge: 6,
  grid: 9,
};

export const SNAP_LABELS = {
  endpoint: 'Endpoint',
  intersection: 'Intersection',
  center: 'Center',
  midpoint: 'Midpoint',
  quadrant: 'Quadrant',
  perpendicular: 'Perpendicular',
  edge: 'On edge',
  grid: 'Grid',
};

/**
 * Resolve a raw model-space point to a snapped point.
 * @param {object} ctx { project, page, tolerance (model units), exclude:Set, from:Point|null, ortho:boolean }
 * @returns {{ point, kind, source }} kind is null when nothing snapped.
 */
export function resolveSnap(raw, ctx) {
  const { project, page, tolerance } = ctx;
  const exclude = ctx.exclude || new Set();
  let best = null;

  const consider = (p, kind, source) => {
    const d = g.dist(p, raw);
    if (d > tolerance) return;
    const rank = SNAP_PRIORITY[kind] ?? 8;
    if (!best || rank < best.rank || (rank === best.rank && d < best.d)) {
      best = { point: { x: p.x, y: p.y }, kind, source, d, rank };
    }
  };

  if (project.snapObject) {
    const visible = page.entities.filter((e) => {
      if (exclude.has(e.id)) return false;
      const layer = project.layers.find((l) => l.id === e.layer);
      return layer ? layer.visible : true;
    });

    for (const ent of visible) {
      for (const cand of snapPoints(ent, page)) consider(cand.p, cand.kind, ent);
    }

    // Nearest point on an edge, and edge/edge intersections nearby.
    const nearSegments = [];
    for (const ent of visible) {
      for (const path of outlines(ent, page)) {
        const n = path.closed ? path.pts.length : path.pts.length - 1;
        for (let i = 0; i < n; i += 1) {
          const a = path.pts[i];
          const b = path.pts[(i + 1) % path.pts.length];
          const near = g.closestPointOnSegment(raw, a, b);
          if (g.dist(near, raw) <= tolerance) {
            nearSegments.push({ a, b, ent });
            consider(near, 'edge', ent);
          }
        }
      }
    }
    for (let i = 0; i < nearSegments.length; i += 1) {
      for (let j = i + 1; j < nearSegments.length; j += 1) {
        const s1 = nearSegments[i];
        const s2 = nearSegments[j];
        if (s1.ent === s2.ent) continue;
        const x = g.segmentIntersect(s1.a, s1.b, s2.a, s2.b);
        if (x) consider(x, 'intersection', s1.ent);
      }
    }

    // Perpendicular foot from the rubber-band origin.
    if (ctx.from) {
      for (const seg of nearSegments) {
        const foot = g.closestPointOnSegment(ctx.from, seg.a, seg.b);
        consider(foot, 'perpendicular', seg.ent);
      }
    }
  }

  if (best) return { point: best.point, kind: best.kind, source: best.source };

  if (project.snapGrid && project.gridSize > 0) {
    const p = g.vec(g.roundTo(raw.x, project.gridSize), g.roundTo(raw.y, project.gridSize));
    if (g.dist(p, raw) <= tolerance) return { point: p, kind: 'grid', source: null };
  }

  return { point: { x: raw.x, y: raw.y }, kind: null, source: null };
}

/** Apply ortho / 45° constraint relative to an anchor point. */
export function applyConstraint(anchor, point, mode) {
  if (!anchor || !mode) return point;
  const step = mode === 'ortho' ? Math.PI / 2 : Math.PI / 4;
  return g.constrainAngle(anchor, point, step);
}
