// Screen <-> model transform. `zoom` is screen pixels per model inch.

import * as g from '../core/geometry.js';

export class Viewport {
  constructor() {
    this.x = -12; // model x at screen x = 0
    this.y = -12;
    this.zoom = 2;
    this.minZoom = 0.02;
    this.maxZoom = 200;
  }

  toScreen(p) {
    return { x: (p.x - this.x) * this.zoom, y: (p.y - this.y) * this.zoom };
  }

  toModel(p) {
    return { x: p.x / this.zoom + this.x, y: p.y / this.zoom + this.y };
  }

  /** Model-space length of `pixels` screen pixels. */
  px(pixels) {
    return pixels / this.zoom;
  }

  panByScreen(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  zoomAt(screenPoint, factor) {
    const before = this.toModel(screenPoint);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const after = this.toModel(screenPoint);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  fit(box, width, height, padding = 48) {
    if (!g.bboxValid(box)) return;
    const w = Math.max(box.maxX - box.minX, 1);
    const h = Math.max(box.maxY - box.minY, 1);
    const zx = (width - padding * 2) / w;
    const zy = (height - padding * 2) / h;
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, Math.min(zx, zy)));
    const center = g.bboxCenter(box);
    this.x = center.x - width / 2 / this.zoom;
    this.y = center.y - height / 2 / this.zoom;
  }

  visibleBox(width, height) {
    const a = this.toModel({ x: 0, y: 0 });
    const b = this.toModel({ x: width, y: height });
    return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
  }
}
