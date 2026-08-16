// Snapshot-based undo/redo. Documents are plain JSON so a deep copy is cheap
// enough for the drawing sizes this app targets and impossible to get wrong.

const snapshot = (value) => JSON.parse(JSON.stringify(value));

export class History {
  constructor(limit = 150) {
    this.limit = limit;
    this.past = [];
    this.future = [];
    this.present = null;
    this.label = 'Start';
  }

  reset(state, label = 'New project') {
    this.past = [];
    this.future = [];
    this.present = snapshot(state);
    this.label = label;
  }

  /** Record the state *after* a change. */
  commit(state, label = 'Edit') {
    if (this.present) this.past.push({ state: this.present, label: this.label });
    if (this.past.length > this.limit) this.past.shift();
    this.present = snapshot(state);
    this.label = label;
    this.future = [];
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  undo() {
    if (!this.canUndo) return null;
    const entry = this.past.pop();
    this.future.push({ state: this.present, label: this.label });
    this.present = entry.state;
    this.label = entry.label;
    return snapshot(this.present);
  }

  redo() {
    if (!this.canRedo) return null;
    const entry = this.future.pop();
    this.past.push({ state: this.present, label: this.label });
    this.present = entry.state;
    this.label = entry.label;
    return snapshot(this.present);
  }

  undoLabel() {
    return this.canUndo ? this.past[this.past.length - 1].label : null;
  }

  redoLabel() {
    return this.canRedo ? this.future[this.future.length - 1].label : null;
  }
}
