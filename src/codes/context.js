// Turn a drawing into the facts a code check needs.
//
// This layer is deliberately dumb about the code itself. It measures what is
// actually on the sheet — room areas and their narrowest dimension, opening
// sizes and sill heights, wall runs, ceiling height — and marks what it cannot
// know. Rules then read these facts.
//
// The distinction that matters: a measurement the drawing genuinely contains
// (a room's floor area) versus one it only bounds (a window's *net clear*
// opening, which depends on the unit that gets installed). The second kind is
// reported as a bound plus an explicit unknown, never as a determination.

import * as g from '../core/geometry.js';
import {
  wallLength,
  openingsForWall,
  openingFrame,
  openingHead,
  openingSill,
  openingUnitHeight,
} from '../core/entities.js';

const SQ_IN_PER_SQ_FT = 144;

/** Rooms a code treats as habitable. */
export const HABITABLE_USES = new Set(['bedroom', 'living', 'kitchen']);

/** Rooms someone sleeps in, which drives escape-opening rules. */
export const SLEEPING_USES = new Set(['bedroom']);

function roomFacts(ent, page) {
  const areaSqIn = Math.abs(g.polygonArea(ent.pts));
  return {
    id: ent.id,
    page: page.name,
    pageId: page.id,
    name: ent.name || 'Room',
    use: ent.use || 'other',
    habitable: HABITABLE_USES.has(ent.use),
    sleeping: SLEEPING_USES.has(ent.use),
    pts: ent.pts,
    areaSqIn,
    areaSqFt: areaSqIn / SQ_IN_PER_SQ_FT,
    perimeterIn: g.polygonPerimeter(ent.pts, true),
    minWidthIn: g.minimumWidth(ent.pts),
    centroid: g.polygonCentroid(ent.pts),
  };
}

/**
 * Which rooms an opening serves. An opening sits in a wall, so it can face a
 * room on either side; both are returned.
 */
function roomsTouching(frame, rooms, wallThickness) {
  const reach = Math.max(wallThickness, 6) * 1.2;
  const touching = [];
  for (const sign of [1, -1]) {
    const probe = g.add(frame.center, g.mul(frame.normal, sign * reach));
    const room = rooms.find((r) => g.pointInPolygon(probe, r.pts));
    if (room && !touching.includes(room)) touching.push(room);
  }
  return touching;
}

function openingFacts(ent, page, rooms) {
  const frame = openingFrame(ent, page);
  const width = ent.width;
  // `height` is the unit height; the head is derived. Reading it as an absolute
  // head elevation made every default window report a 12-inch clear opening.
  const unitHeight = openingUnitHeight(ent);
  const sill = openingSill(ent);
  const head = openingHead(ent);
  const clearHeight = unitHeight;

  return {
    id: ent.id,
    page: page.name,
    pageId: page.id,
    tag: ent.tag || '',
    kind: ent.kind,
    widthIn: width,
    unitHeightIn: unitHeight,
    headIn: head,
    sillIn: sill,
    clearHeightIn: clearHeight,
    // The rough opening bounds the net clear opening from above. What actually
    // opens depends on the window unit, which a plan cannot tell you.
    roughOpeningSqIn: width * clearHeight,
    roughOpeningSqFt: (width * clearHeight) / SQ_IN_PER_SQ_FT,
    netClearKnown: false,
    wallId: ent.host,
    wallThickness: frame ? frame.thickness : 0,
    rooms: frame ? roomsTouching(frame, rooms, frame.thickness).map((r) => r.id) : [],
    swing: ent.swing || '',
  };
}

function wallFacts(ent) {
  return {
    id: ent.id,
    status: ent.status || 'new',
    lengthIn: wallLength(ent),
    thicknessIn: ent.thickness,
  };
}

/**
 * Build the checkable model.
 * @param project
 * @param options { pageId } — omit to check every sheet
 */
export function buildContext(project, options = {}) {
  const pages = options.pageId
    ? project.pages.filter((p) => p.id === options.pageId)
    : project.pages;

  const rooms = [];
  const openings = [];
  const walls = [];
  let hasStairEntity = false;

  for (const page of pages) {
    const pageRooms = page.entities.filter((e) => e.type === 'room').map((e) => roomFacts(e, page));
    rooms.push(...pageRooms);
    for (const ent of page.entities) {
      if (ent.type === 'opening') openings.push(openingFacts(ent, page, pageRooms));
      if (ent.type === 'wall') walls.push(wallFacts(ent));
      if (ent.type === 'room' && ent.use === 'stair') hasStairEntity = true;
    }
  }

  // Openings per room, so a rule can ask "does this bedroom have a way out?"
  const openingsByRoom = new Map();
  for (const opening of openings) {
    for (const roomId of opening.rooms) {
      if (!openingsByRoom.has(roomId)) openingsByRoom.set(roomId, []);
      openingsByRoom.get(roomId).push(opening);
    }
  }

  return {
    project,
    jurisdiction: {
      state: 'MI',
      county: (project.jurisdiction && project.jurisdiction.county) || null,
      authority: (project.jurisdiction && project.jurisdiction.authority) || null,
    },
    rooms,
    openings,
    walls,
    openingsByRoom,
    ceilingHeightIn: project.wallHeight ?? 96,
    totalFloorAreaSqFt: rooms.reduce((sum, r) => sum + r.areaSqFt, 0),
    // Things the drawing simply does not carry yet. Rules that need them return
    // "review" rather than inventing an answer.
    unknowns: {
      stairs: !hasStairEntity,
      windowUnitTypes: openings.some((o) => o.kind === 'window'),
      smokeAlarms: true,
      guards: true,
      safetyGlazing: true,
      insulation: true,
    },
  };
}

export { SQ_IN_PER_SQ_FT };
