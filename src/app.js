// Storystick application controller: owns the document, the viewport, the
// active tool and every DOM binding.

import * as g from './core/geometry.js';
import { formatLength, parseLength } from './core/units.js';
import {
  createProject,
  activePage,
  addEntity,
  removeEntities,
  addLayer,
  addPage,
  removePage,
  cloneProject,
} from './core/document.js';
import { uid, bboxOfMany, translate, findEntity, wallLength } from './core/entities.js';
import { History } from './core/history.js';
import { resolveSnap, applyConstraint, SNAP_LABELS } from './core/snap.js';
import { Viewport } from './render/viewport.js';
import { Renderer } from './render/renderer.js';
import { TOOL_ENTRIES, toolEntryById, toolByShortcut } from './tools/index.js';
import { SelectTool } from './tools/select.js';
import { buildTemplate } from './features/templates.js';
import { saveProject, loadProject, lastOpened, deserializeProject, serializeProject } from './core/store.js';
import { renderToolbar, renderToolOptions } from './ui/toolbar.js';
import { renderLayers, renderPages, renderProperties } from './ui/panels.js';
import {
  initModals,
  templateGallery,
  openProjectDialog,
  settingsDialog,
  cutListDialog,
  scheduleDialog,
  estimateDialog,
  exportDialog,
  pageDialog,
  helpDialog,
} from './ui/dialogs.js';
import { downloadText } from './ui/dom.js';

const AUTOSAVE_MS = 1200;

export class App {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.renderer = new Renderer(this.canvas);
    this.viewport = new Viewport();
    this.history = new History();

    this.selection = new Set();
    this.hover = null;
    this.marquee = null;
    this.snap = null;
    this.pointer = { x: 0, y: 0 };
    this.modelPoint = { x: 0, y: 0 };
    this.panning = null;
    this.spaceDown = false;
    this.dirty = false;
    this.autosaveTimer = null;
    this.statusMessage = '';

    this.defaults = {
      wall: { thickness: 5.5, status: 'new' },
      door: { width: 32, height: 80, swing: 'left' },
      window: { width: 36, height: 48, sill: 36 },
      part: { material: 'ply-3/4', thickness: 0.75, qty: 1 },
      textSize: 6,
    };

    this.tools = new Map();
    for (const entry of TOOL_ENTRIES) this.tools.set(entry.Tool.id, new entry.Tool(this));
    this.activeTool = this.tools.get('select');

    this.project = this.loadInitialProject();
    this.history.reset(this.project);
    this.defaults.wall.thickness = this.project.defaultWallThickness;

    initModals();
    this.bindDom();
    this.bindCanvas();
    this.bindKeyboard();

    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.render();
    });

    this.renderer.resize();
    this.zoomFit();
    this.refreshAll();
  }

  // --- document lifecycle ----------------------------------------------

  loadInitialProject() {
    const id = lastOpened();
    if (id) {
      const saved = loadProject(id);
      if (saved) return saved;
    }
    return buildTemplate('blank-building') || createProject({ name: 'Untitled Project' });
  }

  get page() {
    return activePage(this.project);
  }

  setProject(project, label = 'Open project') {
    this.project = project;
    this.selection.clear();
    this.hover = null;
    this.history.reset(project, label);
    this.defaults.wall.thickness = project.defaultWallThickness;
    this.activeTool.reset();
    this.activeTool = this.tools.get('select');
    this.canvas.style.cursor = this.activeTool.constructor.cursor;
    this.renderer.resize();
    this.zoomFit();
    this.refreshAll();
  }

  newProjectFromTemplate(id) {
    const project = buildTemplate(id);
    if (!project) return;
    this.setProject(project, 'New project');
    this.scheduleAutosave();
  }

  openSaved(id) {
    const project = loadProject(id);
    if (project) this.setProject(project);
    else this.setStatus('That project could not be read.');
  }

  importProjectText(text) {
    try {
      const project = deserializeProject(text);
      project.id = project.id || uid('prj');
      this.setProject(project, 'Import project');
      this.scheduleAutosave();
      this.setStatus(`Imported “${project.name}”.`);
    } catch (err) {
      this.setStatus(`Import failed: ${err.message}`);
    }
  }

  saveNow() {
    const ok = saveProject(this.project);
    this.dirty = false;
    this.setStatus(ok ? `Saved “${this.project.name}”.` : 'Could not save — browser storage is unavailable.');
    this.refreshTitle();
  }

  scheduleAutosave() {
    this.dirty = true;
    this.refreshTitle();
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      saveProject(this.project);
      this.dirty = false;
      this.refreshTitle();
    }, AUTOSAVE_MS);
  }

  /** Record a change: history entry, autosave, full UI refresh. */
  commit(label = 'Edit') {
    this.history.commit(this.project, label);
    this.scheduleAutosave();
    this.refreshAll();
  }

  touch(label) {
    this.commit(label);
  }

  undo() {
    const state = this.history.undo();
    if (!state) return;
    this.project = state;
    this.pruneSelection();
    this.scheduleAutosave();
    this.refreshAll();
    this.setStatus(`Undo — ${this.history.redoLabel() || ''}`);
  }

  redo() {
    const state = this.history.redo();
    if (!state) return;
    this.project = state;
    this.pruneSelection();
    this.scheduleAutosave();
    this.refreshAll();
    this.setStatus('Redo');
  }

  pruneSelection() {
    const ids = new Set(this.page.entities.map((e) => e.id));
    for (const id of [...this.selection]) if (!ids.has(id)) this.selection.delete(id);
  }

  // --- entity helpers ---------------------------------------------------

  add(entity, label = 'Add') {
    addEntity(this.project, entity);
    this.commit(label);
    return entity;
  }

  layerFor(kind, variant) {
    const map = {
      wall: variant === 'existing' ? 'existing' : variant === 'demo' ? 'demo' : 'walls',
      opening: 'openings',
      room: 'rooms',
      part: 'parts',
      dim: 'dimensions',
      text: 'notes',
    };
    const wanted = map[kind];
    if (wanted && this.project.layers.some((l) => l.id === wanted)) return wanted;
    return this.project.activeLayerId;
  }

  nextPartNumber() {
    return this.project.pages.reduce((n, p) => n + p.entities.filter((e) => e.type === 'part').length, 0) + 1;
  }

  nextRoomNumber() {
    return this.project.pages.reduce((n, p) => n + p.entities.filter((e) => e.type === 'room').length, 0) + 1;
  }

  nextOpeningTag(kind) {
    const prefix = kind === 'window' ? 'W' : kind === 'door' ? 'D' : 'O';
    const count = this.project.pages.reduce(
      (n, p) => n + p.entities.filter((e) => e.type === 'opening' && e.kind === kind).length,
      0
    );
    return `${prefix}${count + 1}`;
  }

  resizePart(ent, length, width) {
    const dx = ent.b.x - ent.a.x;
    const dy = ent.b.y - ent.a.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const sx = dx < 0 ? -1 : 1;
    const sy = dy < 0 ? -1 : 1;
    ent.b = {
      x: ent.a.x + (horizontal ? length : width) * sx,
      y: ent.a.y + (horizontal ? width : length) * sy,
    };
  }

  deleteSelection() {
    if (!this.selection.size) return;
    removeEntities(this.project, [...this.selection]);
    this.selection.clear();
    this.commit('Erase');
  }

  duplicateSelection() {
    if (!this.selection.size) return;
    const offset = this.project.gridSize || 6;
    const clones = [];
    for (const id of this.selection) {
      const ent = this.page.entities.find((e) => e.id === id);
      if (!ent) continue;
      const copy = JSON.parse(JSON.stringify(ent));
      copy.id = uid(ent.type.slice(0, 2));
      if (copy.type === 'opening') {
        const host = findEntity(this.page, copy.host);
        const total = host ? wallLength(host) : 0;
        if (total > 0) {
          const half = copy.width / 2 / total;
          copy.t = Math.min(1 - half, Math.max(half, copy.t + copy.width / total));
        }
      } else {
        translate(copy, { x: offset, y: offset });
      }
      clones.push(copy);
    }
    this.page.entities.push(...clones);
    this.setSelection(clones.map((c) => c.id));
    this.commit('Duplicate');
  }

  reorderSelection(where) {
    if (!this.selection.size) return;
    const page = this.page;
    const picked = page.entities.filter((e) => this.selection.has(e.id));
    const rest = page.entities.filter((e) => !this.selection.has(e.id));
    page.entities = where === 'front' ? [...rest, ...picked] : [...picked, ...rest];
    this.commit(where === 'front' ? 'Bring to front' : 'Send to back');
  }

  selectAll() {
    const ids = this.page.entities
      .filter((e) => {
        const layer = this.project.layers.find((l) => l.id === e.layer);
        return !layer || (layer.visible && !layer.locked);
      })
      .map((e) => e.id);
    this.setSelection(ids);
  }

  editEntityInline(ent) {
    if (ent.type === 'text') {
      const v = this.promptText('Note text', ent.text);
      if (v !== null) {
        ent.text = v;
        this.commit('Edit text');
      }
    } else if (ent.type === 'room') {
      const v = this.promptText('Room name', ent.name);
      if (v !== null) {
        ent.name = v || 'Room';
        this.commit('Rename room');
      }
    } else if (ent.type === 'part') {
      const v = this.promptText('Part name', ent.name);
      if (v !== null) {
        ent.name = v || 'Part';
        this.commit('Rename part');
      }
    }
  }

  // --- layers, pages ----------------------------------------------------

  addLayer() {
    const name = this.promptText('Layer name', `Layer ${this.project.layers.length + 1}`);
    if (name === null) return;
    const layer = addLayer(this.project, name);
    this.project.activeLayerId = layer.id;
    this.commit('Add layer');
  }

  isolateActiveLayer() {
    for (const layer of this.project.layers) layer.visible = layer.id === this.project.activeLayerId;
    this.commit('Isolate layer');
  }

  showAllLayers() {
    for (const layer of this.project.layers) layer.visible = true;
    this.commit('Show all layers');
  }

  addPage() {
    const page = addPage(this.project);
    this.project.activePageId = page.id;
    this.selection.clear();
    this.commit('Add sheet');
  }

  deletePage(id) {
    if (removePage(this.project, id)) {
      this.selection.clear();
      this.commit('Delete sheet');
    }
  }

  setActivePage(id) {
    this.project.activePageId = id;
    this.selection.clear();
    this.hover = null;
    this.zoomFit();
    this.refreshAll();
  }

  openPageDialog() {
    pageDialog(this);
  }

  // --- selection --------------------------------------------------------

  setSelection(ids) {
    this.selection = new Set(ids);
    this.refreshProperties();
    this.render();
  }

  toggleSelection(id) {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.refreshProperties();
    this.render();
  }

  setHover(id) {
    if (this.hover === id) return;
    this.hover = id;
    this.render();
  }

  setMarquee(m) {
    this.marquee = m;
    this.render();
  }

  // --- view -------------------------------------------------------------

  zoomFit() {
    const box = bboxOfMany(this.page.entities, this.page);
    if (box && g.bboxValid(box)) {
      this.viewport.fit(box, this.renderer.width, this.renderer.height);
    } else {
      this.viewport.zoom = 2;
      this.viewport.x = -this.renderer.width / 4;
      this.viewport.y = -this.renderer.height / 4;
    }
    this.render();
  }

  zoomSelection() {
    const ents = this.page.entities.filter((e) => this.selection.has(e.id));
    const box = bboxOfMany(ents.length ? ents : this.page.entities, this.page);
    if (box && g.bboxValid(box)) {
      this.viewport.fit(g.bboxExpand(box, 12), this.renderer.width, this.renderer.height);
      this.render();
    }
  }

  pickTolerance() {
    return this.viewport.px(7);
  }

  fmt(inches) {
    return formatLength(inches, this.project.unitSystem, { denominator: this.project.denominator });
  }

  fmtShort(inches) {
    return formatLength(inches, this.project.unitSystem, {
      denominator: this.project.denominator,
      forceInches: true,
    });
  }

  slug() {
    return (this.project.name || 'storystick').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  promptText(label, value) {
    return window.prompt(label, value ?? '');
  }

  setStatus(message) {
    this.statusMessage = message;
    const node = document.getElementById('status-message');
    if (node) node.textContent = message;
  }

  // --- rendering --------------------------------------------------------

  render() {
    this.renderer.draw({
      project: this.project,
      page: this.page,
      viewport: this.viewport,
      selection: this.selection,
      hover: this.hover,
      snap: this.snap,
      marquee: this.marquee,
      preview: this.activeTool.preview(),
    });
    this.refreshCoords();
  }

  refreshAll() {
    this.refreshTitle();
    renderToolbar(this, document.getElementById('toolbar'));
    renderToolOptions(this, document.getElementById('tool-options'));
    renderPages(this, document.getElementById('panel-pages'));
    renderLayers(this, document.getElementById('panel-layers'));
    this.refreshProperties();
    this.refreshUndoButtons();
    this.render();
  }

  refreshProperties() {
    renderProperties(this, document.getElementById('panel-properties'));
  }

  refreshToolOptions() {
    renderToolOptions(this, document.getElementById('tool-options'));
  }

  refreshTitle() {
    const node = document.getElementById('project-name');
    if (node) node.textContent = `${this.project.name}${this.dirty ? ' •' : ''}`;
    document.title = `${this.project.name} — Storystick`;
  }

  refreshUndoButtons() {
    const undo = document.getElementById('btn-undo');
    const redo = document.getElementById('btn-redo');
    if (undo) undo.disabled = !this.history.canUndo;
    if (redo) redo.disabled = !this.history.canRedo;
  }

  refreshCoords() {
    const node = document.getElementById('status-coords');
    if (!node) return;
    const p = this.modelPoint;
    const snapLabel = this.snap && this.snap.kind ? ` · ${SNAP_LABELS[this.snap.kind]}` : '';
    node.textContent = `X ${this.fmt(p.x)}   Y ${this.fmt(p.y)}${snapLabel}`;
  }

  // --- input ------------------------------------------------------------

  screenPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  resolvePoint(event) {
    const screen = this.screenPoint(event);
    const raw = this.viewport.toModel(screen);
    const anchor = this.activeTool.anchor;
    let orthoMode = null;
    if (event.altKey) orthoMode = 'diag';
    else if (this.project.ortho || event.shiftKey) orthoMode = 'ortho';

    if (anchor && orthoMode) {
      const constrained = applyConstraint(anchor, raw, orthoMode === 'diag' ? 'diag' : 'ortho');
      this.snap = { point: constrained, kind: null };
      return constrained;
    }

    const exclude =
      this.activeTool instanceof SelectTool && this.activeTool.mode ? this.selection : new Set();
    const snapped = resolveSnap(raw, {
      project: this.project,
      page: this.page,
      tolerance: this.viewport.px(10),
      exclude,
      from: anchor,
    });
    this.snap = snapped;
    return snapped.point;
  }

  bindCanvas() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      if (e.button === 1 || e.button === 2 || this.spaceDown) {
        this.panning = this.screenPoint(e);
        c.style.cursor = 'grabbing';
        return;
      }
      if (e.button !== 0) return;
      const pt = this.resolvePoint(e);
      this.modelPoint = pt;
      this.activeTool.onPointerDown(pt, e);
      this.render();
    });

    c.addEventListener('pointermove', (e) => {
      const screen = this.screenPoint(e);
      if (this.panning) {
        this.viewport.panByScreen(screen.x - this.panning.x, screen.y - this.panning.y);
        this.panning = screen;
        this.render();
        return;
      }
      const pt = this.resolvePoint(e);
      this.modelPoint = pt;
      this.activeTool.onPointerMove(pt, e);
      this.render();
    });

    const end = (e) => {
      if (this.panning) {
        this.panning = null;
        c.style.cursor = this.spaceDown ? 'grab' : this.activeTool.constructor.cursor;
        return;
      }
      const pt = this.resolvePoint(e);
      this.activeTool.onPointerUp(pt, e);
      this.refreshProperties();
      this.render();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', () => {
      this.panning = null;
      this.activeTool.reset();
      this.render();
    });

    c.addEventListener('dblclick', (e) => {
      const pt = this.resolvePoint(e);
      this.activeTool.onDoubleClick(pt, e);
      this.render();
    });

    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0015);
        this.viewport.zoomAt(this.screenPoint(e), factor);
        this.render();
      },
      { passive: false }
    );
  }

  setTool(id) {
    const tool = this.tools.get(id);
    if (!tool || tool === this.activeTool) return;
    this.activeTool.deactivate();
    this.activeTool = tool;
    tool.activate();
    this.canvas.style.cursor = tool.constructor.cursor;
    this.setStatus(tool.hint());
    renderToolbar(this, document.getElementById('toolbar'));
    this.refreshToolOptions();
    this.refreshProperties();
    this.render();
  }

  bindKeyboard() {
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        this.canvas.style.cursor = this.activeTool.constructor.cursor;
      }
    });

    window.addEventListener('keydown', (e) => {
      const target = e.target;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (typing) return;

      if (e.code === 'Space' && !e.repeat) {
        this.spaceDown = true;
        this.canvas.style.cursor = 'grab';
        e.preventDefault();
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) this.redo();
          else this.undo();
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          this.redo();
          return;
        }
        if (key === 's') {
          e.preventDefault();
          this.saveNow();
          return;
        }
        if (key === 'o') {
          e.preventDefault();
          openProjectDialog(this);
          return;
        }
        if (key === 'n') {
          e.preventDefault();
          templateGallery(this);
          return;
        }
        if (key === 'a') {
          e.preventDefault();
          this.selectAll();
          return;
        }
        if (key === 'd') {
          e.preventDefault();
          this.duplicateSelection();
          return;
        }
        if (key === 'e') {
          e.preventDefault();
          exportDialog(this);
          return;
        }
        return;
      }

      if (this.activeTool.onKey(e)) {
        this.refreshProperties();
        this.render();
        e.preventDefault();
        return;
      }

      switch (e.key) {
        case 'Escape':
          this.activeTool.reset();
          this.setSelection([]);
          this.render();
          return;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          this.deleteSelection();
          return;
        case 'F3':
          e.preventDefault();
          this.toggleSetting('snapObject');
          return;
        case 'F7':
          e.preventDefault();
          this.toggleSetting('snapGrid');
          return;
        case 'F8':
          e.preventDefault();
          this.toggleSetting('ortho');
          return;
        default:
          break;
      }

      if (e.key === 'f' || e.key === 'F') {
        this.zoomFit();
        return;
      }
      if (e.key === '?') {
        helpDialog();
        return;
      }

      // Start numeric entry straight from the keyboard while drawing.
      if (/^[0-9.]$/.test(e.key) && this.activeTool.anchor) {
        const input = document.getElementById('command-input');
        if (input) {
          input.value = e.key;
          input.focus();
          e.preventDefault();
          return;
        }
      }

      const entry = toolByShortcut(e.key.toLowerCase());
      if (entry) this.setTool(entry.Tool.id);
    });
  }

  toggleSetting(key) {
    this.project[key] = !this.project[key];
    this.setStatus(
      `${{ snapObject: 'Object snap', snapGrid: 'Grid snap', ortho: 'Ortho' }[key]} ${
        this.project[key] ? 'on' : 'off'
      }`
    );
    this.refreshToggles();
    this.scheduleAutosave();
    this.render();
  }

  refreshToggles() {
    const map = { 'toggle-osnap': 'snapObject', 'toggle-grid': 'snapGrid', 'toggle-ortho': 'ortho' };
    for (const [id, key] of Object.entries(map)) {
      const node = document.getElementById(id);
      if (node) node.classList.toggle('on', !!this.project[key]);
    }
  }

  runCommand(text) {
    const values = text
      .split(/[x,×]/i)
      .map((part) => parseLength(part.trim(), this.project.unitSystem))
      .filter((v) => v !== null && Number.isFinite(v));
    if (!values.length) {
      this.setStatus(`Could not read “${text}” as a length.`);
      return false;
    }
    const handled = this.activeTool.applyNumeric(values);
    if (!handled) this.setStatus('That tool does not take a typed length right now.');
    this.render();
    return handled;
  }

  // --- exports ----------------------------------------------------------

  exportPng(page) {
    const target = page || this.page;
    const box = bboxOfMany(target.entities, target);
    if (!box || !g.bboxValid(box)) {
      this.setStatus('Nothing to export on this sheet.');
      return;
    }
    const padded = g.bboxExpand(box, 24);
    const width = padded.maxX - padded.minX;
    const height = padded.maxY - padded.minY;
    const scale = Math.min(4000 / width, 4000 / height, 8);

    const canvas = document.createElement('canvas');
    const renderer = new Renderer(canvas);
    renderer.resizeTo(Math.ceil(width * scale), Math.ceil(height * scale), 1);
    const viewport = new Viewport();
    viewport.zoom = scale;
    viewport.x = padded.minX;
    viewport.y = padded.minY;
    renderer.draw({
      project: this.project,
      page: target,
      viewport,
      selection: new Set(),
      hover: null,
      snap: null,
      marquee: null,
      preview: null,
    });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.slug()}-${target.name.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  // --- DOM wiring -------------------------------------------------------

  bindDom() {
    const on = (id, handler) => {
      const node = document.getElementById(id);
      if (node) node.addEventListener('click', handler);
    };

    on('btn-new', () => templateGallery(this));
    on('btn-open', () => openProjectDialog(this));
    on('btn-save', () => this.saveNow());
    on('btn-export', () => exportDialog(this));
    on('btn-settings', () => settingsDialog(this));
    on('btn-cutlist', () => cutListDialog(this));
    on('btn-schedules', () => scheduleDialog(this));
    on('btn-estimate', () => estimateDialog(this));
    on('btn-help', () => helpDialog());
    on('btn-undo', () => this.undo());
    on('btn-redo', () => this.redo());
    on('btn-fit', () => this.zoomFit());
    on('btn-zoom-in', () => {
      this.viewport.zoomAt({ x: this.renderer.width / 2, y: this.renderer.height / 2 }, 1.25);
      this.render();
    });
    on('btn-zoom-out', () => {
      this.viewport.zoomAt({ x: this.renderer.width / 2, y: this.renderer.height / 2 }, 0.8);
      this.render();
    });
    on('toggle-osnap', () => this.toggleSetting('snapObject'));
    on('toggle-grid', () => this.toggleSetting('snapGrid'));
    on('toggle-ortho', () => this.toggleSetting('ortho'));

    const title = document.getElementById('project-name');
    if (title) {
      title.addEventListener('click', () => {
        const name = this.promptText('Project name', this.project.name);
        if (name) {
          this.project.name = name;
          this.commit('Rename project');
        }
      });
    }

    const input = document.getElementById('command-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          if (this.runCommand(input.value)) input.value = '';
          this.canvas.focus();
        } else if (e.key === 'Escape') {
          input.value = '';
          input.blur();
        }
      });
    }

    window.addEventListener('beforeunload', () => {
      if (this.dirty) saveProject(this.project);
    });

    this.refreshToggles();
  }
}

export function bootstrap() {
  const app = new App();
  window.storystick = app;
  // Drop a .storystick file anywhere on the window to open it.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => app.importProjectText(String(reader.result));
    reader.readAsText(file);
  });
  return app;
}

export { cloneProject, serializeProject, downloadText };
