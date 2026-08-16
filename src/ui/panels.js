// Sidebar panels: sheets, layers and the context-sensitive properties editor.

import { el, clear, field, select, numberInput, textInput } from './dom.js';
import { formatLength, formatArea, parseLength } from '../core/units.js';
import { WALL_STATUS, describe, wallLength, findEntity } from '../core/entities.js';
import { layerColor } from '../render/theme.js';
import * as g from '../core/geometry.js';

const ICONS = {
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff:
    '<svg viewBox="0 0 24 24"><path d="M4 5l16 14M10.6 6.2A9.6 9.6 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.3 4M6.5 8.4A17 17 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 3.6-.7"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  unlock:
    '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-1.8"/></svg>',
};

function lengthInput(app, value, onCommit, opts = {}) {
  const sys = app.project.unitSystem;
  const input = el('input', { type: 'text', class: 'dim', value: formatLength(value, sys, opts) });
  const commit = () => {
    const parsed = parseLength(input.value, sys);
    if (parsed !== null && (opts.allowZero || parsed > 0)) {
      onCommit(parsed);
      input.value = formatLength(parsed, sys, opts);
    } else {
      input.value = formatLength(value, sys, opts);
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

// --- sheets ---------------------------------------------------------------

export function renderPages(app, container) {
  clear(container);
  const list = el('div', { class: 'page-list' });
  for (const page of app.project.pages) {
    list.appendChild(
      el(
        'button',
        {
          class: `page-item${page.id === app.project.activePageId ? ' active' : ''}`,
          onclick: () => app.setActivePage(page.id),
        },
        [
          el('span', { class: 'page-name', text: page.name }),
          el('span', { class: 'page-meta', text: `${page.kind} · ${page.entities.length}` }),
        ]
      )
    );
  }
  container.appendChild(list);
  container.appendChild(
    el('div', { class: 'panel-actions' }, [
      el('button', { class: 'btn tiny', text: '+ Sheet', onclick: () => app.addPage() }),
      el('button', { class: 'btn tiny', text: 'Manage…', onclick: () => app.openPageDialog() }),
    ])
  );
}

// --- layers ---------------------------------------------------------------

export function renderLayers(app, container) {
  clear(container);
  const project = app.project;
  const counts = new Map();
  for (const ent of app.page.entities) counts.set(ent.layer, (counts.get(ent.layer) || 0) + 1);

  const list = el('div', { class: 'layer-list' });
  for (const layer of project.layers) {
    const row = el('div', { class: `layer-row${layer.id === project.activeLayerId ? ' active' : ''}` }, [
      el('button', {
        class: `eye${layer.visible ? '' : ' off'}`,
        title: layer.visible ? 'Hide layer' : 'Show layer',
        'aria-label': layer.visible ? 'Hide layer' : 'Show layer',
        html: layer.visible ? ICONS.eye : ICONS.eyeOff,
        onclick: (e) => {
          e.stopPropagation();
          layer.visible = !layer.visible;
          app.touch('Toggle layer');
          app.refreshAll();
        },
      }),
      el('button', {
        class: `lock${layer.locked ? ' on' : ''}`,
        title: layer.locked ? 'Unlock layer' : 'Lock layer',
        'aria-label': layer.locked ? 'Unlock layer' : 'Lock layer',
        html: layer.locked ? ICONS.lock : ICONS.unlock,
        onclick: (e) => {
          e.stopPropagation();
          layer.locked = !layer.locked;
          app.touch('Toggle lock');
          app.refreshAll();
        },
      }),
      el('span', { class: 'swatch', style: `background:${layerColor(layer, app.canvasMode)}` }),
      el('span', { class: 'layer-name', text: layer.name }),
      el('span', { class: 'layer-count', text: String(counts.get(layer.id) || 0) }),
    ]);
    row.addEventListener('click', () => {
      project.activeLayerId = layer.id;
      app.refreshAll();
    });
    list.appendChild(row);
  }
  container.appendChild(list);
  container.appendChild(
    el('div', { class: 'panel-actions' }, [
      el('button', { class: 'btn tiny', text: '+ Layer', onclick: () => app.addLayer() }),
      el('button', {
        class: 'btn tiny',
        text: 'Isolate active',
        onclick: () => app.isolateActiveLayer(),
      }),
      el('button', { class: 'btn tiny', text: 'Show all', onclick: () => app.showAllLayers() }),
    ])
  );
}

// --- properties -----------------------------------------------------------

function geometrySummary(app, ent) {
  const sys = app.project.unitSystem;
  switch (ent.type) {
    case 'line':
    case 'dim':
      return `${formatLength(g.dist(ent.a, ent.b), sys)} long`;
    case 'wall':
      return `${formatLength(wallLength(ent), sys)} long`;
    case 'rect':
    case 'part': {
      const w = Math.abs(ent.b.x - ent.a.x);
      const h = Math.abs(ent.b.y - ent.a.y);
      return `${formatLength(Math.max(w, h), sys)} × ${formatLength(Math.min(w, h), sys)} · ${formatArea(
        w * h,
        sys
      )}`;
    }
    case 'circle':
      return `⌀ ${formatLength(ent.r * 2, sys)}`;
    case 'polyline':
      return `${ent.pts.length} vertices · ${formatLength(g.polygonPerimeter(ent.pts, !!ent.closed), sys)}`;
    case 'room':
      return `${formatArea(Math.abs(g.polygonArea(ent.pts)), sys)} · ${formatLength(
        g.polygonPerimeter(ent.pts, true),
        sys
      )} perimeter`;
    default:
      return '';
  }
}

function entityEditor(app, ent) {
  const fields = [];
  const change = (label) => {
    app.touch(label);
    app.render();
  };

  fields.push(
    field(
      'Layer',
      select(
        app.project.layers.map((l) => ({ value: l.id, label: l.name })),
        ent.layer,
        (v) => {
          ent.layer = v;
          change('Change layer');
          app.refreshAll();
        }
      )
    )
  );

  switch (ent.type) {
    case 'wall':
      fields.push(
        field('Thickness', lengthInput(app, ent.thickness, (v) => {
          ent.thickness = v;
          change('Change wall thickness');
        }))
      );
      fields.push(
        field(
          'Status',
          select(
            WALL_STATUS.map((s) => ({ value: s, label: s })),
            ent.status,
            (v) => {
              ent.status = v;
              ent.layer = app.layerFor('wall', v);
              change('Change wall status');
              app.refreshAll();
            }
          )
        )
      );
      break;

    case 'opening': {
      const host = findEntity(app.page, ent.host);
      const total = host ? wallLength(host) : 0;
      fields.push(
        field(
          'Type',
          select(
            [
              { value: 'door', label: 'Door' },
              { value: 'window', label: 'Window' },
              { value: 'cased', label: 'Cased opening' },
            ],
            ent.kind,
            (v) => {
              ent.kind = v;
              change('Change opening type');
            }
          )
        )
      );
      fields.push(field('Tag', textInput(ent.tag || '', (v) => { ent.tag = v; change('Tag opening'); })));
      fields.push(
        field('Width', lengthInput(app, ent.width, (v) => {
          ent.width = v;
          change('Change opening width');
        }))
      );
      fields.push(
        field('Head height', lengthInput(app, ent.height ?? 80, (v) => {
          ent.height = v;
          change('Change opening height');
        }))
      );
      if (ent.kind === 'window') {
        fields.push(
          field('Sill height', lengthInput(app, ent.sill ?? 36, (v) => {
            ent.sill = v;
            change('Change sill');
          }, { allowZero: true }))
        );
      }
      if (ent.kind === 'door') {
        fields.push(
          field(
            'Hinge',
            select(
              [
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
              ],
              ent.swing || 'left',
              (v) => {
                ent.swing = v;
                change('Change swing');
              }
            )
          )
        );
        fields.push(
          el('button', {
            class: 'btn tiny',
            text: 'Flip swing side',
            onclick: () => {
              ent.flip = !ent.flip;
              change('Flip swing');
            },
          })
        );
      }
      if (total > 0) {
        fields.push(
          field(
            'From wall start',
            lengthInput(app, ent.t * total, (v) => {
              const half = ent.width / 2;
              ent.t = Math.min(1 - half / total, Math.max(half / total, v / total));
              change('Move opening');
            }, { allowZero: true })
          )
        );
      }
      break;
    }

    case 'part': {
      fields.push(field('Name', textInput(ent.name, (v) => { ent.name = v || 'Part'; change('Rename part'); })));
      fields.push(
        field(
          'Material',
          select(
            app.project.materials.map((m) => ({ value: m.id, label: m.name })),
            ent.material,
            (v) => {
              ent.material = v;
              const mat = app.project.materials.find((m) => m.id === v);
              if (mat) ent.thickness = mat.thickness;
              app.defaults.part.material = v;
              change('Change material');
              app.refreshAll();
            }
          )
        )
      );
      fields.push(
        field('Thickness', lengthInput(app, ent.thickness, (v) => {
          ent.thickness = v;
          change('Change thickness');
        }))
      );
      fields.push(
        field('Quantity', numberInput(ent.qty, (v) => {
          ent.qty = Math.max(1, Math.round(v));
          change('Change quantity');
          app.refreshAll();
        }, { step: 1, min: 1 }))
      );
      const dx = Math.abs(ent.b.x - ent.a.x);
      const dy = Math.abs(ent.b.y - ent.a.y);
      fields.push(
        field('Length', lengthInput(app, Math.max(dx, dy), (v) => {
          app.resizePart(ent, v, Math.min(dx, dy));
          change('Resize part');
        }))
      );
      fields.push(
        field('Width', lengthInput(app, Math.min(dx, dy), (v) => {
          app.resizePart(ent, Math.max(dx, dy), v);
          change('Resize part');
        }))
      );
      fields.push(field('Notes', textInput(ent.notes || '', (v) => { ent.notes = v; change('Edit notes'); })));
      break;
    }

    case 'room':
      fields.push(field('Name', textInput(ent.name, (v) => { ent.name = v || 'Room'; change('Rename room'); })));
      break;

    case 'text':
      fields.push(field('Text', textInput(ent.text, (v) => { ent.text = v; change('Edit text'); })));
      fields.push(
        field('Size', lengthInput(app, ent.size, (v) => {
          ent.size = v;
          change('Change text size');
        }))
      );
      fields.push(
        field('Rotation', numberInput(Math.round((ent.rot * 180) / Math.PI), (v) => {
          ent.rot = (v * Math.PI) / 180;
          change('Rotate text');
        }, { step: 15 }), 'degrees')
      );
      break;

    case 'dim':
      fields.push(
        field('Offset', numberInput(Math.round(ent.offset * 100) / 100, (v) => {
          ent.offset = v;
          change('Move dimension');
        }), 'model units, negative flips side')
      );
      break;

    case 'circle':
      fields.push(
        field('Radius', lengthInput(app, ent.r, (v) => {
          ent.r = v;
          change('Change radius');
        }))
      );
      break;

    case 'polyline':
      fields.push(
        el('button', {
          class: 'btn tiny',
          text: ent.closed ? 'Open shape' : 'Close shape',
          onclick: () => {
            ent.closed = !ent.closed;
            change('Toggle closed');
          },
        })
      );
      break;

    default:
      break;
  }

  return fields;
}

export function renderProperties(app, container) {
  clear(container);
  const ids = [...app.selection];

  if (!ids.length) {
    container.appendChild(
      el('div', { class: 'prop-empty' }, [
        el('p', { class: 'muted', text: 'Nothing selected.' }),
        el('p', { class: 'muted small', text: app.activeTool.hint() }),
      ])
    );
    return;
  }

  if (ids.length > 1) {
    container.appendChild(el('h4', { text: `${ids.length} objects selected` }));
    container.appendChild(
      field(
        'Move all to layer',
        select(
          [{ value: '', label: '—' }, ...app.project.layers.map((l) => ({ value: l.id, label: l.name }))],
          '',
          (v) => {
            if (!v) return;
            for (const id of ids) {
              const ent = app.page.entities.find((e) => e.id === id);
              if (ent) ent.layer = v;
            }
            app.touch('Change layer');
            app.refreshAll();
          }
        )
      )
    );
  } else {
    const ent = app.page.entities.find((e) => e.id === ids[0]);
    if (!ent) return;
    container.appendChild(el('h4', { text: describe(ent) }));
    const summary = geometrySummary(app, ent);
    if (summary) container.appendChild(el('p', { class: 'muted small mono', text: summary }));
    for (const node of entityEditor(app, ent)) container.appendChild(node);
  }

  container.appendChild(
    el('div', { class: 'panel-actions' }, [
      el('button', { class: 'btn tiny', text: 'Duplicate', onclick: () => app.duplicateSelection() }),
      el('button', { class: 'btn tiny', text: 'To front', onclick: () => app.reorderSelection('front') }),
      el('button', { class: 'btn tiny', text: 'To back', onclick: () => app.reorderSelection('back') }),
      el('button', { class: 'btn tiny danger', text: 'Delete', onclick: () => app.deleteSelection() }),
    ])
  );
}
