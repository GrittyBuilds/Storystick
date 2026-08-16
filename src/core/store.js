// Browser persistence. Projects live in localStorage; files move in and out as
// .storystick JSON. Every read is defensive — a corrupt entry must never brick
// the app.

import { normalizeProject } from './document.js';

const INDEX_KEY = 'storystick.index.v1';
const PROJECT_PREFIX = 'storystick.project.';
const LAST_KEY = 'storystick.last';

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readIndex() {
  const s = storage();
  if (!s) return [];
  try {
    const raw = JSON.parse(s.getItem(INDEX_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((e) => e && typeof e.id === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(entries) {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    /* quota — the in-memory project is still intact */
  }
}

export function listProjects() {
  return readIndex().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function saveProject(project) {
  const s = storage();
  if (!s) return false;
  project.updatedAt = new Date().toISOString();
  try {
    s.setItem(PROJECT_PREFIX + project.id, JSON.stringify(project));
  } catch {
    return false;
  }
  const entries = readIndex().filter((e) => e.id !== project.id);
  entries.push({
    id: project.id,
    name: project.name,
    kind: project.kind,
    updatedAt: project.updatedAt,
    pages: project.pages.length,
  });
  writeIndex(entries);
  setLastOpened(project.id);
  return true;
}

export function loadProject(id) {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(PROJECT_PREFIX + id);
    if (!raw) return null;
    return normalizeProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function deleteProject(id) {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(PROJECT_PREFIX + id);
  } catch {
    /* ignore */
  }
  writeIndex(readIndex().filter((e) => e.id !== id));
}

export function setLastOpened(id) {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(LAST_KEY, id);
  } catch {
    /* ignore */
  }
}

export function lastOpened() {
  const s = storage();
  if (!s) return null;
  try {
    return s.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function serializeProject(project) {
  return JSON.stringify(project, null, 2);
}

export function deserializeProject(text) {
  return normalizeProject(JSON.parse(text));
}
