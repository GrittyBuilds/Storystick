// Symbol drawing.
//
// A symbol is a list of ops in inches relative to its insertion point, y-down.
// The same op list drives the canvas renderer, the SVG exporter and the symbol
// picker, so a symbol is defined once and looks identical everywhere.
//
// Ops:
//   { t:'l', pts:[[x,y],...] }        open polyline
//   { t:'f', pts:[[x,y],...] }        filled polygon
//   { t:'c', c:[x,y], r }             circle
//   { t:'a', c:[x,y], r, a0, a1 }     arc, radians
//   { t:'x', p:[x,y], s:'text', h }   text, h is height in inches
// Any op may carry w, a relative line weight where 1 is normal.

const cos = Math.cos;
const sin = Math.sin;

/** Place a local symbol point into model space. */
export function place(point, fixture) {
  const scale = fixture.scale || 1;
  const mirror = fixture.mirrored ? -1 : 1;
  const x = point[0] * scale * mirror;
  const y = point[1] * scale;
  const a = fixture.rot || 0;
  return {
    x: fixture.p.x + x * cos(a) - y * sin(a),
    y: fixture.p.y + x * sin(a) + y * cos(a),
  };
}

/** Every point a symbol touches, in model space — used for bounds and picking. */
export function symbolPoints(symbol, fixture) {
  if (!symbol) return [fixture.p];
  const pts = [];
  for (const op of symbol.ops || []) {
    if (op.t === 'l' || op.t === 'f') {
      for (const p of op.pts || []) pts.push(place(p, fixture));
    } else if (op.t === 'c' || op.t === 'a') {
      const r = op.r || 0;
      const c = op.c || [0, 0];
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        pts.push(place([c[0] + cos(a) * r, c[1] + sin(a) * r], fixture));
      }
    } else if (op.t === 'x') {
      pts.push(place(op.p || [0, 0], fixture));
    }
  }
  return pts.length ? pts : [fixture.p];
}

/** Nominal footprint radius, for hit testing when the symbol is unknown. */
export function symbolReach(symbol) {
  if (!symbol) return 6;
  return Math.max(symbol.widthIn || 12, symbol.heightIn || 12) / 2;
}

/**
 * Draw a symbol to a 2D canvas already transformed into model space.
 * @param ctx canvas context
 * @param vp  viewport, for screen-constant text and weights
 * @param opts { color, weight, textColor }
 */
export function drawSymbolCanvas(ctx, symbol, fixture, vp, opts) {
  if (!symbol) return;
  const baseWeight = opts.weight;
  for (const op of symbol.ops || []) {
    ctx.beginPath();
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = vp.px(baseWeight * (op.w || 1));
    ctx.setLineDash(op.d ? op.d.map((d) => vp.px(d)) : []);

    if (op.t === 'l' || op.t === 'f') {
      const pts = (op.pts || []).map((p) => place(p, fixture));
      if (pts.length < 2) continue;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      if (op.t === 'f') {
        ctx.closePath();
        ctx.fillStyle = opts.color;
        ctx.fill();
      }
      ctx.stroke();
    } else if (op.t === 'c') {
      const centre = place(op.c || [0, 0], fixture);
      const r = (op.r || 0) * (fixture.scale || 1);
      ctx.arc(centre.x, centre.y, r, 0, Math.PI * 2);
      if (op.fill) {
        ctx.fillStyle = opts.color;
        ctx.fill();
      }
      ctx.stroke();
    } else if (op.t === 'a') {
      const centre = place(op.c || [0, 0], fixture);
      const r = (op.r || 0) * (fixture.scale || 1);
      const rot = fixture.rot || 0;
      ctx.arc(centre.x, centre.y, r, (op.a0 || 0) + rot, (op.a1 || 0) + rot);
      ctx.stroke();
    } else if (op.t === 'x') {
      const at = place(op.p || [0, 0], fixture);
      const size = Math.max((op.h || 4) * (fixture.scale || 1), vp.px(7));
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.rotate(fixture.rot || 0);
      ctx.font = `500 ${size}px ${opts.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = opts.textColor || opts.color;
      ctx.fillText(op.s || '', 0, 0);
      ctx.restore();
    }
  }
  ctx.setLineDash([]);
}

const n = (v) => (Math.round(v * 1000) / 1000).toString();

const escapeXml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Draw a symbol as SVG markup, in model coordinates. */
export function drawSymbolSvg(symbol, fixture, opts) {
  if (!symbol) return '';
  const out = [];
  // Weights are in the caller's units — paper inches on a plot, model inches in
  // the picker — so the stroke must scale with the coordinate system, not fight
  // it. A non-scaling stroke here plots every symbol as an invisible hairline.
  const stroke = (w) =>
    `fill="none" stroke="${opts.color}" stroke-width="${n(opts.weight * (w || 1))}" ` +
    'stroke-linecap="round" stroke-linejoin="round"';

  for (const op of symbol.ops || []) {
    if (op.t === 'l' || op.t === 'f') {
      const pts = (op.pts || []).map((p) => place(p, fixture));
      if (pts.length < 2) continue;
      const d = pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
      out.push(
        op.t === 'f'
          ? `<polygon points="${d}" fill="${opts.color}" stroke="${opts.color}" stroke-width="${n(
              opts.weight
            )}"/>`
          : `<polyline points="${d}" ${stroke(op.w)}/>`
      );
    } else if (op.t === 'c') {
      const centre = place(op.c || [0, 0], fixture);
      const r = (op.r || 0) * (fixture.scale || 1);
      out.push(
        op.fill
          ? `<circle cx="${n(centre.x)}" cy="${n(centre.y)}" r="${n(r)}" fill="${opts.color}"/>`
          : `<circle cx="${n(centre.x)}" cy="${n(centre.y)}" r="${n(r)}" ${stroke(op.w)}/>`
      );
    } else if (op.t === 'a') {
      const centre = place(op.c || [0, 0], fixture);
      const r = (op.r || 0) * (fixture.scale || 1);
      const rot = fixture.rot || 0;
      const a0 = (op.a0 || 0) + rot;
      const a1 = (op.a1 || 0) + rot;
      const start = { x: centre.x + cos(a0) * r, y: centre.y + sin(a0) * r };
      const end = { x: centre.x + cos(a1) * r, y: centre.y + sin(a1) * r };
      const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
      const sweep = a1 >= a0 ? 1 : 0;
      out.push(
        `<path d="M ${n(start.x)} ${n(start.y)} A ${n(r)} ${n(r)} 0 ${large} ${sweep} ${n(end.x)} ${n(
          end.y
        )}" ${stroke(op.w)}/>`
      );
    } else if (op.t === 'x') {
      const at = place(op.p || [0, 0], fixture);
      const size = (op.h || 4) * (fixture.scale || 1);
      const rot = ((fixture.rot || 0) * 180) / Math.PI;
      const transform = rot ? ` transform="rotate(${n(rot)} ${n(at.x)} ${n(at.y)})"` : '';
      out.push(
        `<text x="${n(at.x)}" y="${n(at.y)}" font-size="${n(size)}" fill="${
          opts.textColor || opts.color
        }" text-anchor="middle" dominant-baseline="middle" font-family="${opts.font}" font-weight="500"${transform}>${escapeXml(
          op.s || ''
        )}</text>`
      );
    }
  }
  return out.join('');
}

/** A standalone SVG of one symbol, for the picker. */
export function symbolPreviewSvg(symbol, size = 40, color = '#0F2338') {
  const reach = Math.max(symbol.widthIn || 12, symbol.heightIn || 12) * 0.62;
  const fixture = { p: { x: 0, y: 0 }, rot: 0, scale: 1 };
  const body = drawSymbolSvg(symbol, fixture, { color, weight: reach / 22, font: 'Inter, sans-serif' });
  return `<svg viewBox="${-reach} ${-reach} ${reach * 2} ${reach * 2}" width="${size}" height="${size}">${body}</svg>`;
}
