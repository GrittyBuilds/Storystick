// Unified pointer input for the drawing canvas: mouse, pen and touch through one
// path, with the gestures a CAD app needs on a phone or tablet.
//
// Conventions, chosen to match what mobile drawing tools have settled on:
//   one finger   draw / select
//   two fingers  pan and pinch-zoom together
//   long press   context action on whatever is under the point
//   mouse        left draws, middle/right or space drags the view, wheel zooms
//
// The fat-finger problem: a fingertip covers roughly a 10 mm circle, which at a
// working zoom is most of a stud bay. Touch input is therefore offset above the
// contact point and the app draws a crosshair at the true target, so the user
// can always see exactly where the point will land. Pen and mouse are exact and
// get no offset.

export const TOUCH_OFFSET_PX = 34;
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;
const TAP_SLOP_PX = 8;
const DOUBLE_TAP_MS = 320;

const MODE = { IDLE: 'idle', DRAW: 'draw', VIEW: 'view', GESTURE: 'gesture' };

export class CanvasInput {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} handlers pointDown/pointMove/pointUp/doubleTap/longPress/panBy/zoomAt/cancel
   * @param {object} options { shouldPan(event), touchOffset }
   */
  constructor(canvas, handlers, options = {}) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.options = options;
    this.pointers = new Map();
    this.mode = MODE.IDLE;
    this.gesture = null;
    this.longPressTimer = 0;
    this.pressOrigin = null;
    this.lastTap = { time: 0, x: 0, y: 0 };
    this.pointerType = 'mouse';
    this.now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.bind();
  }

  get usingTouch() {
    return this.pointerType === 'touch';
  }

  touchOffset() {
    if (this.options.touchOffset === 0) return 0;
    return this.options.touchOffset ?? TOUCH_OFFSET_PX;
  }

  /** Canvas-relative point, with the touch offset already applied. */
  screenPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    const offset = event.pointerType === 'touch' ? this.touchOffset() : 0;
    return { x: event.clientX - rect.left, y: event.clientY - rect.top - offset };
  }

  rawPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  clearLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = 0;
    }
  }

  startGesture() {
    const [a, b] = [...this.pointers.values()];
    this.gesture = {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }

  bind() {
    const canvas = this.canvas;

    this.onDown = (event) => {
      this.pointerType = event.pointerType || 'mouse';
      // Capture is an optimisation, not a requirement: it throws for pointers the
      // browser considers already released, and losing input over that would be
      // far worse than losing capture.
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* keep going without capture */
      }
      const raw = this.rawPoint(event);
      this.pointers.set(event.pointerId, { ...raw, type: event.pointerType });

      // A second contact always wins: abandon any in-flight draw and switch to
      // the two-finger pan/zoom gesture rather than drawing a stray line.
      if (this.pointers.size === 2) {
        this.clearLongPress();
        if (this.mode === MODE.DRAW && this.handlers.cancel) this.handlers.cancel();
        this.mode = MODE.GESTURE;
        this.startGesture();
        return;
      }
      if (this.pointers.size > 2) return;

      if (this.options.shouldPan && this.options.shouldPan(event)) {
        this.mode = MODE.VIEW;
        this.pressOrigin = raw;
        return;
      }

      this.mode = MODE.DRAW;
      this.pressOrigin = raw;
      const point = this.screenPoint(event);
      this.clearLongPress();
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = 0;
        if (this.mode === MODE.DRAW && this.handlers.longPress) {
          this.handlers.longPress(point, event);
        }
      }, LONG_PRESS_MS);
      if (this.handlers.pointDown) this.handlers.pointDown(point, event);
    };

    this.onMove = (event) => {
      const previous = this.pointers.get(event.pointerId);
      const raw = this.rawPoint(event);
      if (previous) this.pointers.set(event.pointerId, { ...raw, type: event.pointerType });

      if (this.mode === MODE.GESTURE && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        if (this.gesture) {
          if (this.gesture.distance > 1 && distance > 1 && this.handlers.zoomAt) {
            this.handlers.zoomAt({ x: midX, y: midY }, distance / this.gesture.distance);
          }
          if (this.handlers.panBy) {
            this.handlers.panBy(midX - this.gesture.midX, midY - this.gesture.midY);
          }
        }
        this.gesture = { distance, midX, midY };
        return;
      }

      if (this.mode === MODE.VIEW && previous) {
        if (this.handlers.panBy) this.handlers.panBy(raw.x - previous.x, raw.y - previous.y);
        return;
      }

      if (this.pressOrigin && this.longPressTimer) {
        const moved = Math.hypot(raw.x - this.pressOrigin.x, raw.y - this.pressOrigin.y);
        if (moved > LONG_PRESS_SLOP_PX) this.clearLongPress();
      }

      // Hover (no button down) still drives snapping and the tool preview.
      if (this.mode === MODE.DRAW || (this.mode === MODE.IDLE && event.pointerType !== 'touch')) {
        if (this.handlers.pointMove) this.handlers.pointMove(this.screenPoint(event), event);
      }
    };

    this.onUp = (event) => {
      this.clearLongPress();
      const wasMode = this.mode;
      const point = this.screenPoint(event);
      const raw = this.rawPoint(event);
      this.pointers.delete(event.pointerId);
      try {
        if (canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
      } catch {
        /* already released */
      }

      if (wasMode === MODE.GESTURE) {
        if (this.pointers.size < 2) {
          this.gesture = null;
          // Keep ignoring the remaining finger until it lifts, so the gesture
          // does not turn into an accidental stroke.
          this.mode = this.pointers.size === 1 ? MODE.VIEW : MODE.IDLE;
        }
        return;
      }

      if (wasMode === MODE.DRAW && this.handlers.pointUp) this.handlers.pointUp(point, event);

      // Synthesise a double-tap for touch, which does not fire dblclick reliably.
      if (event.pointerType === 'touch' && wasMode === MODE.DRAW) {
        const now = this.now();
        const near = Math.hypot(raw.x - this.lastTap.x, raw.y - this.lastTap.y) < TAP_SLOP_PX * 3;
        if (now - this.lastTap.time < DOUBLE_TAP_MS && near) {
          if (this.handlers.doubleTap) this.handlers.doubleTap(point, event);
          this.lastTap = { time: 0, x: 0, y: 0 };
        } else {
          this.lastTap = { time: now, x: raw.x, y: raw.y };
        }
      }

      if (this.pointers.size === 0) this.mode = MODE.IDLE;
    };

    this.onCancel = (event) => {
      this.clearLongPress();
      this.pointers.delete(event.pointerId);
      this.gesture = null;
      this.mode = this.pointers.size === 0 ? MODE.IDLE : this.mode;
      if (this.handlers.cancel) this.handlers.cancel();
    };

    this.onWheel = (event) => {
      event.preventDefault();
      const point = this.rawPoint(event);
      // Trackpad pinch arrives as a ctrl-modified wheel event.
      const intensity = event.ctrlKey ? 0.012 : 0.0015;
      if (this.handlers.zoomAt) this.handlers.zoomAt(point, Math.exp(-event.deltaY * intensity));
    };

    this.onDoubleClick = (event) => {
      if (event.pointerType === 'touch') return;
      if (this.handlers.doubleTap) this.handlers.doubleTap(this.screenPoint(event), event);
    };

    this.onContextMenu = (event) => event.preventDefault();

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('dblclick', this.onDoubleClick);
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  destroy() {
    const canvas = this.canvas;
    this.clearLongPress();
    canvas.removeEventListener('pointerdown', this.onDown);
    canvas.removeEventListener('pointermove', this.onMove);
    canvas.removeEventListener('pointerup', this.onUp);
    canvas.removeEventListener('pointercancel', this.onCancel);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('dblclick', this.onDoubleClick);
    canvas.removeEventListener('contextmenu', this.onContextMenu);
  }
}
