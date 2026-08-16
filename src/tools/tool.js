// Base class for interactive tools. The app resolves snapping and constraints
// before dispatching, so tools always receive a final model-space point.

export class Tool {
  static id = 'tool';
  static label = 'Tool';
  static hint = '';
  static cursor = 'crosshair';

  constructor(app) {
    this.app = app;
  }

  get project() {
    return this.app.project;
  }

  get page() {
    return this.app.page;
  }

  /** Point the rubber band should be constrained from, if any. */
  get anchor() {
    return null;
  }

  activate() {}

  deactivate() {
    this.reset();
  }

  reset() {}

  onPointerDown() {}

  onPointerMove() {}

  onPointerUp() {}

  onDoubleClick() {}

  /** Return true when the key was consumed. */
  onKey() {
    return false;
  }

  /** Numeric entry from the command bar; `values` are inches. */
  applyNumeric() {
    return false;
  }

  preview() {
    return null;
  }

  hint() {
    return this.constructor.hint;
  }
}
