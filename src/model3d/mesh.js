// Mesh primitives for the 3D view.
//
// Coordinate mapping from the 2D drawing to 3D:
//   plan x  ->  3D x
//   plan y  ->  3D z      (the drawing is y-down, which reads as "north up")
//   height  ->  3D y      (up)
//
// Everything is in model inches, the same unit the 2D drawing uses.

export class MeshBuilder {
  constructor(material = 'default') {
    this.material = material;
    this.positions = [];
    this.normals = [];
    this.indices = [];
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  get triangleCount() {
    return this.indices.length / 3;
  }

  /** Add a triangle with a flat normal. Vertices are [x,y,z] arrays. */
  triangle(a, b, c, normal) {
    const n = normal || faceNormal(a, b, c);
    const base = this.vertexCount;
    for (const v of [a, b, c]) {
      this.positions.push(v[0], v[1], v[2]);
      this.normals.push(n[0], n[1], n[2]);
    }
    this.indices.push(base, base + 1, base + 2);
    return this;
  }

  /** Add a planar quad as two triangles, wound a→b→c→d. */
  quad(a, b, c, d, normal) {
    const n = normal || faceNormal(a, b, c) || faceNormal(a, c, d);
    this.triangle(a, b, c, n);
    this.triangle(a, c, d, n);
    return this;
  }

  merge(other) {
    const offset = this.vertexCount;
    // Element-wise, not spread: `push(...array)` passes every element as an
    // argument and overflows the call stack on a large mesh.
    for (let i = 0; i < other.positions.length; i += 1) this.positions.push(other.positions[i]);
    for (let i = 0; i < other.normals.length; i += 1) this.normals.push(other.normals[i]);
    for (let i = 0; i < other.indices.length; i += 1) this.indices.push(other.indices[i] + offset);
    return this;
  }

  build() {
    return {
      material: this.material,
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      indices: (this.vertexCount > 65535 ? Uint32Array : Uint16Array).from(this.indices),
      triangleCount: this.triangleCount,
    };
  }
}

export function faceNormal(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return null;
  return [nx / len, ny / len, nz / len];
}

/**
 * Extrude a closed planar polygon (given as plan-space {x,y} points) vertically
 * between two heights. Produces caps plus side walls, wound so every face's
 * normal points out of the solid.
 */
export function extrudePolygon(builder, points, bottom, top, opts = {}) {
  if (points.length < 3 || top <= bottom) return builder;
  // Work with a consistently wound copy: counter-clockwise in plan space.
  const pts = signedArea(points) < 0 ? [...points].reverse() : [...points];
  const tris = triangulate(pts);

  if (opts.caps !== false) {
    for (const [i0, i1, i2] of tris) {
      const a = pts[i0];
      const b = pts[i1];
      const c = pts[i2];
      // Top cap faces up; reversed winding for the bottom cap so it faces down.
      builder.triangle([a.x, top, a.y], [c.x, top, c.y], [b.x, top, b.y], [0, 1, 0]);
      builder.triangle([a.x, bottom, a.y], [b.x, bottom, b.y], [c.x, bottom, c.y], [0, -1, 0]);
    }
  }

  if (opts.sides !== false) {
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const dx = q.x - p.x;
      const dz = q.y - p.y;
      const len = Math.hypot(dx, dz);
      if (len < 1e-9) continue;
      const n = [dz / len, 0, -dx / len];
      // Wound so the right-hand rule agrees with `n`: winding and normal must
      // point the same way or backface culling removes the face you can see.
      builder.quad(
        [p.x, bottom, p.y],
        [p.x, top, p.y],
        [q.x, top, q.y],
        [q.x, bottom, q.y],
        n
      );
    }
  }
  return builder;
}

/** Axis-aligned box helper, in plan coordinates plus a height range. */
export function boxFromRect(builder, x0, z0, x1, z1, bottom, top) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minZ = Math.min(z0, z1);
  const maxZ = Math.max(z0, z1);
  return extrudePolygon(
    builder,
    [
      { x: minX, y: minZ },
      { x: maxX, y: minZ },
      { x: maxX, y: maxZ },
      { x: minX, y: maxZ },
    ],
    bottom,
    top
  );
}

export function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

function isConvex(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
}

function pointInTriangle(p, a, b, c) {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Ear-clipping triangulation of a simple polygon. Input must be counter-clockwise
 * and non-self-intersecting. Returns index triples into the input array.
 */
export function triangulate(points) {
  const n = points.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];

  const remaining = points.map((_, i) => i);
  const triangles = [];
  let guard = 0;

  while (remaining.length > 3 && guard < n * n + 16) {
    guard += 1;
    let clipped = false;
    for (let i = 0; i < remaining.length; i += 1) {
      const iPrev = remaining[(i - 1 + remaining.length) % remaining.length];
      const iCurr = remaining[i];
      const iNext = remaining[(i + 1) % remaining.length];
      const a = points[iPrev];
      const b = points[iCurr];
      const c = points[iNext];
      if (!isConvex(a, b, c)) continue;

      let containsOther = false;
      for (const j of remaining) {
        if (j === iPrev || j === iCurr || j === iNext) continue;
        if (pointInTriangle(points[j], a, b, c)) {
          containsOther = true;
          break;
        }
      }
      if (containsOther) continue;

      triangles.push([iPrev, iCurr, iNext]);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    // Degenerate or self-intersecting input: fall back to a fan so the caller
    // still gets a closed-ish surface rather than nothing.
    if (!clipped) break;
  }

  if (remaining.length === 3) {
    triangles.push([remaining[0], remaining[1], remaining[2]]);
  } else if (remaining.length > 3) {
    for (let i = 1; i < remaining.length - 1; i += 1) {
      triangles.push([remaining[0], remaining[i], remaining[i + 1]]);
    }
  }
  return triangles;
}

/** Bounding box of a set of built meshes. */
export function meshBounds(meshes) {
  const box = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i];
      const y = mesh.positions[i + 1];
      const z = mesh.positions[i + 2];
      if (x < box.minX) box.minX = x;
      if (y < box.minY) box.minY = y;
      if (z < box.minZ) box.minZ = z;
      if (x > box.maxX) box.maxX = x;
      if (y > box.maxY) box.maxY = y;
      if (z > box.maxZ) box.maxZ = z;
    }
  }
  return box;
}

export function boundsValid(box) {
  return Number.isFinite(box.minX) && box.maxX >= box.minX;
}
