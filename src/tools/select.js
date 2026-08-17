import { Tool } from './tool.js';
import * as g from '../core/geometry.js';
import {
  hitTest,
  handlesOf,
  translate,
  moveHandle,
  bboxOf,
  findEntity,
  entityLength,
  setEntityLength,
  ENTITY_LABELS,
} from '../core/entities.js';

const MODE = { NONE: 0, MOVE: 1, GRIP: 2, MARQUEE: 3 };

export class SelectTool extends Tool {
  static id = 'select';
  static label = 'Select';
  static hint = 'Click to select · Shift-click to add · drag to move · drag empty space to marquee · Del to erase';
  static cursor = 'default';

  constructor(app) {
    super(app);
    this.mode = MODE.NONE;
    this.start = null;
    this.originals = null;
    this.grip = null;
    this.marquee = null;
    this.moved = false;
  }

  reset() {
    this.mode = MODE.NONE;
    this.start = null;
    this.originals = null;
    this.grip = null;
    this.marquee = null;
    this.moved = false;
  }

  pickable() {
    const project = this.project;
    return this.page.entities.filter((e) => {
      const layer = project.layers.find((l) => l.id === e.layer);
      return !layer || (layer.visible && !layer.locked);
    });
  }

  entityAt(pt, tol) {
    const list = this.pickable();
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (hitTest(list[i], this.page, pt, tol)) return list[i];
    }
    return null;
  }

  gripAt(pt, tol) {
    for (const id of this.app.selection) {
      const ent = this.page.entities.find((e) => e.id === id);
      if (!ent) continue;
      for (const h of handlesOf(ent, this.page)) {
        if (g.dist(h.p, pt) <= tol) return { entityId: id, name: h.name };
      }
    }
    return null;
  }

  onPointerMoveIdle(pt, tol) {
    const ent = this.entityAt(pt, tol);
    this.app.setHover(ent ? ent.id : null);
  }

  onPointerDown(pt, event) {
    const tol = this.app.pickTolerance();
    this.start = pt;
    this.moved = false;

    const grip = this.gripAt(pt, tol * 1.2);
    if (grip) {
      this.mode = MODE.GRIP;
      this.grip = grip;
      this.originals = this.snapshotSelection();
      return;
    }

    const ent = this.entityAt(pt, tol);
    if (ent) {
      if (event.shiftKey) {
        this.app.toggleSelection(ent.id);
      } else if (!this.app.selection.has(ent.id)) {
        this.app.setSelection([ent.id]);
      }
      if (this.app.selection.has(ent.id)) {
        this.mode = MODE.MOVE;
        this.originals = this.snapshotSelection();
      }
      return;
    }

    if (!event.shiftKey) this.app.setSelection([]);
    this.mode = MODE.MARQUEE;
    this.marquee = { a: pt, b: pt, crossing: false };
  }

  snapshotSelection() {
    const map = new Map();
    for (const id of this.app.selection) {
      const ent = this.page.entities.find((e) => e.id === id);
      if (ent) map.set(id, JSON.parse(JSON.stringify(ent)));
    }
    return map;
  }

  onPointerMove(pt, event) {
    if (this.mode === MODE.NONE) {
      this.onPointerMoveIdle(pt, this.app.pickTolerance());
      return;
    }
    this.moved = true;

    if (this.mode === MODE.MARQUEE) {
      this.marquee = { a: this.start, b: pt, crossing: pt.x < this.start.x };
      this.app.setMarquee(this.marquee);
      return;
    }

    if (this.mode === MODE.MOVE) {
      const delta = g.sub(pt, this.start);
      for (const [id, original] of this.originals) {
        const ent = this.page.entities.find((e) => e.id === id);
        if (!ent) continue;
        if (ent.type === 'opening') {
          moveHandle(ent, 'center', pt, this.page);
          continue;
        }
        Object.assign(ent, JSON.parse(JSON.stringify(original)));
        translate(ent, delta);
      }
      this.app.setStatus(
        `Move Δx ${this.app.fmt(delta.x)}  Δy ${this.app.fmt(delta.y)}`
      );
      return;
    }

    if (this.mode === MODE.GRIP) {
      const ent = this.page.entities.find((e) => e.id === this.grip.entityId);
      if (ent) {
        const original = this.originals.get(this.grip.entityId);
        if (original) Object.assign(ent, JSON.parse(JSON.stringify(original)));
        moveHandle(ent, this.grip.name, pt, this.page);
      }
      void event;
    }
  }

  onPointerUp(pt) {
    if (this.mode === MODE.MARQUEE) {
      const box = g.bboxOfPoints([this.start, pt]);
      const crossing = pt.x < this.start.x;
      const hits = this.pickable().filter((ent) => {
        const eb = bboxOf(ent, this.page);
        if (!g.bboxValid(eb)) return false;
        return crossing ? g.bboxIntersects(box, eb) : g.bboxContainsBox(box, eb);
      });
      const ids = hits.map((e) => e.id);
      if (this.moved) {
        this.app.setSelection([...new Set([...this.app.selection, ...ids])]);
      }
      this.app.setMarquee(null);
    } else if (this.moved && (this.mode === MODE.MOVE || this.mode === MODE.GRIP)) {
      this.app.commit(this.mode === MODE.MOVE ? 'Move' : 'Edit');
    }
    this.reset();
  }

  onDoubleClick(pt) {
    const ent = this.entityAt(pt, this.app.pickTolerance());
    if (ent) this.app.editEntityInline(ent);
  }

  /**
   * With one thing selected, a typed length resizes it — the same number the
   * sidebar's Length box takes, for people who would rather not reach for the
   * mouse. It holds the start end still, exactly as the sidebar does.
   */
  applyNumeric(values) {
    if (!values.length) return false;
    const ids = [...this.app.selection];
    if (ids.length !== 1) {
      if (ids.length > 1) {
        this.app.setStatus('Select one object to set its length — a typed length resizes one thing.', true);
      }
      return false;
    }
    const ent = findEntity(this.page, ids[0]);
    if (!ent || entityLength(ent) === null) {
      if (ent) {
        this.app.setStatus(
          `A ${(ENTITY_LABELS[ent.type] || ent.type).toLowerCase()} has no single length to set — use the Properties panel.`,
          true
        );
      }
      return false;
    }
    if (!setEntityLength(ent, values[0], this.page)) return false;
    this.app.commit('Set length');
    this.app.setStatus(`Length set to ${this.app.fmt(values[0])}.`);
    return true;
  }
}
