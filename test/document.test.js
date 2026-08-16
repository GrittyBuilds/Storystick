import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject,
  normalizeProject,
  removeEntities,
  addLayer,
  removeLayer,
  addPage,
  removePage,
  activePage,
} from '../src/core/document.js';
import { makeWall, makeOpening, makeLine, wallSpans, outlines, hitTest, bboxOf } from '../src/core/entities.js';

function projectWithWall() {
  const project = createProject({ name: 'Test' });
  const page = activePage(project);
  const wall = makeWall({ x: 0, y: 0 }, { x: 100, y: 0 }, 'walls', 6);
  const door = makeOpening(wall.id, 0.5, 'openings', 'door', 30);
  page.entities.push(wall, door);
  return { project, page, wall, door };
}

test('a new project has layers, a sheet and materials', () => {
  const project = createProject({ name: 'Shed' });
  assert.equal(project.name, 'Shed');
  assert.ok(project.layers.length > 0);
  assert.equal(project.pages.length, 1);
  assert.ok(project.materials.some((m) => m.form === 'sheet'));
  assert.ok(project.materials.some((m) => m.form === 'board'));
  assert.equal(activePage(project).id, project.activePageId);
});

test('deleting a wall also deletes its openings', () => {
  const { project, page, wall } = projectWithWall();
  assert.equal(page.entities.length, 2);
  removeEntities(project, [wall.id]);
  assert.equal(activePage(project).entities.length, 0);
});

test('deleting an opening leaves the wall alone', () => {
  const { project, door } = projectWithWall();
  removeEntities(project, [door.id]);
  const page = activePage(project);
  assert.equal(page.entities.length, 1);
  assert.equal(page.entities[0].type, 'wall');
});

test('openings cut solid spans out of a wall', () => {
  const { page, wall } = projectWithWall();
  const spans = wallSpans(wall, page);
  assert.deepEqual(spans, [
    [0, 35],
    [65, 100],
  ]);
  assert.equal(outlines(wall, page).length, 2);
});

test('wall hit testing covers its thickness', () => {
  const { page, wall } = projectWithWall();
  assert.equal(hitTest(wall, page, { x: 10, y: 2 }, 0.5), true);
  assert.equal(hitTest(wall, page, { x: 10, y: 20 }, 0.5), false);
  // Inside the door gap there is no wall to hit.
  assert.equal(hitTest(wall, page, { x: 50, y: 0 }, 0.1), false);
  const box = bboxOf(wall, page);
  assert.deepEqual(box, { minX: 0, minY: -3, maxX: 100, maxY: 3 });
});

test('layers can be added and removed, reassigning orphaned entities', () => {
  const project = createProject({});
  const page = activePage(project);
  const layer = addLayer(project, 'Trim');
  page.entities.push(makeLine({ x: 0, y: 0 }, { x: 1, y: 1 }, layer.id));
  assert.equal(removeLayer(project, layer.id), true);
  assert.ok(project.layers.every((l) => l.id !== layer.id));
  assert.ok(project.layers.some((l) => l.id === page.entities[0].layer));
});

test('the last layer and last sheet cannot be removed', () => {
  const project = createProject({});
  project.layers = [project.layers[0]];
  assert.equal(removeLayer(project, project.layers[0].id), false);
  assert.equal(removePage(project, project.pages[0].id), false);
});

test('pages can be added and removed', () => {
  const project = createProject({});
  const page = addPage(project, 'Elevations', 'elevation');
  assert.equal(project.pages.length, 2);
  assert.equal(removePage(project, page.id), true);
  assert.equal(project.pages.length, 1);
});

test('normalizeProject repairs a hand-edited file', () => {
  const project = normalizeProject({
    name: 'Recovered',
    unitSystem: 'metric',
    pages: [
      {
        name: 'Plan',
        entities: [
          { type: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, layer: 'nope' },
          { type: 'line', a: { x: 0, y: 0 } }, // missing b
          { type: 'wormhole', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
          { type: 'opening', host: 'missing-wall', t: 0.5, width: 30 },
          { type: 'part', a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, qty: -3 },
        ],
      },
    ],
  });

  const page = activePage(project);
  assert.equal(project.unitSystem, 'metric');
  assert.equal(project.name, 'Recovered');
  const types = page.entities.map((e) => e.type).sort();
  assert.deepEqual(types, ['line', 'part']);
  // Unknown layer references fall back to a real layer.
  assert.ok(project.layers.some((l) => l.id === page.entities[0].layer));
  assert.equal(page.entities.find((e) => e.type === 'part').qty, 1);
});

test('normalizeProject rejects garbage input', () => {
  assert.throws(() => normalizeProject(null));
  assert.throws(() => normalizeProject('not a project'));
});

test('normalizeProject always leaves at least one page', () => {
  const project = normalizeProject({ name: 'Empty', pages: [] });
  assert.equal(project.pages.length, 1);
  assert.equal(project.activePageId, project.pages[0].id);
});
