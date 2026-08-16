import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, activePage } from '../src/core/document.js';
import { makeWall, makeOpening, makeRoom, makePart } from '../src/core/entities.js';
import { buildModel, wallFootprint, MATERIALS } from '../src/model3d/build.js';
import {
  MeshBuilder,
  triangulate,
  extrudePolygon,
  signedArea,
  meshBounds,
  faceNormal,
} from '../src/model3d/mesh.js';
import { buildTemplate, TEMPLATES } from '../src/features/templates.js';

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

// --- solid membership -----------------------------------------------------
// Sampling vertices only tells you where corners are. To assert that a door
// opening is genuinely a void and that a header genuinely exists above it, cast
// a ray and count crossings: odd means the point is inside solid material.

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function rayHitsTriangle(origin, dir, a, b, c) {
  const EPS = 1e-10;
  const e1 = sub3(b, a);
  const e2 = sub3(c, a);
  const p = cross3(dir, e2);
  const det = dot3(e1, p);
  if (Math.abs(det) < EPS) return false;
  const inv = 1 / det;
  const t = sub3(origin, a);
  const u = dot3(t, p) * inv;
  if (u < 0 || u > 1) return false;
  const q = cross3(t, e1);
  const v = dot3(dir, q) * inv;
  if (v < 0 || u + v > 1) return false;
  return dot3(e2, q) * inv > EPS;
}

function vertexAt(mesh, index) {
  return [mesh.positions[index * 3], mesh.positions[index * 3 + 1], mesh.positions[index * 3 + 2]];
}

/** True when the point lies inside solid material of this mesh. */
function insideSolid(mesh, point) {
  // An irrational-ish direction so the ray never runs along a shared face.
  const dir = [0.5771234, 0.5773502, 0.5775891];
  let hits = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    if (
      rayHitsTriangle(
        point,
        dir,
        vertexAt(mesh, mesh.indices[i]),
        vertexAt(mesh, mesh.indices[i + 1]),
        vertexAt(mesh, mesh.indices[i + 2])
      )
    ) {
      hits += 1;
    }
  }
  return hits % 2 === 1;
}

function roomProject() {
  const project = createProject({ name: '3D' });
  project.wallHeight = 96;
  const page = activePage(project);
  const south = makeWall({ x: 0, y: 0 }, { x: 120, y: 0 }, 'walls', 6, 'new');
  const east = makeWall({ x: 120, y: 0 }, { x: 120, y: 96 }, 'walls', 6, 'new');
  const north = makeWall({ x: 120, y: 96 }, { x: 0, y: 96 }, 'walls', 6, 'new');
  const west = makeWall({ x: 0, y: 96 }, { x: 0, y: 0 }, 'walls', 6, 'new');
  page.entities.push(south, east, north, west);
  page.entities.push(
    makeOpening(south.id, 0.5, 'openings', 'door', 36, { height: 80 }),
    makeOpening(east.id, 0.5, 'openings', 'window', 24, { height: 60, sill: 36 })
  );
  page.entities.push(
    makeRoom([{ x: 3, y: 3 }, { x: 117, y: 3 }, { x: 117, y: 93 }, { x: 3, y: 93 }], 'rooms', 'Shop')
  );
  return { project, page, south, east };
}

// --- triangulation --------------------------------------------------------

test('triangulating an n-gon yields n-2 triangles', () => {
  assert.equal(triangulate(square).length, 2);
  const hexagon = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    hexagon.push({ x: Math.cos(a) * 10, y: Math.sin(a) * 10 });
  }
  assert.equal(triangulate(hexagon).length, 4);
});

test('ear clipping handles a concave (L-shaped) polygon', () => {
  const ell = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 20 },
    { x: 0, y: 20 },
  ];
  const tris = triangulate(ell);
  assert.equal(tris.length, 4);
  // The triangles must tile the polygon: their areas sum to the polygon area.
  const area = tris.reduce((sum, [i, j, k]) => {
    const a = ell[i];
    const b = ell[j];
    const c = ell[k];
    return sum + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
  }, 0);
  assert.ok(Math.abs(area - Math.abs(signedArea(ell))) < 1e-6);
});

test('triangulate copes with degenerate input instead of hanging', () => {
  assert.deepEqual(triangulate([{ x: 0, y: 0 }, { x: 1, y: 1 }]), []);
  const collinear = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
  ];
  assert.ok(triangulate(collinear).length >= 1);
});

// --- extrusion ------------------------------------------------------------

test('an extruded square is a closed box with outward normals', () => {
  const builder = new MeshBuilder('test');
  extrudePolygon(builder, square, 0, 8);
  const mesh = builder.build();
  // 2 caps × 2 triangles + 4 sides × 2 triangles.
  assert.equal(mesh.triangleCount, 12);

  const bounds = meshBounds([mesh]);
  assert.deepEqual(bounds, { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 8, maxZ: 10 });

  // Every normal is a unit vector.
  for (let i = 0; i < mesh.normals.length; i += 3) {
    const len = Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
    assert.ok(Math.abs(len - 1) < 1e-5, 'normals are unit length');
  }

  // Side normals must point away from the centre of the box.
  const cx = 5;
  const cz = 5;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const ny = mesh.normals[i + 1];
    if (Math.abs(ny) > 0.5) continue; // skip caps
    const dx = mesh.positions[i] - cx;
    const dz = mesh.positions[i + 2] - cz;
    const dot = dx * mesh.normals[i] + dz * mesh.normals[i + 2];
    assert.ok(dot > 0, 'side normals face outward');
  }
});

test('extrusion winding is independent of the input winding', () => {
  const cw = new MeshBuilder('a');
  const ccw = new MeshBuilder('b');
  extrudePolygon(cw, [...square].reverse(), 0, 8);
  extrudePolygon(ccw, square, 0, 8);
  assert.equal(cw.build().triangleCount, ccw.build().triangleCount);
  assert.deepEqual(meshBounds([cw.build()]), meshBounds([ccw.build()]));
});

test('a zero-height or degenerate extrusion produces nothing', () => {
  const builder = new MeshBuilder('t');
  extrudePolygon(builder, square, 5, 5);
  extrudePolygon(builder, [{ x: 0, y: 0 }, { x: 1, y: 0 }], 0, 10);
  assert.equal(builder.triangleCount, 0);
});

test('faceNormal returns null for a degenerate triangle', () => {
  assert.equal(faceNormal([0, 0, 0], [1, 0, 0], [2, 0, 0]), null);
});

// --- model building -------------------------------------------------------

test('walls extrude to the project wall height', () => {
  const { project, page } = roomProject();
  const model = buildModel(project, page, { includeRoof: false, includeFloors: false });
  assert.equal(model.stats.walls, 4);
  assert.equal(model.stats.openings, 2);
  assert.equal(model.bounds.minY, 0);
  assert.equal(model.bounds.maxY, 96);
});

test('a door opening is a real void with a real header above it', () => {
  const { project, page } = roomProject();
  const model = buildModel(project, page, { includeRoof: false, includeFloors: false });
  const wall = model.meshes.find((m) => m.material === 'wallNew');
  assert.ok(wall);

  // The door sits mid-span on the south wall (z = 0), 36" wide, 80" head.
  assert.equal(insideSolid(wall, [60, 40, 0]), false, 'the doorway is open at 40" up');
  assert.equal(insideSolid(wall, [60, 79, 0]), false, 'the doorway is open just under the head');
  assert.equal(insideSolid(wall, [60, 88, 0]), true, 'a header spans the doorway');
  assert.equal(insideSolid(wall, [20, 40, 0]), true, 'the wall either side is still solid');
  assert.equal(insideSolid(wall, [100, 40, 0]), true, 'the wall either side is still solid');
});

test('a window opening has a sill below and a header above', () => {
  const { project, page } = roomProject();
  const model = buildModel(project, page, { includeRoof: false, includeFloors: false });
  const wall = model.meshes.find((m) => m.material === 'wallNew');

  // The window sits mid-span on the east wall (x = 120), sill 36", head 60".
  assert.equal(insideSolid(wall, [120, 20, 48]), true, 'solid below the sill');
  assert.equal(insideSolid(wall, [120, 48, 48]), false, 'open between sill and head');
  assert.equal(insideSolid(wall, [120, 78, 48]), true, 'solid above the head');
});

test('windows produce glazing between sill and head', () => {
  const { project, page } = roomProject();
  const model = buildModel(project, page, { includeRoof: false });
  const glass = model.meshes.find((m) => m.material === 'glass');
  assert.ok(glass, 'a glazing mesh exists');
  const bounds = meshBounds([glass]);
  assert.ok(Math.abs(bounds.minY - 36) < 1e-6, 'glazing starts at the sill');
  assert.ok(Math.abs(bounds.maxY - 60) < 1e-6, 'glazing stops at the head');
});

test('rooms become floor slabs below zero', () => {
  const { project, page } = roomProject();
  const model = buildModel(project, page, { includeRoof: false });
  const floor = model.meshes.find((m) => m.material === 'floor');
  assert.ok(floor);
  const bounds = meshBounds([floor]);
  assert.ok(bounds.minY < 0 && Math.abs(bounds.maxY) < 1e-9);
  assert.equal(model.stats.floorArea, 114 * 90);
});

test('a gable roof rises above the walls by pitch times run', () => {
  const { project, page } = roomProject();
  const overhang = 12;
  const pitch = 6;
  const model = buildModel(project, page, { roofStyle: 'gable', roofPitch: pitch, roofOverhang: overhang });
  assert.equal(model.stats.roof.style, 'gable');

  // The ridge runs along the longer eave span; the run is half the shorter one.
  const fp = wallFootprint(page);
  const spanX = fp.maxX - fp.minX + overhang * 2;
  const spanZ = fp.maxY - fp.minY + overhang * 2;
  const run = Math.min(spanX, spanZ) / 2;
  const expected = 96 + (run * pitch) / 12;

  assert.ok(Math.abs(model.stats.roof.rise - (run * pitch) / 12) < 1e-9);
  assert.ok(Math.abs(model.stats.roof.ridgeHeight - expected) < 1e-9);
  assert.ok(Math.abs(model.bounds.maxY - expected) < 1e-9);

  // A steeper pitch must produce a taller ridge over the same footprint.
  const steep = buildModel(project, page, { roofStyle: 'gable', roofPitch: 12, roofOverhang: overhang });
  assert.ok(steep.stats.roof.ridgeHeight > model.stats.roof.ridgeHeight);
});

test('roof styles are all buildable and hip never exceeds gable height', () => {
  const { project, page } = roomProject();
  const gable = buildModel(project, page, { roofStyle: 'gable' });
  const hip = buildModel(project, page, { roofStyle: 'hip' });
  const flat = buildModel(project, page, { roofStyle: 'flat' });
  const none = buildModel(project, page, { roofStyle: 'none' });
  assert.ok(hip.stats.roof.ridgeHeight <= gable.stats.roof.ridgeHeight + 1e-9);
  assert.equal(flat.stats.roof.style, 'flat');
  assert.equal(none.stats.roof, null);
  for (const model of [gable, hip, flat]) assert.ok(model.stats.triangles > 0);
});

test('wall status picks the matching material', () => {
  const project = createProject({});
  const page = activePage(project);
  page.entities.push(
    makeWall({ x: 0, y: 0 }, { x: 100, y: 0 }, 'walls', 6, 'new'),
    makeWall({ x: 0, y: 50 }, { x: 100, y: 50 }, 'existing', 6, 'existing'),
    makeWall({ x: 0, y: 100 }, { x: 100, y: 100 }, 'demo', 4.5, 'demo')
  );
  const model = buildModel(project, page, { includeRoof: false });
  const materials = new Set(model.meshes.map((m) => m.material));
  assert.ok(materials.has('wallNew'));
  assert.ok(materials.has('wallExisting'));
  assert.ok(materials.has('wallDemo'));
  for (const material of materials) assert.ok(MATERIALS[material], `${material} is a known material`);
});

test('woodworking parts become boards of their own thickness', () => {
  const project = createProject({});
  const page = activePage(project);
  page.entities.push(makePart({ x: 0, y: 0 }, { x: 48, y: 24 }, 'parts', { thickness: 0.75 }));
  const model = buildModel(project, page);
  assert.equal(model.stats.parts, 1);
  const board = model.meshes.find((m) => m.material === 'part');
  const bounds = meshBounds([board]);
  assert.equal(bounds.maxY, 0.75);
  assert.equal(bounds.maxX, 48);
  assert.equal(bounds.maxZ, 24);
});

test('hidden layers are left out of the model', () => {
  const { project, page } = roomProject();
  const before = buildModel(project, page, { includeRoof: false }).stats.walls;
  project.layers.find((l) => l.id === 'walls').visible = false;
  const after = buildModel(project, page, { includeRoof: false }).stats.walls;
  assert.equal(before, 4);
  assert.equal(after, 0);
});

test('an empty sheet builds an empty model without throwing', () => {
  const project = createProject({});
  const model = buildModel(project, activePage(project));
  assert.equal(model.stats.empty, true);
  assert.equal(model.stats.triangles, 0);
  assert.ok(Number.isFinite(model.bounds.maxX));
});

test('wallFootprint covers the outside face of the walls', () => {
  const { project, page } = roomProject();
  void project;
  const box = wallFootprint(page);
  assert.equal(box.minX, -3);
  assert.equal(box.maxX, 123);
  assert.equal(box.minY, -3);
  assert.equal(box.maxY, 99);
});

test('every template builds a finite 3D model', () => {
  for (const template of TEMPLATES) {
    const project = buildTemplate(template.id);
    for (const page of project.pages) {
      const model = buildModel(project, page);
      assert.ok(Number.isFinite(model.bounds.maxY), `${template.id}/${page.name} bounds`);
      for (const mesh of model.meshes) {
        for (const value of mesh.positions) {
          assert.ok(Number.isFinite(value), `${template.id}/${page.name} has a non-finite vertex`);
        }
        for (const value of mesh.normals) {
          assert.ok(Number.isFinite(value), `${template.id}/${page.name} has a non-finite normal`);
        }
        assert.equal(mesh.indices.length % 3, 0);
      }
    }
  }
});
