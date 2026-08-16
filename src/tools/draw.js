import { Tool } from './tool.js';
import * as g from '../core/geometry.js';
import {
  makeLine,
  makeRect,
  makeCircle,
  makeArc,
  makePolyline,
  makeRoom,
  makePart,
  makeText,
} from '../core/entities.js';
import { formatArea, formatAngle } from '../core/units.js';

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

export class LineTool extends PointTool {
  static id = 'line';
  static label = 'Line';
  static hint = 'Click start, click end. Type a length and press Enter for exact runs. Esc ends the chain.';

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
    this.app.add(makeLine(start, end, this.app.layerFor('line')), 'Draw line');
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
    const b = this.cursorPt;
    return {
      entities: [makeLine(a, b, this.app.layerFor('line'))],
      label: `${this.app.fmt(g.dist(a, b))}  ${formatAngle(g.angleOf(g.sub(b, a)))}`,
      labelAt: b,
    };
  }
}

export class RectTool extends PointTool {
  static id = 'rect';
  static label = 'Rectangle';
  static hint = 'Click two opposite corners. Type "48 x 24" and press Enter for exact sizes.';

  onPointerDown(pt) {
    if (!this.pts.length) {
      this.pts = [pt];
      return;
    }
    this.create(this.pts[0], pt);
  }

  create(a, b) {
    if (Math.abs(b.x - a.x) < g.EPS || Math.abs(b.y - a.y) < g.EPS) return;
    this.app.add(makeRect(a, b, this.app.layerFor('rect')), 'Draw rectangle');
    this.reset();
  }

  applyNumeric(values) {
    if (!this.pts.length || !values.length) return false;
    const a = this.pts[0];
    const w = values[0];
    const h = values.length > 1 ? values[1] : values[0];
    const sx = this.cursorPt && this.cursorPt.x < a.x ? -1 : 1;
    const sy = this.cursorPt && this.cursorPt.y < a.y ? -1 : 1;
    this.create(a, g.vec(a.x + w * sx, a.y + h * sy));
    return true;
  }

  preview() {
    if (!this.pts.length || !this.cursorPt) return null;
    const a = this.pts[0];
    const b = this.cursorPt;
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    return {
      entities: [makeRect(a, b, this.app.layerFor('rect'))],
      label: `${this.app.fmt(w)} × ${this.app.fmt(h)}  ${formatArea(w * h, this.project.unitSystem)}`,
      labelAt: b,
    };
  }
}

export class PartTool extends RectTool {
  static id = 'part';
  static label = 'Part';
  static hint = 'Draw a woodworking part rectangle. Set material, thickness and quantity in Properties.';

  create(a, b) {
    if (Math.abs(b.x - a.x) < g.EPS || Math.abs(b.y - a.y) < g.EPS) return;
    const d = this.app.defaults.part;
    const ent = makePart(a, b, this.app.layerFor('part'), {
      name: `Part ${this.app.nextPartNumber()}`,
      material: d.material,
      thickness: d.thickness,
      qty: d.qty,
    });
    this.app.add(ent, 'Draw part');
    this.app.setSelection([ent.id]);
    this.reset();
  }

  preview() {
    const base = super.preview();
    if (!base) return null;
    base.entities = [makePart(this.pts[0], this.cursorPt, this.app.layerFor('part'))];
    return base;
  }
}

export class CircleTool extends PointTool {
  static id = 'circle';
  static label = 'Circle';
  static hint = 'Click the centre, then a point on the circle. Type a radius and press Enter.';

  onPointerDown(pt) {
    if (!this.pts.length) {
      this.pts = [pt];
      return;
    }
    this.create(g.dist(this.pts[0], pt));
  }

  create(radius) {
    if (radius < g.EPS) return;
    this.app.add(makeCircle(this.pts[0], radius, this.app.layerFor('circle')), 'Draw circle');
    this.reset();
  }

  applyNumeric(values) {
    if (!this.pts.length || !values.length) return false;
    this.create(values[0]);
    return true;
  }

  preview() {
    if (!this.pts.length || !this.cursorPt) return null;
    const r = g.dist(this.pts[0], this.cursorPt);
    return {
      entities: [makeCircle(this.pts[0], r, this.app.layerFor('circle'))],
      guides: [[this.pts[0], this.cursorPt]],
      label: `R ${this.app.fmt(r)}  ⌀ ${this.app.fmt(r * 2)}`,
      labelAt: this.cursorPt,
    };
  }
}

export class ArcTool extends PointTool {
  static id = 'arc';
  static label = 'Arc';
  static hint = 'Click the centre, the start point, then the end point.';

  onPointerDown(pt) {
    this.pts.push(pt);
    if (this.pts.length === 3) {
      const [c, s, e] = this.pts;
      const r = g.dist(c, s);
      if (r > g.EPS) {
        this.app.add(
          makeArc(c, r, g.angleOf(g.sub(s, c)), g.angleOf(g.sub(e, c)), this.app.layerFor('arc')),
          'Draw arc'
        );
      }
      this.reset();
    }
  }

  preview() {
    if (!this.pts.length || !this.cursorPt) return null;
    const c = this.pts[0];
    if (this.pts.length === 1) {
      const r = g.dist(c, this.cursorPt);
      return { guides: [[c, this.cursorPt]], label: `R ${this.app.fmt(r)}`, labelAt: this.cursorPt };
    }
    const r = g.dist(c, this.pts[1]);
    const a0 = g.angleOf(g.sub(this.pts[1], c));
    const a1 = g.angleOf(g.sub(this.cursorPt, c));
    return {
      entities: [makeArc(c, r, a0, a1, this.app.layerFor('arc'))],
      guides: [[c, this.cursorPt]],
      label: `R ${this.app.fmt(r)}`,
      labelAt: this.cursorPt,
    };
  }
}

class ChainTool extends PointTool {
  finish() {
    this.reset();
  }

  onPointerDown(pt) {
    this.pts.push(pt);
  }

  onDoubleClick() {
    this.finish();
  }

  onKey(event) {
    if (event.key === 'Enter') {
      this.finish();
      return true;
    }
    if (event.key === 'Escape') {
      this.reset();
      return true;
    }
    if (event.key === 'Backspace' && this.pts.length) {
      this.pts.pop();
      return true;
    }
    return false;
  }

  applyNumeric(values) {
    if (!this.pts.length || !this.cursorPt || !values.length) return false;
    const start = this.pts[this.pts.length - 1];
    const dir = g.norm(g.sub(this.cursorPt, start));
    if (!dir.x && !dir.y) return false;
    this.pts.push(g.add(start, g.mul(dir, values[0])));
    return true;
  }
}

export class PolylineTool extends ChainTool {
  static id = 'polyline';
  static label = 'Polyline';
  static hint = 'Click each vertex. Enter or double-click to finish, C to close, Backspace to undo a vertex.';

  finish(closed = false) {
    if (this.pts.length >= 2) {
      this.app.add(
        makePolyline(this.pts, this.app.layerFor('polyline'), closed),
        'Draw polyline'
      );
    }
    this.reset();
  }

  onKey(event) {
    if (event.key.toLowerCase() === 'c' && this.pts.length >= 3) {
      this.finish(true);
      return true;
    }
    return super.onKey(event);
  }

  preview() {
    if (!this.pts.length || !this.cursorPt) return null;
    const pts = [...this.pts, this.cursorPt];
    const last = this.pts[this.pts.length - 1];
    return {
      entities: [makePolyline(pts, this.app.layerFor('polyline'), false)],
      label: `${this.app.fmt(g.dist(last, this.cursorPt))}  ·  ${this.pts.length} pts`,
      labelAt: this.cursorPt,
    };
  }
}

export class RoomTool extends ChainTool {
  static id = 'room';
  static label = 'Room';
  static hint = 'Click each corner of the room. Enter or double-click to close and name it.';

  finish() {
    if (this.pts.length >= 3) {
      const name = this.app.promptText('Room name', `Room ${this.app.nextRoomNumber()}`);
      if (name !== null) {
        this.app.add(makeRoom(this.pts, this.app.layerFor('room'), name || 'Room'), 'Add room');
      }
    }
    this.reset();
  }

  preview() {
    if (!this.pts.length || !this.cursorPt) return null;
    const pts = [...this.pts, this.cursorPt];
    const area = pts.length >= 3 ? Math.abs(g.polygonArea(pts)) : 0;
    return {
      entities: [makePolyline(pts, this.app.layerFor('room'), pts.length >= 3)],
      label: area ? formatArea(area, this.project.unitSystem) : this.app.fmt(g.dist(this.pts[0], this.cursorPt)),
      labelAt: this.cursorPt,
    };
  }
}

export class TextTool extends Tool {
  static id = 'text';
  static label = 'Text';
  static hint = 'Click where the note should start, then type it.';

  onPointerDown(pt) {
    const value = this.app.promptText('Note text', '');
    if (value) {
      this.app.add(
        makeText(pt, value, this.app.layerFor('text'), this.app.defaults.textSize),
        'Add note'
      );
    }
  }
}

export class MeasureTool extends PointTool {
  static id = 'measure';
  static label = 'Measure';
  static hint = 'Click two points to read distance, run and rise. Nothing is added to the drawing.';

  onPointerDown(pt) {
    if (!this.pts.length) this.pts = [pt];
    else this.reset();
  }

  preview() {
    if (!this.pts.length || !this.cursorPt) return null;
    const a = this.pts[0];
    const b = this.cursorPt;
    const d = g.sub(b, a);
    return {
      guides: [[a, b]],
      label: `${this.app.fmt(g.len(d))}  ·  Δx ${this.app.fmt(Math.abs(d.x))}  Δy ${this.app.fmt(
        Math.abs(d.y)
      )}  ${formatAngle(g.angleOf(d))}`,
      labelAt: b,
    };
  }
}
