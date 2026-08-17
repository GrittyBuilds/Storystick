// End-to-end smoke test: boots the static server, drives the real UI in
// Chromium and asserts the drawing, reporting and persistence paths.
//
//   npm run smoke
//
// Requires the optional `playwright` dev dependency and a Chromium binary.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const PORT = process.env.SMOKE_PORT || '4199';
const BASE = `http://127.0.0.1:${PORT}`;
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT, HOST: '127.0.0.1' },
  stdio: 'ignore',
});

const checks = [];
const check = (name, fn) => {
  try {
    fn();
    checks.push(`  ok  ${name}`);
  } catch (err) {
    checks.push(`FAIL  ${name}: ${err.message}`);
    process.exitCode = 1;
  }
};

let browser;
try {
  await sleep(600);
  browser = await chromium.launch({ executablePath: EXECUTABLE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(300);

  // Compared against the tool registry rather than a hard-coded count, so
  // adding a tool does not fail this test for the wrong reason.
  const { TOOL_ENTRIES } = await import('../src/tools/index.js');
  const toolCount = await page.locator('.tool-btn').count();
  check('the tool palette renders every tool', () =>
    assert.equal(toolCount, TOOL_ENTRIES.length));

  const shortcuts = TOOL_ENTRIES.map((t) => t.key);
  check('no two tools claim the same shortcut', () =>
    assert.equal(new Set(shortcuts).size, shortcuts.length));

  // --- brand -------------------------------------------------------------
  const typography = await page.evaluate(() => {
    const coords = getComputedStyle(document.getElementById('status-coords')).fontFamily;
    const name = getComputedStyle(document.getElementById('project-name')).fontFamily;
    const body = getComputedStyle(document.body).fontFamily;
    return { coords, name, body };
  });
  check('exact values are set in IBM Plex Mono', () => assert.match(typography.coords, /Plex Mono/));
  check('the project name is set in Space Grotesk', () => assert.match(typography.name, /Space Grotesk/));
  check('interface copy is set in Inter', () => assert.match(typography.body, /Inter/));

  const activeTool = await page.evaluate(() => {
    const btn = document.querySelector('.tool-btn.active');
    return btn ? getComputedStyle(btn).backgroundColor : null;
  });
  check('cedar marks the active tool', () => assert.equal(activeTool, 'rgb(217, 130, 53)'));

  const startMode = await page.evaluate(() => document.body.dataset.mode);
  check('blueprint is the default canvas mode', () => assert.equal(startMode, 'blueprint'));

  await page.click('#mode-paper');
  await sleep(200);
  const paperMode = await page.evaluate(() => ({
    mode: document.body.dataset.mode,
    shell: getComputedStyle(document.querySelector('.topbar')).backgroundColor,
  }));
  check('paper mode switches the canvas and the shell', () => {
    assert.equal(paperMode.mode, 'paper');
    assert.equal(paperMode.shell, 'rgb(255, 255, 255)');
  });

  await page.reload({ waitUntil: 'networkidle' });
  await sleep(400);
  const remembered = await page.evaluate(() => document.body.dataset.mode);
  check('the chosen canvas mode survives a reload', () => assert.equal(remembered, 'paper'));
  await page.click('#mode-blueprint');
  await sleep(200);

  const loadTemplate = async (label) => {
    await page.click('#btn-new');
    await page.click(`button.card:has-text("${label}")`);
    await sleep(350);
  };

  // --- building flow ------------------------------------------------------
  await loadTemplate('12 × 16 storage shed');
  const shed = await page.evaluate(() => ({
    name: window.storystick.project.name,
    pages: window.storystick.project.pages.length,
    walls: window.storystick.page.entities.filter((e) => e.type === 'wall').length,
  }));
  check('a template loads its sheets and walls', () => {
    assert.equal(shed.pages, 2);
    assert.equal(shed.walls, 4);
  });

  const box = await page.locator('#canvas').boundingBox();

  // Draw a wall by clicking two points.
  await page.keyboard.press('w');
  await page.mouse.click(box.x + 200, box.y + 620);
  await page.mouse.move(box.x + 480, box.y + 620);
  await page.mouse.click(box.x + 480, box.y + 620);
  await page.keyboard.press('Escape');
  await sleep(150);
  const wallsDrawn = await page.evaluate(
    () => window.storystick.page.entities.filter((e) => e.type === 'wall').length
  );
  check('the wall tool creates a wall from two clicks', () => assert.equal(wallsDrawn, 5));

  // Typed exact length.
  await page.keyboard.press('l');
  await page.mouse.click(box.x + 200, box.y + 300);
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.fill('#command-input', "6'-6\"");
  await page.press('#command-input', 'Enter');
  await sleep(150);
  const lineLength = await page.evaluate(() => {
    const line = window.storystick.page.entities.filter((e) => e.type === 'line').pop();
    return Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y);
  });
  check('typing a length draws it exactly', () => assert.equal(lineLength, 78));

  // Undo / redo.
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  const before = await page.evaluate(() => window.storystick.page.entities.length);
  await page.keyboard.press('Control+z');
  const undone = await page.evaluate(() => window.storystick.page.entities.length);
  await page.keyboard.press('Control+Shift+z');
  const redone = await page.evaluate(() => window.storystick.page.entities.length);
  check('undo and redo move the document', () => {
    assert.equal(undone, before - 1);
    assert.equal(redone, before);
  });

  // Select all populates the properties panel.
  await page.keyboard.press('Control+a');
  await sleep(150);
  const selected = await page.evaluate(() => window.storystick.selection.size);
  check('select all picks up the drawing', () => assert.ok(selected >= shed.walls));
  await page.keyboard.press('Escape');

  // --- reports ------------------------------------------------------------
  await page.click('#btn-cutlist');
  await sleep(300);
  const layouts = await page.locator('.modal svg.layout').count();
  check('the cut list draws stock layouts', () => assert.ok(layouts > 0));
  await page.keyboard.press('Escape');

  await page.click('#btn-schedules');
  await sleep(250);
  const scheduleRows = await page.locator('.modal .data-table tbody tr').count();
  check('the schedules dialog lists rooms and openings', () => assert.ok(scheduleRows > 0));
  await page.keyboard.press('Escape');

  await page.click('#btn-estimate');
  await sleep(250);
  const total = await page.locator('.modal .totals .grand strong').innerText();
  check('the estimate shows a grand total', () => assert.match(total, /^\$[\d,]+\.\d\d$/));
  await page.keyboard.press('Escape');

  // --- renovation flow ----------------------------------------------------
  await loadTemplate('Kitchen renovation');
  const reno = await page.evaluate(() => {
    const ents = window.storystick.page.entities;
    return {
      demo: ents.filter((e) => e.type === 'wall' && e.status === 'demo').length,
      existing: ents.filter((e) => e.type === 'wall' && e.status === 'existing').length,
      rooms: ents.filter((e) => e.type === 'room').length,
    };
  });
  check('the renovation template separates demo, existing and new work', () => {
    assert.equal(reno.demo, 1);
    assert.equal(reno.existing, 4);
    assert.equal(reno.rooms, 2);
  });

  // Drop a door onto a wall.
  const doorsBefore = await page.evaluate(
    () => window.storystick.page.entities.filter((e) => e.type === 'opening').length
  );
  await page.keyboard.press('d');
  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await sleep(120);
  await page.mouse.click(box.x + box.width / 2, box.y + 120);
  await sleep(200);
  const doorsAfter = await page.evaluate(
    () => window.storystick.page.entities.filter((e) => e.type === 'opening').length
  );
  check('clicking a wall with the door tool hosts a door on it', () =>
    assert.equal(doorsAfter, doorsBefore + 1)
  );

  // --- woodworking flow ---------------------------------------------------
  await loadTemplate('Bookshelf 36 × 72');
  await page.click('.page-item:has-text("Part Layout")');
  await sleep(300);
  await page.keyboard.press('k');
  await page.mouse.click(box.x + 250, box.y + 560);
  await page.mouse.move(box.x + 360, box.y + 610);
  await page.fill('#command-input', '24 x 12');
  await page.press('#command-input', 'Enter');
  await sleep(200);
  const part = await page.evaluate(() => {
    const last = window.storystick.page.entities.filter((e) => e.type === 'part').pop();
    return { w: Math.abs(last.b.x - last.a.x), h: Math.abs(last.b.y - last.a.y) };
  });
  check('the part tool honours typed width × length', () => {
    assert.equal(part.w, 24);
    assert.equal(part.h, 12);
  });

  // --- nudge and rotate ---------------------------------------------------
  await loadTemplate('12 × 16 storage shed');
  await page.keyboard.press('v');

  // Select one wall and nudge it with the arrow keys.
  const wallStart = await page.evaluate(() => {
    const app = window.storystick;
    const wall = app.page.entities.find((e) => e.type === 'wall');
    app.setSelection([wall.id]);
    app.render();
    return { id: wall.id, ax: wall.a.x, ay: wall.a.y };
  });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await sleep(120);
  const nudged = await page.evaluate((id) => {
    const app = window.storystick;
    const wall = app.page.entities.find((e) => e.id === id);
    return { ax: wall.a.x, ay: wall.a.y, step: app.nudgeStep() };
  }, wallStart.id);
  check('arrow keys nudge by exactly one step of the display precision', () => {
    assert.equal(nudged.step, 1 / 16);
    assert.ok(Math.abs(nudged.ax - (wallStart.ax + 2 / 16)) < 1e-9, `x is ${nudged.ax}`);
    assert.ok(Math.abs(nudged.ay - (wallStart.ay + 1 / 16)) < 1e-9, `y is ${nudged.ay}`);
  });

  // The whole run should undo in one press.
  await page.keyboard.press('Control+z');
  await sleep(120);
  const afterUndo = await page.evaluate((id) => {
    const wall = window.storystick.page.entities.find((e) => e.id === id);
    return { ax: wall.a.x, ay: wall.a.y };
  }, wallStart.id);
  check('a run of nudges undoes in one step', () => {
    assert.ok(Math.abs(afterUndo.ax - wallStart.ax) < 1e-9, `x is ${afterUndo.ax}`);
    assert.ok(Math.abs(afterUndo.ay - wallStart.ay) < 1e-9, `y is ${afterUndo.ay}`);
  });

  // Changing the precision changes the step.
  const coarseStep = await page.evaluate(() => {
    const app = window.storystick;
    app.project.denominator = 8;
    return app.nudgeStep();
  });
  check('the nudge follows the fraction precision setting', () =>
    assert.equal(coarseStep, 1 / 8)
  );
  await page.evaluate(() => {
    window.storystick.project.denominator = 16;
  });

  // Typing an angle points the selected wall.
  await page.fill('#command-input', '<45');
  await page.press('#command-input', 'Enter');
  await sleep(150);
  const angled = await page.evaluate((id) => {
    const app = window.storystick;
    const wall = app.page.entities.find((e) => e.id === id);
    return {
      degrees: (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI,
      ax: wall.a.x,
      ay: wall.a.y,
      length: Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y),
    };
  }, wallStart.id);
  check('typing <45 points the selected wall at 45 degrees', () => {
    assert.ok(Math.abs(angled.degrees - 45) < 1e-6, `angle is ${angled.degrees}`);
    // It turns about the end it starts from, and keeps its length.
    assert.ok(Math.abs(angled.ax - wallStart.ax) < 1e-9);
    assert.ok(Math.abs(angled.length - 192) < 1e-6, `length is ${angled.length}`);
  });

  // A relative angle turns further.
  await page.fill('#command-input', '<+15');
  await page.press('#command-input', 'Enter');
  await sleep(150);
  const turned = await page.evaluate((id) => {
    const wall = window.storystick.page.entities.find((e) => e.id === id);
    return (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI;
  }, wallStart.id);
  check('a signed angle turns further rather than setting an absolute one', () =>
    assert.ok(Math.abs(turned - 60) < 1e-6, `angle is ${turned}`)
  );

  // A bare number is still a length, not an angle.
  const bareNumber = await page.evaluate((id) => {
    const app = window.storystick;
    const wall = app.page.entities.find((e) => e.id === id);
    const before = (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI;
    app.runCommand('45');
    const after = (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI;
    return { before, after };
  }, wallStart.id);
  check('a bare number does not rotate anything', () =>
    assert.equal(bareNumber.before, bareNumber.after)
  );

  // The properties panel exposes the same controls.
  await page.evaluate(() => window.storystick.refreshAll());
  await sleep(150);
  const panelFields = await page.evaluate(() =>
    [...document.querySelectorAll('#panel-properties .field-label')].map((n) => n.textContent)
  );
  check('the sidebar offers length and angle for a selected wall', () => {
    assert.ok(panelFields.includes('Length'), `fields were ${panelFields.join(', ')}`);
    assert.ok(panelFields.includes('Set to'));
    assert.ok(panelFields.includes('Turn by'));
  });

  // Typing into the sidebar's Length box actually resizes the wall.
  const resized = await page.evaluate(async (id) => {
    const app = window.storystick;
    const labels = [...document.querySelectorAll('#panel-properties .field')];
    const lengthField = labels.find(
      (f) => f.querySelector('.field-label') && f.querySelector('.field-label').textContent === 'Length'
    );
    const input = lengthField.querySelector('input');
    const wall = app.page.entities.find((e) => e.id === id);
    const startA = { ...wall.a };
    const startAngle = Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
    input.value = "10'-0\"";
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const after = app.page.entities.find((e) => e.id === id);
    return {
      length: Math.hypot(after.b.x - after.a.x, after.b.y - after.a.y),
      angle: Math.atan2(after.b.y - after.a.y, after.b.x - after.a.x),
      startAngle,
      movedStart: after.a.x !== startA.x || after.a.y !== startA.y,
    };
  }, wallStart.id);
  check('editing Length in the sidebar resizes the wall', () =>
    assert.ok(Math.abs(resized.length - 120) < 1e-6, `length is ${resized.length}`)
  );
  check('resizing holds the start end and keeps the angle', () => {
    assert.equal(resized.movedStart, false);
    assert.ok(Math.abs(resized.angle - resized.startAngle) < 1e-9);
  });

  // A typed length with something selected resizes it too.
  await page.fill('#command-input', "20'");
  await page.press('#command-input', 'Enter');
  await sleep(150);
  const typedLength = await page.evaluate((id) => {
    const wall = window.storystick.page.entities.find((e) => e.id === id);
    return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  }, wallStart.id);
  check('typing a length with something selected resizes it', () =>
    assert.ok(Math.abs(typedLength - 240) < 1e-6, `length is ${typedLength}`)
  );

  // Openings must not end up hanging off a shortened wall.
  const openingHeld = await page.evaluate(async () => {
    const { makeWall, makeOpening } = await import('/src/core/entities.js');
    const app = window.storystick;
    const wall = app.add(makeWall({ x: 0, y: 400 }, { x: 200, y: 400 }, 'walls', 5.5), 'Test wall');
    const door = app.add(makeOpening(wall.id, 0.92, 'openings', 'door', 36), 'Test door');
    app.setSelection([wall.id]);
    app.runCommand('50');
    const w = app.page.entities.find((e) => e.id === wall.id);
    const d = app.page.entities.find((e) => e.id === door.id);
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const centre = d.t * len;
    return { len, start: centre - d.width / 2, end: centre + d.width / 2 };
  });
  check('an opening stays inside a wall that was shortened under it', () => {
    assert.ok(Math.abs(openingHeld.len - 50) < 1e-6);
    assert.ok(openingHeld.start >= -1e-6, `door starts at ${openingHeld.start}`);
    assert.ok(openingHeld.end <= openingHeld.len + 1e-6, `door ends at ${openingHeld.end}`);
  });

  // A room has no single length, so the box is not offered at all.
  const roomFields = await page.evaluate(() => {
    const app = window.storystick;
    const room = app.page.entities.find((e) => e.type === 'room');
    app.setSelection([room.id]);
    app.refreshAll();
    return [...document.querySelectorAll('#panel-properties .field-label')].map((n) => n.textContent);
  });
  check('a room is not offered a length it does not have', () => {
    assert.ok(!roomFields.includes('Length'), `fields were ${roomFields.join(', ')}`);
    assert.ok(roomFields.includes('Turn by'), 'a room should still be turnable');
  });

  // A part is axis-aligned, so rotating it is refused rather than faked.
  const refused = await page.evaluate(async () => {
    const { makePart } = await import('/src/core/entities.js');
    const app = window.storystick;
    const part = app.add(makePart({ x: 0, y: 0 }, { x: 24, y: 12 }, 'parts', {}), 'Test part');
    app.setSelection([part.id]);
    const before = JSON.stringify(part);
    const ok = app.rotateSelection(45, { absolute: true });
    const after = app.page.entities.find((e) => e.id === part.id);
    return { ok, unchanged: JSON.stringify(after) === before, message: app.statusMessage };
  });
  check('an axis-aligned part refuses rotation instead of deforming', () => {
    assert.equal(refused.ok, false);
    assert.ok(refused.unchanged, 'the part was modified anyway');
    assert.match(refused.message, /cannot carry a rotation/);
  });

  // --- the sample house, its systems and its plot -------------------------
  await loadTemplate('Sample house on a basement');
  const house = await page.evaluate(() => {
    const p = window.storystick.project;
    const kinds = p.pages.map((x) => x.kind);
    const foundation = p.pages.find((x) => x.kind === 'foundation');
    const electrical = p.pages.find((x) => x.kind === 'electrical');
    const roof = p.pages.find((x) => x.kind === 'roof');
    const count = (pg, type) => pg.entities.filter((e) => e.type === type).length;
    return {
      kinds,
      footings: count(foundation, 'footing'),
      slabs: count(foundation, 'slab'),
      beams: count(foundation, 'beam'),
      fixtures: count(electrical, 'fixture'),
      roofPlanes: count(roof, 'roofPlane'),
      // Discipline sheets trace the plan rather than owning a copy of it.
      tracesPlan: electrical.basePageId === p.pages.find((x) => x.kind === 'plan').id,
      electricalWalls: count(electrical, 'wall'),
    };
  });
  check('the sample house carries a full set of discipline sheets', () => {
    for (const kind of ['foundation', 'plan', 'framing', 'roof', 'electrical', 'plumbing', 'mechanical']) {
      assert.ok(house.kinds.includes(kind), `missing a ${kind} sheet`);
    }
  });
  check('the foundation sheet carries footings, a slab and a beam', () => {
    assert.ok(house.footings > 0);
    assert.equal(house.slabs, 1);
    assert.ok(house.beams > 0);
  });
  check('the roof is drawn as planes, not guessed', () => assert.equal(house.roofPlanes, 2));
  check('the electrical sheet traces the plan instead of copying it', () => {
    assert.ok(house.tracesPlan);
    assert.equal(house.electricalWalls, 0);
    assert.ok(house.fixtures > 20);
  });

  // Placing a symbol from the palette.
  await page.evaluate(() => {
    const app = window.storystick;
    app.project.activePageId = app.project.pages.find((x) => x.kind === 'electrical').id;
    app.refreshAll();
    app.render();
  });
  await page.keyboard.press('q');
  await sleep(200);
  const paletteCount = await page.locator('.symbol-btn').count();
  check('the symbol palette offers symbols for the active discipline', () =>
    assert.ok(paletteCount > 5)
  );
  const beforeFixtures = await page.evaluate(
    () => window.storystick.page.entities.filter((e) => e.type === 'fixture').length
  );
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(200);
  const afterFixtures = await page.evaluate(
    () => window.storystick.page.entities.filter((e) => e.type === 'fixture').length
  );
  check('the symbol tool places the picked symbol', () =>
    assert.equal(afterFixtures, beforeFixtures + 1)
  );

  // The blueprint plot: a real sheet at a real scale.
  const plot = await page.evaluate(async () => {
    const mod = await import('/src/features/blueprint.js');
    const app = window.storystick;
    const plan = app.project.pages.find((x) => x.kind === 'plan');
    const found = app.project.pages.find((x) => x.kind === 'foundation');
    const a = mod.renderSheet(app.project, plan, {});
    const b = mod.renderSheet(app.project, found, {});
    return {
      svg: a.svg,
      scale: a.scaleLabel,
      standard: a.standardScale,
      planNumber: a.sheetNumber,
      foundationNumber: b.sheetNumber,
      set: mod.renderSet(app.project, {}).length,
    };
  });
  check('the sheet plots at a true architectural scale', () => {
    assert.ok(plot.standard, 'scale is not a standard one');
    assert.match(plot.scale, /=\s*1'-0"$/);
  });
  check('the sheet is sized in physical inches so 100% prints to scale', () => {
    assert.match(plot.svg, /width="36in"\s+height="24in"/);
    assert.ok(!/NaN/.test(plot.svg));
    assert.ok(plot.svg.trim().endsWith('</svg>'));
  });
  check('sheet numbers carry their discipline prefix', () => {
    assert.match(plot.planNumber, /^A-/);
    assert.match(plot.foundationNumber, /^S-/);
  });
  check('the whole set renders as one printable document', () =>
    assert.ok(plot.set > 20000)
  );

  // 3D: the whole building, basement included.
  const model = await page.evaluate(async () => {
    const mod = await import('/src/model3d/build.js');
    const m = mod.buildBuildingModel(window.storystick.project, {});
    return {
      sheets: m.stats.sheets.length,
      walls: m.stats.walls,
      roof: m.stats.roof,
      substructure: m.stats.substructure,
      minY: m.bounds.minY,
      maxY: m.bounds.maxY,
    };
  });
  check('the 3D model stacks the basement under the floor', () => {
    assert.ok(model.minY < -80, `basement floor at ${model.minY}`);
    assert.ok(model.maxY > 150, `ridge at ${model.maxY}`);
    assert.ok(model.substructure.slabs > 0);
  });
  check('a drawn roof is used instead of the generated gable', () =>
    assert.equal(model.roof.style, 'drawn')
  );

  // --- export + persistence ----------------------------------------------
  const svg = await page.evaluate(async () => {
    const mod = await import('/src/features/export.js');
    const app = window.storystick;
    return mod.pageToSvg(app.project, app.page);
  });
  check('SVG export is well formed', () => {
    assert.ok(svg.startsWith('<?xml'));
    assert.ok(svg.trim().endsWith('</svg>'));
    assert.ok(!/NaN/.test(svg));
  });

  const persisted = await page.evaluate(async () => {
    const store = await import('/src/core/store.js');
    const app = window.storystick;
    app.project.name = 'Persisted';
    store.saveProject(app.project);
    const back = store.loadProject(app.project.id);
    return back && { name: back.name, entities: back.pages.reduce((n, p) => n + p.entities.length, 0) };
  });
  check('projects survive a save/load round trip', () => {
    assert.ok(persisted);
    assert.equal(persisted.name, 'Persisted');
    assert.ok(persisted.entities > 0);
  });

  check('no console or page errors were raised', () => assert.deepEqual(errors, []));
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(checks.join('\n'));
console.log(process.exitCode ? '\nsmoke test FAILED' : `\nsmoke test passed (${checks.length} checks)`);
