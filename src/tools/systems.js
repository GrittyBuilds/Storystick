// Tools for everything that is not the architectural floor plan: the roof, the
// foundation, the structure holding it up, and the electrical, plumbing and
// mechanical work that runs through it.
//
// Each of these draws onto its own layer, so a plumbing plan is the same
// drawing with a different set of layers turned on — which is what a permit set
// actually is, and why the pipes and the joists cannot drift out of alignment
// with the walls.

import { Tool } from './tool.js';
import * as g from '../core/geometry.js';
import {
  makeRoofPlane,
  makeFooting,
  makePadFooting,
  makeSlab,
  makeBeam,
  makeFixture,
  makePolyline,
} from '../core/entities.js';
import { formatArea } from '../core/units.js';
import { getSymbol, layerForSymbol } from '../symbols/library.js';

class PointTool extends Tool {
  constructor(app) {
    super(app);
    this.pts = [];
    this.cursorPt = null;
  }

  reset() {
    this.pts = [];
    this.cursorPt = null;
  }

  get anchor() {
    return this.pts.length ? this.pts[this.pts.length - 1] : null;
  }

  onPointerMove(pt) {
    this.cursorPt = pt;
  }

  onKey(event) {
    if (event.key === 'Escape') {
      this.reset();
      return true;
    }
    return false;
  }
}

class PolygonTool extends PointTool {
  onPointerDown(pt) {
    this.pts.push(pt);
  }

  onDoubleClick() {
    this.finish();
  }

  finish() {
    this.reset();
  }

  onKey(event) {
    if (event.key === 'Enter') {
      this.finish();
      return true;
    }
    if (event.key === 'Backspace' && this.pts.length) {
      this.pts.pop();
      return true;
    }
    return super.onKey(event);
  }

  applyNumeric(values) {
    if (!this.pts.length || !this.cursorPt || !values.length) return false;
    const start = this.pts[this.pts.length - 1];
    const dir = g.norm(g.sub(this.cursorPt, start));
    if (!dir.x && !dir.y) return false;
    this.pts.push(g.add(start, g.mul(dir, values[0])));
    return true;
  }

  ghost(closed = true) {
    const pts = [...this.pts, this.cursorPt];
    return makePolyline(pts, this.app.activeLayerId || 'sketch', closed && pts.length >= 3);
  }
}

// --- roof ------------------------------------------------------------------

export class RoofTool extends PolygonTool {
  static id = 'roof';
  static label = 'Roof plane';
  static hint =
    'Click the corners of one roof plane. Enter or double-click to close, then click the eave edge — the pitch runs up from there.';

  constructor(app) {
    super(app);
    this.pending = null;
  }

  reset() {
    super.reset();
    this.pending = null;
  }

  onPointerDown(pt) {
    if (!this.pending) {
      super.onPointerDown(pt);
      return;
    }
    // Second phase: the click picks which edge is the eave.
    this.commit(this.nearestEdge(pt));
  }

  finish() {
    if (this.pts.length >= 3) {
      this.pending = this.pts.slice();
      this.app.setStatus('Click the eave edge — the low side the roof slopes up from.');
    } else {
      this.reset();
    }
  }

  nearestEdge(pt) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.pending.length; i += 1) {
      const a = this.pending[i];
      const b = this.pending[(i + 1) % this.pending.length];
      const d = g.dist(g.closestPointOnSegment(pt, a, b), pt);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  commit(eave) {
    const d = this.app.defaults.roof;
    const ent = makeRoofPlane(this.pending, this.app.layerFor('roofPlane'), {
      eave,
      pitch: d.pitch,
      eaveHeight: d.eaveHeight,
      overhang: d.overhang,
    });
    this.app.add(ent, 'Draw roof plane');
    this.app.setSelection([ent.id]);
    this.reset();
  }

  preview() {
    if (this.pending) {
      if (!this.cursorPt) return null;
      const i = this.nearestEdge(this.cursorPt);
      const a = this.pending[i];
      const b = this.pending[(i + 1) % this.pending.length];
      return {
        entities: [makePolyline(this.pending, this.app.layerFor('roofPlane'), true)],
        guides: [[a, b]],
        label: 'Eave edge',
        labelAt: g.lerp(a, b, 0.5),
      };
    }
    if (!this.pts.length || !this.cursorPt) return null;
    const pts = [...this.pts, this.cursorPt];
    const area = pts.length >= 3 ? Math.abs(g.polygonArea(pts)) : 0;
    return {
      entities: [this.ghost()],
      label: area
        ? `${formatArea(area, this.project.unitSystem)} in plan`
        : this.app.fmt(g.dist(this.pts[0], this.cursorPt)),
      labelAt: this.cursorPt,
    };
  }
}

// --- foundation ------------------------------------------------------------

export class FootingTool extends PointTool {
  static id = 'footing';
  static label = 'Footing';
  static hint = 'Click the ends of a continuous footing. Width and depth are in Properties. Esc ends the run.';

  onPointerDown(pt) {
    if (!this.pts.length) {
      this.pts = [pt];
      return;
    }
    this.commitSegment(pt);
  }

  commitSegment(end) {
    const start = this.pts[this.pts.length - 1];
    if (g.dist(start, end) < g.EPS) return;
    const d = this.app.defaults.footing;
    this.app.add(
      makeFooting(start, end, this.app.layerFor('footing'), {
        width: d.width,
        thickness: d.thickness,
        depthBelowGrade: d.depthBelowGrade,
      }),
      'Draw footing'
    );
    this.pts = [end];
  }

  applyNumeric(values) {
    if (!this.pts.length || !this.cursorPt || !values.length) return false;
    const start = this.pts[this.pts.length - 1];
    const dir = g.norm(g.sub(this.cursorPt, start));
    if (!dir.x && !dir.y) return false;
    this.commitSegment(g.add(start, g.mul(dir, values[0])));
    return true;
  }

  preview() {
    if (!this.pts.length || !this.cursorPt) return null;
    const a = this.pts[this.pts.length - 1];
    const d = this.app.defaults.footing;
    return {
      entities: [makeFooting(a, this.cursorPt, this.app.layerFor('footing'), { width: d.width })],
      guides: [[a, this.cursorPt]],
      label: `${this.app.fmt(g.dist(a, this.cursorPt))}  ·  ${this.app.fmt(d.width)} wide`,
      labelAt: this.cursorPt,
    };
  }
}

export class PadFootingTool extends Tool {
  static id = 'pad';
  static label = 'Pad footing';
  static hint = 'Click where a post lands. The pad size is in Properties.';

  onPointerDown(pt) {
    const d = this.app.defaults.pad;
    const ent = makePadFooting(pt, this.app.layerFor('footing'), {
      width: d.width,
      length: d.length,
      thickness: d.thickness,
    });
    this.app.add(ent, 'Add pad footing');
    this.app.setSelection([ent.id]);
  }

  onPointerMove(pt) {
    this.cursorPt = pt;
  }

  preview() {
    if (!this.cursorPt) return null;
    const d = this.app.defaults.pad;
    return {
      entities: [makePadFooting(this.cursorPt, this.app.layerFor('footing'), d)],
      label: `${this.app.fmt(d.width)} × ${this.app.fmt(d.length)} pad`,
      labelAt: this.cursorPt,
    };
  }
}

export class SlabTool extends PolygonTool {
  static id = 'slab';
  static label = 'Slab';
  static hint = 'Click the corners of the slab. Enter or double-click to close.';

  finish() {
    if (this.pts.length >= 3) {
      const d = this.app.defaults.slab;
      const ent = makeSlab(this.pts, this.app.layerFor('slab'), {
        thickness: d.thickness,
        topElevation: d.topElevation,
        reinforcement: d.reinforcement,
      });
      this.app.add(ent, 'Draw slab');
      this.app.setSelection([ent.id]);
    }
    this.reset();
  }

  preview() {
    if (!this.pts.length || !this.cursorPt) return null;
    const pts = [...this.pts, this.cursorPt];
    const area = pts.length >= 3 ? Math.abs(g.polygonArea(pts)) : 0;
    return {
      entities: [this.ghost()],
      label: area
        ? formatArea(area, this.project.unitSystem)
        : this.app.fmt(g.dist(this.pts[0], this.cursorPt)),
      labelAt: this.cursorPt,
    };
  }
}

// --- structure -------------------------------------------------------------

export class BeamTool extends PointTool {
  static id = 'beam';
  static label = 'Beam';
  static hint = 'Click each end of the beam. Size, plies and material are in Properties.';

  onPointerDown(pt) {
    if (!this.pts.length) {
      this.pts = [pt];
      return;
    }
    this.commit(pt);
  }

  commit(end) {
    const start = this.pts[0];
    if (g.dist(start, end) < g.EPS) return;
    const d = this.app.defaults.beam;
    const ent = makeBeam(start, end, this.app.layerFor('beam'), {
      size: d.size,
      plies: d.plies,
      material: d.material,
      tag: `B${this.app.nextBeamNumber()}`,
    });
    this.app.add(ent, 'Draw beam');
    this.app.setSelection([ent.id]);
    this.reset();
  }

  applyNumeric(values) {
    if (!this.pts.length || !this.cursorPt || !values.length) return false;
    const dir = g.norm(g.sub(this.cursorPt, this.pts[0]));
    if (!dir.x && !dir.y) return false;
    this.commit(g.add(this.pts[0], g.mul(dir, values[0])));
    return true;
  }

  preview() {
    if (!this.pts.length || !this.cursorPt) return null;
    const d = this.app.defaults.beam;
    const span = g.dist(this.pts[0], this.cursorPt);
    return {
      entities: [
        makeBeam(this.pts[0], this.cursorPt, this.app.layerFor('beam'), {
          size: d.size,
          plies: d.plies,
        }),
      ],
      guides: [[this.pts[0], this.cursorPt]],
      label: `${this.app.fmt(span)} span  ·  ${d.plies > 1 ? `(${d.plies}) ` : ''}${d.size}`,
      labelAt: this.cursorPt,
    };
  }
}

// --- symbols ---------------------------------------------------------------

/**
 * One tool places every symbol in the library. The active symbol comes from the
 * app so the palette, the keyboard and the properties panel all drive the same
 * state — and a new symbol never needs a new tool.
 */
export class FixtureTool extends Tool {
  static id = 'fixture';
  static label = 'Symbol';
  static hint =
    'Pick a symbol, then click to place it. R rotates 90°, Shift+R rotates back, F flips it.';

  constructor(app) {
    super(app);
    this.cursorPt = null;
    this.rot = 0;
    this.mirrored = false;
  }

  reset() {
    this.cursorPt = null;
  }

  get symbolId() {
    return this.app.activeSymbolId;
  }

  onPointerMove(pt) {
    this.cursorPt = pt;
  }

  onPointerDown(pt) {
    const id = this.symbolId;
    const symbol = getSymbol(id);
    if (!symbol) {
      this.app.setStatus('Pick a symbol from the palette first.');
      return;
    }
    const ent = makeFixture(id, pt, layerForSymbol(id), {
      rot: this.rot,
      mirrored: this.mirrored,
      discipline: symbol.discipline,
      tag: symbol.tagPrefix ? `${symbol.tagPrefix}${this.app.nextFixtureTag(symbol.tagPrefix)}` : '',
    });
    this.app.add(ent, `Place ${symbol.name.toLowerCase()}`);
  }

  onKey(event) {
    const key = event.key.toLowerCase();
    if (key === 'r') {
      this.rot += (event.shiftKey ? -1 : 1) * (Math.PI / 2);
      return true;
    }
    if (key === 'f') {
      this.mirrored = !this.mirrored;
      return true;
    }
    return false;
  }

  preview() {
    const symbol = getSymbol(this.symbolId);
    if (!symbol || !this.cursorPt) return null;
    return {
      entities: [
        makeFixture(this.symbolId, this.cursorPt, layerForSymbol(this.symbolId), {
          rot: this.rot,
          mirrored: this.mirrored,
          discipline: symbol.discipline,
        }),
      ],
      label: symbol.name,
      labelAt: this.cursorPt,
    };
  }

  hint() {
    const symbol = getSymbol(this.symbolId);
    return symbol ? `${symbol.name} — click to place. R rotates, F flips.` : FixtureTool.hint;
  }
}
