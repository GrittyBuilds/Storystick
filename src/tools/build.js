import { Tool } from './tool.js';
import * as g from '../core/geometry.js';
import { makeWall, makeOpening, makeDim, wallLength } from '../core/entities.js';
import { formatAngle } from '../core/units.js';

export class WallTool extends Tool {
  static id = 'wall';
  static label = 'Wall';
  static hint = 'Click along the wall centreline. Type a length and press Enter for exact runs. Esc ends the chain.';

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
    const d = this.app.defaults.wall;
    this.app.add(
      makeWall(start, end, this.app.layerFor('wall', d.status), d.thickness, d.status),
      'Draw wall'
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

  onKey(event) {
    if (event.key === 'Escape') {
      this.reset();
      return true;
    }
    return false;
  }

  preview() {
    if (!this.pts.length || !this.cursorPt) return null;
    const a = this.pts[this.pts.length - 1];
    const b = this.cursorPt;
    const d = this.app.defaults.wall;
    return {
      entities: [makeWall(a, b, this.app.layerFor('wall', d.status), d.thickness, d.status)],
      guides: [[a, b]],
      label: `${this.app.fmt(g.dist(a, b))}  ${formatAngle(g.angleOf(g.sub(b, a)))}  ·  ${this.app.fmt(
        d.thickness
      )} thick`,
      labelAt: b,
    };
  }
}

class OpeningToolBase extends Tool {
  constructor(app, kind) {
    super(app);
    this.kind = kind;
    this.target = null;
  }

  reset() {
    this.target = null;
  }

  defaults() {
    return this.app.defaults[this.kind] || { width: 32 };
  }

  locate(pt) {
    const tol = this.app.pickTolerance() * 2.5;
    let best = null;
    for (const ent of this.page.entities) {
      if (ent.type !== 'wall') continue;
      const layer = this.project.layers.find((l) => l.id === ent.layer);
      if (layer && (!layer.visible || layer.locked)) continue;
      const near = g.closestPointOnSegment(pt, ent.a, ent.b);
      const d = g.dist(near, pt);
      if (d > Math.max(tol, ent.thickness)) continue;
      if (!best || d < best.d) best = { wall: ent, t: near.t ?? 0.5, d };
    }
    if (!best) return null;
    const total = wallLength(best.wall);
    const width = this.defaults().width;
    if (total <= width) return null;
    const half = width / 2 / total;
    best.t = Math.max(half, Math.min(1 - half, best.t));
    return best;
  }

  onPointerMove(pt) {
    this.target = this.locate(pt);
  }

  onPointerDown(pt) {
    const target = this.target || this.locate(pt);
    if (!target) {
      this.app.setStatus(`Click on a wall to place a ${this.kind}.`);
      return;
    }
    const d = this.defaults();
    const ent = makeOpening(
      target.wall.id,
      target.t,
      this.app.layerFor('opening'),
      this.kind,
      d.width,
      { swing: d.swing, sill: d.sill, height: d.height, tag: this.app.nextOpeningTag(this.kind) }
    );
    this.app.add(ent, `Add ${this.kind}`);
    this.app.setSelection([ent.id]);
  }

  preview() {
    if (!this.target) return null;
    const d = this.defaults();
    const ghost = makeOpening(
      this.target.wall.id,
      this.target.t,
      this.app.layerFor('opening'),
      this.kind,
      d.width
    );
    const total = wallLength(this.target.wall);
    const dir = g.norm(g.sub(this.target.wall.b, this.target.wall.a));
    const center = g.add(this.target.wall.a, g.mul(dir, this.target.t * total));
    return {
      entities: [ghost],
      label: `${this.kind === 'door' ? 'Door' : 'Window'} ${this.app.fmt(d.width)} wide`,
      labelAt: center,
    };
  }
}

export class DoorTool extends OpeningToolBase {
  static id = 'door';
  static label = 'Door';
  static hint = 'Click a wall to drop a door. Change width and swing in Properties.';

  constructor(app) {
    super(app, 'door');
  }
}

export class WindowTool extends OpeningToolBase {
  static id = 'window';
  static label = 'Window';
  static hint = 'Click a wall to drop a window. Change width, sill and head height in Properties.';

  constructor(app) {
    super(app, 'window');
  }
}

export class DimensionTool extends Tool {
  static id = 'dim';
  static label = 'Dimension';
  static hint = 'Click the two points to measure, then click to set how far off the drawing the string sits.';

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
    return this.pts.length === 1 ? this.pts[0] : null;
  }

  onPointerMove(pt) {
    this.cursorPt = pt;
  }

  onPointerDown(pt) {
    if (this.pts.length < 2) {
      this.pts.push(pt);
      return;
    }
    this.app.add(makeDim(this.pts[0], this.pts[1], this.app.layerFor('dim'), this.offsetFor(pt)), 'Add dimension');
    this.reset();
  }

  offsetFor(pt) {
    const [a, b] = this.pts;
    const dir = g.norm(g.sub(b, a));
    if (!dir.x && !dir.y) return 0;
    return g.dot(g.sub(pt, a), g.perp(dir));
  }

  onKey(event) {
    if (event.key === 'Escape') {
      this.reset();
      return true;
    }
    return false;
  }

  preview() {
    if (!this.cursorPt) return null;
    if (this.pts.length === 1) {
      const a = this.pts[0];
      return {
        guides: [[a, this.cursorPt]],
        label: this.app.fmt(g.dist(a, this.cursorPt)),
        labelAt: this.cursorPt,
      };
    }
    if (this.pts.length === 2) {
      const dim = makeDim(this.pts[0], this.pts[1], this.app.layerFor('dim'), this.offsetFor(this.cursorPt));
      return {
        entities: [dim],
        label: this.app.fmt(g.dist(this.pts[0], this.pts[1])),
        labelAt: this.cursorPt,
      };
    }
    return null;
  }
}
