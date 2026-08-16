// Canvas renderer. All drawing happens in model space via a world transform,
// so line weights and UI-sized text divide by zoom to stay screen-constant.
//
// Colours come from src/render/theme.js — there are no raw hex values here —
// and stroke weights are the brand's plotted millimetre weights carried on each
// layer, converted to pixels at draw time.

import * as g from '../core/geometry.js';
import { formatLength, formatArea, IN_PER_FT, mmToIn } from '../core/units.js';
import { outlines, wallSpans, openingFrame, wallLength, handlesOf } from '../core/entities.js';
import {
  palette,
  layerColor,
  wallStatusColor,
  mmToPx,
  LINE_WEIGHT_MM,
  FONT_SANS,
  FONT_MONO,
} from './theme.js';

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

const DIM_TEXT_PX = 11;
const LABEL_TEXT_PX = 12;
const SNAP_PX = 6;
const SELECTION_PX = 2;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.pal = palette('blueprint');
    this.mode = 'blueprint';
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
    this.mode = state.mode === 'paper' ? 'paper' : 'blueprint';
    this.pal = palette(this.mode);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.pal.background;
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
    this.drawTouchTarget(state);
  }

  /**
   * Touch input is offset above the fingertip; this crosshair shows exactly
   * where the point will land so the finger never hides its own target.
   */
  drawTouchTarget(state) {
    if (!state.touchTarget) return;
    const { ctx } = this;
    const { viewport: vp } = state;
    const p = state.touchTarget;
    const arm = vp.px(16);
    const gap = vp.px(4);
    ctx.setLineDash([]);
    ctx.strokeStyle = this.pal.selection;
    ctx.lineWidth = vp.px(1.5);
    ctx.beginPath();
    ctx.moveTo(p.x - arm, p.y);
    ctx.lineTo(p.x - gap, p.y);
    ctx.moveTo(p.x + gap, p.y);
    ctx.lineTo(p.x + arm, p.y);
    ctx.moveTo(p.x, p.y - arm);
    ctx.lineTo(p.x, p.y - gap);
    ctx.moveTo(p.x, p.y + gap);
    ctx.lineTo(p.x, p.y + arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, vp.px(2), 0, Math.PI * 2);
    ctx.fillStyle = this.pal.selection;
    ctx.fill();
  }

  // --- stroke helpers ---------------------------------------------------

  /** Stroke at a plotted millimetre weight. */
  applyStroke(vp, color, weightMm, dash) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = vp.px(Math.max(0.5, mmToPx(weightMm || LINE_WEIGHT_MM.surface)));
    ctx.setLineDash(dash ? dash.map((d) => vp.px(d)) : []);
  }

  /** Stroke at a fixed screen pixel width (UI overlays, not drawing content). */
  applyStrokePx(vp, color, px, dash) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = vp.px(px);
    ctx.setLineDash(dash ? dash.map((d) => vp.px(d)) : []);
  }

  path(pts, closed) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    if (closed) ctx.closePath();
  }

  strokeStyleFor(ent, layer) {
    if (ent.type === 'wall') {
      const status = wallStatusColor(ent.status, this.mode);
      if (status) return status;
    }
    return { color: layerColor(layer, this.mode), dash: layer.dash };
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

    const drawSet = (step, color) => {
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
      ctx.lineWidth = vp.px(1);
      ctx.setLineDash([]);
      ctx.stroke();
    };

    drawSet(minor, this.pal.gridMinor);
    drawSet(major, this.pal.gridMajor);

    ctx.beginPath();
    ctx.moveTo(box.minX, 0);
    ctx.lineTo(box.maxX, 0);
    ctx.moveTo(0, box.minY);
    ctx.lineTo(0, box.maxY);
    ctx.strokeStyle = this.pal.axis;
    ctx.lineWidth = vp.px(1);
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

    // Walls are drawn in two passes so a neighbour's poché never paints over an
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
      const layer = layers.get(ent.layer) || { color: '#46525E', weight: LINE_WEIGHT_MM.surface, dash: null };
      this.drawEntity(ent, state, layer);
    }
    if (!wallsDrawn) drawWalls();
  }

  drawWall(ent, state, layers, pass) {
    const { ctx } = this;
    const { viewport: vp, page } = state;
    const layer = layers.get(ent.layer) || { color: '#46525E', weight: LINE_WEIGHT_MM.sectionCut, dash: null };
    const style = this.strokeStyleFor(ent, layer);
    const total = wallLength(ent) || 1;
    if (pass === 'stroke') this.applyStroke(vp, style.color, layer.weight, style.dash);
    for (const s of wallSpans(ent, page)) {
      const quad = g.thickSegmentQuad(ent.a, ent.b, ent.thickness, s[0] / total, s[1] / total);
      this.path(quad, true);
      if (pass === 'fill') {
        if (ent.status === 'demo') continue;
        ctx.fillStyle = ent.status === 'existing' ? this.pal.wallFillExisting : this.pal.wallFill;
        ctx.fill();
      } else {
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  drawEntity(ent, state, layer) {
    const { ctx } = this;
    const { viewport: vp, project, page } = state;
    const style = this.strokeStyleFor(ent, layer);

    switch (ent.type) {
      case 'room': {
        this.path(ent.pts, true);
        ctx.fillStyle = this.pal.roomFill;
        ctx.fill();
        this.applyStroke(vp, style.color, layer.weight, style.dash);
        ctx.stroke();
        const c = g.polygonCentroid(ent.pts);
        const area = Math.abs(g.polygonArea(ent.pts));
        this.label(vp, c, ent.name, formatArea(area, project.unitSystem), style.color);
        break;
      }
      case 'part': {
        const pts = g.rectCorners(ent.a, ent.b);
        this.path(pts, true);
        ctx.fillStyle = this.pal.partFill;
        ctx.fill();
        this.applyStroke(vp, style.color, layer.weight, style.dash);
        ctx.stroke();
        const w = Math.abs(ent.b.x - ent.a.x);
        const h = Math.abs(ent.b.y - ent.a.y);
        const long = Math.max(w, h);
        const short = Math.min(w, h);
        const size = `${formatLength(long, project.unitSystem, { forceInches: true })} × ${formatLength(
          short,
          project.unitSystem,
          { forceInches: true }
        )}`;
        this.label(
          vp,
          g.lerp(ent.a, ent.b, 0.5),
          ent.qty > 1 ? `${ent.name} ×${ent.qty}` : ent.name,
          size,
          style.color
        );
        break;
      }
      case 'opening': {
        this.drawOpening(ent, state, style, layer);
        break;
      }
      case 'dim': {
        this.drawDimension(ent, state, layer);
        break;
      }
      case 'text': {
        ctx.save();
        ctx.translate(ent.p.x, ent.p.y);
        if (ent.rot) ctx.rotate(ent.rot);
        ctx.fillStyle = style.color;
        ctx.font = `400 ${ent.size}px ${FONT_SANS}`;
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
    this.applyStroke(vp, style.color, LINE_WEIGHT_MM.construction, [4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawDimension(ent, state, layer) {
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
    const weight = layer.weight || LINE_WEIGHT_MM.dimension;

    // Extension lines stay solid; the dimension line itself picks up the
    // Blueprint-mode 3-2 dash from the brand canvas spec.
    this.applyStroke(vp, this.pal.dimensionLine, weight, null);
    ctx.beginPath();
    ctx.moveTo(ent.a.x + gap.x, ent.a.y + gap.y);
    ctx.lineTo(a2.x + over.x, a2.y + over.y);
    ctx.moveTo(ent.b.x + gap.x, ent.b.y + gap.y);
    ctx.lineTo(b2.x + over.x, b2.y + over.y);
    ctx.stroke();

    this.applyStroke(vp, this.pal.dimensionLine, weight, this.pal.dimensionDash);
    ctx.beginPath();
    ctx.moveTo(a2.x, a2.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.stroke();

    // Architectural tick marks.
    this.applyStroke(vp, this.pal.dimensionLine, weight, null);
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
    const size = vp.px(DIM_TEXT_PX);
    ctx.save();
    ctx.translate(mid.x, mid.y);
    ctx.rotate(angle);
    ctx.font = `500 ${size}px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = this.pal.labelHalo;
    ctx.fillRect(-w / 2 - size * 0.3, -size * 1.25, w + size * 0.6, size * 1.2);
    ctx.fillStyle = this.pal.dimensionText;
    ctx.fillText(text, 0, -size * 0.3);
    ctx.restore();
  }

  /**
   * Screen-constant label centred on a model point: the name is prose (Inter),
   * the measurement is exact (IBM Plex Mono).
   */
  label(vp, at, name, value, color) {
    const { ctx } = this;
    const size = vp.px(LABEL_TEXT_PX);
    const valueSize = vp.px(DIM_TEXT_PX);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    if (name) {
      ctx.font = `500 ${size}px ${FONT_SANS}`;
      ctx.fillText(name, at.x, value ? at.y - size * 0.65 : at.y);
    }
    if (value) {
      ctx.font = `400 ${valueSize}px ${FONT_MONO}`;
      ctx.fillText(value, at.x, name ? at.y + valueSize * 0.75 : at.y);
    }
  }

  // --- overlays ---------------------------------------------------------

  drawSelection(state) {
    const { ctx } = this;
    const { viewport: vp, page, selection, hover } = state;
    const byId = new Map(page.entities.map((e) => [e.id, e]));

    if (hover && !selection.has(hover)) {
      const ent = byId.get(hover);
      if (ent) this.outlineEntity(ent, state, this.pal.hover, SELECTION_PX);
    }

    for (const id of selection) {
      const ent = byId.get(id);
      if (ent) this.outlineEntity(ent, state, this.pal.selection, SELECTION_PX);
    }

    if (selection.size && selection.size <= 4) {
      const size = vp.px(4);
      ctx.fillStyle = this.pal.handleFill;
      ctx.strokeStyle = this.pal.selection;
      ctx.lineWidth = vp.px(1.4);
      ctx.setLineDash([]);
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

  outlineEntity(ent, state, color, px) {
    const { ctx } = this;
    const { viewport: vp, page } = state;
    this.applyStrokePx(vp, color, px, null);
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
      const box = g.bboxOfPoints([
        ent.p,
        g.vec(ent.p.x + ent.text.length * ent.size * 0.6, ent.p.y - ent.size),
      ]);
      ctx.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
    }
  }

  drawPreview(state) {
    const { ctx } = this;
    const { viewport: vp, preview } = state;
    if (!preview) return;

    const ghostLayer = {
      color: this.pal.preview,
      colorDark: this.pal.preview,
      weight: LINE_WEIGHT_MM.surface,
      dash: [6, 4],
    };
    for (const ent of preview.entities || []) {
      if (RICH_PREVIEW.has(ent.type)) {
        this.drawEntity(ent, state, ghostLayer);
        continue;
      }
      this.applyStroke(vp, this.pal.preview, LINE_WEIGHT_MM.outline, [6, 4]);
      for (const p of outlines(ent, state.page)) {
        if (p.pts.length < 2) continue;
        this.path(p.pts, p.closed);
        ctx.stroke();
      }
    }
    for (const guide of preview.guides || []) {
      this.applyStroke(vp, this.pal.preview, LINE_WEIGHT_MM.construction, [3, 3]);
      this.path(guide, false);
      ctx.stroke();
    }
    if (preview.label && preview.labelAt) {
      const size = vp.px(DIM_TEXT_PX);
      ctx.font = `500 ${size}px ${FONT_MONO}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(preview.label).width;
      const x = preview.labelAt.x + vp.px(14);
      const y = preview.labelAt.y - vp.px(14);
      ctx.setLineDash([]);
      ctx.fillStyle = this.pal.labelHalo;
      ctx.fillRect(x - vp.px(6), y - size, w + vp.px(12), size * 2);
      ctx.strokeStyle = this.pal.preview;
      ctx.lineWidth = vp.px(1);
      ctx.strokeRect(x - vp.px(6), y - size, w + vp.px(12), size * 2);
      ctx.fillStyle = this.pal.dimensionText;
      ctx.fillText(preview.label, x, y);
    }
    ctx.setLineDash([]);
  }

  drawSnap(state) {
    const { ctx } = this;
    const { viewport: vp, snap } = state;
    if (!snap || !snap.kind) return;
    const s = vp.px(SNAP_PX);
    const p = snap.point;
    ctx.strokeStyle = this.pal.snap;
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
    ctx.strokeStyle = crossing ? this.pal.marqueeCrossing : this.pal.marqueeWindow;
    ctx.fillStyle = crossing ? this.pal.marqueeCrossingFill : this.pal.marqueeWindowFill;
    ctx.lineWidth = vp.px(1.2);
    ctx.beginPath();
    ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
