// Project document model: layers, pages, materials and project-wide settings.

import { uid } from './entities.js';
import { defaultGrid } from './units.js';

export const FILE_VERSION = 2;

// `color` is the Paper-mode stroke, `colorDark` the Blueprint-mode stroke, and
// `weight` is the plotted line weight in millimetres from the brand's line
// weight table. See src/render/theme.js.
export const DEFAULT_LAYERS = [
  { id: 'walls', name: 'Walls — New', color: '#0F2338', colorDark: '#A9C7E5', weight: 0.7, dash: null },
  { id: 'existing', name: 'Walls — Existing', color: '#8A97A3', colorDark: '#5E7A97', weight: 0.35, dash: null },
  { id: 'demo', name: 'Walls — Demo', color: '#B93636', colorDark: '#D14343', weight: 0.35, dash: [8, 5] },
  { id: 'openings', name: 'Doors & Windows', color: '#1B5FA6', colorDark: '#3E86CE', weight: 0.5, dash: null },
  { id: 'rooms', name: 'Rooms', color: '#65717C', colorDark: '#7E9BB8', weight: 0.18, dash: null },
  { id: 'parts', name: 'Woodworking Parts', color: '#46525E', colorDark: '#A9C7E5', weight: 0.5, dash: null },
  { id: 'furniture', name: 'Fixtures & Furniture', color: '#65717C', colorDark: '#7E9BB8', weight: 0.35, dash: null },
  { id: 'dimensions', name: 'Dimensions', color: '#1B5FA6', colorDark: '#3E86CE', weight: 0.25, dash: null },
  { id: 'notes', name: 'Notes & Text', color: '#46525E', colorDark: '#A9C7E5', weight: 0.25, dash: null },
  { id: 'sketch', name: 'Sketch', color: '#8A97A3', colorDark: '#5E7A97', weight: 0.18, dash: [4, 4] },
];

const DEFAULT_LAYER_WEIGHTS = new Map(DEFAULT_LAYERS.map((l) => [l.id, l.weight]));

export const DEFAULT_MATERIALS = [
  { id: 'ply-3/4', name: '3/4" Plywood', form: 'sheet', thickness: 0.75, stockW: 48, stockL: 96, cost: 68 },
  { id: 'ply-1/2', name: '1/2" Plywood', form: 'sheet', thickness: 0.5, stockW: 48, stockL: 96, cost: 55 },
  { id: 'ply-1/4', name: '1/4" Plywood', form: 'sheet', thickness: 0.25, stockW: 48, stockL: 96, cost: 32 },
  { id: 'mdf-3/4', name: '3/4" MDF', form: 'sheet', thickness: 0.75, stockW: 49, stockL: 97, cost: 46 },
  { id: 'pine-1x4', name: 'Pine 1x4', form: 'board', thickness: 0.75, stockW: 3.5, stockL: 96, cost: 9.5 },
  { id: 'pine-1x6', name: 'Pine 1x6', form: 'board', thickness: 0.75, stockW: 5.5, stockL: 96, cost: 14 },
  { id: 'poplar-1x2', name: 'Poplar 1x2', form: 'board', thickness: 0.75, stockW: 1.5, stockL: 96, cost: 6 },
  { id: 'oak-4/4', name: 'Red Oak 4/4', form: 'board', thickness: 0.8125, stockW: 6, stockL: 96, cost: 38 },
  { id: 'spf-2x4', name: 'SPF 2x4 Stud', form: 'board', thickness: 1.5, stockW: 3.5, stockL: 96, cost: 5.25 },
  { id: 'spf-2x6', name: 'SPF 2x6', form: 'board', thickness: 1.5, stockW: 5.5, stockL: 96, cost: 9.75 },
  { id: 'pt-2x8-16', name: 'PT 2x8 — 16 ft', form: 'board', thickness: 1.5, stockW: 7.25, stockL: 192, cost: 29 },
  { id: 'deck-54x6-16', name: '5/4x6 Decking — 16 ft', form: 'board', thickness: 1, stockW: 5.5, stockL: 192, cost: 23 },
];

export const PAGE_KINDS = ['plan', 'elevation', 'section', 'detail', 'layout'];

export function makePage(name, kind = 'plan') {
  return { id: uid('pg'), name, kind, scale: '1/4" = 1\'-0"', entities: [] };
}

export function createProject(options = {}) {
  const unitSystem = options.unitSystem === 'metric' ? 'metric' : 'imperial';
  const pages = options.pages || [makePage('Floor Plan', 'plan')];
  return {
    version: FILE_VERSION,
    id: uid('prj'),
    name: options.name || 'Untitled Project',
    kind: options.kind || 'building',
    unitSystem,
    denominator: unitSystem === 'metric' ? 16 : 16,
    gridSize: options.gridSize ?? defaultGrid(unitSystem),
    snapGrid: true,
    snapObject: true,
    ortho: false,
    kerf: 0.125,
    wasteFactor: 0.1,
    defaultWallThickness: unitSystem === 'metric' ? 3.937 : 5.5,
    wallHeight: unitSystem === 'metric' ? 94.488 : 96,
    studSpacing: 16,
    layers: DEFAULT_LAYERS.map((l) => ({ ...l, visible: true, locked: false })),
    materials: DEFAULT_MATERIALS.map((m) => ({ ...m })),
    pages,
    activePageId: pages[0].id,
    activeLayerId: 'walls',
    meta: {
      client: '',
      address: '',
      designer: '',
      date: '',
      notes: '',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function activePage(project) {
  return project.pages.find((p) => p.id === project.activePageId) || project.pages[0];
}

export function getLayer(project, id) {
  return project.layers.find((l) => l.id === id) || project.layers[0];
}

export function getMaterial(project, id) {
  return project.materials.find((m) => m.id === id) || null;
}

export function isLayerEditable(project, layerId) {
  const layer = getLayer(project, layerId);
  return !!layer && layer.visible && !layer.locked;
}

export function addEntity(project, entity, pageId) {
  const page = pageId ? project.pages.find((p) => p.id === pageId) : activePage(project);
  if (!page) return null;
  page.entities.push(entity);
  return entity;
}

export function removeEntities(project, ids) {
  const set = new Set(ids);
  for (const page of project.pages) {
    // Openings cannot outlive their host wall.
    const removedWalls = new Set(
      page.entities.filter((e) => set.has(e.id) && e.type === 'wall').map((e) => e.id)
    );
    page.entities = page.entities.filter(
      (e) => !set.has(e.id) && !(e.type === 'opening' && removedWalls.has(e.host))
    );
  }
}

export function addLayer(project, name) {
  const layer = {
    id: uid('ly'),
    name: name || `Layer ${project.layers.length + 1}`,
    color: '#46525E',
    colorDark: '#A9C7E5',
    weight: 0.35,
    dash: null,
    visible: true,
    locked: false,
  };
  project.layers.push(layer);
  return layer;
}

export function removeLayer(project, layerId) {
  if (project.layers.length <= 1) return false;
  const fallback = project.layers.find((l) => l.id !== layerId);
  for (const page of project.pages) {
    for (const ent of page.entities) if (ent.layer === layerId) ent.layer = fallback.id;
  }
  project.layers = project.layers.filter((l) => l.id !== layerId);
  if (project.activeLayerId === layerId) project.activeLayerId = fallback.id;
  return true;
}

export function addPage(project, name, kind) {
  const page = makePage(name || `Sheet ${project.pages.length + 1}`, kind);
  project.pages.push(page);
  return page;
}

export function removePage(project, pageId) {
  if (project.pages.length <= 1) return false;
  project.pages = project.pages.filter((p) => p.id !== pageId);
  if (project.activePageId === pageId) project.activePageId = project.pages[0].id;
  return true;
}

export function allEntities(project) {
  return project.pages.flatMap((p) => p.entities);
}

export function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

const KNOWN_TYPES = new Set([
  'line',
  'rect',
  'circle',
  'arc',
  'polyline',
  'wall',
  'opening',
  'dim',
  'text',
  'room',
  'part',
]);

const isPoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

function sanitizeEntity(raw, layerIds) {
  if (!raw || typeof raw !== 'object' || !KNOWN_TYPES.has(raw.type)) return null;
  const ent = { ...raw };
  ent.id = typeof ent.id === 'string' && ent.id ? ent.id : uid('e');
  if (!layerIds.has(ent.layer)) ent.layer = [...layerIds][0];

  const needsAB = ['line', 'rect', 'part', 'dim', 'wall'];
  if (needsAB.includes(ent.type) && (!isPoint(ent.a) || !isPoint(ent.b))) return null;
  if ((ent.type === 'circle' || ent.type === 'arc') && (!isPoint(ent.c) || !Number.isFinite(ent.r))) {
    return null;
  }
  if (ent.type === 'polyline' || ent.type === 'room') {
    if (!Array.isArray(ent.pts) || ent.pts.length < 2 || !ent.pts.every(isPoint)) return null;
    ent.pts = ent.pts.map((p) => ({ x: p.x, y: p.y }));
  }
  if (ent.type === 'text') {
    if (!isPoint(ent.p)) return null;
    ent.text = String(ent.text ?? '');
    ent.size = Number.isFinite(ent.size) ? ent.size : 8;
    ent.rot = Number.isFinite(ent.rot) ? ent.rot : 0;
  }
  if (ent.type === 'wall') {
    ent.thickness = Number.isFinite(ent.thickness) && ent.thickness > 0 ? ent.thickness : 5.5;
    if (!['new', 'existing', 'demo'].includes(ent.status)) ent.status = 'new';
  }
  if (ent.type === 'opening') {
    if (typeof ent.host !== 'string') return null;
    ent.t = Number.isFinite(ent.t) ? Math.min(1, Math.max(0, ent.t)) : 0.5;
    ent.width = Number.isFinite(ent.width) && ent.width > 0 ? ent.width : 32;
    if (!['door', 'window', 'cased'].includes(ent.kind)) ent.kind = 'door';
  }
  if (ent.type === 'part') {
    ent.qty = Number.isInteger(ent.qty) && ent.qty > 0 ? ent.qty : 1;
    ent.thickness = Number.isFinite(ent.thickness) && ent.thickness > 0 ? ent.thickness : 0.75;
    ent.name = String(ent.name ?? 'Part');
    ent.material = String(ent.material ?? 'ply-3/4');
  }
  if (ent.type === 'dim') ent.offset = Number.isFinite(ent.offset) ? ent.offset : 18;
  if (ent.type === 'room') ent.name = String(ent.name ?? 'Room');
  return ent;
}

/** Repair/validate an imported project so a bad file cannot break the app. */
export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a Storystick project file.');
  const base = createProject({ name: typeof raw.name === 'string' ? raw.name : 'Imported Project' });

  const project = { ...base };
  if (raw.unitSystem === 'metric' || raw.unitSystem === 'imperial') project.unitSystem = raw.unitSystem;
  for (const key of [
    'gridSize',
    'kerf',
    'wasteFactor',
    'defaultWallThickness',
    'denominator',
    'wallHeight',
    'studSpacing',
  ]) {
    if (Number.isFinite(raw[key])) project[key] = raw[key];
  }
  for (const key of ['snapGrid', 'snapObject', 'ortho']) {
    if (typeof raw[key] === 'boolean') project[key] = raw[key];
  }
  if (typeof raw.kind === 'string') project.kind = raw.kind;
  if (raw.meta && typeof raw.meta === 'object') project.meta = { ...base.meta, ...raw.meta };

  // Files written before version 2 stored line weights as arbitrary screen
  // pixels; version 2 stores plotted millimetres from the brand weight table.
  const legacyWeights = !Number.isFinite(raw.version) || raw.version < 2;
  const migrateWeight = (id, weight) => {
    if (!Number.isFinite(weight)) return 0.35;
    if (!legacyWeights) return Math.min(2, Math.max(0.05, weight));
    if (DEFAULT_LAYER_WEIGHTS.has(id)) return DEFAULT_LAYER_WEIGHTS.get(id);
    return Math.min(0.7, Math.max(0.18, weight * 0.44));
  };
  const defaultsById = new Map(DEFAULT_LAYERS.map((l) => [l.id, l]));

  if (Array.isArray(raw.layers) && raw.layers.length) {
    project.layers = raw.layers
      .filter((l) => l && typeof l.id === 'string')
      .map((l) => {
        const preset = defaultsById.get(l.id);
        return {
          id: l.id,
          name: String(l.name ?? l.id),
          color:
            typeof l.color === 'string' && !legacyWeights
              ? l.color
              : (preset && preset.color) || (typeof l.color === 'string' ? l.color : '#46525E'),
          colorDark:
            typeof l.colorDark === 'string'
              ? l.colorDark
              : (preset && preset.colorDark) || '#A9C7E5',
          weight: migrateWeight(l.id, l.weight),
          dash: Array.isArray(l.dash) ? l.dash : (preset && preset.dash) || null,
          visible: l.visible !== false,
          locked: !!l.locked,
        };
      });
  }
  if (!project.layers.length) project.layers = base.layers;

  if (Array.isArray(raw.materials) && raw.materials.length) {
    project.materials = raw.materials
      .filter((m) => m && typeof m.id === 'string')
      .map((m) => ({
        id: m.id,
        name: String(m.name ?? m.id),
        form: m.form === 'board' ? 'board' : 'sheet',
        thickness: Number.isFinite(m.thickness) ? m.thickness : 0.75,
        stockW: Number.isFinite(m.stockW) ? m.stockW : 48,
        stockL: Number.isFinite(m.stockL) ? m.stockL : 96,
        cost: Number.isFinite(m.cost) ? m.cost : 0,
      }));
  }

  const layerIds = new Set(project.layers.map((l) => l.id));
  const pages = Array.isArray(raw.pages) ? raw.pages : [];
  project.pages = pages
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      id: typeof p.id === 'string' && p.id ? p.id : uid('pg'),
      name: String(p.name ?? 'Sheet'),
      kind: PAGE_KINDS.includes(p.kind) ? p.kind : 'plan',
      scale: String(p.scale ?? '1/4" = 1\'-0"'),
      entities: (Array.isArray(p.entities) ? p.entities : [])
        .map((e) => sanitizeEntity(e, layerIds))
        .filter(Boolean),
    }));
  if (!project.pages.length) project.pages = [makePage('Floor Plan', 'plan')];

  // Drop openings whose host wall vanished.
  for (const page of project.pages) {
    const walls = new Set(page.entities.filter((e) => e.type === 'wall').map((e) => e.id));
    page.entities = page.entities.filter((e) => e.type !== 'opening' || walls.has(e.host));
  }

  project.activePageId = project.pages.some((p) => p.id === raw.activePageId)
    ? raw.activePageId
    : project.pages[0].id;
  project.activeLayerId = layerIds.has(raw.activeLayerId) ? raw.activeLayerId : project.layers[0].id;
  project.version = FILE_VERSION;
  project.updatedAt = new Date().toISOString();
  return project;
}
