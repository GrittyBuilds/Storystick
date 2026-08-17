// Door / window / room schedules and a wall takeoff, the tables that normally
// sit on the drawing sheet next to the plan.

import * as g from '../core/geometry.js';
import {
  wallLength,
  openingsForWall,
  openingHead,
  openingUnitHeight,
  openingSill,
  footingLength,
  roofPlanArea,
  roofSlopedArea,
  roofRidgeHeight,
} from '../core/entities.js';
import { getAssembly } from '../core/assemblies.js';
import { getSymbol } from '../symbols/library.js';

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
        height: openingUnitHeight(ent),
        sill: openingSill(ent),
        headHeight: openingHead(ent),
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
        use: ent.use || 'other',
        area,
        perimeter: g.polygonPerimeter(ent.pts, true),
        finishes: ent.finishes || null,
      });
    }
  }
  rows.sort((a, b) => b.area - a.area);
  return rows;
}

/**
 * The finish schedule: what goes on the floor, the base, the walls and the
 * ceiling of every room, with the quantity each of those finishes covers.
 *
 * A finish left blank stays blank. Guessing "probably paint" is how a schedule
 * becomes something nobody trusts, and an empty cell is a question somebody can
 * answer — a wrong one is not.
 */
export function finishSchedule(project) {
  return roomSchedule(project).map((room) => {
    const f = room.finishes || {};
    const height = f.ceilingHeight ?? project.wallHeight ?? 96;
    return {
      id: room.id,
      page: room.page,
      name: room.name,
      use: room.use,
      floor: f.floor || '',
      base: f.base || '',
      walls: f.walls || '',
      ceiling: f.ceiling || '',
      ceilingHeight: height,
      notes: f.notes || '',
      // Quantities a finisher prices from.
      floorArea: room.area,
      ceilingArea: room.area,
      wallArea: room.perimeter * height,
      baseLength: room.perimeter,
      complete: Boolean(f.floor && f.base && f.walls && f.ceiling),
    };
  });
}

/** Rooms still missing a finish, so the gap is visible rather than assumed. */
export function missingFinishes(project) {
  const out = [];
  for (const row of finishSchedule(project)) {
    const gaps = ['floor', 'base', 'walls', 'ceiling'].filter((slot) => !row[slot]);
    if (gaps.length) out.push({ name: row.name, page: row.page, missing: gaps });
  }
  return out;
}

/**
 * Material quantities implied by the wall assemblies: sheets of gypsum board,
 * square feet of sheathing and insulation, cubic yards of concrete.
 *
 * A wall with no assembly assigned contributes nothing here and is reported
 * separately — a takeoff that silently treats an unmodelled wall as zero is
 * worse than one that says it does not know.
 */
export function assemblyTakeoff(project) {
  const height = project.wallHeight ?? 96;
  const byMaterial = new Map();
  const unassigned = [];

  for (const page of project.pages) {
    for (const ent of page.entities) {
      if (ent.type !== 'wall' || ent.status === 'demo') continue;
      const length = wallLength(ent);
      if (length <= 0) continue;
      const assembly = ent.assembly ? getAssembly(project, ent.assembly) : null;
      if (!assembly) {
        unassigned.push({ page: page.name, id: ent.id, length });
        continue;
      }
      const wallHeight = ent.height ?? height;
      const openings = openingsForWall(page, ent.id);
      const openingArea = openings.reduce(
        (sum, o) => sum + o.width * Math.max(0, Math.min(wallHeight, openingHead(o)) - openingSill(o)),
        0
      );
      const netSqIn = Math.max(0, length * wallHeight - openingArea);
      const netSqFt = netSqIn / 144;

      for (const layer of assembly.layers) {
        if (!layer.takeoff) continue;
        // A board or finish layer exists on each face it is drawn on; the
        // assembly lists it once per face, so counting layers counts faces.
        const key = `${assembly.id}|${layer.name}`;
        if (!byMaterial.has(key)) {
          byMaterial.set(key, {
            assembly: assembly.name,
            layer: layer.name,
            kind: layer.kind,
            material: layer.material,
            unit: layer.takeoff,
            area: 0,
            volume: 0,
            sheets: 0,
            length: 0,
          });
        }
        const row = byMaterial.get(key);
        row.length += length / 12;
        if (layer.takeoff === 'volume') {
          row.volume += (netSqIn * layer.thickness) / 46656; // cubic yards
        } else {
          row.area += netSqFt;
          if (layer.takeoff === 'sheet') {
            row.sheets = Math.ceil(row.area / (layer.sheetCoverageSqFt || 32));
          }
        }
      }
    }
  }

  return {
    rows: [...byMaterial.values()].sort(
      (a, b) => a.assembly.localeCompare(b.assembly) || a.layer.localeCompare(b.layer)
    ),
    unassigned,
  };
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
        (sum, o) => sum + o.width * Math.max(0, Math.min(height, openingHead(o)) - openingSill(o)),
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

/**
 * Every symbol placed, grouped the way a fixture schedule counts them. This is
 * what tells an estimator how many receptacles and how many supply registers
 * the drawing actually asks for.
 */
export function fixtureSchedule(project, discipline = null) {
  const counts = new Map();
  for (const page of project.pages) {
    for (const ent of page.entities) {
      if (ent.type !== 'fixture') continue;
      const symbol = getSymbol(ent.symbol);
      // A symbol the library does not know is still a thing somebody drew and
      // somebody will have to buy. Dropping it from the count would quietly
      // make the schedule disagree with the drawing.
      const spec = symbol || {
        id: ent.symbol,
        name: `Unknown symbol "${ent.symbol}"`,
        discipline: ent.discipline || 'architectural',
        countAs: 'unknown',
      };
      if (discipline && spec.discipline !== discipline) continue;
      const key = spec.id;
      if (!counts.has(key)) {
        counts.set(key, {
          id: spec.id,
          name: spec.name,
          discipline: spec.discipline,
          countAs: spec.countAs || 'fixture',
          known: Boolean(symbol),
          qty: 0,
          tags: [],
        });
      }
      const row = counts.get(key);
      row.qty += 1;
      if (ent.tag) row.tags.push(ent.tag);
    }
  }
  return [...counts.values()].sort(
    (a, b) => a.discipline.localeCompare(b.discipline) || a.name.localeCompare(b.name)
  );
}

/** Footings, slabs and beams, which is what a concrete sub prices from. */
export function structureTakeoff(project) {
  const rows = { footings: [], slabs: [], beams: [] };
  for (const page of project.pages) {
    for (const ent of page.entities) {
      if (ent.type === 'footing') {
        const length = ent.kind === 'pad' ? ent.length || ent.width : footingLength(ent);
        const volume = (ent.width * length * ent.thickness) / 46656;
        rows.footings.push({
          page: page.name,
          kind: ent.kind || 'continuous',
          width: ent.width,
          length,
          thickness: ent.thickness,
          depthBelowGrade: ent.depthBelowGrade,
          volume,
        });
      } else if (ent.type === 'slab') {
        const area = Math.abs(g.polygonArea(ent.pts));
        rows.slabs.push({
          page: page.name,
          area,
          thickness: ent.thickness,
          topElevation: ent.topElevation,
          reinforcement: ent.reinforcement || '',
          volume: (area * ent.thickness) / 46656,
        });
      } else if (ent.type === 'beam') {
        rows.beams.push({
          page: page.name,
          tag: ent.tag || '',
          size: ent.size,
          plies: ent.plies || 1,
          span: g.dist(ent.a, ent.b),
          elevation: ent.elevation ?? 0,
        });
      }
    }
  }
  return {
    ...rows,
    totals: {
      footingVolume: rows.footings.reduce((s, r) => s + r.volume, 0),
      slabVolume: rows.slabs.reduce((s, r) => s + r.volume, 0),
      slabArea: rows.slabs.reduce((s, r) => s + r.area, 0),
      beamLength: rows.beams.reduce((s, r) => s + r.span * (r.plies || 1), 0),
    },
  };
}

/** Roof planes, with the sloped area a roofer orders shingles against. */
export function roofTakeoff(project) {
  const rows = [];
  for (const page of project.pages) {
    for (const ent of page.entities) {
      if (ent.type !== 'roofPlane') continue;
      rows.push({
        page: page.name,
        pitch: ent.pitch,
        planArea: roofPlanArea(ent),
        slopedArea: roofSlopedArea(ent),
        eaveHeight: ent.eaveHeight,
        ridgeHeight: roofRidgeHeight(ent),
        overhang: ent.overhang,
      });
    }
  }
  const slopedArea = rows.reduce((s, r) => s + r.slopedArea, 0);
  return {
    rows,
    totals: {
      planArea: rows.reduce((s, r) => s + r.planArea, 0),
      slopedArea,
      // Roofing is sold by the square: 100 square feet.
      squares: slopedArea / 144 / 100,
    },
  };
}

export function scheduleSummary(project) {
  const doors = doorSchedule(project);
  const windows = windowSchedule(project);
  const rooms = roomSchedule(project);
  const walls = wallTakeoff(project);
  const finishes = finishSchedule(project);
  const fixtures = fixtureSchedule(project);
  return {
    doors,
    windows,
    rooms,
    walls,
    finishes,
    fixtures,
    assemblies: assemblyTakeoff(project),
    structure: structureTakeoff(project),
    roof: roofTakeoff(project),
    totals: {
      doors: doors.length,
      windows: windows.length,
      rooms: rooms.length,
      fixtures: fixtures.reduce((s, f) => s + f.qty, 0),
      floorArea: rooms.reduce((s, r) => s + r.area, 0),
      wallLength: walls.reduce((s, w) => s + w.length, 0),
      wallArea: walls.reduce((s, w) => s + w.netArea, 0),
    },
  };
}
