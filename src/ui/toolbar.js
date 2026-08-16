// Tool palette and the contextual options strip for the active tool.

import { el, clear, field, select, numberInput } from './dom.js';
import { TOOL_GROUPS } from '../tools/index.js';
import { formatLength, parseLength } from '../core/units.js';
import { WALL_STATUS } from '../core/entities.js';

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

function lengthControl(app, value, onCommit) {
  const sys = app.project.unitSystem;
  const input = el('input', { type: 'text', class: 'mini', value: formatLength(value, sys) });
  const commit = () => {
    const parsed = parseLength(input.value, sys);
    if (parsed !== null && parsed > 0) {
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

export function renderToolOptions(app, container) {
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
  }

  container.appendChild(el('span', { class: 'options-hint', text: app.activeTool.hint() }));
}
