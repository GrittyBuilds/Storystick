// Cut list generation and stock optimisation.
//
// Sheet goods are packed with a shelf (first-fit decreasing) guillotine
// heuristic; solid stock is ripped into lanes of a fixed width and then packed
// one-dimensionally. Both honour the saw kerf.

import { boardFeet } from '../core/units.js';
import { getMaterial } from '../core/document.js';

const TOL = 1e-9;

/** Flatten every `part` entity in the project into cut-list rows. */
export function collectParts(project) {
  const rows = [];
  for (const page of project.pages) {
    for (const ent of page.entities) {
      if (ent.type !== 'part') continue;
      const dx = Math.abs(ent.b.x - ent.a.x);
      const dy = Math.abs(ent.b.y - ent.a.y);
      if (dx <= TOL || dy <= TOL) continue;
      rows.push({
        id: ent.id,
        page: page.name,
        name: ent.name || 'Part',
        length: Math.max(dx, dy),
        width: Math.min(dx, dy),
        thickness: ent.thickness,
        material: ent.material,
        qty: ent.qty || 1,
        notes: ent.notes || '',
      });
    }
  }
  return rows;
}

/** Merge identical parts (same name, size, material) into single rows. */
export function mergeParts(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = [
      row.material,
      row.name,
      row.length.toFixed(4),
      row.width.toFixed(4),
      row.thickness.toFixed(4),
    ].join('|');
    const existing = map.get(key);
    if (existing) existing.qty += row.qty;
    else map.set(key, { ...row });
  }
  return [...map.values()].sort((a, b) => b.length - a.length || b.width - a.width);
}

function expand(rows) {
  const out = [];
  for (const row of rows) {
    for (let i = 0; i < row.qty; i += 1) {
      out.push({ ref: row.id, name: row.name, length: row.length, width: row.width });
    }
  }
  return out;
}

function fitsSheet(l, w, material) {
  return l <= material.stockL + TOL && w <= material.stockW + TOL;
}

function tryPlace(sheet, piece, material, kerf) {
  const orientations = [
    [piece.length, piece.width],
    [piece.width, piece.length],
  ];

  for (const shelf of sheet.shelves) {
    for (const [pl, pw] of orientations) {
      if (!fitsSheet(pl, pw, material)) continue;
      if (pw > shelf.height + TOL) continue;
      const x = shelf.used === 0 ? 0 : shelf.used + kerf;
      if (x + pl <= material.stockL + TOL) {
        shelf.used = x + pl;
        sheet.pieces.push({ x, y: shelf.y, l: pl, w: pw, name: piece.name, ref: piece.ref });
        return true;
      }
    }
  }

  const top = sheet.shelves.length ? sheet.shelves[sheet.shelves.length - 1] : null;
  const y = top ? top.y + top.height + kerf : 0;
  for (const [pl, pw] of orientations) {
    if (!fitsSheet(pl, pw, material)) continue;
    if (y + pw <= material.stockW + TOL) {
      sheet.shelves.push({ y, height: pw, used: pl });
      sheet.pieces.push({ x: 0, y, l: pl, w: pw, name: piece.name, ref: piece.ref });
      return true;
    }
  }
  return false;
}

export function packSheets(rows, material, kerf = 0.125) {
  const pieces = expand(rows).sort(
    (a, b) =>
      Math.max(b.length, b.width) - Math.max(a.length, a.width) ||
      Math.min(b.length, b.width) - Math.min(a.length, a.width)
  );
  const sheets = [];
  const oversize = [];

  for (const piece of pieces) {
    if (
      !fitsSheet(piece.length, piece.width, material) &&
      !fitsSheet(piece.width, piece.length, material)
    ) {
      oversize.push(piece);
      continue;
    }
    let placed = false;
    for (const sheet of sheets) {
      if (tryPlace(sheet, piece, material, kerf)) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      const sheet = { index: sheets.length + 1, shelves: [], pieces: [] };
      tryPlace(sheet, piece, material, kerf);
      sheets.push(sheet);
    }
  }

  const sheetArea = material.stockL * material.stockW;
  for (const sheet of sheets) {
    sheet.usedArea = sheet.pieces.reduce((sum, p) => sum + p.l * p.w, 0);
    sheet.utilization = sheetArea ? sheet.usedArea / sheetArea : 0;
  }
  return { sheets, oversize };
}

export function packBoards(rows, material, kerf = 0.125) {
  const byWidth = new Map();
  const oversize = [];
  for (const row of rows) {
    if (row.width > material.stockW + TOL || row.length > material.stockL + TOL) {
      oversize.push(row);
      continue;
    }
    const key = row.width.toFixed(4);
    if (!byWidth.has(key)) byWidth.set(key, []);
    byWidth.get(key).push(row);
  }

  const runs = [];
  for (const [key, group] of byWidth) {
    const width = Number(key);
    const ripsPerBoard = Math.max(1, Math.floor((material.stockW + kerf) / (width + kerf)));
    const pieces = expand(group).sort((a, b) => b.length - a.length);
    const lanes = [];
    for (const piece of pieces) {
      let placed = false;
      for (const lane of lanes) {
        const start = lane.used === 0 ? 0 : lane.used + kerf;
        if (start + piece.length <= material.stockL + TOL) {
          lane.pieces.push({ start, length: piece.length, name: piece.name, ref: piece.ref });
          lane.used = start + piece.length;
          placed = true;
          break;
        }
      }
      if (!placed) {
        lanes.push({
          used: piece.length,
          pieces: [{ start: 0, length: piece.length, name: piece.name, ref: piece.ref }],
        });
      }
    }
    runs.push({
      width,
      ripsPerBoard,
      lanes,
      boards: Math.ceil(lanes.length / ripsPerBoard),
      utilization: lanes.length
        ? lanes.reduce((s, l) => s + l.used, 0) / (lanes.length * material.stockL)
        : 0,
    });
  }
  runs.sort((a, b) => b.width - a.width);
  return { runs, oversize };
}

/**
 * Full cut list for a project, grouped by material.
 * Returns { groups, totals, unassigned }.
 */
export function buildCutList(project) {
  const merged = mergeParts(collectParts(project));
  const byMaterial = new Map();
  const unassigned = [];

  for (const row of merged) {
    const material = getMaterial(project, row.material);
    if (!material) {
      unassigned.push(row);
      continue;
    }
    if (!byMaterial.has(material.id)) byMaterial.set(material.id, { material, rows: [] });
    byMaterial.get(material.id).rows.push(row);
  }

  const kerf = project.kerf ?? 0.125;
  const groups = [];
  for (const { material, rows } of byMaterial.values()) {
    const bf = rows.reduce(
      (sum, r) => sum + boardFeet(r.thickness || material.thickness, r.width, r.length, r.qty),
      0
    );
    const partCount = rows.reduce((sum, r) => sum + r.qty, 0);
    const group = {
      material,
      rows,
      partCount,
      boardFeet: bf,
      kerf,
    };
    if (material.form === 'sheet') {
      const packed = packSheets(rows, material, kerf);
      group.sheets = packed.sheets;
      group.oversize = packed.oversize;
      group.stockCount = packed.sheets.length;
      group.utilization = packed.sheets.length
        ? packed.sheets.reduce((s, sh) => s + sh.utilization, 0) / packed.sheets.length
        : 0;
    } else {
      const packed = packBoards(rows, material, kerf);
      group.runs = packed.runs;
      group.oversize = packed.oversize;
      group.stockCount = packed.runs.reduce((s, r) => s + r.boards, 0);
      group.utilization = packed.runs.length
        ? packed.runs.reduce((s, r) => s + r.utilization, 0) / packed.runs.length
        : 0;
    }
    group.cost = group.stockCount * (material.cost || 0);
    groups.push(group);
  }

  groups.sort((a, b) => b.cost - a.cost || a.material.name.localeCompare(b.material.name));

  const totals = {
    parts: groups.reduce((s, g) => s + g.partCount, 0) + unassigned.reduce((s, r) => s + r.qty, 0),
    stock: groups.reduce((s, g) => s + g.stockCount, 0),
    boardFeet: groups.reduce((s, g) => s + g.boardFeet, 0),
    cost: groups.reduce((s, g) => s + g.cost, 0),
    oversize: groups.reduce((s, g) => s + (g.oversize ? g.oversize.length : 0), 0),
  };

  return { groups, totals, unassigned };
}
