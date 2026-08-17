// Render a sheet as a construction document.
//
// Output is an SVG whose user units are PAPER INCHES, with width and height in
// physical inches, so printing at 100% gives a drawing you can lay a scale rule
// on and read real dimensions off. That is the whole point of the exercise.
//
// What goes on the sheet: a border with a binding edge, a title block with the
// project and sheet identification, the drawing itself at a true architectural
// scale, a view title, a graphic scale bar, a north arrow, and a general-notes
// block. Everything is positioned in paper inches from src/features/sheet.js.

import * as g from '../core/geometry.js';
import {
  wallSpans,
  wallLength,
  openingFrame,
  outlines,
  roofHeightAt,
  roofEaveEdge,
  roofSlopedArea,
  footingLength,
  beamWidth,
} from '../core/entities.js';
import { formatLength, formatArea } from '../core/units.js';
import { TOKEN } from '../render/theme.js';
import {
  sheetSize,
  layout,
  scaleBar,
  numberSheets,
  FURNITURE,
  MARGIN,
  BINDING_MARGIN,
  TITLE_BLOCK_WIDTH,
} from './sheet.js';
import { SHEET_PREFIX, basePageOf } from '../core/document.js';
import { getSymbol } from '../symbols/library.js';
import { drawSymbolSvg, symbolPoints } from '../symbols/render.js';
import { getAssembly, layerOffsets } from '../core/assemblies.js';

const n = (v) => (Math.round(v * 10000) / 10000).toString();
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FONT_SANS = "'Inter', Helvetica, Arial, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const FONT_BRAND = "'Space Grotesk', 'Inter', Helvetica, sans-serif";

const INK = TOKEN.blueprint;
const RULE = '#4b5563';
// Screened-back background, for the plan a discipline sheet traces over.
const BG_INK = '#9aa3ab';
const BG_FILL = '#e6e9ec';

// Plotted line weights in paper inches. A construction drawing reads through
// its weight hierarchy: what is cut is heavy, what is beyond is light.
const PLOT = {
  sectionCut: 0.028,
  outline: 0.02,
  surface: 0.014,
  dimension: 0.01,
  construction: 0.007,
  border: 0.025,
};

function text(x, y, value, opts = {}) {
  const {
    size = 0.1,
    anchor = 'start',
    font = FONT_SANS,
    weight = 400,
    color = INK,
    tracking,
    rotate,
    baseline,
  } = opts;
  const t = rotate ? ` transform="rotate(${n(rotate)} ${n(x)} ${n(y)})"` : '';
  const ls = tracking ? ` letter-spacing="${tracking}"` : '';
  const bl = baseline ? ` dominant-baseline="${baseline}"` : '';
  return `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" font-family="${font}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}"${ls}${bl}${t}>${esc(
    value
  )}</text>`;
}

function line(x1, y1, x2, y2, w = PLOT.surface, color = INK, dash = null) {
  const d = dash ? ` stroke-dasharray="${dash.map(n).join(' ')}"` : '';
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${color}" stroke-width="${n(
    w
  )}"${d}/>`;
}

function rect(x, y, w, h, opts = {}) {
  const { fill = 'none', stroke = INK, weight = PLOT.outline, dash = null } = opts;
  const d = dash ? ` stroke-dasharray="${dash.map(n).join(' ')}"` : '';
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(
    weight
  )}"${d}/>`;
}

function poly(points, opts = {}) {
  const { fill = 'none', stroke = INK, weight = PLOT.outline, closed = true, dash = null } = opts;
  const d = points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
  const dashAttr = dash ? ` stroke-dasharray="${dash.map(n).join(' ')}"` : '';
  const tag = closed ? 'polygon' : 'polyline';
  return `<${tag} points="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${n(weight)}"${dashAttr}/>`;
}

// --- hatch patterns --------------------------------------------------------

/**
 * Diagonal hatch clipped to a polygon, generated as line segments so it prints
 * at a fixed spacing on paper no matter what the drawing scale is.
 */
function hatchPolygon(points, id, { spacing = 0.06, angle = 45, weight = 0.006, color = RULE } = {}) {
  const box = g.bboxOfPoints(points);
  const diag = Math.hypot(box.maxX - box.minX, box.maxY - box.minY) + spacing * 2;
  const rad = (angle * Math.PI) / 180;
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };
  const normal = { x: -dir.y, y: dir.x };
  const centre = g.bboxCenter(box);
  const lines = [];
  const count = Math.ceil(diag / spacing);
  for (let i = -count; i <= count; i += 1) {
    const offset = i * spacing;
    const a = {
      x: centre.x + normal.x * offset - dir.x * diag,
      y: centre.y + normal.y * offset - dir.y * diag,
    };
    const b = {
      x: centre.x + normal.x * offset + dir.x * diag,
      y: centre.y + normal.y * offset + dir.y * diag,
    };
    lines.push(line(a.x, a.y, b.x, b.y, weight, color));
  }
  const clip = points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
  return (
    `<clipPath id="${id}"><polygon points="${clip}"/></clipPath>` +
    `<g clip-path="url(#${id})">${lines.join('')}</g>`
  );
}

// --- drawing content -------------------------------------------------------

function wallSvg(ent, page, project, L, hatchIds) {
  const total = wallLength(ent) || 1;
  const out = [];
  const assembly = ent.assembly ? getAssembly(project, ent.assembly) : null;
  const isDemo = ent.status === 'demo';
  const isExisting = ent.status === 'existing';
  const stroke = isDemo ? '#8a8a8a' : INK;
  const weight = isDemo || isExisting ? PLOT.surface : PLOT.sectionCut;

  for (const [from, to] of wallSpans(ent, page)) {
    const quad = g.thickSegmentQuad(ent.a, ent.b, ent.thickness, from / total, to / total).map(L.toPaper, L);

    if (!isDemo) {
      // Poché: solid for a plan cut at small scale, hatched when there is room.
      const solid = L.ratio >= 40;
      out.push(
        poly(quad, {
          fill: solid ? (isExisting ? '#c2c8ce' : '#333d47') : '#ffffff',
          stroke,
          weight,
          dash: null,
        })
      );
      if (!solid) {
        const id = `h${hatchIds.next++}`;
        out.push(hatchPolygon(quad, id, { spacing: 0.05, angle: 45, weight: 0.005 }));
        out.push(poly(quad, { fill: 'none', stroke, weight }));
      }
    } else {
      out.push(poly(quad, { fill: 'none', stroke, weight, dash: [0.08, 0.05] }));
    }

    // Assembly layer lines, but only where they would be legible on paper.
    if (assembly && L.ratio <= 24) {
      const dir = g.norm(g.sub(ent.b, ent.a));
      const normal = g.perp(dir);
      const half = ent.thickness / 2;
      for (const { to: offset } of layerOffsets(assembly).slice(0, -1)) {
        const t = -half + offset;
        const p0 = L.toPaper(g.add(g.add(ent.a, g.mul(dir, total * (from / total))), g.mul(normal, t)));
        const p1 = L.toPaper(g.add(g.add(ent.a, g.mul(dir, total * (to / total))), g.mul(normal, t)));
        out.push(line(p0.x, p0.y, p1.x, p1.y, PLOT.construction, RULE));
      }
    }
  }
  return out.join('');
}

/**
 * The architectural plan screened back under a discipline sheet. Real permit
 * sets print the background at a lighter pen so the electrician's work is what
 * the eye lands on; the walls are there to say where, not to be read.
 */
function backgroundSvg(base, project, L) {
  const out = [];
  const fills = [];
  const strokes = [];
  for (const ent of base.entities) {
    if (ent.type === 'wall') {
      const total = wallLength(ent) || 1;
      for (const [from, to] of wallSpans(ent, base)) {
        const quad = g
          .thickSegmentQuad(ent.a, ent.b, ent.thickness, from / total, to / total)
          .map(L.toPaper, L);
        fills.push(poly(quad, { fill: BG_FILL, stroke: 'none', weight: 0 }));
        strokes.push(poly(quad, { fill: 'none', stroke: BG_INK, weight: PLOT.surface }));
      }
    }
  }
  out.push(...fills, ...strokes);

  for (const ent of base.entities) {
    if (ent.type === 'opening') {
      const f = openingFrame(ent, base);
      if (!f) continue;
      const half = g.mul(f.normal, f.thickness / 2);
      for (const p of [f.start, f.end]) {
        const a = L.toPaper(g.add(p, half));
        const b = L.toPaper(g.sub(p, half));
        out.push(line(a.x, a.y, b.x, b.y, PLOT.construction, BG_INK));
      }
    } else if (ent.type === 'room') {
      const c = L.toPaper(g.polygonCentroid(ent.pts));
      out.push(
        text(c.x, c.y, ent.name.toUpperCase(), {
          size: 0.12,
          anchor: 'middle',
          weight: 600,
          color: BG_INK,
        })
      );
    }
  }
  void project;
  return out.join('');
}

function openingSvg(ent, page, L) {
  const f = openingFrame(ent, page);
  if (!f) return '';
  const out = [];
  const half = g.mul(f.normal, f.thickness / 2);
  const jamb = (p) => {
    const a = L.toPaper(g.add(p, half));
    const b = L.toPaper(g.sub(p, half));
    return line(a.x, a.y, b.x, b.y, PLOT.outline);
  };
  out.push(jamb(f.start), jamb(f.end));

  if (ent.kind === 'window') {
    const inset = g.mul(f.normal, f.thickness / 6);
    for (const sign of [1, -1]) {
      const a = L.toPaper(g.add(f.start, g.mul(inset, sign)));
      const b = L.toPaper(g.add(f.end, g.mul(inset, sign)));
      out.push(line(a.x, a.y, b.x, b.y, PLOT.surface));
    }
  } else if (ent.kind === 'door') {
    const hingeAtStart = ent.swing !== 'right';
    const hinge = hingeAtStart ? f.start : f.end;
    const leafEnd = g.add(hinge, g.mul(f.normal, ent.width));
    const h = L.toPaper(hinge);
    const e = L.toPaper(leafEnd);
    out.push(line(h.x, h.y, e.x, e.y, PLOT.outline));
    const r = ent.width / L.ratio;
    const a0 = g.angleOf(g.sub(e, h));
    const other = g.angleOf(g.sub(L.toPaper(hingeAtStart ? f.end : f.start), h));
    let sweep = other - a0;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    const end = { x: h.x + Math.cos(a0 + sweep) * r, y: h.y + Math.sin(a0 + sweep) * r };
    out.push(
      `<path d="M ${n(e.x)} ${n(e.y)} A ${n(r)} ${n(r)} 0 0 ${sweep >= 0 ? 1 : 0} ${n(end.x)} ${n(
        end.y
      )}" fill="none" stroke="${INK}" stroke-width="${n(PLOT.construction)}"/>`
    );
  }

  // Tag bubble, the way a door or window schedule keys back to the plan.
  if (ent.tag) {
    const c = L.toPaper(f.center);
    const off = g.mul(f.normal, -(f.thickness / 2 + 10));
    const at = L.toPaper(g.add(f.center, off));
    const r = 0.11;
    const shape =
      ent.kind === 'window'
        ? `<rect x="${n(at.x - r)}" y="${n(at.y - r)}" width="${n(r * 2)}" height="${n(
            r * 2
          )}" fill="#fff" stroke="${INK}" stroke-width="${n(PLOT.dimension)}"/>`
        : `<circle cx="${n(at.x)}" cy="${n(at.y)}" r="${n(r)}" fill="#fff" stroke="${INK}" stroke-width="${n(
            PLOT.dimension
          )}"/>`;
    void c;
    return out.join('') + shape + text(at.x, at.y, ent.tag, { size: 0.1, anchor: 'middle', font: FONT_MONO, baseline: 'middle' });
  }
  return out.join('');
}

function roomSvg(ent, project, L) {
  const pts = ent.pts.map(L.toPaper, L);
  const out = [poly(pts, { fill: 'none', stroke: RULE, weight: PLOT.construction, dash: [0.03, 0.03] })];
  const c = L.toPaper(g.polygonCentroid(ent.pts));
  const area = Math.abs(g.polygonArea(ent.pts));
  out.push(text(c.x, c.y, ent.name.toUpperCase(), { size: 0.13, anchor: 'middle', weight: 600, tracking: '0.04em' }));
  out.push(
    text(c.x, c.y + 0.16, formatArea(area, project.unitSystem), {
      size: 0.1,
      anchor: 'middle',
      font: FONT_MONO,
      color: RULE,
    })
  );
  if (ent.finishes && ent.finishes.ceilingHeight) {
    out.push(
      text(c.x, c.y + 0.3, `CLG ${formatLength(ent.finishes.ceilingHeight, project.unitSystem)}`, {
        size: 0.085,
        anchor: 'middle',
        font: FONT_MONO,
        color: RULE,
      })
    );
  }
  return out.join('');
}

function dimensionSvg(ent, project, L) {
  const dir = g.norm(g.sub(ent.b, ent.a));
  if (!dir.x && !dir.y) return '';
  const normal = g.perp(dir);
  const off = g.mul(normal, ent.offset);
  const a = L.toPaper(ent.a);
  const b = L.toPaper(ent.b);
  const a2 = L.toPaper(g.add(ent.a, off));
  const b2 = L.toPaper(g.add(ent.b, off));
  const out = [];
  const gap = 0.05;
  const unit = { x: (a2.x - a.x), y: (a2.y - a.y) };
  const len = Math.hypot(unit.x, unit.y) || 1;
  const ext = { x: (unit.x / len) * gap, y: (unit.y / len) * gap };

  out.push(line(a.x + ext.x, a.y + ext.y, a2.x + ext.x, a2.y + ext.y, PLOT.dimension, RULE));
  out.push(line(b.x + ext.x, b.y + ext.y, b2.x + ext.x, b2.y + ext.y, PLOT.dimension, RULE));
  out.push(line(a2.x, a2.y, b2.x, b2.y, PLOT.dimension, INK));

  // Architectural ticks, not arrowheads.
  const d = { x: b2.x - a2.x, y: b2.y - a2.y };
  const dl = Math.hypot(d.x, d.y) || 1;
  const t = { x: (d.x / dl + unit.x / len) * 0.05, y: (d.y / dl + unit.y / len) * 0.05 };
  out.push(line(a2.x - t.x, a2.y - t.y, a2.x + t.x, a2.y + t.y, PLOT.outline, INK));
  out.push(line(b2.x - t.x, b2.y - t.y, b2.x + t.x, b2.y + t.y, PLOT.outline, INK));

  const mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
  let angle = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  const label = formatLength(g.dist(ent.a, ent.b), project.unitSystem, { denominator: project.denominator });
  const w = label.length * 0.055;
  out.push(
    `<rect x="${n(mid.x - w / 2)}" y="${n(mid.y - 0.115)}" width="${n(w)}" height="${n(
      0.13
    )}" fill="#ffffff" transform="rotate(${n(angle)} ${n(mid.x)} ${n(mid.y)})"/>`
  );
  out.push(
    text(mid.x, mid.y - 0.035, label, {
      size: 0.1,
      anchor: 'middle',
      font: FONT_MONO,
      weight: 500,
      rotate: angle,
    })
  );
  return out.join('');
}

function roofPlaneSvg(ent, project, L) {
  const pts = ent.pts.map(L.toPaper, L);
  const out = [poly(pts, { fill: 'none', stroke: INK, weight: PLOT.outline })];
  const [ea, eb] = roofEaveEdge(ent);
  const pa = L.toPaper(ea);
  const pb = L.toPaper(eb);
  out.push(line(pa.x, pa.y, pb.x, pb.y, PLOT.sectionCut, INK));

  // Slope arrow pointing up the pitch, with the pitch called out.
  const centre = g.polygonCentroid(ent.pts);
  const edge = g.sub(eb, ea);
  const len = g.len(edge) || 1;
  const inward = Math.sign(g.cross(edge, g.sub(centre, ea)) / len) || 1;
  const up = g.mul(g.norm(g.perp(edge)), inward);
  const tail = L.toPaper(g.add(centre, g.mul(up, -18)));
  const head = L.toPaper(g.add(centre, g.mul(up, 18)));
  out.push(line(tail.x, tail.y, head.x, head.y, PLOT.surface, INK));
  const ang = Math.atan2(head.y - tail.y, head.x - tail.x);
  for (const s of [2.6, -2.6]) {
    out.push(
      line(head.x, head.y, head.x + Math.cos(ang + s) * 0.09, head.y + Math.sin(ang + s) * 0.09, PLOT.surface)
    );
  }
  const label = L.toPaper(g.add(centre, g.mul(up, 30)));
  out.push(
    text(label.x, label.y, `${ent.pitch}:12`, {
      size: 0.115,
      anchor: 'middle',
      font: FONT_MONO,
      weight: 500,
    })
  );
  void project;
  return out.join('');
}

function footingSvg(ent, L) {
  const shape =
    ent.kind === 'pad'
      ? g.rectCorners(
          g.vec(ent.a.x - ent.width / 2, ent.a.y - (ent.length || ent.width) / 2),
          g.vec(ent.a.x + ent.width / 2, ent.a.y + (ent.length || ent.width) / 2)
        )
      : g.thickSegmentQuad(ent.a, ent.b, ent.width);
  return poly(shape.map(L.toPaper, L), {
    fill: 'none',
    stroke: RULE,
    weight: PLOT.surface,
    dash: [0.09, 0.05],
  });
}

function slabSvg(ent, L, hatchIds) {
  const pts = ent.pts.map(L.toPaper, L);
  const id = `h${hatchIds.next++}`;
  return (
    hatchPolygon(pts, id, { spacing: 0.09, angle: 45, weight: 0.004, color: '#9aa3ab' }) +
    poly(pts, { fill: 'none', stroke: RULE, weight: PLOT.surface })
  );
}

function beamSvg(ent, project, L) {
  const quad = g.thickSegmentQuad(ent.a, ent.b, beamWidth(ent)).map(L.toPaper, L);
  const out = [poly(quad, { fill: 'none', stroke: INK, weight: PLOT.outline, dash: [0.12, 0.05] })];
  const mid = L.toPaper(g.lerp(ent.a, ent.b, 0.5));
  const label = `${ent.plies > 1 ? `(${ent.plies}) ` : ''}${ent.size}${ent.tag ? ` ${ent.tag}` : ''}`;
  const angle = (Math.atan2(ent.b.y - ent.a.y, ent.b.x - ent.a.x) * 180) / Math.PI;
  out.push(
    text(mid.x, mid.y - 0.05, label, {
      size: 0.095,
      anchor: 'middle',
      font: FONT_MONO,
      rotate: angle > 90 || angle < -90 ? angle + 180 : angle,
    })
  );
  void project;
  return out.join('');
}

function fixtureSvg(ent, L) {
  const symbol = getSymbol(ent.symbol);
  if (!symbol) return '';
  // Symbols are drawn in model space then mapped, so they scale with the plan.
  const paperFixture = {
    p: L.toPaper(ent.p),
    rot: ent.rot || 0,
    scale: (ent.scale || 1) / L.ratio,
    mirrored: ent.mirrored,
  };
  const body = drawSymbolSvg(symbol, paperFixture, {
    color: INK,
    weight: PLOT.surface,
    font: FONT_SANS,
  });
  if (!ent.tag) return body;
  const at = L.toPaper(g.add(ent.p, g.vec(0, -(symbol.heightIn || 12) * 0.75)));
  return body + text(at.x, at.y, ent.tag, { size: 0.09, anchor: 'middle', font: FONT_MONO, color: RULE });
}

const Z = {
  slab: -1,
  footing: -0.5,
  room: 0,
  roofPlane: 0.5,
  part: 1,
  rect: 2,
  circle: 2,
  arc: 2,
  polyline: 2,
  line: 2,
  beam: 2.5,
  wall: 3,
  opening: 4,
  fixture: 4.5,
  dim: 5,
  text: 6,
};

// --- the sheet ------------------------------------------------------------

function titleBlockRight(project, page, sheet, opts) {
  const x = sheet.w - MARGIN - TITLE_BLOCK_WIDTH;
  const y = MARGIN;
  const w = TITLE_BLOCK_WIDTH;
  const h = sheet.h - MARGIN * 2;
  const pad = 0.18;
  const out = [rect(x, y, w, h, { stroke: INK, weight: PLOT.border })];
  let cursor = y;

  // Brand band.
  out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(0.62)}" fill="${INK}"/>`);
  out.push(
    text(x + pad, y + 0.4, 'STORYSTICK', {
      size: 0.2,
      font: FONT_BRAND,
      weight: 500,
      color: TOKEN.vellum,
    })
  );
  out.push(
    `<rect x="${n(x)}" y="${n(y + 0.62)}" width="${n(w)}" height="${n(0.035)}" fill="${TOKEN.cedar}"/>`
  );
  cursor = y + 0.72;

  const fieldRow = (label, value, height = 0.44) => {
    out.push(line(x, cursor, x + w, cursor, PLOT.titleRuleWeight, RULE));
    out.push(
      text(x + pad, cursor + 0.15, label.toUpperCase(), {
        size: 0.075,
        weight: 600,
        tracking: '0.1em',
        color: RULE,
      })
    );
    out.push(text(x + pad, cursor + 0.34, value || '—', { size: 0.115, weight: 500 }));
    cursor += height;
  };

  out.push(
    text(x + pad, cursor + 0.24, project.name, {
      size: 0.2,
      font: FONT_BRAND,
      weight: 500,
    })
  );
  cursor += 0.42;
  if (project.meta.address) {
    out.push(text(x + pad, cursor + 0.05, project.meta.address, { size: 0.1, color: RULE }));
    cursor += 0.22;
  }
  cursor += 0.08;

  fieldRow('Client', project.meta.client);
  fieldRow('Designer', project.meta.designer);
  fieldRow('Sheet title', page.name);
  fieldRow('Scale', opts.scaleLabel);
  fieldRow('Date', project.meta.date || new Date().toISOString().slice(0, 10));
  fieldRow('Drawn / checked', `${project.meta.drawnBy || '—'} / ${project.meta.checkedBy || '—'}`);

  // Revisions.
  out.push(line(x, cursor, x + w, cursor, PLOT.titleRuleWeight, RULE));
  out.push(
    text(x + pad, cursor + 0.15, 'REVISIONS', { size: 0.075, weight: 600, tracking: '0.1em', color: RULE })
  );
  const revisions = project.meta.revisions || [];
  let revY = cursor + 0.34;
  for (const rev of revisions.slice(0, 6)) {
    out.push(text(x + pad, revY, `${rev.no}`, { size: 0.09, font: FONT_MONO }));
    out.push(text(x + pad + 0.3, revY, rev.date || '', { size: 0.09, font: FONT_MONO, color: RULE }));
    out.push(text(x + pad + 1.1, revY, rev.note || '', { size: 0.09 }));
    revY += 0.17;
  }
  cursor = Math.max(revY + 0.1, cursor + 0.5);

  // Notes fill the remaining space above the sheet number.
  const numberBoxH = 0.9;
  const notesTop = cursor;
  const notesBottom = y + h - numberBoxH;
  if (notesBottom - notesTop > 0.5) {
    out.push(line(x, notesTop, x + w, notesTop, PLOT.titleRuleWeight, RULE));
    out.push(
      text(x + pad, notesTop + 0.15, 'GENERAL NOTES', {
        size: 0.075,
        weight: 600,
        tracking: '0.1em',
        color: RULE,
      })
    );
    let noteY = notesTop + 0.33;
    const notes = (page.notes && page.notes.length ? page.notes : opts.defaultNotes) || [];
    const hang = 0.26;
    notes.forEach((note, i) => {
      const chunks = wrap(note, 76);
      chunks.forEach((chunk, j) => {
        if (noteY > notesBottom - 0.12) return;
        if (j === 0) {
          out.push(
            text(x + pad, noteY, `${i + 1}.`, { size: 0.085, font: FONT_MONO, color: RULE })
          );
        }
        out.push(text(x + pad + hang, noteY, chunk, { size: 0.085, color: RULE }));
        noteY += 0.125;
      });
      noteY += 0.06;
    });
  }

  // Sheet number.
  out.push(line(x, notesBottom, x + w, notesBottom, PLOT.border, INK));
  out.push(
    text(x + pad, notesBottom + 0.24, 'SHEET', {
      size: 0.075,
      weight: 600,
      tracking: '0.1em',
      color: RULE,
    })
  );
  out.push(
    text(x + w - pad, notesBottom + 0.66, opts.sheetNumber, {
      size: FURNITURE.sheetNumberHeight,
      anchor: 'end',
      font: FONT_MONO,
      weight: 500,
    })
  );
  return out.join('');
}

function wrap(value, width) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > width) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current += ` ${word}`;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function northArrow(x, y, size) {
  const r = size / 2;
  return [
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="none" stroke="${INK}" stroke-width="${n(
      PLOT.dimension
    )}"/>`,
    `<polygon points="${n(x)},${n(y - r * 0.78)} ${n(x + r * 0.3)},${n(y + r * 0.42)} ${n(x)},${n(
      y + r * 0.16
    )} ${n(x - r * 0.3)},${n(y + r * 0.42)}" fill="${INK}"/>`,
    text(x, y + r + 0.14, 'N', { size: 0.11, anchor: 'middle', font: FONT_MONO, weight: 500 }),
  ].join('');
}

function graphicScale(x, y, ratio) {
  const bar = scaleBar(ratio, 2.4);
  const h = FURNITURE.scaleBarHeight;
  const out = [];
  const segment = bar.paperWidth / bar.divisions;
  for (let i = 0; i < bar.divisions; i += 1) {
    out.push(
      `<rect x="${n(x + i * segment)}" y="${n(y)}" width="${n(segment)}" height="${n(h)}" fill="${
        i % 2 ? '#ffffff' : INK
      }" stroke="${INK}" stroke-width="${n(PLOT.dimension)}"/>`
    );
  }
  for (const tick of bar.ticks) {
    out.push(
      text(x + tick.at, y + h + 0.12, tick.label, {
        size: 0.08,
        anchor: 'middle',
        font: FONT_MONO,
        color: RULE,
      })
    );
  }
  out.push(
    text(x + bar.paperWidth + 0.1, y + h, 'FEET', { size: 0.08, font: FONT_MONO, color: RULE })
  );
  return out.join('');
}

const DEFAULT_NOTES = [
  'Do not scale drawings. Written dimensions govern.',
  'Contractor shall verify all dimensions and conditions in the field before starting work.',
  'All work shall comply with the adopted building code and local amendments.',
  'These drawings are a design aid produced in Storystick and are not a stamped engineering document.',
];

/**
 * Render one sheet as a construction document.
 * @returns { svg, scaleLabel, standardScale, sheetNumber }
 */
export function renderSheet(project, page, options = {}) {
  const sheet = sheetSize(
    options.size || (project.sheet && project.sheet.size) || 'ARCH-D',
    options.orientation || (project.sheet && project.sheet.orientation) || 'landscape'
  );
  const titleBlock = options.titleBlock || (project.sheet && project.sheet.titleBlock) || 'right';
  const layers = new Map(project.layers.map((l) => [l.id, l]));
  const shown = (e) => {
    const layer = layers.get(e.layer);
    return !layer || layer.visible;
  };
  const visible = page.entities.filter(shown);
  const base = basePageOf(project, page);
  const baseEntities = base ? base.entities.filter(shown) : [];

  // Model bounds, including symbol footprints and anything traced underneath.
  let box = null;
  for (const ent of baseEntities.concat(visible)) {
    if (ent.type === 'fixture') {
      const symbol = getSymbol(ent.symbol);
      box = g.bboxUnion(box, g.bboxOfPoints(symbolPoints(symbol, ent)));
      continue;
    }
    for (const path of outlines(ent, page)) {
      if (path.pts.length) box = g.bboxUnion(box, g.bboxOfPoints(path.pts));
    }
    if (ent.type === 'text') box = g.bboxUnion(box, g.bboxOfPoints([ent.p]));
    if (ent.type === 'dim') {
      const dir = g.norm(g.sub(ent.b, ent.a));
      const off = g.mul(g.perp(dir), ent.offset);
      box = g.bboxUnion(box, g.bboxOfPoints([g.add(ent.a, off), g.add(ent.b, off)]));
    }
  }
  if (!g.bboxValid(box)) box = { minX: 0, minY: 0, maxX: 120, maxY: 96 };
  box = g.bboxExpand(box, 12);

  const L = layout({
    modelBox: box,
    sheet,
    titleBlock,
    kind: page.kind,
    scaleLabel: options.scaleLabel || (project.sheet && project.sheet.autoScale === false ? page.scale : null),
    reserve: { bottom: FURNITURE.bottomBand },
  });

  const hatchIds = { next: 0 };
  const sorted = [...visible].sort((a, b) => (Z[a.type] ?? 2) - (Z[b.type] ?? 2));
  const body = [];
  if (base) body.push(backgroundSvg(base, project, L));
  for (const ent of sorted) {
    switch (ent.type) {
      case 'wall':
        body.push(wallSvg(ent, page, project, L, hatchIds));
        break;
      case 'opening':
        body.push(openingSvg(ent, page, L));
        break;
      case 'room':
        body.push(roomSvg(ent, project, L));
        break;
      case 'dim':
        body.push(dimensionSvg(ent, project, L));
        break;
      case 'roofPlane':
        body.push(roofPlaneSvg(ent, project, L));
        break;
      case 'footing':
        body.push(footingSvg(ent, L));
        break;
      case 'slab':
        body.push(slabSvg(ent, L, hatchIds));
        break;
      case 'beam':
        body.push(beamSvg(ent, project, L));
        break;
      case 'fixture':
        body.push(fixtureSvg(ent, L));
        break;
      case 'text': {
        const at = L.toPaper(ent.p);
        body.push(text(at.x, at.y, ent.text, { size: Math.max(0.08, ent.size / L.ratio) }));
        break;
      }
      case 'part': {
        const pts = g.rectCorners(ent.a, ent.b).map(L.toPaper, L);
        body.push(poly(pts, { fill: 'none', stroke: INK, weight: PLOT.outline }));
        const c = L.toPaper(g.lerp(ent.a, ent.b, 0.5));
        body.push(text(c.x, c.y, ent.name, { size: 0.1, anchor: 'middle' }));
        break;
      }
      default: {
        for (const path of outlines(ent, page)) {
          if (path.pts.length < 2) continue;
          body.push(
            poly(path.pts.map(L.toPaper, L), {
              fill: 'none',
              stroke: INK,
              weight: PLOT.surface,
              closed: path.closed,
            })
          );
        }
        break;
      }
    }
  }

  // Sheet furniture.
  const inner = FURNITURE.innerBorderInset;
  const furniture = [];
  furniture.push(
    rect(BINDING_MARGIN - inner, MARGIN - inner, sheet.w - BINDING_MARGIN - MARGIN + inner * 2, sheet.h - MARGIN * 2 + inner * 2, {
      stroke: INK,
      weight: PLOT.border,
    })
  );

  // View title block, in the band reserved under the drawing so it can never
  // collide with the drawing above it or run off the border below it.
  const bandTop = L.area.y + L.area.h;
  const titleX = L.area.x + 0.1;
  const bubbleR = 0.17;
  const viewNo = options.viewNumber || 1;
  furniture.push(
    `<circle cx="${n(titleX + bubbleR)}" cy="${n(bandTop + 0.26)}" r="${n(
      bubbleR
    )}" fill="none" stroke="${INK}" stroke-width="${n(PLOT.outline)}"/>`,
    text(titleX + bubbleR, bandTop + 0.26, String(viewNo), {
      size: 0.15,
      anchor: 'middle',
      font: FONT_MONO,
      weight: 500,
      baseline: 'middle',
    })
  );
  const textX = titleX + bubbleR * 2 + 0.14;
  furniture.push(
    text(textX, bandTop + 0.32, page.name.toUpperCase(), {
      size: FURNITURE.viewTitleHeight,
      weight: 600,
      tracking: '0.06em',
    })
  );
  const ruleW = Math.max(1.4, page.name.length * 0.115) + bubbleR * 2 + 0.14;
  furniture.push(line(titleX, bandTop + 0.42, titleX + ruleW, bandTop + 0.42, PLOT.outline, INK));
  furniture.push(
    text(textX, bandTop + 0.6, L.scale.label, {
      size: FURNITURE.viewSubtitleHeight,
      font: FONT_MONO,
      color: RULE,
    })
  );
  furniture.push(graphicScale(titleX, bandTop + 0.7, L.ratio));
  furniture.push(northArrow(L.area.x + L.area.w - 0.6, L.area.y + 0.6, FURNITURE.northArrowSize));

  if (!L.standardScale) {
    furniture.push(
      text(L.area.x + 0.1, L.area.y + 0.18, 'NOT TO A STANDARD SCALE — DO NOT MEASURE', {
        size: 0.11,
        weight: 600,
        color: TOKEN.redDeep,
      })
    );
  }

  // A sheet always carries a number, and the number carries its discipline —
  // an S sheet numbered A-101 is a filing error waiting to happen.
  const number =
    options.sheetNumber || page.sheetNumber || `${SHEET_PREFIX[page.kind] || 'A'}-101`;
  const block =
    titleBlock === 'right'
      ? titleBlockRight(project, page, sheet, {
          scaleLabel: L.scale.label,
          sheetNumber: number,
          defaultNotes: DEFAULT_NOTES,
        })
      : '';

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(sheet.w)}in" height="${n(sheet.h)}in" viewBox="0 0 ${n(
    sheet.w
  )} ${n(sheet.h)}">
  <title>${esc(project.name)} — ${esc(page.name)}</title>
  <rect x="0" y="0" width="${n(sheet.w)}" height="${n(sheet.h)}" fill="#ffffff"/>
  ${body.filter(Boolean).join('\n  ')}
  ${furniture.join('\n  ')}
  ${block}
</svg>`;

  return {
    svg,
    scaleLabel: L.scale.label,
    standardScale: L.standardScale,
    sheetNumber: number,
    sheet,
  };
}

/** Every sheet in the set, as one printable HTML document. */
export function renderSet(project, options = {}) {
  const numbers = numberSheets(project.pages, (p) => SHEET_PREFIX[p.kind] || 'A');
  const sheets = project.pages.map((page) =>
    renderSheet(project, page, {
      ...options,
      sheetNumber: page.sheetNumber || numbers.get(page.id),
    })
  );
  const pages = sheets
    .map((s) => `<section class="sheet">${s.svg.replace(/^<\?xml[^>]*\?>\s*/, '')}</section>`)
    .join('\n');
  const size = sheets[0] ? sheets[0].sheet : sheetSize('ARCH-D');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(project.name)} — drawing set</title>
<style>
  @page { size: ${n(size.w)}in ${n(size.h)}in; margin: 0; }
  html, body { margin: 0; padding: 0; background: #6b7280; }
  .sheet { display: block; page-break-after: always; background: #fff; margin: 0 auto 24px; width: ${n(size.w)}in; }
  .sheet svg { display: block; width: 100%; height: auto; }
  @media print { body { background: #fff; } .sheet { margin: 0; } }
</style></head><body>${pages}</body></html>`;
}

export { DEFAULT_NOTES };
