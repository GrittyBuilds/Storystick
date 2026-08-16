// The rule set.
//
// Rules come in two kinds, and keeping them apart is the point:
//
//   Drawing rules   answerable from the drawing alone. A bedroom with no window
//                   and no door is a problem in every edition of every code, so
//                   these give real determinations with no code lookup at all.
//
//   Threshold rules need a number from the code. They measure the drawing, name
//                   the requirement and the section, and then either compare
//                   against a value the user has confirmed, or return "review"
//                   with the measurement and where to look it up. They never
//                   invent the number.
//
// Nothing in here hardcodes a code value.

import { pass, fail, review, notApplicable, SEVERITY } from './engine.js';
import { getThreshold, isConfirmed } from './jurisdiction.js';
import { formatLength } from '../core/units.js';

const sqft = (v) => `${v.toFixed(1)} sq ft`;
const inches = (v) => formatLength(v, 'imperial');

/**
 * Compare a measurement against a code threshold.
 * Returns a finding either way — a determination when the value is confirmed,
 * otherwise a review that shows the measurement and names the source.
 */
function against(rule, ctx, thresholdId, measured, { compare = 'atLeast', subject, format = String, what }) {
  const record = getThreshold(ctx.code, thresholdId);
  if (!record) {
    return review(rule, `No requirement is recorded for ${what}.`, {
      subject,
      measured: format(measured),
      fix: 'Add this requirement in Code settings.',
    });
  }
  if (!isConfirmed(record)) {
    return review(
      rule,
      `${what} measures ${format(measured)}. Storystick has no confirmed value for "${record.label}".`,
      {
        subject,
        measured: format(measured),
        required: `not confirmed — see ${record.citation}`,
        fix:
          `Look up ${record.label.toLowerCase()} in ${record.citation}, then enter it in Code settings. ` +
          `${record.note || ''}`.trim(),
      }
    );
  }

  const limit = record.value;
  const ok = compare === 'atLeast' ? measured >= limit : measured <= limit;
  const relation = compare === 'atLeast' ? 'at least' : 'no more than';
  return ok
    ? pass(rule, `${what} is ${format(measured)}, ${relation} the required ${format(limit)}.`, {
        subject,
        measured: format(measured),
        required: `${relation} ${format(limit)}`,
      })
    : fail(rule, `${what} is ${format(measured)}; ${record.citation} requires ${relation} ${format(limit)}.`, {
        subject,
        measured: format(measured),
        required: `${relation} ${format(limit)}`,
        fix: `Change the drawing so ${what.toLowerCase()} is ${relation} ${format(limit)}.`,
      });
}

const roomSubject = (room) => ({ type: 'room', id: room.id, label: room.name });
const openingSubject = (o) => ({ type: 'opening', id: o.id, label: o.tag || o.kind });

// --- drawing rules: real determinations, no code value needed --------------

export const DRAWING_RULES = [
  {
    id: 'draw.bedroom-has-opening',
    title: 'Every sleeping room has a way out',
    citation: 'Universal to every code edition',
    severity: SEVERITY.CRITICAL,
    verified: true,
    applies: (ctx) => ctx.rooms.some((r) => r.sleeping),
    notApplicableMessage: 'No rooms are marked as sleeping rooms.',
    check(ctx) {
      return ctx.rooms
        .filter((r) => r.sleeping)
        .map((room) => {
          const served = ctx.openingsByRoom.get(room.id) || [];
          const windows = served.filter((o) => o.kind === 'window');
          const doors = served.filter((o) => o.kind === 'door');
          if (!served.length) {
            return fail(this, `${room.name} has no door and no window at all.`, {
              subject: roomSubject(room),
              fix: 'Add at least a door, and an escape window if the room is below or above grade.',
            });
          }
          if (!windows.length) {
            return review(
              this,
              `${room.name} has ${doors.length} door(s) but no window. Whether that is allowed depends on where the room sits.`,
              {
                subject: roomSubject(room),
                fix:
                  'A sleeping room normally needs an emergency escape opening unless it has a door directly ' +
                  'outside. Confirm with your building official.',
              }
            );
          }
          return pass(this, `${room.name} has ${windows.length} window(s) and ${doors.length} door(s).`, {
            subject: roomSubject(room),
          });
        });
    },
  },
  {
    id: 'draw.rooms-have-use',
    title: 'Every room has a use assigned',
    citation: 'Storystick — needed before occupancy rules can run',
    severity: SEVERITY.ADVISORY,
    verified: true,
    applies: (ctx) => ctx.rooms.length > 0,
    notApplicableMessage: 'No rooms drawn.',
    check(ctx) {
      const unset = ctx.rooms.filter((r) => !r.use || r.use === 'other');
      if (!unset.length) return pass(this, `All ${ctx.rooms.length} rooms have a use.`);
      return unset.map((room) =>
        review(this, `${room.name} has no use set, so occupancy rules cannot run on it.`, {
          subject: roomSubject(room),
          fix: 'Select the room and set its Use in Properties.',
        })
      );
    },
  },
  {
    id: 'draw.opening-fits-wall',
    title: 'Openings fit inside the wall that hosts them',
    citation: 'Geometry',
    severity: SEVERITY.MAJOR,
    verified: true,
    applies: (ctx) => ctx.openings.length > 0,
    notApplicableMessage: 'No doors or windows placed.',
    check(ctx) {
      const wallsById = new Map(ctx.walls.map((w) => [w.id, w]));
      const bad = ctx.openings.filter((o) => {
        const wall = wallsById.get(o.wallId);
        return wall && o.widthIn >= wall.lengthIn;
      });
      if (!bad.length) return pass(this, `All ${ctx.openings.length} openings fit their walls.`);
      return bad.map((o) =>
        fail(this, `${o.tag || o.kind} is ${inches(o.widthIn)} wide but its wall is shorter than that.`, {
          subject: openingSubject(o),
          fix: 'Make the wall longer or the opening narrower.',
        })
      );
    },
  },
  {
    id: 'draw.opening-fits-wall-height',
    title: 'Openings fit under the ceiling',
    citation: 'Geometry',
    severity: SEVERITY.MAJOR,
    verified: true,
    applies: (ctx) => ctx.openings.length > 0,
    notApplicableMessage: 'No doors or windows placed.',
    check(ctx) {
      const tall = ctx.openings.filter((o) => o.headIn > ctx.ceilingHeightIn);
      if (!tall.length) return pass(this, 'Every opening fits below the wall height.');
      return tall.map((o) =>
        fail(
          this,
          `${o.tag || o.kind} reaches ${inches(o.headIn)} but the wall is only ${inches(ctx.ceilingHeightIn)}.`,
          {
            subject: openingSubject(o),
            measured: inches(o.headIn),
            required: `no more than ${inches(ctx.ceilingHeightIn)}`,
            fix: 'Lower the sill, shorten the unit, or raise the wall height in Settings.',
          }
        )
      );
    },
  },
  {
    id: 'draw.local-scope',
    title: 'What this check does not cover',
    citation: 'Scope',
    severity: SEVERITY.ADVISORY,
    verified: true,
    check(ctx) {
      const warning =
        (ctx.code && ctx.code.localScopeWarning) ||
        'Construction-code items only. Local zoning and other local requirements are not checked.';
      return review(this, warning, {
        fix: 'Check zoning setbacks, floodplain, historic district and local fire requirements separately.',
      });
    },
  },
];

// --- threshold rules: measured here, compared only against confirmed values --

export const THRESHOLD_RULES = [
  {
    id: 'code.eero-area',
    title: 'Escape opening — net clear area',
    citation: 'IRC/MRC R310 (confirm section for your edition)',
    severity: SEVERITY.CRITICAL,
    verified: false,
    applies: (ctx) => ctx.rooms.some((r) => r.sleeping),
    notApplicableMessage: 'No sleeping rooms.',
    check(ctx) {
      const findings = [];
      for (const room of ctx.rooms.filter((r) => r.sleeping)) {
        for (const opening of (ctx.openingsByRoom.get(room.id) || []).filter((o) => o.kind === 'window')) {
          const record = getThreshold(ctx.code, 'eero.minNetClearAreaSqFt');
          // The rough opening is an upper bound on what the unit can ever give.
          // If even that is short, it is a definite failure whatever unit goes in.
          if (isConfirmed(record) && opening.roughOpeningSqFt < record.value) {
            findings.push(
              fail(
                this,
                `${opening.tag || 'window'} in ${room.name} has a rough opening of only ` +
                  `${sqft(opening.roughOpeningSqFt)} — smaller than the required ${sqft(record.value)} before ` +
                  'any frame or sash is fitted.',
                {
                  subject: openingSubject(opening),
                  measured: sqft(opening.roughOpeningSqFt),
                  required: `at least ${sqft(record.value)} net clear`,
                  fix: 'Use a larger window.',
                }
              )
            );
            continue;
          }
          findings.push(
            review(
              this,
              `${opening.tag || 'window'} in ${room.name} has a rough opening of ` +
                `${sqft(opening.roughOpeningSqFt)}. The net clear opening depends on the window unit and is ` +
                'always smaller than the rough opening.',
              {
                subject: openingSubject(opening),
                measured: `${sqft(opening.roughOpeningSqFt)} rough`,
                required: isConfirmed(record) ? `at least ${sqft(record.value)} net clear` : 'not confirmed',
                fix:
                  "Check the window manufacturer's net clear opening for this unit against " +
                  `${record ? record.citation : 'the escape opening section'}.`,
              }
            )
          );
        }
      }
      return findings.length ? findings : [notApplicable(this, 'No windows serve a sleeping room.')];
    },
  },
  {
    id: 'code.eero-sill',
    title: 'Escape opening — sill height',
    citation: 'IRC/MRC R310 (confirm)',
    severity: SEVERITY.CRITICAL,
    verified: false,
    applies: (ctx) => ctx.rooms.some((r) => r.sleeping),
    notApplicableMessage: 'No sleeping rooms.',
    check(ctx) {
      const findings = [];
      for (const room of ctx.rooms.filter((r) => r.sleeping)) {
        for (const opening of (ctx.openingsByRoom.get(room.id) || []).filter((o) => o.kind === 'window')) {
          findings.push(
            against(this, ctx, 'eero.maxSillHeightIn', opening.sillIn, {
              compare: 'atMost',
              subject: openingSubject(opening),
              format: inches,
              what: `The sill of ${opening.tag || 'the window'} in ${room.name}`,
            })
          );
        }
      }
      return findings.length ? findings : [notApplicable(this, 'No windows serve a sleeping room.')];
    },
  },
  {
    id: 'code.ceiling-height',
    title: 'Habitable rooms — ceiling height',
    citation: 'IRC/MRC R305 (confirm)',
    severity: SEVERITY.MAJOR,
    verified: false,
    applies: (ctx) => ctx.rooms.some((r) => r.habitable),
    notApplicableMessage: 'No habitable rooms.',
    check(ctx) {
      return [
        against(this, ctx, 'room.minCeilingHeightIn', ctx.ceilingHeightIn, {
          format: inches,
          what: 'The wall height set for this project',
        }),
      ];
    },
  },
  {
    id: 'code.room-dimension',
    title: 'Habitable rooms — narrowest dimension',
    citation: 'IRC/MRC R304 (confirm)',
    severity: SEVERITY.MAJOR,
    verified: false,
    applies: (ctx) => ctx.rooms.some((r) => r.habitable),
    notApplicableMessage: 'No habitable rooms.',
    check(ctx) {
      return ctx.rooms
        .filter((r) => r.habitable)
        .map((room) =>
          against(this, ctx, 'room.minHorizontalDimensionIn', room.minWidthIn, {
            subject: roomSubject(room),
            format: inches,
            what: `${room.name} at its narrowest`,
          })
        );
    },
  },
  {
    id: 'code.room-area',
    title: 'Habitable rooms — floor area',
    citation: 'IRC/MRC R304 (confirm)',
    severity: SEVERITY.MAJOR,
    verified: false,
    applies: (ctx) => ctx.rooms.some((r) => r.habitable),
    notApplicableMessage: 'No habitable rooms.',
    check(ctx) {
      return ctx.rooms
        .filter((r) => r.habitable)
        .map((room) =>
          against(this, ctx, 'room.minAreaSqFt', room.areaSqFt, {
            subject: roomSubject(room),
            format: sqft,
            what: `${room.name}`,
          })
        );
    },
  },
  {
    id: 'code.natural-light',
    title: 'Natural light — glazing area',
    citation: 'IRC/MRC R303 (confirm)',
    severity: SEVERITY.MAJOR,
    verified: false,
    applies: (ctx) => ctx.rooms.some((r) => r.habitable),
    notApplicableMessage: 'No habitable rooms.',
    check(ctx) {
      const record = getThreshold(ctx.code, 'light.glazingFractionOfFloorArea');
      return ctx.rooms
        .filter((r) => r.habitable)
        .map((room) => {
          const glazing = (ctx.openingsByRoom.get(room.id) || [])
            .filter((o) => o.kind === 'window')
            .reduce((sum, o) => sum + o.roughOpeningSqFt, 0);
          if (!isConfirmed(record)) {
            return review(
              this,
              `${room.name} is ${sqft(room.areaSqFt)} with ${sqft(glazing)} of rough window opening ` +
                `(${((glazing / Math.max(room.areaSqFt, 0.001)) * 100).toFixed(1)}%).`,
              {
                subject: roomSubject(room),
                measured: `${((glazing / Math.max(room.areaSqFt, 0.001)) * 100).toFixed(1)}% of floor area`,
                required: 'not confirmed',
                fix: `Look up the required glazing fraction in ${record ? record.citation : 'R303'} and enter it in Code settings.`,
              }
            );
          }
          const required = room.areaSqFt * record.value;
          return glazing >= required
            ? pass(this, `${room.name} has ${sqft(glazing)} of glazing against ${sqft(required)} required.`, {
                subject: roomSubject(room),
              })
            : fail(this, `${room.name} has ${sqft(glazing)} of glazing but needs ${sqft(required)}.`, {
                subject: roomSubject(room),
                measured: sqft(glazing),
                required: sqft(required),
                fix: 'Add or enlarge a window in this room.',
              });
        });
    },
  },
];

export const ALL_RULES = [...DRAWING_RULES, ...THRESHOLD_RULES];
