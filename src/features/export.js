// Pure string exporters: SVG drawings and CSV tables. No DOM access, so they
// can be unit tested and reused by the download helpers in the UI layer.

import * as g from '../core/geometry.js';
import { wallSpans, wallLength, openingFrame, outlines } from '../core/entities.js';
import { formatLength, formatArea } from '../core/units.js';
import { palette, layerColor, wallStatusColor, mmToPx, TOKEN } from '../render/theme.js';
import { buildCutList } from './cutlist.js';
import { scheduleSummary } from './schedule.js';
import { buildEstimate } from './estimate.js';

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const n = (v) => (Math.round(v * 1000) / 1000).toString();

function polygonEl(pts, attrs) {
  return `<polygon points="${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" ${attrs}/>`;
}

function polylineEl(pts, attrs) {
  return `<polyline points="${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" ${attrs}/>`;
}

function lineEl(a, b, attrs) {
  return `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" ${attrs}/>`;
}

function arcPath(c, r, a0, a1, attrs) {
  const start = { x: c.x + Math.cos(a0) * r, y: c.y + Math.sin(a0) * r };
  const end = { x: c.x + Math.cos(a1) * r, y: c.y + Math.sin(a1) * r };
  const delta = a1 - a0;
  const large = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;
  return `<path d="M ${n(start.x)} ${n(start.y)} A ${n(r)} ${n(r)} 0 ${large} ${sweep} ${n(
    end.x
  )} ${n(end.y)}" ${attrs}/>`;
}

// Exports are always drawn in Paper mode: they exist to be printed and shared.
const PAPER = palette('paper');

const FONT_STACK = {
  sans: "'Inter', Helvetica, Arial, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  brand: "'Space Grotesk', 'Inter', Helvetica, sans-serif",
};

function textEl(at, text, size, color, opts = {}) {
  const { anchor = 'middle', rotate = 0, font = 'sans', weight = 400, tracking } = opts;
  const transform = rotate
    ? ` transform="rotate(${n((rotate * 180) / Math.PI)} ${n(at.x)} ${n(at.y)})"`
    : '';
  const spacing = tracking ? ` letter-spacing="${tracking}"` : '';
  return `<text x="${n(at.x)}" y="${n(at.y)}" font-size="${n(size)}" fill="${color}" text-anchor="${anchor}" font-family="${
    FONT_STACK[font]
  }" font-weight="${weight}"${spacing}${transform}>${esc(text)}</text>`;
}

/** `weightMm` is a plotted line weight from the brand weight table. */
function strokeAttrs(color, weightMm, dash) {
  const dashAttr = dash ? ` stroke-dasharray="${dash.join(' ')}"` : '';
  return `fill="none" stroke="${color}" stroke-width="${n(
    mmToPx(weightMm || 0.35)
  )}" vector-effect="non-scaling-stroke"${dashAttr}`;
}

/** One pass of a wall: `fill` lays the poché down, `stroke` draws its outline. */
function wallSvg(ent, page, layer, pass) {
  const total = wallLength(ent) || 1;
  const isDemo = ent.status === 'demo';
  if (pass === 'fill' && isDemo) return '';
  const status = wallStatusColor(ent.status, 'paper');
  const stroke = status ? status.color : layerColor(layer, 'paper');
  const fill = ent.status === 'existing' ? PAPER.wallFillExisting : PAPER.wallFill;
  const attrs =
    pass === 'fill'
      ? `fill="${fill}" stroke="none"`
      : strokeAttrs(stroke, layer.weight, status ? status.dash : layer.dash);
  return wallSpans(ent, page)
    .map((s) => polygonEl(g.thickSegmentQuad(ent.a, ent.b, ent.thickness, s[0] / total, s[1] / total), attrs))
    .join('');
}

function entitySvg(ent, project, page, layer) {
  const color = layerColor(layer, 'paper');
  const weight = layer.weight || 0.35;
  const out = [];

  switch (ent.type) {
    case 'wall':
      out.push(wallSvg(ent, page, layer, 'fill'), wallSvg(ent, page, layer, 'stroke'));
      break;
    case 'opening': {
      const f = openingFrame(ent, page);
      if (!f) break;
      const half = g.mul(f.normal, f.thickness / 2);
      const attrs = strokeAttrs(color, weight, null);
      out.push(lineEl(g.add(f.start, half), g.sub(f.start, half), attrs));
      out.push(lineEl(g.add(f.end, half), g.sub(f.end, half), attrs));
      if (ent.kind === 'window') {
        const inset = g.mul(f.normal, f.thickness / 6);
        out.push(lineEl(g.add(f.start, inset), g.add(f.end, inset), attrs));
        out.push(lineEl(g.sub(f.start, inset), g.sub(f.end, inset), attrs));
      } else if (ent.kind === 'door') {
        const hingeAtStart = ent.swing !== 'right';
        const hinge = hingeAtStart ? f.start : f.end;
        const leafEnd = g.add(hinge, g.mul(f.normal, ent.width));
        out.push(lineEl(hinge, leafEnd, attrs));
        const a0 = g.angleOf(g.sub(leafEnd, hinge));
        const other = g.angleOf(g.sub(hingeAtStart ? f.end : f.start, hinge));
        let sweep = other - a0;
        while (sweep > Math.PI) sweep -= Math.PI * 2;
        while (sweep < -Math.PI) sweep += Math.PI * 2;
        out.push(arcPath(hinge, ent.width, a0, a0 + sweep, strokeAttrs(color, 0.18, [4, 3])));
      }
      break;
    }
    case 'room': {
      out.push(
        polygonEl(
          ent.pts,
          `fill="${PAPER.roomFill}" stroke="${color}" stroke-width="${n(
            mmToPx(weight)
          )}" vector-effect="non-scaling-stroke"`
        )
      );
      const c = g.polygonCentroid(ent.pts);
      const area = Math.abs(g.polygonArea(ent.pts));
      const size = Math.max(4, Math.sqrt(area) / 14);
      out.push(textEl(c, ent.name, size, color, { font: 'sans', weight: 500 }));
      out.push(
        textEl({ x: c.x, y: c.y + size * 1.35 }, formatArea(area, project.unitSystem), size * 0.8, color, {
          font: 'mono',
        })
      );
      break;
    }
    case 'part': {
      const pts = g.rectCorners(ent.a, ent.b);
      out.push(
        polygonEl(
          pts,
          `fill="${PAPER.partFill}" stroke="${color}" stroke-width="${n(
            mmToPx(weight)
          )}" vector-effect="non-scaling-stroke"`
        )
      );
      const c = g.lerp(ent.a, ent.b, 0.5);
      const w = Math.abs(ent.b.x - ent.a.x);
      const h = Math.abs(ent.b.y - ent.a.y);
      const size = Math.max(3, Math.min(w, h) / 8);
      out.push(
        textEl(c, ent.qty > 1 ? `${ent.name} ×${ent.qty}` : ent.name, size, color, {
          font: 'sans',
          weight: 500,
        })
      );
      out.push(
        textEl(
          { x: c.x, y: c.y + size * 1.35 },
          `${formatLength(Math.max(w, h), project.unitSystem, { forceInches: true })} × ${formatLength(
            Math.min(w, h),
            project.unitSystem,
            { forceInches: true }
          )}`,
          size * 0.8,
          color,
          { font: 'mono' }
        )
      );
      break;
    }
    case 'dim': {
      const dir = g.norm(g.sub(ent.b, ent.a));
      if (!dir.x && !dir.y) break;
      const nrm = g.perp(dir);
      const off = g.mul(nrm, ent.offset);
      const a2 = g.add(ent.a, off);
      const b2 = g.add(ent.b, off);
      const attrs = strokeAttrs(PAPER.dimensionLine, weight, null);
      out.push(lineEl(ent.a, a2, attrs));
      out.push(lineEl(ent.b, b2, attrs));
      out.push(lineEl(a2, b2, attrs));
      const tickLen = g.dist(ent.a, ent.b) / 60 + 1;
      const tick = g.mul(g.norm(g.add(dir, nrm)), tickLen);
      out.push(lineEl(g.sub(a2, tick), g.add(a2, tick), attrs));
      out.push(lineEl(g.sub(b2, tick), g.add(b2, tick), attrs));
      const mid = g.lerp(a2, b2, 0.5);
      let angle = g.angleOf(dir);
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
      const size = Math.max(3, g.dist(ent.a, ent.b) / 25);
      out.push(
        textEl(
          { x: mid.x - nrm.x * size * 0.5, y: mid.y - nrm.y * size * 0.5 },
          formatLength(g.dist(ent.a, ent.b), project.unitSystem, { denominator: project.denominator }),
          size,
          PAPER.dimensionText,
          { rotate: angle, font: 'mono', weight: 500 }
        )
      );
      break;
    }
    case 'text': {
      out.push(textEl(ent.p, ent.text, ent.size, color, { anchor: 'start', rotate: ent.rot || 0 }));
      break;
    }
    case 'circle': {
      out.push(
        `<circle cx="${n(ent.c.x)}" cy="${n(ent.c.y)}" r="${n(ent.r)}" ${strokeAttrs(
          color,
          weight,
          layer.dash
        )}/>`
      );
      break;
    }
    case 'arc': {
      out.push(arcPath(ent.c, ent.r, ent.a0, ent.a1, strokeAttrs(color, weight, layer.dash)));
      break;
    }
    default: {
      for (const path of outlines(ent, page)) {
        if (path.pts.length < 2) continue;
        const attrs = strokeAttrs(color, weight, layer.dash);
        out.push(path.closed ? polygonEl(path.pts, attrs) : polylineEl(path.pts, attrs));
      }
      break;
    }
  }
  return out.join('');
}

const Z_ORDER = { room: 0, part: 1, rect: 2, circle: 2, arc: 2, polyline: 2, line: 2, wall: 3, opening: 4, dim: 5, text: 6 };

/** Render one page to a standalone SVG document. */
export function pageToSvg(project, page, options = {}) {
  const margin = options.margin ?? 24;
  const layers = new Map(project.layers.map((l) => [l.id, l]));
  const visible = page.entities.filter((e) => {
    const layer = layers.get(e.layer);
    return !layer || layer.visible;
  });

  let box = null;
  for (const ent of visible) {
    for (const path of outlines(ent, page)) {
      if (!path.pts.length) continue;
      box = g.bboxUnion(box, g.bboxOfPoints(path.pts));
    }
    if (ent.type === 'text') box = g.bboxUnion(box, g.bboxOfPoints([ent.p]));
  }
  if (!g.bboxValid(box)) box = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  box = g.bboxExpand(box, margin);

  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const titleHeight = options.titleBlock === false ? 0 : Math.max(28, height * 0.08);

  const sorted = [...visible].sort((a, b) => (Z_ORDER[a.type] ?? 2) - (Z_ORDER[b.type] ?? 2));
  const layerOf = (ent) => layers.get(ent.layer) || { color: TOKEN.blueprint, weight: 0.35, dash: null };
  const walls = sorted.filter((e) => e.type === 'wall');
  const wallBlock = [
    ...walls.map((w) => wallSvg(w, page, layerOf(w), 'fill')),
    ...walls.map((w) => wallSvg(w, page, layerOf(w), 'stroke')),
  ].join('');

  const chunks = [];
  let wallsEmitted = false;
  for (const ent of sorted) {
    if (ent.type === 'wall') continue;
    if (!wallsEmitted && (Z_ORDER[ent.type] ?? 2) > Z_ORDER.wall) {
      chunks.push(wallBlock);
      wallsEmitted = true;
    }
    chunks.push(entitySvg(ent, project, page, layerOf(ent)));
  }
  if (!wallsEmitted) chunks.push(wallBlock);
  const body = chunks.filter(Boolean).join('\n  ');

  // Title block: a Blueprint band carrying the project in Space Grotesk and
  // every hard fact — sheet, scale, date — in IBM Plex Mono.
  const pad = margin * 0.6;
  const titleSize = titleHeight * 0.3;
  const metaSize = titleSize * 0.62;
  const meta = [
    page.name,
    page.scale,
    project.meta.date || new Date().toISOString().slice(0, 10),
    project.meta.client ? `CLIENT ${project.meta.client}` : null,
  ]
    .filter(Boolean)
    .join('   ·   ');

  const titleBlock =
    titleHeight === 0
      ? ''
      : [
          `<rect x="${n(box.minX)}" y="${n(box.maxY)}" width="${n(width)}" height="${n(
            titleHeight
          )}" fill="${TOKEN.blueprint}"/>`,
          `<rect x="${n(box.minX)}" y="${n(box.maxY)}" width="${n(width)}" height="${n(
            titleHeight * 0.06
          )}" fill="${TOKEN.cedar}"/>`,
          textEl(
            { x: box.minX + pad, y: box.maxY + titleHeight * 0.52 },
            project.name,
            titleSize,
            TOKEN.vellum,
            { anchor: 'start', font: 'brand', weight: 500 }
          ),
          textEl(
            { x: box.minX + pad, y: box.maxY + titleHeight * 0.84 },
            meta,
            metaSize,
            TOKEN.chalk,
            { anchor: 'start', font: 'mono', tracking: '0.06em' }
          ),
          textEl(
            { x: box.maxX - pad, y: box.maxY + titleHeight * 0.52 },
            'STORYSTICK',
            metaSize,
            TOKEN.chalk,
            { anchor: 'end', font: 'mono', tracking: '0.18em' }
          ),
          textEl(
            { x: box.maxX - pad, y: box.maxY + titleHeight * 0.84 },
            'Draw it before you build it.',
            metaSize * 0.92,
            TOKEN.sky,
            { anchor: 'end', font: 'sans' }
          ),
        ].join('\n  ');

  // The viewBox stays in model inches so the drawing is dimensionally true;
  // width/height only decide how large the sheet opens on screen.
  const sheetHeight = height + titleHeight;
  const displayScale = Math.min(3, Math.max(0.25, 1100 / Math.max(width, sheetHeight)));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(box.minX)} ${n(box.minY)} ${n(width)} ${n(
    sheetHeight
  )}" width="${n(width * displayScale)}" height="${n(sheetHeight * displayScale)}">
  <title>${esc(project.name)} — ${esc(page.name)}</title>
  <rect x="${n(box.minX)}" y="${n(box.minY)}" width="${n(width)}" height="${n(
    sheetHeight
  )}" fill="${TOKEN.paper}"/>
  ${body}
  ${titleBlock}
</svg>`;
}

// --- CSV -----------------------------------------------------------------

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function cutListCsv(project) {
  const list = buildCutList(project);
  const sys = project.unitSystem;
  const rows = [['Material', 'Part', 'Qty', 'Length', 'Width', 'Thickness', 'Board feet', 'Notes']];
  for (const group of list.groups) {
    for (const row of group.rows) {
      rows.push([
        group.material.name,
        row.name,
        row.qty,
        formatLength(row.length, sys, { forceInches: true }),
        formatLength(row.width, sys, { forceInches: true }),
        formatLength(row.thickness, sys, { forceInches: true }),
        ((row.thickness * row.width * row.length * row.qty) / 144).toFixed(2),
        row.notes,
      ]);
    }
    rows.push([
      `${group.material.name} — stock needed`,
      `${group.stockCount} ${group.material.form === 'sheet' ? 'sheets' : 'boards'}`,
      '',
      '',
      '',
      '',
      group.boardFeet.toFixed(2),
      `${(group.utilization * 100).toFixed(0)}% yield`,
    ]);
  }
  return toCsv(rows);
}

export function scheduleCsv(project) {
  const s = scheduleSummary(project);
  const sys = project.unitSystem;
  const rows = [['Table', 'Tag / Name', 'A', 'B', 'C']];
  for (const d of s.doors) {
    rows.push(['Door', d.tag || d.id, formatLength(d.width, sys, { forceInches: true }), formatLength(d.height, sys, { forceInches: true }), d.swing]);
  }
  for (const w of s.windows) {
    rows.push([
      'Window',
      w.tag || w.id,
      formatLength(w.width, sys, { forceInches: true }),
      formatLength(w.height, sys, { forceInches: true }),
      `sill ${formatLength(w.sill, sys, { forceInches: true })}`,
    ]);
  }
  for (const r of s.rooms) {
    rows.push(['Room', r.name, formatArea(r.area, sys), formatLength(r.perimeter, sys), '']);
  }
  for (const w of s.walls) {
    rows.push(['Wall', w.status, formatLength(w.length, sys), formatArea(w.netArea, sys), `${w.count} runs`]);
  }
  return toCsv(rows);
}

export function estimateCsv(project) {
  const est = buildEstimate(project);
  const rows = [['Section', 'Item', 'Qty', 'Unit', 'Unit cost', 'Total', 'Note']];
  for (const section of est.sections) {
    for (const item of section.items) {
      rows.push([
        section.title,
        item.label,
        item.qty,
        item.unit,
        item.unitCost.toFixed(2),
        item.total.toFixed(2),
        item.note,
      ]);
    }
  }
  rows.push(['', 'Subtotal', '', '', '', est.subtotal.toFixed(2), '']);
  rows.push(['', 'Contingency 10%', '', '', '', est.contingency.toFixed(2), '']);
  rows.push(['', 'Total', '', '', '', est.total.toFixed(2), '']);
  return toCsv(rows);
}
