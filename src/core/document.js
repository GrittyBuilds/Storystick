// Project document model: layers, pages, materials and project-wide settings.

import { uid } from './entities.js';
import { defaultGrid } from './units.js';
import { createJurisdiction } from '../codes/jurisdiction.js';
import { createSpeciesTable } from '../engineering/species.js';
import { createAssemblies, DEFAULT_FINISHES } from './assemblies.js';

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
  { id: 'foundation', name: 'Foundation', color: '#0F2338', colorDark: '#A9C7E5', weight: 0.7, dash: null },
  { id: 'footings', name: 'Footings', color: '#65717C', colorDark: '#7E9BB8', weight: 0.35, dash: [10, 4] },
  { id: 'slab', name: 'Slabs', color: '#8A97A3', colorDark: '#5E7A97', weight: 0.25, dash: null },
  { id: 'structure', name: 'Beams & Posts', color: '#46525E', colorDark: '#A9C7E5', weight: 0.5, dash: null },
  { id: 'roof', name: 'Roof', color: '#46525E', colorDark: '#7E9BB8', weight: 0.5, dash: null },
  { id: 'electrical', name: 'Electrical', color: '#1B5FA6', colorDark: '#3E86CE', weight: 0.35, dash: null },
  { id: 'plumbing', name: 'Plumbing', color: '#177C54', colorDark: '#1F9D6B', weight: 0.35, dash: null },
  { id: 'mechanical', name: 'Mechanical', color: '#9E5813', colorDark: '#EFA860', weight: 0.35, dash: null },
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

export const PAGE_KINDS = [
  'plan',
  'foundation',
  'framing',
  'electrical',
  'plumbing',
  'mechanical',
  'roof',
  'elevation',
  'section',
  'detail',
  'site',
  'layout',
];

/** Discipline prefix a sheet number takes, by sheet kind. */
export const SHEET_PREFIX = {
  plan: 'A',
  elevation: 'A',
  section: 'A',
  detail: 'A',
  layout: 'A',
  roof: 'A',
  site: 'C',
  foundation: 'S',
  framing: 'S',
  electrical: 'E',
  plumbing: 'P',
  mechanical: 'M',
};

export function makePage(name, kind = 'plan', opts = {}) {
  return {
    id: uid('pg'),
    name,
    kind,
    scale: opts.scale || '1/4" = 1\'-0"',
    sheetNumber: opts.sheetNumber || '',
    // A discipline sheet draws another sheet's plan underneath in background
    // weight rather than owning a copy of it. An electrician's sheet and the
    // architect's sheet then cannot disagree about where a wall is, because
    // there is only one wall.
    basePageId: opts.basePageId || null,
    entities: [],
    notes: opts.notes || [],
  };
}

/** The page a sheet traces over, if any. */
export function basePageOf(project, page) {
  if (!page || !page.basePageId) return null;
  const base = project.pages.find((p) => p.id === page.basePageId);
  return base && base.id !== page.id ? base : null;
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
    // Code requirements and lumber design values are per project, because they
    // are jurisdiction- and material-specific and must be confirmed by the user.
    jurisdiction: createJurisdiction(),
    speciesValues: createSpeciesTable(),
    assemblies: createAssemblies(),
    sheet: {
      size: 'ARCH-D',
      orientation: 'landscape',
      titleBlock: 'right',
      autoScale: true,
      showGrid: false,
    },
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
  'fixture',
  'roofPlane',
  'footing',
  'slab',
  'beam',
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
  if (['polyline', 'room', 'slab', 'roofPlane'].includes(ent.type)) {
    const minimum = ent.type === 'polyline' ? 2 : 3;
    if (!Array.isArray(ent.pts) || ent.pts.length < minimum || !ent.pts.every(isPoint)) return null;
    ent.pts = ent.pts.map((p) => ({ x: p.x, y: p.y }));
  }
  if (ent.type === 'fixture') {
    if (!isPoint(ent.p) || typeof ent.symbol !== 'string') return null;
    ent.rot = Number.isFinite(ent.rot) ? ent.rot : 0;
    ent.scale = Number.isFinite(ent.scale) && ent.scale > 0 ? ent.scale : 1;
    ent.discipline = typeof ent.discipline === 'string' ? ent.discipline : 'architectural';
    ent.tag = String(ent.tag ?? '');
  }
  if (ent.type === 'roofPlane') {
    ent.pitch = Number.isFinite(ent.pitch) ? Math.max(0, ent.pitch) : 6;
    ent.eaveHeight = Number.isFinite(ent.eaveHeight) ? ent.eaveHeight : 96;
    ent.eave = Number.isInteger(ent.eave) ? Math.max(0, Math.min(ent.eave, ent.pts.length - 1)) : 0;
    ent.overhang = Number.isFinite(ent.overhang) ? ent.overhang : 0;
  }
  if (ent.type === 'slab') {
    ent.thickness = Number.isFinite(ent.thickness) && ent.thickness > 0 ? ent.thickness : 4;
    ent.topElevation = Number.isFinite(ent.topElevation) ? ent.topElevation : 0;
    ent.name = String(ent.name ?? 'Slab');
  }
  if (ent.type === 'footing') {
    if (!isPoint(ent.a) || !isPoint(ent.b)) return null;
    ent.width = Number.isFinite(ent.width) && ent.width > 0 ? ent.width : 20;
    ent.thickness = Number.isFinite(ent.thickness) && ent.thickness > 0 ? ent.thickness : 10;
    ent.kind = ent.kind === 'pad' ? 'pad' : 'continuous';
    if (ent.kind === 'pad') ent.length = Number.isFinite(ent.length) ? ent.length : ent.width;
  }
  if (ent.type === 'beam') {
    if (!isPoint(ent.a) || !isPoint(ent.b)) return null;
    ent.size = String(ent.size ?? '2x10');
    ent.plies = Number.isInteger(ent.plies) && ent.plies > 0 ? ent.plies : 2;
    ent.elevation = Number.isFinite(ent.elevation) ? ent.elevation : 96;
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
  if (ent.type === 'room') {
    ent.name = String(ent.name ?? 'Room');
    ent.use = typeof ent.use === 'string' ? ent.use : 'other';
    ent.finishes =
      ent.finishes && typeof ent.finishes === 'object'
        ? { ...DEFAULT_FINISHES, ...ent.finishes }
        : { ...DEFAULT_FINISHES };
  }
  if (ent.type === 'wall' && typeof ent.assembly !== 'string') ent.assembly = null;
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
  if (raw.sheet && typeof raw.sheet === 'object') project.sheet = { ...project.sheet, ...raw.sheet };
  if (raw.meta && typeof raw.meta === 'object') project.meta = { ...base.meta, ...raw.meta };

  // Confirmed code values and design values survive a round trip, but only the
  // fields we know about — an imported file cannot introduce new thresholds.
  if (raw.jurisdiction && typeof raw.jurisdiction === 'object') {
    for (const key of ['authorities', 'edition', 'groundSnow']) {
      if (raw.jurisdiction[key] && typeof raw.jurisdiction[key] === 'object') {
        project.jurisdiction[key] = { ...project.jurisdiction[key], ...raw.jurisdiction[key] };
      }
    }
    const incoming = raw.jurisdiction.thresholds || {};
    for (const [id, record] of Object.entries(project.jurisdiction.thresholds)) {
      const from = incoming[id];
      if (from && typeof from === 'object' && Number.isFinite(from.value)) {
        record.value = from.value;
        record.source = typeof from.source === 'string' ? from.source : null;
        record.confirmedBy = typeof from.confirmedBy === 'string' ? from.confirmedBy : null;
        record.confirmedOn = typeof from.confirmedOn === 'string' ? from.confirmedOn : null;
      }
    }
  }
  if (raw.speciesValues && typeof raw.speciesValues === 'object') {
    for (const [id, record] of Object.entries(project.speciesValues)) {
      const from = raw.speciesValues[id];
      if (!from || typeof from !== 'object') continue;
      for (const key of ['fb', 'fv', 'fcPerp', 'e']) {
        if (Number.isFinite(from[key]) && from[key] > 0) record[key] = from[key];
      }
      if (typeof from.source === 'string') record.source = from.source;
      if (typeof from.confirmedOn === 'string') record.confirmedOn = from.confirmedOn;
      record.verified = !!from.verified;
    }
  }

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
      sheetNumber: String(p.sheetNumber ?? ''),
      basePageId: typeof p.basePageId === 'string' && p.basePageId ? p.basePageId : null,
      notes: Array.isArray(p.notes) ? p.notes.map(String) : [],
      entities: (Array.isArray(p.entities) ? p.entities : [])
        .map((e) => sanitizeEntity(e, layerIds))
        .filter(Boolean),
    }));
  if (!project.pages.length) project.pages = [makePage('Floor Plan', 'plan')];

  // A base-page reference that points at a deleted sheet, or at itself, would
  // either draw nothing or recurse; drop it rather than carry a broken link.
  const pageIds = new Set(project.pages.map((p) => p.id));
  for (const page of project.pages) {
    if (page.basePageId && (page.basePageId === page.id || !pageIds.has(page.basePageId))) {
      page.basePageId = null;
    }
  }

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
