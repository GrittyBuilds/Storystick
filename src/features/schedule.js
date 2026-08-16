// Door / window / room schedules and a wall takeoff, the tables that normally
// sit on the drawing sheet next to the plan.

import * as g from '../core/geometry.js';
import { wallLength, openingsForWall } from '../core/entities.js';

export function openingSchedule(project, kind) {
  const rows = [];
  for (const page of project.pages) {
    const walls = new Map(page.entities.filter((e) => e.type === 'wall').map((w) => [w.id, w]));
    for (const ent of page.entities) {
      if (ent.type !== 'opening') continue;
      if (kind && ent.kind !== kind) continue;
      const wall = walls.get(ent.host);
      rows.push({
        id: ent.id,
        tag: ent.tag || '',
        page: page.name,
        kind: ent.kind,
        width: ent.width,
        height: ent.height ?? (ent.kind === 'window' ? 48 : 80),
        sill: ent.sill ?? 0,
        swing: ent.swing || '',
        wallThickness: wall ? wall.thickness : 0,
      });
    }
  }
  rows.sort((a, b) => a.tag.localeCompare(b.tag) || a.width - b.width);
  return rows;
}

export function doorSchedule(project) {
  return openingSchedule(project, 'door');
}

export function windowSchedule(project) {
  return openingSchedule(project, 'window');
}

export function roomSchedule(project) {
  const rows = [];
  for (const page of project.pages) {
    for (const ent of page.entities) {
      if (ent.type !== 'room') continue;
      const area = Math.abs(g.polygonArea(ent.pts));
      rows.push({
        id: ent.id,
        page: page.name,
        name: ent.name || 'Room',
        area,
        perimeter: g.polygonPerimeter(ent.pts, true),
      });
    }
  }
  rows.sort((a, b) => b.area - a.area);
  return rows;
}

export function totalFloorArea(project) {
  return roomSchedule(project).reduce((sum, r) => sum + r.area, 0);
}

/**
 * Linear run and surface area per wall status, with opening area removed.
 * Heights are in model inches.
 */
export function wallTakeoff(project) {
  const height = project.wallHeight ?? 96;
  const byStatus = new Map();
  for (const page of project.pages) {
    for (const ent of page.entities) {
      if (ent.type !== 'wall') continue;
      const length = wallLength(ent);
      if (length <= 0) continue;
      const openings = openingsForWall(page, ent.id);
      const openingArea = openings.reduce(
        (sum, o) => sum + o.width * Math.min(height, o.height ?? (o.kind === 'window' ? 48 : 80)),
        0
      );
      const status = ent.status || 'new';
      if (!byStatus.has(status)) {
        byStatus.set(status, { status, count: 0, length: 0, grossArea: 0, netArea: 0, openings: 0 });
      }
      const row = byStatus.get(status);
      row.count += 1;
      row.length += length;
      row.grossArea += length * height;
      row.netArea += Math.max(0, length * height - openingArea);
      row.openings += openings.length;
    }
  }
  const order = { new: 0, existing: 1, demo: 2 };
  return [...byStatus.values()].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
}

export function scheduleSummary(project) {
  const doors = doorSchedule(project);
  const windows = windowSchedule(project);
  const rooms = roomSchedule(project);
  const walls = wallTakeoff(project);
  return {
    doors,
    windows,
    rooms,
    walls,
    totals: {
      doors: doors.length,
      windows: windows.length,
      rooms: rooms.length,
      floorArea: rooms.reduce((s, r) => s + r.area, 0),
      wallLength: walls.reduce((s, w) => s + w.length, 0),
      wallArea: walls.reduce((s, w) => s + w.netArea, 0),
    },
  };
}
