// Starter projects. Each returns a fully-formed project document.

import { createProject, makePage } from '../core/document.js';
import {
  makeWall,
  makeOpening,
  makeRoom,
  makeDim,
  makeText,
  makePart,
  makeRect,
} from '../core/entities.js';

const pt = (x, y) => ({ x, y });

function rectWalls(page, x, y, w, h, thickness, status = 'new') {
  const corners = [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)];
  const walls = [];
  for (let i = 0; i < 4; i += 1) {
    const wall = makeWall(corners[i], corners[(i + 1) % 4], 'walls', thickness, status);
    if (status === 'existing') wall.layer = 'existing';
    if (status === 'demo') wall.layer = 'demo';
    page.entities.push(wall);
    walls.push(wall);
  }
  return walls;
}

/** Flow a list of part specs onto a layout page in tidy rows. */
function layoutParts(page, specs, opts = {}) {
  const gap = opts.gap ?? 6;
  const maxWidth = opts.maxWidth ?? 240;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const spec of specs) {
    const w = spec.length;
    const h = spec.width;
    if (x > 0 && x + w > maxWidth) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    page.entities.push(
      makePart(pt(x, y), pt(x + w, y + h), 'parts', {
        name: spec.name,
        thickness: spec.thickness,
        material: spec.material,
        qty: spec.qty,
        notes: spec.notes || '',
      })
    );
    x += w + gap;
    rowHeight = Math.max(rowHeight, h);
  }
}

function blankBuilding() {
  const project = createProject({ name: 'New Building Plan', kind: 'building' });
  project.pages = [makePage('Floor Plan', 'plan'), makePage('Elevations', 'elevation')];
  project.activePageId = project.pages[0].id;
  return project;
}

function blankWoodworking() {
  const project = createProject({ name: 'New Woodworking Project', kind: 'woodworking' });
  project.pages = [makePage('Assembly', 'plan'), makePage('Part Layout', 'layout')];
  project.activePageId = project.pages[0].id;
  project.activeLayerId = 'parts';
  project.gridSize = 1;
  return project;
}

function shed() {
  const project = createProject({ name: '12×16 Storage Shed', kind: 'building' });
  const plan = project.pages[0];
  plan.name = 'Shed Floor Plan';
  const W = 16 * 12;
  const H = 12 * 12;
  const t = 5.5;
  const walls = rectWalls(plan, 0, 0, W, H, t);

  plan.entities.push(
    makeOpening(walls[0].id, 0.5, 'openings', 'door', 36, { tag: 'D1', height: 80, swing: 'left' })
  );
  plan.entities.push(
    makeOpening(walls[1].id, 0.35, 'openings', 'window', 36, { tag: 'W1', sill: 36, height: 36 })
  );
  plan.entities.push(
    makeOpening(walls[3].id, 0.5, 'openings', 'window', 36, { tag: 'W2', sill: 36, height: 36 })
  );
  plan.entities.push(
    makeRoom(
      [pt(t / 2, t / 2), pt(W - t / 2, t / 2), pt(W - t / 2, H - t / 2), pt(t / 2, H - t / 2)],
      'rooms',
      'Storage'
    )
  );
  plan.entities.push(makeDim(pt(0, 0), pt(W, 0), 'dimensions', -24));
  plan.entities.push(makeDim(pt(W, 0), pt(W, H), 'dimensions', -24));
  plan.entities.push(
    makeText(pt(0, H + 40), '2x4 walls @ 16" o.c. · 4/12 gable roof · pressure-treated skids', 'notes', 6)
  );

  const framing = project.pages[1] || makePage('Framing', 'elevation');
  if (!project.pages[1]) project.pages.push(framing);
  framing.name = 'Wall Framing';
  layoutParts(framing, [
    { name: 'Stud', length: 92.625, width: 3.5, thickness: 1.5, material: 'spf-2x4', qty: 34 },
    { name: 'Bottom plate', length: 96, width: 3.5, thickness: 1.5, material: 'spf-2x4', qty: 6 },
    { name: 'Top plate', length: 96, width: 3.5, thickness: 1.5, material: 'spf-2x4', qty: 12 },
    { name: 'Header', length: 42, width: 5.5, thickness: 1.5, material: 'spf-2x6', qty: 3 },
    { name: 'Floor sheathing', length: 96, width: 48, thickness: 0.75, material: 'ply-3/4', qty: 6 },
  ], { maxWidth: 300 });

  project.meta.notes = 'Verify local setback and permit requirements before construction.';
  return project;
}

function bookshelf() {
  const project = blankWoodworking();
  project.name = 'Bookshelf — 36" × 72"';
  const assembly = project.pages[0];
  assembly.name = 'Elevation';
  assembly.entities.push(makeRect(pt(0, 0), pt(36, 72), 'sketch'));
  for (let i = 1; i <= 4; i += 1) {
    const y = 12 * i + 3;
    assembly.entities.push(makeRect(pt(0.75, y), pt(35.25, y + 0.75), 'parts'));
  }
  assembly.entities.push(makeDim(pt(0, 0), pt(36, 0), 'dimensions', -8));
  assembly.entities.push(makeDim(pt(36, 0), pt(36, 72), 'dimensions', -8));
  assembly.entities.push(makeText(pt(0, -14), 'Bookshelf — 3/4" plywood case, 1/4" back, poplar face frame', 'notes', 3));

  layoutParts(project.pages[1], [
    { name: 'Side', length: 72, width: 11.25, thickness: 0.75, material: 'ply-3/4', qty: 2 },
    { name: 'Top / Bottom', length: 34.5, width: 11.25, thickness: 0.75, material: 'ply-3/4', qty: 2 },
    { name: 'Fixed shelf', length: 34.5, width: 11, thickness: 0.75, material: 'ply-3/4', qty: 4 },
    { name: 'Back panel', length: 72, width: 36, thickness: 0.25, material: 'ply-1/4', qty: 1 },
    { name: 'Face frame stile', length: 72, width: 1.5, thickness: 0.75, material: 'poplar-1x2', qty: 2 },
    { name: 'Face frame rail', length: 33, width: 1.5, thickness: 0.75, material: 'poplar-1x2', qty: 2 },
  ], { maxWidth: 200 });
  return project;
}

function workbench() {
  const project = blankWoodworking();
  project.name = 'Workbench — 60" × 24"';
  const assembly = project.pages[0];
  assembly.name = 'Assembly';
  assembly.entities.push(makeRect(pt(0, 0), pt(60, 24), 'sketch'));
  assembly.entities.push(makeDim(pt(0, 0), pt(60, 0), 'dimensions', -8));
  assembly.entities.push(makeDim(pt(60, 0), pt(60, 24), 'dimensions', -8));
  assembly.entities.push(makeText(pt(0, -14), 'Workbench — 2x4 base, doubled 3/4" plywood top, 34" finished height', 'notes', 3));

  layoutParts(project.pages[1], [
    { name: 'Leg', length: 33.25, width: 3.5, thickness: 1.5, material: 'spf-2x4', qty: 4 },
    { name: 'Long rail', length: 53, width: 3.5, thickness: 1.5, material: 'spf-2x4', qty: 4 },
    { name: 'Short rail', length: 17, width: 3.5, thickness: 1.5, material: 'spf-2x4', qty: 4 },
    { name: 'Top panel', length: 60, width: 24, thickness: 0.75, material: 'ply-3/4', qty: 2 },
    { name: 'Shelf', length: 53, width: 20, thickness: 0.75, material: 'ply-3/4', qty: 1 },
  ], { maxWidth: 200 });
  return project;
}

function kitchenReno() {
  const project = createProject({ name: 'Kitchen Renovation', kind: 'renovation' });
  const plan = project.pages[0];
  plan.name = 'Demo & New Plan';
  const W = 18 * 12;
  const H = 14 * 12;
  rectWalls(plan, 0, 0, W, H, 5.5, 'existing');

  const demoWall = makeWall(pt(0, 96), pt(120, 96), 'demo', 4.5, 'demo');
  plan.entities.push(demoWall);

  const newWall = makeWall(pt(150, 96), pt(W, 96), 'walls', 4.5, 'new');
  plan.entities.push(newWall);
  plan.entities.push(
    makeOpening(newWall.id, 0.4, 'openings', 'door', 36, { tag: 'D1', height: 80, swing: 'left' })
  );

  plan.entities.push(
    makeRoom([pt(3, 3), pt(W - 3, 3), pt(W - 3, 93), pt(3, 93)], 'rooms', 'Kitchen')
  );
  plan.entities.push(
    makeRoom([pt(3, 99), pt(W - 3, 99), pt(W - 3, H - 3), pt(3, H - 3)], 'rooms', 'Dining')
  );

  // Island as a woodworking part so it flows into the cut list.
  plan.entities.push(
    makePart(pt(60, 54), pt(132, 90), 'parts', {
      name: 'Island carcase panel',
      thickness: 0.75,
      material: 'ply-3/4',
      qty: 4,
      notes: '72" × 36" island',
    })
  );

  plan.entities.push(makeDim(pt(0, 0), pt(W, 0), 'dimensions', -24));
  plan.entities.push(makeText(pt(0, H + 36), 'Dashed orange = remove. Grey = existing to remain. Black = new work.', 'notes', 6));
  project.meta.notes = 'Confirm the wall being removed is non-load-bearing before demolition.';
  return project;
}

function deck() {
  const project = createProject({ name: 'Deck — 16 × 12', kind: 'building' });
  const plan = project.pages[0];
  plan.name = 'Deck Framing Plan';
  const W = 16 * 12;
  const H = 12 * 12;
  plan.entities.push(makeRect(pt(0, 0), pt(W, H), 'sketch'));
  for (let x = 0; x <= W; x += 16) {
    plan.entities.push(makeRect(pt(x, 0), pt(x + 1.5, H), 'furniture'));
  }
  plan.entities.push(makeDim(pt(0, 0), pt(W, 0), 'dimensions', -24));
  plan.entities.push(makeDim(pt(W, 0), pt(W, H), 'dimensions', -24));
  plan.entities.push(makeText(pt(0, H + 40), 'Joists 2x8 @ 16" o.c. · double 2x10 beam · 6x6 posts on footings', 'notes', 6));

  const framing = makePage('Material Layout', 'layout');
  project.pages.push(framing);
  layoutParts(framing, [
    { name: 'Joist', length: 144, width: 7.25, thickness: 1.5, material: 'pt-2x8-16', qty: 13 },
    { name: 'Rim joist', length: 192, width: 7.25, thickness: 1.5, material: 'pt-2x8-16', qty: 2 },
    { name: 'Decking board', length: 192, width: 5.5, thickness: 1, material: 'deck-54x6-16', qty: 27 },
  ], { maxWidth: 420 });
  return project;
}

export const TEMPLATES = [
  {
    id: 'blank-building',
    name: 'Blank floor plan',
    category: 'Building',
    description: 'Empty plan sheet with construction layers ready to go.',
    build: blankBuilding,
  },
  {
    id: 'shed',
    name: '12 × 16 storage shed',
    category: 'Building',
    description: 'Walls, door, windows, room and framing part list.',
    build: shed,
  },
  {
    id: 'deck',
    name: '16 × 12 deck',
    category: 'Building',
    description: 'Joist layout plan with a decking and framing material list.',
    build: deck,
  },
  {
    id: 'kitchen-reno',
    name: 'Kitchen renovation',
    category: 'Renovation',
    description: 'Existing, demo and new walls plus an island in the cut list.',
    build: kitchenReno,
  },
  {
    id: 'blank-woodworking',
    name: 'Blank woodworking project',
    category: 'Woodworking',
    description: 'Assembly sheet plus a part layout sheet, 1" grid.',
    build: blankWoodworking,
  },
  {
    id: 'bookshelf',
    name: 'Bookshelf 36 × 72',
    category: 'Woodworking',
    description: 'Plywood case, face frame and a complete cut list.',
    build: bookshelf,
  },
  {
    id: 'workbench',
    name: 'Workbench 60 × 24',
    category: 'Woodworking',
    description: '2x4 base with a laminated plywood top.',
    build: workbench,
  },
];

export function buildTemplate(id) {
  const template = TEMPLATES.find((t) => t.id === id);
  return template ? template.build() : null;
}
