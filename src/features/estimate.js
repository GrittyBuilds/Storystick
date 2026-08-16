// Rough order-of-magnitude materials estimate. Quantities are derived from the
// drawing; unit prices are editable defaults, not quotes.

import { buildCutList } from './cutlist.js';
import { wallTakeoff, roomSchedule, doorSchedule, windowSchedule } from './schedule.js';

export const UNIT_COSTS = {
  stud: 5.25, // 2x4x8 stud
  plate: 5.25, // 2x4x8 used as plate stock
  drywallSheet: 16.5, // 4x8 sheet
  insulationSqFt: 0.85,
  paintGallon: 48,
  flooringSqFt: 4.25,
  door: 180,
  window: 340,
  demoPerSqFt: 2.5,
};

const SQ_IN_PER_SHEET = 48 * 96;
const SQ_IN_PER_SQ_FT = 144;
const PAINT_COVERAGE_SQ_FT = 350; // per gallon, per coat
const STOCK_LENGTH = 96;

function line(label, qty, unit, unitCost, note = '') {
  const quantity = Math.ceil(qty * 100) / 100;
  return { label, qty: quantity, unit, unitCost, total: quantity * unitCost, note };
}

/**
 * @param {object} project
 * @param {object} options { waste, costs, coats }
 */
export function buildEstimate(project, options = {}) {
  const waste = options.waste ?? project.wasteFactor ?? 0.1;
  const costs = { ...UNIT_COSTS, ...(options.costs || {}) };
  const coats = options.coats ?? 2;
  const height = project.wallHeight ?? 96;
  const spacing = project.studSpacing ?? 16;

  const walls = wallTakeoff(project);
  const rooms = roomSchedule(project);
  const doors = doorSchedule(project);
  const windows = windowSchedule(project);

  const sections = [];

  // --- framing (new walls only) ---
  const newWalls = walls.find((w) => w.status === 'new');
  const framing = [];
  if (newWalls && newWalls.length > 0) {
    // One stud per spacing interval, plus a pair at each wall end for corners.
    const studs = Math.ceil(newWalls.length / spacing) + newWalls.count * 2;
    const plateLength = newWalls.length * 3; // single bottom + double top
    const plates = Math.ceil((plateLength * (1 + waste)) / STOCK_LENGTH);
    framing.push(line('Wall studs (2x4)', Math.ceil(studs * (1 + waste)), 'ea', costs.stud, `${spacing}" on centre`));
    framing.push(line('Plate stock (2x4)', plates, 'ea', costs.plate, '8 ft lengths'));
  }
  if (framing.length) sections.push({ title: 'Framing', items: framing });

  // --- finishes ---
  const finishes = [];
  const wallFaceArea = walls
    .filter((w) => w.status !== 'demo')
    .reduce((sum, w) => sum + w.netArea * 2, 0);
  if (wallFaceArea > 0) {
    const sheets = Math.ceil((wallFaceArea * (1 + waste)) / SQ_IN_PER_SHEET);
    finishes.push(line('Drywall 4x8 sheets', sheets, 'ea', costs.drywallSheet, 'both faces'));
    const paintSqFt = wallFaceArea / SQ_IN_PER_SQ_FT;
    finishes.push(
      line('Paint', Math.ceil((paintSqFt * coats) / PAINT_COVERAGE_SQ_FT), 'gal', costs.paintGallon, `${coats} coats`)
    );
  }
  const floorArea = rooms.reduce((s, r) => s + r.area, 0) / SQ_IN_PER_SQ_FT;
  if (floorArea > 0) {
    finishes.push(line('Flooring', floorArea * (1 + waste), 'sq ft', costs.flooringSqFt));
  }
  if (finishes.length) sections.push({ title: 'Finishes', items: finishes });

  // --- openings ---
  const openings = [];
  if (doors.length) openings.push(line('Doors', doors.length, 'ea', costs.door));
  if (windows.length) openings.push(line('Windows', windows.length, 'ea', costs.window));
  if (openings.length) sections.push({ title: 'Doors & Windows', items: openings });

  // --- demolition ---
  const demo = walls.find((w) => w.status === 'demo');
  if (demo && demo.grossArea > 0) {
    sections.push({
      title: 'Demolition',
      items: [
        line('Remove existing walls', demo.grossArea / SQ_IN_PER_SQ_FT, 'sq ft', costs.demoPerSqFt),
      ],
    });
  }

  // --- woodworking stock from the cut list ---
  const cutList = buildCutList(project);
  const millwork = cutList.groups.map((group) =>
    line(
      group.material.name,
      Math.ceil(group.stockCount * (1 + waste)),
      group.material.form === 'sheet' ? 'sheet' : 'board',
      group.material.cost || 0,
      `${group.partCount} parts · ${(group.utilization * 100).toFixed(0)}% yield`
    )
  );
  if (millwork.length) sections.push({ title: 'Millwork & Casework', items: millwork });

  const subtotal = sections.reduce(
    (sum, s) => sum + s.items.reduce((t, i) => t + i.total, 0),
    0
  );

  return {
    sections,
    waste,
    subtotal,
    contingency: subtotal * 0.1,
    total: subtotal * 1.1,
    metrics: {
      floorAreaSqFt: floorArea,
      wallLinearFt: walls.reduce((s, w) => s + w.length, 0) / 12,
      boardFeet: cutList.totals.boardFeet,
      sheetsAndBoards: cutList.totals.stock,
    },
  };
}
