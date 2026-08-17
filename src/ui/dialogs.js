// Modal host plus every report/settings dialog in the app.

import { el, clear, field, select, numberInput, textInput, table, money, downloadText, pickFile } from './dom.js';
import { TEMPLATES } from '../features/templates.js';
import { buildCutList } from '../features/cutlist.js';
import { scheduleSummary, missingFinishes } from '../features/schedule.js';
import { buildEstimate } from '../features/estimate.js';
import { pageToSvg, cutListCsv, scheduleCsv, estimateCsv } from '../features/export.js';
import { renderSheet, renderSet } from '../features/blueprint.js';
import { SHEET_SIZES } from '../features/sheet.js';
import { listProjects, deleteProject, serializeProject } from '../core/store.js';
import { formatLength, formatArea, parseLength } from '../core/units.js';
import { PAGE_KINDS } from '../core/document.js';
import { TOKEN } from '../render/theme.js';

export const TAGLINE = 'Draw it before you build it.';

let host = null;
let onCloseHook = null;

export function initModals(rootId = 'modal-root') {
  host = document.getElementById(rootId);
  host.addEventListener('click', (e) => {
    if (e.target === host) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && host.classList.contains('open')) {
      e.stopPropagation();
      closeModal();
    }
  });
}

export function closeModal() {
  if (!host) return;
  host.classList.remove('open');
  clear(host);
  if (onCloseHook) {
    const fn = onCloseHook;
    onCloseHook = null;
    fn();
  }
}

export function openModal({ title, subtitle, body, actions = [], wide = false, onClose = null }) {
  if (!host) return () => {};
  clear(host);
  onCloseHook = onClose;
  const panel = el('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true' }, [
    el('header', { class: 'modal-head' }, [
      el('div', {}, [
        el('h2', { text: title }),
        subtitle ? el('p', { class: 'muted', text: subtitle }) : null,
      ]),
      el('button', { class: 'icon-btn', title: 'Close', onclick: closeModal, html: '&times;' }),
    ]),
    el('div', { class: 'modal-body' }, [body]),
    actions.length
      ? el(
          'footer',
          { class: 'modal-foot' },
          actions.map((a) =>
            el('button', {
              class: a.primary ? 'btn primary' : 'btn',
              text: a.label,
              onclick: () => a.onClick(closeModal),
            })
          )
        )
      : null,
  ]);
  host.appendChild(panel);
  host.classList.add('open');
  return closeModal;
}

// --- new project / templates ---------------------------------------------

export function templateGallery(app) {
  const categories = [...new Set(TEMPLATES.map((t) => t.category))];
  const body = el(
    'div',
    { class: 'gallery' },
    categories.map((cat) =>
      el('section', {}, [
        el('h3', { text: cat }),
        el(
          'div',
          { class: 'card-grid' },
          TEMPLATES.filter((t) => t.category === cat).map((t) =>
            el(
              'button',
              {
                class: 'card',
                onclick: () => {
                  app.newProjectFromTemplate(t.id);
                  closeModal();
                },
              },
              [el('strong', { text: t.name }), el('span', { text: t.description })]
            )
          )
        ),
      ])
    )
  );
  openModal({
    title: 'Start a new project',
    subtitle: `${TAGLINE} Pick a starting point — everything stays editable.`,
    body,
    wide: true,
  });
}

// --- open / manage saved projects ----------------------------------------

export function openProjectDialog(app) {
  const render = () => {
    const entries = listProjects();
    const rows = entries.map((entry) => [
      el('button', {
        class: 'link',
        text: entry.name,
        onclick: () => {
          app.openSaved(entry.id);
          closeModal();
        },
      }),
      entry.kind || '—',
      `${entry.pages} sheet${entry.pages === 1 ? '' : 's'}`,
      new Date(entry.updatedAt).toLocaleString(),
      el('button', {
        class: 'btn tiny danger',
        text: 'Delete',
        onclick: () => {
          if (confirm(`Delete "${entry.name}"? This cannot be undone.`)) {
            deleteProject(entry.id);
            body.replaceChildren(render());
          }
        },
      }),
    ]);
    return entries.length
      ? table(['Project', 'Type', 'Sheets', 'Last saved', ''], rows, { mono: [2, 3] })
      : el('p', { class: 'muted', text: 'No saved projects in this browser yet.' });
  };

  const body = el('div', {}, [render()]);
  openModal({
    title: 'Open project',
    subtitle: 'Projects saved in this browser.',
    body,
    wide: true,
    actions: [
      {
        label: 'Import .storystick file…',
        onClick: async () => {
          const file = await pickFile('.storystick,.json,application/json');
          if (file) {
            app.importProjectText(file.text);
            closeModal();
          }
        },
      },
    ],
  });
}

// --- project settings -----------------------------------------------------

export function settingsDialog(app) {
  const p = app.project;
  const lengthField = (label, value, onCommit, hint) => {
    const input = el('input', { type: 'text', class: 'dim', value: formatLength(value, p.unitSystem) });
    const commit = () => {
      const parsed = parseLength(input.value, p.unitSystem);
      if (parsed !== null && parsed > 0) {
        onCommit(parsed);
        input.value = formatLength(parsed, p.unitSystem);
      } else {
        input.value = formatLength(value, p.unitSystem);
      }
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => e.stopPropagation());
    return field(label, input, hint);
  };

  const body = el('div', { class: 'form-grid' }, [
    field('Project name', textInput(p.name, (v) => { p.name = v || 'Untitled Project'; app.touch('Rename project'); })),
    field(
      'Units',
      select(
        [
          { value: 'imperial', label: 'Imperial (feet & inches)' },
          { value: 'metric', label: 'Metric (millimetres)' },
        ],
        p.unitSystem,
        (v) => {
          p.unitSystem = v;
          app.touch('Change units');
          app.refreshAll();
        }
      )
    ),
    field(
      'Fraction precision',
      select(
        [2, 4, 8, 16, 32, 64].map((d) => ({ value: String(d), label: `1/${d}"` })),
        String(p.denominator),
        (v) => {
          p.denominator = Number(v);
          app.touch('Change precision');
          app.refreshAll();
        }
      ),
      'Also the distance one arrow-key press nudges the selection'
    ),
    lengthField('Grid spacing', p.gridSize, (v) => { p.gridSize = v; app.touch('Change grid'); app.render(); }),
    lengthField('Default wall thickness', p.defaultWallThickness, (v) => {
      p.defaultWallThickness = v;
      app.defaults.wall.thickness = v;
      app.touch('Change wall thickness');
    }),
    lengthField('Wall height', p.wallHeight, (v) => { p.wallHeight = v; app.touch('Change wall height'); }, 'Used for wall areas and estimates'),
    lengthField('Stud spacing', p.studSpacing, (v) => { p.studSpacing = v; app.touch('Change stud spacing'); }),
    lengthField('Saw kerf', p.kerf, (v) => { p.kerf = v; app.touch('Change kerf'); }, 'Used by the cut list optimiser'),
    field(
      'Waste allowance',
      numberInput(Math.round(p.wasteFactor * 100), (v) => {
        p.wasteFactor = Math.max(0, v) / 100;
        app.touch('Change waste allowance');
      }, { step: 1, min: 0, max: 100 }),
      'Percent added to material estimates'
    ),
    field('Client', textInput(p.meta.client, (v) => { p.meta.client = v; app.touch('Edit project info'); })),
    field('Address', textInput(p.meta.address, (v) => { p.meta.address = v; app.touch('Edit project info'); })),
    field('Designer', textInput(p.meta.designer, (v) => { p.meta.designer = v; app.touch('Edit project info'); })),
    field('Date', textInput(p.meta.date, (v) => { p.meta.date = v; app.touch('Edit project info'); }, { placeholder: 'YYYY-MM-DD' })),
  ]);

  const notes = el('textarea', { rows: '3', value: p.meta.notes || '' });
  notes.addEventListener('change', () => {
    p.meta.notes = notes.value;
    app.touch('Edit notes');
  });
  notes.addEventListener('keydown', (e) => e.stopPropagation());

  openModal({
    title: 'Project settings',
    body: el('div', {}, [body, field('General notes', notes)]),
    wide: true,
    actions: [{ label: 'Done', primary: true, onClick: (close) => close() }],
  });
}

// --- cut list -------------------------------------------------------------

const LAYOUT_WIDTH = 400;
const SANS = "'Inter', Helvetica, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const PIECE_FILL = 'rgba(27,95,166,0.13)';

// Part names are user text and these layouts are injected as markup.
const esc = (v) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function sheetSvg(sheet, material, app) {
  const scale = LAYOUT_WIDTH / material.stockL;
  const w = material.stockL * scale;
  const h = material.stockW * scale;
  const pieces = sheet.pieces
    .map((p) => {
      const x = p.x * scale;
      const y = p.y * scale;
      const pw = p.l * scale;
      const ph = p.w * scale;
      const label =
        pw > 46 && ph > 16
          ? `<text x="${x + pw / 2}" y="${y + ph / 2 + 3}" font-size="9" font-family="${SANS}" font-weight="500" text-anchor="middle" fill="${TOKEN.blueprint}">${esc(p.name)}</text>`
          : '';
      const size =
        pw > 60 && ph > 28
          ? `<text x="${x + pw / 2}" y="${y + ph / 2 + 15}" font-size="8" font-family="${MONO}" text-anchor="middle" fill="${TOKEN.slate}">${app.fmtShort(
              p.l
            )} × ${app.fmtShort(p.w)}</text>`
          : '';
      return `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="${PIECE_FILL}" stroke="${TOKEN.blue}" stroke-width="1"/>${label}${size}`;
    })
    .join('');
  return `<svg class="layout" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="${w}" height="${h}" fill="${TOKEN.vellum}" stroke="${TOKEN.blueprint}" stroke-width="1.5"/>${pieces}</svg>`;
}

function laneSvg(run, material, app) {
  const scale = LAYOUT_WIDTH / material.stockL;
  const laneHeight = 20;
  const rows = run.lanes
    .map((lane, i) => {
      const y = i * (laneHeight + 4);
      const segs = lane.pieces
        .map((p) => {
          const x = p.start * scale;
          const width = p.length * scale;
          const label =
            width > 40
              ? `<text x="${x + width / 2}" y="${y + 14}" font-size="9" font-family="${MONO}" text-anchor="middle" fill="${TOKEN.blueprint}">${esc(p.name)} ${app.fmtShort(
                  p.length
                )}</text>`
              : '';
          return `<rect x="${x}" y="${y}" width="${width}" height="${laneHeight}" fill="${PIECE_FILL}" stroke="${TOKEN.blue}" stroke-width="1"/>${label}`;
        })
        .join('');
      return `<rect x="0" y="${y}" width="${material.stockL * scale}" height="${laneHeight}" fill="${
        TOKEN.vellum
      }" stroke="${TOKEN.blueprint}" stroke-width="1"/>${segs}`;
    })
    .join('');
  const height = Math.max(laneHeight, run.lanes.length * (laneHeight + 4));
  const width = material.stockL * scale;
  return `<svg class="layout" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">${rows}</svg>`;
}

/** Brand alert: a title, then the fix the user can act on. */
function alertBox(kind, title, body) {
  return el('div', { class: `alert ${kind}` }, [
    el('span', { class: 'ic', text: kind === 'warn' ? '!' : 'i' }),
    el('div', {}, [el('b', { text: title }), body]),
  ]);
}

export function cutListDialog(app) {
  const p = app.project;
  const list = buildCutList(p);
  const sections = [];

  if (!list.groups.length) {
    sections.push(
      alertBox(
        'info',
        'No parts on this project yet',
        el('span', {
          text: 'Draw a rectangle with the Part tool (K) for each piece you need to cut. Give it a material and a quantity in Properties and it lands here, packed onto real stock.',
        })
      )
    );
  }

  for (const group of list.groups) {
    const rows = group.rows.map((row) => [
      row.name,
      String(row.qty),
      app.fmtShort(row.length),
      app.fmtShort(row.width),
      app.fmtShort(row.thickness),
      ((row.thickness * row.width * row.length * row.qty) / 144).toFixed(2),
      row.notes,
    ]);

    const layouts = el('div', { class: 'layouts' });
    if (group.material.form === 'sheet') {
      group.sheets.forEach((sheet) => {
        layouts.appendChild(
          el('figure', {}, [
            el('div', { html: sheetSvg(sheet, group.material, app) }),
            el('figcaption', {
              text: `Sheet ${sheet.index} — ${(sheet.utilization * 100).toFixed(0)}% used`,
            }),
          ])
        );
      });
    } else {
      group.runs.forEach((run) => {
        layouts.appendChild(
          el('figure', {}, [
            el('div', { html: laneSvg(run, group.material, app) }),
            el('figcaption', {
              text: `${app.fmtShort(run.width)} wide · ${run.lanes.length} rip${
                run.lanes.length === 1 ? '' : 's'
              } · ${run.ripsPerBoard} per board · ${run.boards} board${run.boards === 1 ? '' : 's'}`,
            }),
          ])
        );
      });
    }

    sections.push(
      el('section', { class: 'report-section' }, [
        el('h3', {}, [
          el('span', { text: group.material.name }),
          el('span', {
            class: 'pill',
            text: `${group.stockCount} ${group.material.form === 'sheet' ? 'sheets' : 'boards'} · ${money(
              group.cost
            )} · ${(group.utilization * 100).toFixed(0)}% yield`,
          }),
        ]),
        table(['Part', 'Qty', 'Length', 'Width', 'Thick', 'Bd ft', 'Notes'], rows, {
          compact: true,
          mono: [1, 2, 3, 4, 5],
        }),
        group.oversize && group.oversize.length
          ? alertBox(
              'warn',
              `${group.oversize.length} part${group.oversize.length === 1 ? '' : 's'} won't fit ${
                group.material.name
              }`,
              el('span', {
                text: `Stock is ${app.fmtShort(group.material.stockL)} × ${app.fmtShort(
                  group.material.stockW
                )}. Break the part into smaller pieces, or raise the stock size for this material in Settings.`,
              })
            )
          : null,
        layouts,
      ])
    );
  }

  if (list.unassigned.length) {
    sections.push(
      el('section', { class: 'report-section' }, [
        el('h3', { text: 'Parts with an unknown material' }),
        table(
          ['Part', 'Qty', 'Length', 'Width'],
          list.unassigned.map((r) => [r.name, String(r.qty), app.fmtShort(r.length), app.fmtShort(r.width)]),
          { mono: [1, 2, 3] }
        ),
      ])
    );
  }

  const summary = el('div', { class: 'summary-row' }, [
    el('div', {}, [el('strong', { text: String(list.totals.parts) }), el('span', { text: 'parts' })]),
    el('div', {}, [el('strong', { text: String(list.totals.stock) }), el('span', { text: 'sheets / boards' })]),
    el('div', {}, [el('strong', { text: list.totals.boardFeet.toFixed(1) }), el('span', { text: 'board feet' })]),
    el('div', {}, [el('strong', { text: money(list.totals.cost) }), el('span', { text: 'stock cost' })]),
  ]);

  openModal({
    title: 'Cut list & stock layout',
    subtitle: `Kerf ${app.fmtShort(p.kerf)} · optimised with a shelf-packing heuristic`,
    body: el('div', { class: 'report' }, [summary, ...sections]),
    wide: true,
    actions: [
      {
        label: 'Download CSV',
        onClick: () => downloadText(`${app.slug()}-cutlist.csv`, cutListCsv(p), 'text/csv'),
      },
      { label: 'Print', onClick: () => window.print() },
      { label: 'Done', primary: true, onClick: (close) => close() },
    ],
  });
}

// --- schedules ------------------------------------------------------------

export function scheduleDialog(app) {
  const p = app.project;
  const s = scheduleSummary(p);
  const missing = missingFinishes(p);
  const sys = p.unitSystem;

  const body = el('div', { class: 'report' }, [
    el('div', { class: 'summary-row' }, [
      el('div', {}, [el('strong', { text: String(s.totals.rooms) }), el('span', { text: 'rooms' })]),
      el('div', {}, [el('strong', { text: formatArea(s.totals.floorArea, sys) }), el('span', { text: 'floor area' })]),
      el('div', {}, [el('strong', { text: String(s.totals.doors) }), el('span', { text: 'doors' })]),
      el('div', {}, [el('strong', { text: String(s.totals.windows) }), el('span', { text: 'windows' })]),
      el('div', {}, [el('strong', { text: String(s.totals.fixtures) }), el('span', { text: 'fixtures' })]),
    ]),
    el('section', { class: 'report-section' }, [
      el('h3', { text: 'Room schedule' }),
      s.rooms.length
        ? table(
            ['Room', 'Sheet', 'Area', 'Perimeter'],
            s.rooms.map((r) => [r.name, r.page, formatArea(r.area, sys), formatLength(r.perimeter, sys)]),
            { mono: [2, 3] }
          )
        : el('p', { class: 'muted', text: 'No rooms defined. Use the Room tool (R).' }),
    ]),
    el('section', { class: 'report-section' }, [
      el('h3', { text: 'Door schedule' }),
      s.doors.length
        ? table(
            ['Tag', 'Width', 'Height', 'Swing', 'Wall'],
            s.doors.map((d) => [
              d.tag || '—',
              app.fmtShort(d.width),
              app.fmtShort(d.height),
              d.swing,
              app.fmtShort(d.wallThickness),
            ]),
            { mono: [0, 1, 2, 4] }
          )
        : el('p', { class: 'muted', text: 'No doors placed.' }),
    ]),
    el('section', { class: 'report-section' }, [
      el('h3', { text: 'Window schedule' }),
      s.windows.length
        ? table(
            ['Tag', 'Width', 'Height', 'Sill', 'Wall'],
            s.windows.map((w) => [
              w.tag || '—',
              app.fmtShort(w.width),
              app.fmtShort(w.height),
              app.fmtShort(w.sill),
              app.fmtShort(w.wallThickness),
            ]),
            { mono: [0, 1, 2, 3, 4] }
          )
        : el('p', { class: 'muted', text: 'No windows placed.' }),
    ]),
    el('section', { class: 'report-section' }, [
      el('h3', { text: 'Wall takeoff' }),
      s.walls.length
        ? table(
            ['Status', 'Runs', 'Length', 'Gross area', 'Net area', 'Openings'],
            s.walls.map((w) => [
              w.status,
              String(w.count),
              formatLength(w.length, sys),
              formatArea(w.grossArea, sys),
              formatArea(w.netArea, sys),
              String(w.openings),
            ]),
            { mono: [1, 2, 3, 4, 5] }
          )
        : el('p', { class: 'muted', text: 'No walls drawn.' }),
    ]),
    el('section', { class: 'report-section' }, [
      el('h3', { text: 'Finish schedule' }),
      s.finishes.length
        ? table(
            ['Room', 'Floor', 'Base', 'Walls', 'Ceiling', 'Clg ht', 'Floor area', 'Wall area'],
            s.finishes.map((f) => [
              f.name,
              f.floor || '—',
              f.base || '—',
              f.walls || '—',
              f.ceiling || '—',
              app.fmtShort(f.ceilingHeight),
              formatArea(f.floorArea, sys),
              formatArea(f.wallArea, sys),
            ]),
            { mono: [5, 6, 7] }
          )
        : el('p', { class: 'muted', text: 'No rooms to schedule finishes for.' }),
      missing.length
        ? alertBox(
            'warn',
            'Finishes not specified',
            `${missing.map((m) => `${m.name} (${m.missing.join(', ')})`).join('; ')}. A blank finish is a question for somebody, not a default.`
          )
        : null,
    ]),
    el('section', { class: 'report-section' }, [
      el('h3', { text: 'Assembly takeoff' }),
      s.assemblies.rows.length
        ? table(
            ['Assembly', 'Layer', 'Quantity'],
            s.assemblies.rows.map((r) => [
              r.assembly,
              r.layer,
              r.unit === 'volume'
                ? `${r.volume.toFixed(1)} cu yd`
                : r.unit === 'sheet'
                  ? `${Math.round(r.area)} sq ft · ${r.sheets} sheets`
                  : `${Math.round(r.area)} sq ft`,
            ]),
            { mono: [2] }
          )
        : el('p', { class: 'muted', text: 'No walls have an assembly assigned yet.' }),
      s.assemblies.unassigned.length
        ? alertBox(
            'warn',
            'Walls without an assembly',
            `${s.assemblies.unassigned.length} wall${
              s.assemblies.unassigned.length === 1 ? '' : 's'
            } have only a thickness, so no drywall, sheathing or insulation is counted for them. Assign an assembly in Properties.`
          )
        : null,
    ]),
    s.structure.footings.length || s.structure.slabs.length || s.structure.beams.length
      ? el('section', { class: 'report-section' }, [
          el('h3', { text: 'Foundation & structure' }),
          table(
            ['Item', 'Quantity'],
            [
              ['Footing concrete', `${s.structure.totals.footingVolume.toFixed(1)} cu yd`],
              ['Slab concrete', `${s.structure.totals.slabVolume.toFixed(1)} cu yd`],
              ['Slab area', formatArea(s.structure.totals.slabArea, sys)],
              ['Beam length', formatLength(s.structure.totals.beamLength, sys)],
            ],
            { mono: [1] }
          ),
          s.structure.beams.length
            ? table(
                ['Tag', 'Size', 'Plies', 'Span', 'Sheet'],
                s.structure.beams.map((b) => [
                  b.tag || '—',
                  b.size,
                  String(b.plies),
                  formatLength(b.span, sys),
                  b.page,
                ]),
                { mono: [0, 2, 3] }
              )
            : null,
        ])
      : null,
    s.roof.rows.length
      ? el('section', { class: 'report-section' }, [
          el('h3', { text: 'Roof takeoff' }),
          table(
            ['Pitch', 'Plan area', 'Sloped area', 'Ridge height'],
            s.roof.rows.map((r) => [
              `${r.pitch}:12`,
              formatArea(r.planArea, sys),
              formatArea(r.slopedArea, sys),
              formatLength(r.ridgeHeight, sys),
            ]),
            { mono: [0, 1, 2, 3] }
          ),
          el('p', {
            class: 'muted small',
            text: `${s.roof.totals.squares.toFixed(1)} squares of roofing before waste and starter course.`,
          }),
        ])
      : null,
    s.fixtures.length
      ? el('section', { class: 'report-section' }, [
          el('h3', { text: 'Fixture schedule' }),
          table(
            ['Discipline', 'Symbol', 'Qty', 'Tags'],
            s.fixtures.map((f) => [
              f.discipline,
              f.name,
              String(f.qty),
              f.tags.join(', ') || '—',
            ]),
            { mono: [2] }
          ),
        ])
      : null,
  ]);

  openModal({
    title: 'Schedules & takeoff',
    body,
    wide: true,
    actions: [
      {
        label: 'Download CSV',
        onClick: () => downloadText(`${app.slug()}-schedules.csv`, scheduleCsv(p), 'text/csv'),
      },
      { label: 'Print', onClick: () => window.print() },
      { label: 'Done', primary: true, onClick: (close) => close() },
    ],
  });
}

// --- estimate -------------------------------------------------------------

export function estimateDialog(app) {
  const p = app.project;
  const est = buildEstimate(p);
  const body = el('div', { class: 'report' }, [
    el('div', { class: 'summary-row' }, [
      el('div', {}, [el('strong', { text: est.metrics.floorAreaSqFt.toFixed(0) }), el('span', { text: 'sq ft floor' })]),
      el('div', {}, [el('strong', { text: est.metrics.wallLinearFt.toFixed(0) }), el('span', { text: 'lin ft wall' })]),
      el('div', {}, [el('strong', { text: est.metrics.boardFeet.toFixed(0) }), el('span', { text: 'board feet' })]),
      el('div', {}, [el('strong', { text: money(est.total) }), el('span', { text: 'estimated total' })]),
    ]),
    ...est.sections.map((section) =>
      el('section', { class: 'report-section' }, [
        el('h3', { text: section.title }),
        table(
          ['Item', 'Qty', 'Unit', 'Unit cost', 'Total', 'Note'],
          section.items.map((i) => [i.label, String(i.qty), i.unit, money(i.unitCost), money(i.total), i.note]),
          { mono: [1, 3, 4] }
        ),
      ])
    ),
    el('div', { class: 'totals' }, [
      el('div', {}, [el('span', { text: 'Subtotal' }), el('strong', { text: money(est.subtotal) })]),
      el('div', {}, [el('span', { text: 'Contingency 10%' }), el('strong', { text: money(est.contingency) })]),
      el('div', { class: 'grand' }, [el('span', { text: 'Total' }), el('strong', { text: money(est.total) })]),
    ]),
    el('p', {
      class: 'muted',
      text: 'Rough order-of-magnitude only. Unit prices are defaults, not quotes — confirm with your suppliers.',
    }),
  ]);

  openModal({
    title: 'Materials estimate',
    subtitle: `Includes a ${Math.round(est.waste * 100)}% waste allowance`,
    body,
    wide: true,
    actions: [
      {
        label: 'Download CSV',
        onClick: () => downloadText(`${app.slug()}-estimate.csv`, estimateCsv(p), 'text/csv'),
      },
      { label: 'Print', onClick: () => window.print() },
      { label: 'Done', primary: true, onClick: (close) => close() },
    ],
  });
}

// --- export ---------------------------------------------------------------

export function exportDialog(app) {
  const p = app.project;
  const pageSelect = select(
    p.pages.map((page) => ({ value: page.id, label: page.name })),
    app.page.id,
    () => {}
  );
  const sheetSelect = select(
    Object.entries(SHEET_SIZES).map(([id, s]) => ({ value: id, label: s.label })),
    (p.sheet && p.sheet.size) || 'ARCH-D',
    (v) => {
      p.sheet.size = v;
      app.touch('Change sheet size');
    }
  );
  const orientSelect = select(
    [
      { value: 'landscape', label: 'Landscape' },
      { value: 'portrait', label: 'Portrait' },
    ],
    (p.sheet && p.sheet.orientation) || 'landscape',
    (v) => {
      p.sheet.orientation = v;
      app.touch('Change orientation');
    }
  );
  const sheetOpts = () => ({
    size: sheetSelect.value,
    orientation: orientSelect.value,
  });
  const current = () => p.pages.find((x) => x.id === pageSelect.value) || app.page;

  const body = el('div', { class: 'export-grid' }, [
    field('Sheet to export', pageSelect),
    field('Paper size', sheetSelect),
    field('Orientation', orientSelect),
    el('p', {
      class: 'muted small',
      text:
        'Blueprints plot at a true architectural scale on the paper size above. Print at 100% — not "fit to page" — and a scale rule will read real dimensions off the print.',
    }),
    el('div', { class: 'export-actions' }, [
      el('button', {
        class: 'btn primary',
        text: 'Blueprint sheet (SVG)',
        onclick: () => {
          const page = current();
          const out = renderSheet(p, page, sheetOpts());
          if (!out.standardScale) {
            app.setStatus(
              'That sheet does not fit any standard scale — the plot is marked "do not measure". Try a larger paper size.'
            );
          }
          downloadText(
            `${app.slug()}-${out.sheetNumber}.svg`,
            out.svg,
            'image/svg+xml'
          );
        },
      }),
      el('button', {
        class: 'btn primary',
        text: 'Print the whole set',
        onclick: () => printSet(app, sheetOpts()),
      }),
      el('button', {
        class: 'btn',
        text: 'Drawing set (HTML)',
        onclick: () =>
          downloadText(`${app.slug()}-set.html`, renderSet(p, sheetOpts()), 'text/html'),
      }),
      el('button', {
        class: 'btn',
        text: 'Plain drawing as SVG',
        onclick: () => {
          const page = current();
          downloadText(`${app.slug()}-${page.name.replace(/\s+/g, '-').toLowerCase()}.svg`, pageToSvg(p, page), 'image/svg+xml');
        },
      }),
      el('button', {
        class: 'btn',
        text: 'Drawing as PNG',
        onclick: () => app.exportPng(current()),
      }),
      el('button', {
        class: 'btn',
        text: 'Project file (.storystick)',
        onclick: () => downloadText(`${app.slug()}.storystick`, serializeProject(p), 'application/json'),
      }),
      el('button', {
        class: 'btn',
        text: 'Cut list CSV',
        onclick: () => downloadText(`${app.slug()}-cutlist.csv`, cutListCsv(p), 'text/csv'),
      }),
      el('button', {
        class: 'btn',
        text: 'Schedules CSV',
        onclick: () => downloadText(`${app.slug()}-schedules.csv`, scheduleCsv(p), 'text/csv'),
      }),
      el('button', {
        class: 'btn',
        text: 'Estimate CSV',
        onclick: () => downloadText(`${app.slug()}-estimate.csv`, estimateCsv(p), 'text/csv'),
      }),
    ]),
  ]);

  openModal({
    title: 'Export',
    subtitle: 'Blueprints plot to a true architectural scale; the plain SVG is the raw drawing.',
    body,
    actions: [{ label: 'Done', primary: true, onClick: (close) => close() }],
  });
}

/**
 * Hand the whole set to the browser's print dialog in its own window, sized to
 * the paper it was drawn for. Printing the app's own page would print the app;
 * this prints the drawings.
 */
function printSet(app, options) {
  const html = renderSet(app.project, options);
  const win = window.open('', '_blank');
  if (!win) {
    app.setStatus('The browser blocked the print window. Allow pop-ups, or download the set as HTML.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Wait for layout before asking to print, or the first sheet prints blank.
  win.addEventListener('load', () => {
    win.focus();
    win.print();
  });
}

// --- sheets ---------------------------------------------------------------

export function pageDialog(app) {
  const p = app.project;
  const render = () =>
    table(
      ['Sheet', 'Type', 'Scale', 'Items', ''],
      p.pages.map((page) => [
        textInput(page.name, (v) => {
          page.name = v || 'Sheet';
          app.touch('Rename sheet');
          app.refreshAll();
        }),
        select(
          PAGE_KINDS.map((k) => ({ value: k, label: k })),
          page.kind,
          (v) => {
            page.kind = v;
            app.touch('Change sheet type');
          }
        ),
        textInput(page.scale, (v) => {
          page.scale = v;
          app.touch('Change sheet scale');
        }),
        String(page.entities.length),
        el('button', {
          class: 'btn tiny danger',
          text: 'Delete',
          disabled: p.pages.length <= 1,
          onclick: () => {
            if (confirm(`Delete sheet "${page.name}" and everything on it?`)) {
              app.deletePage(page.id);
              body.replaceChildren(render());
            }
          },
        }),
      ])
    );

  const body = el('div', {}, [render()]);
  openModal({
    title: 'Sheets',
    body,
    wide: true,
    actions: [
      {
        label: 'Add sheet',
        onClick: () => {
          app.addPage();
          body.replaceChildren(render());
        },
      },
      { label: 'Done', primary: true, onClick: (close) => close() },
    ],
  });
}

// --- compact menu ---------------------------------------------------------

/** The phone stand-in for the desktop action row. */
export function menuDialog(title, actions) {
  const body = el(
    'div',
    { class: 'menu-list' },
    actions.map(([label, run]) =>
      el('button', {
        class: 'menu-item',
        text: label,
        onclick: () => {
          closeModal();
          run();
        },
      })
    )
  );
  openModal({ title, subtitle: TAGLINE, body });
}

// --- help -----------------------------------------------------------------

export function helpDialog() {
  const rows = [
    ['V', 'Select / move / edit'],
    ['W', 'Wall (chained)'],
    ['D / N', 'Door / Window on a wall'],
    ['R', 'Room polygon'],
    ['L / B / P', 'Line / Rectangle / Polyline'],
    ['C / A', 'Circle / Arc'],
    ['K', 'Woodworking part'],
    ['F / G / J / H / I', 'Roof plane / Footing / Pad / Slab / Beam'],
    ['Q', 'Place a plan symbol — R rotates it, F flips it'],
    ['M / T / E', 'Dimension / Text / Measure'],
    ['Type a number + Enter', 'Exact length while drawing (e.g. 8\' or 8\'-6 1/2" or 48 x 24)'],
    ['Type a number + Enter (selected)', 'Set the length of the selected wall, line or beam'],
    ['Arrow keys', 'Nudge the selection by one fraction-precision step'],
    ['Shift + arrow', 'Nudge ten steps · Alt + arrow nudges one grid square'],
    ['Type <45 + Enter', 'Point the selected wall or symbol at 45°'],
    ['Type <+15 + Enter', 'Turn the selection 15° further (a sign means relative)'],
    ['Shift (while drawing)', 'Constrain to 90° — hold Alt for 45°'],
    ['Space or middle-drag', 'Pan · scroll wheel zooms'],
    ['F', 'Zoom to fit'],
    ['F3 / F7 / F8', 'Object snap / grid snap / ortho'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
    ['Ctrl+D', 'Duplicate selection'],
    ['Ctrl+S / Ctrl+O / Ctrl+N', 'Save / open / new'],
    ['Delete', 'Erase selection'],
  ];
  openModal({
    title: 'Keyboard & mouse',
    body: el('div', { class: 'report' }, [
      table(['Key', 'Action'], rows),
      el('p', {
        class: 'muted',
        text: 'Lengths accept feet-and-inches (4\'-6 1/2"), plain inches (54.5) or metric (1400mm) depending on the project units. Angles have to say they are angles — <45 or 45° — so a bare number stays a length.',
      }),
    ]),
    wide: true,
    actions: [{ label: 'Close', primary: true, onClick: (close) => close() }],
  });
}
