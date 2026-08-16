// Canvas renderer. All drawing happens in model space via a world transform,
// so line weights and UI-sized text divide by zoom to stay screen-constant.

import * as g from '../core/geometry.js';
import { formatLength, formatArea, IN_PER_FT, mmToIn } from '../core/units.js';
import { outlines, wallSpans, openingFrame, wallLength, handlesOf } from '../core/entities.js';

export const THEME = {
  paper: '#f7f5f0',
  gridMinor: '#e2ded4',
  gridMajor: '#cfc9ba',
  axis: '#b9b0a0',
  accent: '#0b6bcb',
  accentSoft: 'rgba(11,107,203,0.18)',
  hover: '#f59e0b',
  wallFill: '#d9d4c8',
  wallFillExisting: '#e6e2d8',
  roomFill: 'rgba(37,99,235,0.07)',
  partFill: 'rgba(124,58,237,0.12)',
  snap: '#16a34a',
  text: '#1f2933',
};

const RICH_PREVIEW = new Set(['wall', 'opening', 'dim', 'part', 'room']);

const Z_ORDER = {
  room: 0,
  part: 1,
  rect: 2,
  circle: 2,
  arc: 2,
  polyline: 2,
  line: 2,
  wall: 3,
  opening: 4,
  dim: 5,
  text: 6,
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
  }

  /** Size an off-screen canvas explicitly (used by PNG export). */
  resizeTo(width, height, dpr = 2) {
    this.dpr = dpr;
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
  }

  draw(state) {
    const { ctx } = this;
    const { viewport: vp } = state;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = THEME.paper;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.setTransform(
      vp.zoom * this.dpr,
      0,
      0,
      vp.zoom * this.dpr,
      -vp.x * vp.zoom * this.dpr,
      -vp.y * vp.zoom * this.dpr
    );
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';

    this.drawGrid(state);
    this.drawEntities(state);
    this.drawSelection(state);
    this.drawPreview(state);
    this.drawSnap(state);
    this.drawMarquee(state);
  }

  // --- background -------------------------------------------------------

  drawGrid(state) {
    const { ctx } = this;
    const { project, viewport: vp } = state;
    if (!project.gridSize || project.gridSize <= 0) return;
    const box = vp.visibleBox(this.width, this.height);
    const minor = project.gridSize;
    const majorEvery = project.unitSystem === 'metric' ? mmToIn(1000) / minor : IN_PER_FT / minor;
    const major = minor * Math.max(1, Math.round(majorEvery));

    const drawSet = (step, color, weight) => {
      if (step * vp.zoom < 9) return;
      ctx.beginPath();
      const x0 = Math.floor(box.minX / step) * step;
      const y0 = Math.floor(box.minY / step) * step;
      for (let x = x0; x <= box.maxX; x += step) {
        ctx.moveTo(x, box.minY);
        ctx.lineTo(x, box.maxY);
      }
      for (let y = y0; y <= box.maxY; y += step) {
        ctx.moveTo(box.minX, y);
        ctx.lineTo(box.maxX, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = vp.px(weight);
      ctx.stroke();
    };

    drawSet(minor, THEME.gridMinor, 1);
    drawSet(major, THEME.gridMajor, 1);

    ctx.beginPath();
    ctx.moveTo(box.minX, 0);
    ctx.lineTo(box.maxX, 0);
    ctx.moveTo(0, box.minY);
    ctx.lineTo(0, box.maxY);
    ctx.strokeStyle = THEME.axis;
    ctx.lineWidth = vp.px(1.2);
    ctx.stroke();
  }

  // --- entities ---------------------------------------------------------

  drawEntities(state) {
    const { project, page } = state;
    const layers = new Map(project.layers.map((l) => [l.id, l]));
    const visible = page.entities.filter((e) => {
      const layer = layers.get(e.layer);
      return !layer || layer.visible;
    });
    visible.sort((a, b) => (Z_ORDER[a.type] ?? 2) - (Z_ORDER[b.type] ?? 2));

    // Walls are drawn in two passes so a neighbour's fill never paints over an
    // already-stroked wall at a corner.
    const walls = visible.filter((e) => e.type === 'wall');
    let wallsDrawn = false;
    const drawWalls = () => {
      wallsDrawn = true;
      for (const wall of walls) this.drawWall(wall, state, layers, 'fill');
      for (const wall of walls) this.drawWall(wall, state, layers, 'stroke');
    };

    for (const ent of visible) {
      if (ent.type === 'wall') continue;
      if (!wallsDrawn && (Z_ORDER[ent.type] ?? 2) > Z_ORDER.wall) drawWalls();
      const layer = layers.get(ent.layer) || { color: '#333', weight: 1, dash: null };
      this.drawEntity(ent, state, layer);
    }
    if (!wallsDrawn) drawWalls();
  }

  drawWall(ent, state, layers, pass) {
    const { ctx } = this;
    const { viewport: vp, page } = state;
    const layer = layers.get(ent.layer) || { color: '#333', weight: 1, dash: null };
    const style = this.strokeStyleFor(ent, layer);
    const total = wallLength(ent) || 1;
    if (pass === 'stroke') this.applyStroke(vp, style.color, layer.weight, style.dash);
    for (const s of wallSpans(ent, page)) {
      const quad = g.thickSegmentQuad(ent.a, ent.b, ent.thickness, s[0] / total, s[1] / total);
      this.path(quad, true);
      if (pass === 'fill') {
        if (ent.status === 'demo') continue;
        ctx.fillStyle = ent.status === 'existing' ? THEME.wallFillExisting : THEME.wallFill;
        ctx.fill();
      } else {
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  strokeStyleFor(ent, layer) {
    if (ent.type === 'wall') {
      if (ent.status === 'demo') return { color: '#c2410c', dash: [8, 5] };
      if (ent.status === 'existing') return { color: '#8a94a6', dash: null };
    }
    return { color: layer.color, dash: layer.dash };
  }

  applyStroke(vp, color, weight, dash) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = vp.px(Math.max(0.4, weight));
    ctx.setLineDash(dash ? dash.map((d) => vp.px(d)) : []);
  }

  path(pts, closed) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    if (closed) ctx.closePath();
  }

  drawEntity(ent, state, layer) {
    const { ctx } = this;
    const { viewport: vp, project, page } = state;
    const style = this.strokeStyleFor(ent, layer);

    switch (ent.type) {
      case 'room': {
        this.path(ent.pts, true);
        ctx.fillStyle = THEME.roomFill;
        ctx.fill();
        this.applyStroke(vp, style.color, layer.weight, style.dash);
        ctx.stroke();
        const c = g.polygonCentroid(ent.pts);
        const area = Math.abs(g.polygonArea(ent.pts));
        this.label(vp, c, [ent.name, formatArea(area, project.unitSystem)], style.color);
        break;
      }
      case 'part': {
        const pts = g.rectCorners(ent.a, ent.b);
        this.path(pts, true);
        ctx.fillStyle = THEME.partFill;
        ctx.fill();
        this.applyStroke(vp, style.color, layer.weight, style.dash);
        ctx.stroke();
        const w = Math.abs(ent.b.x - ent.a.x);
        const h = Math.abs(ent.b.y - ent.a.y);
        const long = Math.max(w, h);
        const short = Math.min(w, h);
        const lines = [
          ent.qty > 1 ? `${ent.name} ×${ent.qty}` : ent.name,
          `${formatLength(long, project.unitSystem, { forceInches: true })} × ${formatLength(
            short,
            project.unitSystem,
            { forceInches: true }
          )}`,
        ];
        this.label(vp, g.lerp(ent.a, ent.b, 0.5), lines, style.color);
        break;
      }
      case 'wall': {
        const spans = wallSpans(ent, page);
        const total = wallLength(ent) || 1;
        this.applyStroke(vp, style.color, layer.weight, style.dash);
        for (const s of spans) {
          const quad = g.thickSegmentQuad(ent.a, ent.b, ent.thickness, s[0] / total, s[1] / total);
          this.path(quad, true);
          if (ent.status !== 'demo') {
            ctx.fillStyle = ent.status === 'existing' ? THEME.wallFillExisting : THEME.wallFill;
            ctx.fill();
          }
          ctx.stroke();
        }
        break;
      }
      case 'opening': {
        this.drawOpening(ent, state, style, layer);
        break;
      }
      case 'dim': {
        this.drawDimension(ent, state, style, layer);
        break;
      }
      case 'text': {
        ctx.save();
        ctx.translate(ent.p.x, ent.p.y);
        if (ent.rot) ctx.rotate(ent.rot);
        ctx.fillStyle = style.color;
        ctx.font = `${ent.size}px "Helvetica Neue", Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(ent.text, 0, 0);
        ctx.restore();
        break;
      }
      default: {
        this.applyStroke(vp, style.color, layer.weight, style.dash);
        for (const p of outlines(ent, page)) {
          if (p.pts.length < 2) continue;
          this.path(p.pts, p.closed);
          ctx.stroke();
        }
        break;
      }
    }
    ctx.setLineDash([]);
  }

  drawOpening(ent, state, style, layer) {
    const { ctx } = this;
    const { viewport: vp, page } = state;
    const f = openingFrame(ent, page);
    if (!f) return;
    const half = g.mul(f.normal, f.thickness / 2);
    this.applyStroke(vp, style.color, layer.weight, null);

    // Jambs across the wall thickness at both ends of the opening.
    ctx.beginPath();
    ctx.moveTo(f.start.x + half.x, f.start.y + half.y);
    ctx.lineTo(f.start.x - half.x, f.start.y - half.y);
    ctx.moveTo(f.end.x + half.x, f.end.y + half.y);
    ctx.lineTo(f.end.x - half.x, f.end.y - half.y);
    ctx.stroke();

    if (ent.kind === 'window') {
      const inset = g.mul(f.normal, f.thickness / 6);
      ctx.beginPath();
      ctx.moveTo(f.start.x + inset.x, f.start.y + inset.y);
      ctx.lineTo(f.end.x + inset.x, f.end.y + inset.y);
      ctx.moveTo(f.start.x - inset.x, f.start.y - inset.y);
      ctx.lineTo(f.end.x - inset.x, f.end.y - inset.y);
      ctx.stroke();
      return;
    }

    if (ent.kind === 'cased') return;

    // Door: leaf perpendicular to the wall plus its swing arc.
    const hingeAtStart = ent.swing !== 'right';
    const hinge = hingeAtStart ? f.start : f.end;
    const sign = ent.swing === 'right' ? -1 : 1;
    const leafDir = g.mul(f.normal, ent.flip ? -1 : 1);
    const leafEnd = g.add(hinge, g.mul(leafDir, ent.width));
    ctx.beginPath();
    ctx.moveTo(hinge.x, hinge.y);
    ctx.lineTo(leafEnd.x, leafEnd.y);
    ctx.stroke();

    const a0 = g.angleOf(g.sub(leafEnd, hinge));
    const toOther = g.angleOf(g.sub(hingeAtStart ? f.end : f.start, hinge));
    let sweep = toOther - a0;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    ctx.beginPath();
    ctx.arc(hinge.x, hinge.y, ent.width, a0, a0 + sweep, sweep < 0);
    this.applyStroke(vp, style.color, Math.max(0.6, layer.weight * 0.6), [4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    void sign;
  }

  drawDimension(ent, state, style, layer) {
    const { ctx } = this;
    const { viewport: vp, project } = state;
    const dir = g.norm(g.sub(ent.b, ent.a));
    if (!dir.x && !dir.y) return;
    const n = g.perp(dir);
    const off = g.mul(n, ent.offset);
    const a2 = g.add(ent.a, off);
    const b2 = g.add(ent.b, off);
    const gap = g.mul(n, ent.offset >= 0 ? vp.px(3) : -vp.px(3));
    const over = g.mul(n, ent.offset >= 0 ? vp.px(6) : -vp.px(6));

    this.applyStroke(vp, style.color, Math.max(0.6, layer.weight * 0.8), null);
    ctx.beginPath();
    ctx.moveTo(ent.a.x + gap.x, ent.a.y + gap.y);
    ctx.lineTo(a2.x + over.x, a2.y + over.y);
    ctx.moveTo(ent.b.x + gap.x, ent.b.y + gap.y);
    ctx.lineTo(b2.x + over.x, b2.y + over.y);
    ctx.moveTo(a2.x, a2.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.stroke();

    // Architectural tick marks.
    const tick = g.mul(g.norm(g.add(dir, n)), vp.px(5));
    ctx.beginPath();
    ctx.moveTo(a2.x - tick.x, a2.y - tick.y);
    ctx.lineTo(a2.x + tick.x, a2.y + tick.y);
    ctx.moveTo(b2.x - tick.x, b2.y - tick.y);
    ctx.lineTo(b2.x + tick.x, b2.y + tick.y);
    ctx.stroke();

    const mid = g.lerp(a2, b2, 0.5);
    const text = formatLength(g.dist(ent.a, ent.b), project.unitSystem, {
      denominator: project.denominator,
    });
    let angle = g.angleOf(dir);
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
    const size = vp.px(12);
    ctx.save();
    ctx.translate(mid.x, mid.y);
    ctx.rotate(angle);
    ctx.font = `${size}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = THEME.paper;
    ctx.fillRect(-w / 2 - size * 0.2, -size * 1.15, w + size * 0.4, size * 1.1);
    ctx.fillStyle = style.color;
    ctx.fillText(text, 0, -size * 0.25);
    ctx.restore();
  }

  /** Screen-constant multi-line label centred on a model point. */
  label(vp, at, lines, color) {
    const { ctx } = this;
    const size = vp.px(12);
    ctx.font = `${size}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    const start = at.y - ((lines.length - 1) * size * 1.25) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, at.x, start + i * size * 1.25);
    });
  }

  // --- overlays ---------------------------------------------------------

  drawSelection(state) {
    const { ctx } = this;
    const { viewport: vp, page, selection, hover } = state;
    const byId = new Map(page.entities.map((e) => [e.id, e]));

    if (hover && !selection.has(hover)) {
      const ent = byId.get(hover);
      if (ent) this.outlineEntity(ent, state, THEME.hover, 2.5);
    }

    for (const id of selection) {
      const ent = byId.get(id);
      if (ent) this.outlineEntity(ent, state, THEME.accent, 2.5);
    }

    if (selection.size && selection.size <= 4) {
      const size = vp.px(4);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = vp.px(1.4);
      for (const id of selection) {
        const ent = byId.get(id);
        if (!ent) continue;
        for (const h of handlesOf(ent, page)) {
          ctx.beginPath();
          ctx.rect(h.p.x - size, h.p.y - size, size * 2, size * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  outlineEntity(ent, state, color, weight) {
    const { ctx } = this;
    const { viewport: vp, page } = state;
    this.applyStroke(vp, color, weight, null);
    for (const p of outlines(ent, page)) {
      if (p.pts.length < 2) {
        ctx.beginPath();
        ctx.arc(p.pts[0].x, p.pts[0].y, vp.px(5), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      this.path(p.pts, p.closed);
      ctx.stroke();
    }
    if (ent.type === 'dim') {
      const dir = g.norm(g.sub(ent.b, ent.a));
      const off = g.mul(g.perp(dir), ent.offset);
      this.path([g.add(ent.a, off), g.add(ent.b, off)], false);
      ctx.stroke();
    }
    if (ent.type === 'text') {
      const box = g.bboxOfPoints([ent.p, g.vec(ent.p.x + ent.text.length * ent.size * 0.6, ent.p.y - ent.size)]);
      ctx.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
    }
  }

  drawPreview(state) {
    const { ctx } = this;
    const { viewport: vp, preview } = state;
    if (!preview) return;

    const ghostLayer = { color: THEME.accent, weight: 1.4, dash: [6, 4] };
    for (const ent of preview.entities || []) {
      if (RICH_PREVIEW.has(ent.type)) {
        this.drawEntity(ent, state, ghostLayer);
        continue;
      }
      this.applyStroke(vp, THEME.accent, 1.6, [6, 4]);
      for (const p of outlines(ent, state.page)) {
        if (p.pts.length < 2) continue;
        this.path(p.pts, p.closed);
        ctx.stroke();
      }
    }
    for (const guide of preview.guides || []) {
      this.applyStroke(vp, THEME.accent, 1, [3, 3]);
      this.path(guide, false);
      ctx.stroke();
    }
    if (preview.label && preview.labelAt) {
      const size = vp.px(12);
      ctx.font = `${size}px "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(preview.label).width;
      const x = preview.labelAt.x + vp.px(14);
      const y = preview.labelAt.y - vp.px(14);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(x - vp.px(4), y - size * 0.75, w + vp.px(8), size * 1.5);
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = vp.px(1);
      ctx.setLineDash([]);
      ctx.strokeRect(x - vp.px(4), y - size * 0.75, w + vp.px(8), size * 1.5);
      ctx.fillStyle = THEME.text;
      ctx.fillText(preview.label, x, y);
    }
    ctx.setLineDash([]);
  }

  drawSnap(state) {
    const { ctx } = this;
    const { viewport: vp, snap } = state;
    if (!snap || !snap.kind) return;
    const s = vp.px(5);
    const p = snap.point;
    ctx.strokeStyle = THEME.snap;
    ctx.lineWidth = vp.px(1.8);
    ctx.setLineDash([]);
    ctx.beginPath();
    if (snap.kind === 'endpoint') {
      ctx.rect(p.x - s, p.y - s, s * 2, s * 2);
    } else if (snap.kind === 'midpoint') {
      ctx.moveTo(p.x - s, p.y + s);
      ctx.lineTo(p.x, p.y - s);
      ctx.lineTo(p.x + s, p.y + s);
      ctx.closePath();
    } else if (snap.kind === 'center' || snap.kind === 'quadrant') {
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
    } else if (snap.kind === 'intersection') {
      ctx.moveTo(p.x - s, p.y - s);
      ctx.lineTo(p.x + s, p.y + s);
      ctx.moveTo(p.x + s, p.y - s);
      ctx.lineTo(p.x - s, p.y + s);
    } else {
      ctx.rect(p.x - s * 0.7, p.y - s * 0.7, s * 1.4, s * 1.4);
    }
    ctx.stroke();
  }

  drawMarquee(state) {
    const { ctx } = this;
    const { viewport: vp, marquee } = state;
    if (!marquee) return;
    const { a, b, crossing } = marquee;
    ctx.setLineDash(crossing ? [vp.px(6), vp.px(4)] : []);
    ctx.strokeStyle = crossing ? '#16a34a' : THEME.accent;
    ctx.fillStyle = crossing ? 'rgba(22,163,74,0.10)' : THEME.accentSoft;
    ctx.lineWidth = vp.px(1.2);
    ctx.beginPath();
    ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
