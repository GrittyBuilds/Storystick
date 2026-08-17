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
    this.group = null;
  }

  /**
   * Record the state *after* a change.
   *
   * `group` lets a run of small edits collapse into one undo. Nudging a wall
   * twenty times with the arrow keys is one thing the user did, and twenty
   * undos to get back is not what they meant. Passing the same group key as the
   * previous commit replaces that commit instead of stacking on top of it; the
   * caller ends the run by committing something else or calling `endGroup`.
   */
  commit(state, label = 'Edit', group = null) {
    const continues = group !== null && group === this.group;
    if (!continues) {
      if (this.present) this.past.push({ state: this.present, label: this.label });
      if (this.past.length > this.limit) this.past.shift();
    }
    this.present = snapshot(state);
    this.label = label;
    this.group = group;
    this.future = [];
  }

  /** Close the current run, so the next commit starts a new undo step. */
  endGroup() {
    this.group = null;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  undo() {
    if (!this.canUndo) return null;
    this.group = null;
    const entry = this.past.pop();
    this.future.push({ state: this.present, label: this.label });
    this.present = entry.state;
    this.label = entry.label;
    return snapshot(this.present);
  }

  redo() {
    if (!this.canRedo) return null;
    this.group = null;
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
