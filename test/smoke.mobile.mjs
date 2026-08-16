// Mobile and tablet smoke test: boots the static server, drives the real UI in a
// phone-sized touch context and asserts the compact layout, touch targets and
// gestures.
//
//   npm run smoke:mobile
//
// Requires the optional `playwright` dev dependency and a Chromium binary.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';

const PORT = process.env.SMOKE_PORT || '4198';
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
  await sleep(700);
  browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const phone = await browser.newContext({ ...devices['Pixel 7'], hasTouch: true, isMobile: true });
  const page = await phone.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(900);

  const layout = await page.evaluate(() => ({
    compact: window.storystick.isCompact(),
    mobileBar: getComputedStyle(document.querySelector('.mobile-bar')).display !== 'none',
    topActionsHidden: getComputedStyle(document.querySelector('.top-actions')).display === 'none',
    menuVisible: getComputedStyle(document.getElementById('btn-menu')).display !== 'none',
    toolbarRow: getComputedStyle(document.getElementById('toolbar')).flexDirection === 'row',
  }));
  check('the phone gets the compact layout', () => {
    assert.equal(layout.compact, true);
    assert.equal(layout.mobileBar, true);
    assert.equal(layout.topActionsHidden, true);
    assert.equal(layout.menuVisible, true);
    assert.equal(layout.toolbarRow, true, 'the tool palette runs along the bottom');
  });

  // The brand requires a 40 px minimum on anything interactive.
  const small = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button, input, select')) {
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 40) bad.push(`${el.id || el.className || el.tagName}: ${Math.round(r.height)}px`);
    }
    return bad;
  });
  check('every touch target clears 40 px', () => assert.deepEqual(small, []));

  // The compact menu replaces the desktop action row.
  await page.tap('#btn-menu');
  await sleep(300);
  await page.tap('.menu-item:has-text("New project")');
  await sleep(300);
  await page.tap('button.card:has-text("12 × 16 storage shed")');
  await sleep(700);
  const loaded = await page.evaluate(() => window.storystick.page.entities.length);
  check('a template loads through the compact menu', () => assert.ok(loaded > 5));

  // Two fingers must zoom the view, never draw.
  const canvas = await page.locator('#canvas').boundingBox();
  const cx = canvas.x + canvas.width / 2;
  const cy = canvas.y + canvas.height / 2;
  const before = await page.evaluate(() => window.storystick.viewport.zoom);
  await page.evaluate(
    ([x, y]) => {
      const el = document.getElementById('canvas');
      const send = (type, points) => {
        for (const p of points) {
          el.dispatchEvent(
            new PointerEvent(type, {
              pointerId: p.id,
              pointerType: 'touch',
              clientX: p.x,
              clientY: p.y,
              bubbles: true,
              isPrimary: p.id === 1,
            })
          );
        }
      };
      send('pointerdown', [{ id: 1, x: x - 40, y }, { id: 2, x: x + 40, y }]);
      send('pointermove', [{ id: 1, x: x - 120, y }, { id: 2, x: x + 120, y }]);
      send('pointerup', [{ id: 1, x: x - 120, y }, { id: 2, x: x + 120, y }]);
    },
    [cx, cy]
  );
  await sleep(300);
  const after = await page.evaluate(() => window.storystick.viewport.zoom);
  const entitiesAfter = await page.evaluate(() => window.storystick.page.entities.length);
  check('pinching zooms instead of drawing', () => {
    assert.ok(after > before * 1.5, `zoom went ${before} -> ${after}`);
    assert.equal(entitiesAfter, loaded, 'the gesture added no geometry');
  });

  // Bottom sheet.
  await page.tap('#mob-layers');
  await sleep(450);
  const sheet = await page.evaluate(() => ({
    open: document.body.classList.contains('sheet-open'),
    onScreen: document.querySelector('.sidebar').getBoundingClientRect().top < window.innerHeight - 60,
    closeReachable: document.getElementById('sheet-close').getBoundingClientRect().height > 0,
  }));
  check('panels open as a reachable bottom sheet', () => {
    assert.equal(sheet.open, true);
    assert.equal(sheet.onScreen, true);
    assert.equal(sheet.closeReachable, true);
  });
  await page.tap('#sheet-close');
  await sleep(350);
  const closed = await page.evaluate(() => document.body.classList.contains('sheet-open'));
  check('the sheet closes again', () => assert.equal(closed, false));

  // 3D on a phone.
  await page.tap('#view-3d');
  await sleep(1200);
  const mobile3d = await page.evaluate(() => ({
    mode: window.storystick.viewMode,
    triangles: window.storystick.modelStats && window.storystick.modelStats.triangles,
  }));
  check('the 3D view runs on a phone', () => {
    assert.equal(mobile3d.mode, '3d');
    assert.ok(mobile3d.triangles > 0);
  });

  // A tablet keeps the full desktop shell.
  const tablet = await browser.newContext({ ...devices['iPad (gen 7) landscape'], hasTouch: true });
  const tpage = await tablet.newPage();
  tpage.on('pageerror', (e) => errors.push('tablet pageerror: ' + e.message));
  await tpage.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(800);
  const tabletLayout = await tpage.evaluate(() => ({
    compact: window.storystick.isCompact(),
    sidebarInFlow: getComputedStyle(document.querySelector('.sidebar')).position !== 'fixed',
  }));
  check('a tablet keeps the full side panels', () => {
    assert.equal(tabletLayout.compact, false);
    assert.equal(tabletLayout.sidebarInFlow, true);
  });

  check('no console or page errors were raised', () => assert.deepEqual(errors, []));
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(checks.join('\n'));
console.log(process.exitCode ? '\nmobile smoke FAILED' : `\nmobile smoke passed (${checks.length} checks)`);
