// Tool palette and the contextual options strip for the active tool.

import { el, clear, field, select, numberInput } from './dom.js';
import { TOOL_GROUPS } from '../tools/index.js';
import { formatLength, parseLength } from '../core/units.js';
import { WALL_STATUS } from '../core/entities.js';
import { getSymbol, symbolsFor, SYMBOL_GROUPS } from '../symbols/library.js';
import { symbolPreviewSvg } from '../symbols/render.js';

export function renderToolbar(app, container) {
  clear(container);
  for (const group of TOOL_GROUPS) {
    container.appendChild(el('span', { class: 'tool-group-label', text: group.name }));
    const row = el('div', { class: 'tool-group' });
    for (const entry of group.tools) {
      const active = app.activeTool instanceof entry.Tool && app.activeTool.constructor === entry.Tool;
      row.appendChild(
        el('button', {
          class: `tool-btn${active ? ' active' : ''}`,
          title: `${entry.Tool.label} (${entry.key.toUpperCase()})`,
          html: `${entry.icon}<span>${entry.Tool.label}</span>`,
          onclick: () => app.setTool(entry.Tool.id),
        })
      );
    }
    container.appendChild(row);
  }
}

function lengthControl(app, value, onCommit, allowZero = false) {
  const sys = app.project.unitSystem;
  const input = el('input', { type: 'text', class: 'mini', value: formatLength(value, sys) });
  const commit = () => {
    const parsed = parseLength(input.value, sys);
    if (parsed !== null && (allowZero || parsed > 0)) {
      onCommit(parsed);
      input.value = formatLength(parsed, sys);
    } else {
      input.value = formatLength(value, sys);
    }
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      commit();
      input.blur();
    }
  });
  return input;
}

function checkbox(label, checked, onChange) {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  const node = el('label', { class: 'field inline-check' }, [input, el('span', { text: label })]);
  return node;
}

/** The options strip while the 3D view is open. */
export function renderModelOptions(app, container) {
  clear(container);
  const m = app.model3d;
  const stats = app.modelStats;

  container.appendChild(el('span', { class: 'options-title', text: '3D Model' }));

  container.appendChild(
    field(
      'Build',
      select(
        [
          { value: 'building', label: 'Whole building' },
          { value: 'sheet', label: 'This sheet only' },
        ],
        m.scope,
        (v) => {
          m.scope = v;
          app.rebuildModel({ frame: true });
        }
      ),
      'Stacks the foundation, floor and roof sheets'
    )
  );

  container.appendChild(
    field(
      'Roof',
      select(
        [
          { value: 'gable', label: 'Gable' },
          { value: 'hip', label: 'Hip' },
          { value: 'flat', label: 'Flat' },
          { value: 'none', label: 'None' },
        ],
        m.roofStyle,
        (v) => {
          m.roofStyle = v;
          app.rebuildModel();
        }
      )
    )
  );

  if (m.roofStyle === 'gable' || m.roofStyle === 'hip') {
    container.appendChild(
      field(
        'Pitch',
        numberInput(m.roofPitch, (v) => {
          m.roofPitch = Math.max(0, Math.min(24, v));
          app.rebuildModel();
        }, { step: 1, min: 0, max: 24 }),
        'in 12'
      )
    );
    container.appendChild(
      field('Overhang', lengthControl(app, m.roofOverhang, (v) => {
        m.roofOverhang = v;
        app.rebuildModel();
      }))
    );
  }

  container.appendChild(
    field('Wall height', lengthControl(app, app.project.wallHeight, (v) => {
      app.project.wallHeight = v;
      app.touch('Change wall height');
      app.rebuildModel();
    }))
  );

  container.appendChild(
    checkbox('Floors', m.includeFloors, (v) => {
      m.includeFloors = v;
      app.rebuildModel();
    })
  );
  container.appendChild(
    checkbox('Ceilings', m.includeCeilings, (v) => {
      m.includeCeilings = v;
      app.rebuildModel();
    })
  );
  container.appendChild(
    checkbox('Grid', app.showModelGrid, (v) => {
      app.setModelGrid(v);
    })
  );

  container.appendChild(
    el('button', { class: 'btn tiny', text: 'Save PNG', onclick: () => app.exportModelPng() })
  );

  if (stats) {
    const sub = stats.substructure;
    const extra = sub && (sub.footings || sub.slabs || sub.beams)
      ? ` · ${sub.footings} footings · ${sub.slabs} slabs · ${sub.beams} beams`
      : '';
    const drawn = stats.roof && stats.roof.style === 'drawn' ? ` · ${stats.roof.planes} drawn roof planes` : '';
    const summary = stats.empty
      ? 'Nothing to build — draw walls, rooms or parts.'
      : `${stats.walls} walls · ${stats.openings} openings · ${stats.parts} parts${extra}${drawn} · ${stats.triangles.toLocaleString()} triangles`;
    container.appendChild(el('span', { class: 'options-hint', text: summary }));
  }
}

export function renderToolOptions(app, container) {
  if (app.viewMode === '3d') {
    renderModelOptions(app, container);
    return;
  }
  clear(container);
  const id = app.activeTool.constructor.id;
  const d = app.defaults;

  container.appendChild(el('span', { class: 'options-title', text: app.activeTool.constructor.label }));

  if (id === 'wall') {
    container.appendChild(field('Thickness', lengthControl(app, d.wall.thickness, (v) => { d.wall.thickness = v; })));
    container.appendChild(
      field(
        'Status',
        select(
          WALL_STATUS.map((s) => ({ value: s, label: s })),
          d.wall.status,
          (v) => {
            d.wall.status = v;
            app.refreshToolOptions();
          }
        )
      )
    );
  } else if (id === 'door') {
    container.appendChild(field('Width', lengthControl(app, d.door.width, (v) => { d.door.width = v; })));
    container.appendChild(field('Height', lengthControl(app, d.door.height, (v) => { d.door.height = v; })));
    container.appendChild(
      field(
        'Hinge',
        select(
          [
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ],
          d.door.swing,
          (v) => {
            d.door.swing = v;
          }
        )
      )
    );
  } else if (id === 'window') {
    container.appendChild(field('Width', lengthControl(app, d.window.width, (v) => { d.window.width = v; })));
    container.appendChild(field('Height', lengthControl(app, d.window.height, (v) => { d.window.height = v; })));
    container.appendChild(field('Sill', lengthControl(app, d.window.sill, (v) => { d.window.sill = v; })));
  } else if (id === 'part') {
    container.appendChild(
      field(
        'Material',
        select(
          app.project.materials.map((m) => ({ value: m.id, label: m.name })),
          d.part.material,
          (v) => {
            d.part.material = v;
            const mat = app.project.materials.find((m) => m.id === v);
            if (mat) d.part.thickness = mat.thickness;
            app.refreshToolOptions();
          }
        )
      )
    );
    container.appendChild(field('Thickness', lengthControl(app, d.part.thickness, (v) => { d.part.thickness = v; })));
    container.appendChild(
      field('Qty', numberInput(d.part.qty, (v) => { d.part.qty = Math.max(1, Math.round(v)); }, { step: 1, min: 1 }))
    );
  } else if (id === 'text') {
    container.appendChild(field('Size', lengthControl(app, d.textSize, (v) => { d.textSize = v; })));
  } else if (id === 'roof') {
    container.appendChild(
      field(
        'Pitch',
        select(
          PITCHES.map((p) => ({ value: String(p), label: `${p}:12` })),
          String(d.roof.pitch),
          (v) => {
            d.roof.pitch = Number(v);
          }
        )
      )
    );
    container.appendChild(
      field('Eave height', lengthControl(app, d.roof.eaveHeight, (v) => { d.roof.eaveHeight = v; }))
    );
    container.appendChild(
      field('Overhang', lengthControl(app, d.roof.overhang, (v) => { d.roof.overhang = v; }))
    );
  } else if (id === 'footing') {
    container.appendChild(field('Width', lengthControl(app, d.footing.width, (v) => { d.footing.width = v; })));
    container.appendChild(
      field('Thickness', lengthControl(app, d.footing.thickness, (v) => { d.footing.thickness = v; }))
    );
    container.appendChild(
      field(
        'Depth below grade',
        lengthControl(app, d.footing.depthBelowGrade, (v) => {
          d.footing.depthBelowGrade = v;
        })
      )
    );
  } else if (id === 'pad') {
    container.appendChild(field('Width', lengthControl(app, d.pad.width, (v) => { d.pad.width = v; })));
    container.appendChild(field('Length', lengthControl(app, d.pad.length, (v) => { d.pad.length = v; })));
    container.appendChild(
      field('Thickness', lengthControl(app, d.pad.thickness, (v) => { d.pad.thickness = v; }))
    );
  } else if (id === 'slab') {
    container.appendChild(
      field('Thickness', lengthControl(app, d.slab.thickness, (v) => { d.slab.thickness = v; }))
    );
    container.appendChild(
      field('Top elevation', lengthControl(app, d.slab.topElevation, (v) => { d.slab.topElevation = v; }, true))
    );
  } else if (id === 'beam') {
    container.appendChild(
      field(
        'Size',
        select(
          BEAM_SIZES.map((s) => ({ value: s, label: s })),
          d.beam.size,
          (v) => {
            d.beam.size = v;
          }
        )
      )
    );
    container.appendChild(
      field('Plies', numberInput(d.beam.plies, (v) => { d.beam.plies = Math.max(1, Math.round(v)); }, { step: 1, min: 1, max: 6 }))
    );
  } else if (id === 'fixture') {
    container.appendChild(symbolPicker(app));
  }

  container.appendChild(el('span', { class: 'options-hint', text: app.activeTool.hint() }));
}

const PITCHES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
const BEAM_SIZES = ['2x6', '2x8', '2x10', '2x12', '4x6', '4x8', '4x10', '4x12', '6x6', '6x8'];

/**
 * The symbol palette: a discipline chooser and a grid of previews drawn from
 * the same op lists the plan and the plot use, so what you pick is what prints.
 */
function symbolPicker(app) {
  const active = getSymbol(app.activeSymbolId);
  const discipline = active ? active.discipline : 'electrical';
  const wrap = el('div', { class: 'symbol-picker' });

  wrap.appendChild(
    field(
      'Discipline',
      select(
        SYMBOL_GROUPS.map((g) => ({ value: g.discipline, label: g.label })),
        discipline,
        (v) => {
          const first = symbolsFor(v)[0];
          if (first) app.setActiveSymbol(first.id);
        }
      )
    )
  );

  const grid = el('div', { class: 'symbol-grid' });
  for (const symbol of symbolsFor(discipline)) {
    grid.appendChild(
      el('button', {
        class: `symbol-btn${symbol.id === app.activeSymbolId ? ' active' : ''}`,
        title: symbol.name,
        html: symbolPreviewSvg(symbol, 30, 'currentColor'),
        onclick: () => app.setActiveSymbol(symbol.id),
      })
    );
  }
  wrap.appendChild(grid);
  wrap.appendChild(el('span', { class: 'symbol-name', text: active ? active.name : 'No symbol' }));
  return wrap;
}
