// The code-check, code-settings and structural dialogs.
//
// The framing rule these follow: never show a verdict the data does not
// support. A code check with no confirmed values still does real work — it
// measures the drawing, names the requirement and tells the user which section
// to look up — but it says "review", not "pass".

import { el, field, select, numberInput, textInput, table, downloadText } from './dom.js';
import { openModal, closeModal } from './dialogs.js';
import { buildContext } from '../codes/context.js';
import { runChecks, groupFindings, STATUS } from '../codes/engine.js';
import { ALL_RULES } from '../codes/rules.js';
import { confirmedCount, isConfirmed, getThreshold } from '../codes/jurisdiction.js';
import { SPECIES_LIST, missingValues, isConfirmed as speciesConfirmed, VALUE_SOURCES } from '../engineering/species.js';
import { analyseMember, sizeMember, spanTable, ASSUMPTIONS } from '../engineering/analysis.js';
import { JOIST_SIZES } from '../engineering/sections.js';
import { formatSpan, plf, DEFLECTION_LIMITS } from '../engineering/beam.js';
import { formatLength, parseLength } from '../core/units.js';

const STATUS_LABEL = {
  [STATUS.FAIL]: 'Does not meet',
  [STATUS.REVIEW]: 'Needs checking',
  [STATUS.PASS]: 'Meets',
  [STATUS.NA]: 'Not applicable',
};

function statusChip(status) {
  const cls = { fail: 'red', review: 'cedar', pass: 'green', 'n/a': '' }[status] || '';
  return el('span', { class: `chip ${cls}` }, [el('span', { class: 'dot' }), STATUS_LABEL[status] || status]);
}

function findingCard(app, f) {
  const lines = [
    el('div', { class: 'finding-head' }, [
      statusChip(f.status),
      el('strong', { text: f.title }),
      el('span', { class: 'pill', text: f.citation }),
    ]),
    el('p', { class: 'finding-message', text: f.message }),
  ];
  if (f.measured || f.required) {
    lines.push(
      el('p', { class: 'finding-values mono' }, [
        f.measured ? el('span', { text: `measured ${f.measured}` }) : null,
        f.required ? el('span', { text: `required ${f.required}` }) : null,
      ])
    );
  }
  if (f.fix) lines.push(el('p', { class: 'finding-fix', text: f.fix }));
  if (f.subject && f.subject.id) {
    lines.push(
      el('button', {
        class: 'btn tiny',
        text: `Show ${f.subject.label || 'it'}`,
        onclick: () => {
          closeModal();
          app.revealEntity(f.subject.id);
        },
      })
    );
  }
  return el('article', { class: `finding ${f.status}` }, lines);
}

// --- code check ------------------------------------------------------------

export function codeCheckDialog(app) {
  const project = app.project;
  const ctx = buildContext(project);
  ctx.code = project.jurisdiction;
  const { findings, summary } = runChecks(ALL_RULES, ctx);
  const grouped = groupFindings(findings);
  const counts = confirmedCount(project.jurisdiction);

  const banner =
    counts.confirmed === 0
      ? el('div', { class: 'alert warn' }, [
          el('span', { class: 'ic', text: '!' }),
          el('div', {}, [
            el('b', { text: 'No code values have been confirmed yet' }),
            el('span', {
              text:
                `Storystick ships no Michigan code numbers, because none could be verified against the ` +
                `published code. It has measured your drawing and named the requirement for each check — ` +
                `open Code settings to enter the values from your code book, and these become real answers.`,
            }),
          ]),
        ])
      : el('div', { class: 'alert info' }, [
          el('span', { class: 'ic', text: 'i' }),
          el('div', {}, [
            el('b', { text: `${counts.confirmed} of ${counts.total} code values confirmed` }),
            el('span', { text: 'Checks without a confirmed value report as "needs checking".' }),
          ]),
        ]);

  const section = (title, list, emptyText) =>
    el('section', { class: 'report-section' }, [
      el('h3', {}, [el('span', { text: title }), el('span', { class: 'pill', text: String(list.length) })]),
      list.length
        ? el('div', { class: 'finding-list' }, list.map((f) => findingCard(app, f)))
        : el('p', { class: 'muted', text: emptyText }),
    ]);

  const body = el('div', { class: 'report' }, [
    el('div', { class: 'summary-row' }, [
      el('div', {}, [el('strong', { text: String(summary.fail) }), el('span', { text: 'do not meet' })]),
      el('div', {}, [el('strong', { text: String(summary.review) }), el('span', { text: 'need checking' })]),
      el('div', {}, [el('strong', { text: String(summary.pass) }), el('span', { text: 'meet' })]),
      el('div', {}, [
        el('strong', { text: `${counts.confirmed}/${counts.total}` }),
        el('span', { text: 'values confirmed' }),
      ]),
    ]),
    banner,
    section('Does not meet the requirement', grouped.failures, 'Nothing failed outright.'),
    section('Needs checking', grouped.reviews, 'Nothing outstanding.'),
    section('Meets the requirement', grouped.passes, 'Nothing confirmed as passing yet.'),
    el('p', {
      class: 'muted small',
      text:
        'This is a design aid, not a plan review and not a code determination. Storystick checks what a ' +
        'plan can show; it cannot see construction, materials, systems or workmanship. Your building ' +
        'official decides compliance.',
    }),
  ]);

  openModal({
    title: 'Code check',
    subtitle: `${project.jurisdiction.name} · ${project.jurisdiction.administrator}`,
    body,
    wide: true,
    actions: [
      { label: 'Code settings…', onClick: () => codeSettingsDialog(app) },
      {
        label: 'Download CSV',
        onClick: () =>
          downloadText(
            `${app.slug()}-code-check.csv`,
            [
              ['Status', 'Requirement', 'Citation', 'Finding', 'Measured', 'Required', 'What to do'],
              ...findings.map((f) => [
                STATUS_LABEL[f.status],
                f.title,
                f.citation,
                f.message,
                f.measured || '',
                f.required || '',
                f.fix || '',
              ]),
            ]
              .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
              .join('\n'),
            'text/csv'
          ),
      },
      { label: 'Done', primary: true, onClick: (close) => close() },
    ],
  });
}

// --- code settings ---------------------------------------------------------

export function codeSettingsDialog(app) {
  const jurisdiction = app.project.jurisdiction;

  const rows = Object.values(jurisdiction.thresholds).map((record) => {
    const input = el('input', {
      type: 'text',
      class: 'dim',
      value: record.value === null ? '' : String(record.value),
      placeholder: 'not confirmed',
    });
    const sourceInput = el('input', {
      type: 'text',
      value: record.source || '',
      placeholder: 'where you read it',
    });
    const commit = () => {
      const raw = input.value.trim();
      if (!raw) {
        record.value = null;
        record.confirmedOn = null;
      } else {
        const parsed = record.unit === 'in' ? parseLength(raw, 'imperial') : Number(raw);
        if (Number.isFinite(parsed)) {
          record.value = parsed;
          record.confirmedOn = new Date().toISOString().slice(0, 10);
          record.source = sourceInput.value.trim() || record.citation;
        }
      }
      app.touch('Set code value');
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => e.stopPropagation());
    sourceInput.addEventListener('change', commit);
    sourceInput.addEventListener('keydown', (e) => e.stopPropagation());

    return [
      record.label,
      record.citation,
      input,
      record.unit,
      sourceInput,
      isConfirmed(record) ? record.confirmedOn : '—',
    ];
  });

  const body = el('div', { class: 'report' }, [
    el('div', { class: 'alert warn' }, [
      el('span', { class: 'ic', text: '!' }),
      el('div', {}, [
        el('b', { text: 'Enter these from the published code, not from memory' }),
        el('span', {
          text:
            `${jurisdiction.edition.note} Storystick deliberately ships no values here: a number with no ` +
            'source is worse than a blank, because it looks like an answer.',
        }),
      ]),
    ]),
    el('div', { class: 'form-grid' }, [
      field(
        'Residential code edition',
        textInput(jurisdiction.edition.residential || '', (v) => {
          jurisdiction.edition.residential = v || null;
          jurisdiction.edition.confirmedOn = v ? new Date().toISOString().slice(0, 10) : null;
          app.touch('Set code edition');
        }, { placeholder: 'e.g. 2015 Michigan Residential Code' })
      ),
      field(
        'Energy code edition',
        textInput(jurisdiction.edition.energy || '', (v) => {
          jurisdiction.edition.energy = v || null;
          app.touch('Set energy code edition');
        })
      ),
      field(
        'Building official / authority',
        textInput(jurisdiction.authorities.building || '', (v) => {
          jurisdiction.authorities.building = v || null;
          app.touch('Set authority');
        }, { placeholder: 'city, village, township or county' })
      ),
      field(
        'Ground snow load (psf)',
        textInput(jurisdiction.groundSnow.forThisSite || '', (v) => {
          jurisdiction.groundSnow.forThisSite = v || null;
          app.touch('Set ground snow');
        }, { placeholder: 'ask your building official' })
      ),
    ]),
    el('p', { class: 'muted small', text: jurisdiction.groundSnow.note }),
    table(['Requirement', 'Where to look', 'Value', 'Unit', 'Source', 'Confirmed'], rows, {
      compact: true,
      mono: [2, 3, 5],
    }),
    el('p', { class: 'muted small', text: jurisdiction.localScopeWarning }),
  ]);

  openModal({
    title: 'Code settings',
    subtitle: `${jurisdiction.name} — ${jurisdiction.statute}`,
    body,
    wide: true,
    actions: [
      { label: 'Back to code check', onClick: () => codeCheckDialog(app) },
      { label: 'Done', primary: true, onClick: (close) => close() },
    ],
  });
}

// --- structural ------------------------------------------------------------

export function structuralDialog(app) {
  const project = app.project;
  const state = app.structural;
  const speciesRecord = project.speciesValues[state.speciesId] || SPECIES_LIST[0];

  const render = () => {
    const ready = speciesConfirmed(speciesRecord);
    const body = el('div', { class: 'report' });

    body.appendChild(
      el('div', { class: 'form-grid' }, [
        field(
          'Member',
          select(
            [
              { value: 'floor', label: 'Floor joist' },
              { value: 'ceiling', label: 'Ceiling joist' },
              { value: 'rafter', label: 'Rafter' },
              { value: 'header', label: 'Header / beam' },
              { value: 'deck', label: 'Deck joist' },
            ],
            state.member,
            (v) => {
              state.member = v;
              refresh();
            }
          )
        ),
        field(
          'Species and grade',
          select(
            SPECIES_LIST.map((s) => ({ value: s.id, label: `${s.name} ${s.grade}` })),
            state.speciesId,
            (v) => {
              state.speciesId = v;
              refresh();
            }
          )
        ),
        field(
          'Size',
          select(
            JOIST_SIZES.map((s) => ({ value: s, label: s })),
            state.size,
            (v) => {
              state.size = v;
              refresh();
            }
          )
        ),
        field(
          'Plies',
          numberInput(state.plies, (v) => {
            state.plies = Math.max(1, Math.round(v));
            refresh();
          }, { step: 1, min: 1, max: 5 })
        ),
        field(
          'Spacing',
          select(
            [12, 16, 19.2, 24].map((v) => ({ value: String(v), label: `${v}" o.c.` })),
            String(state.spacing),
            (v) => {
              state.spacing = Number(v);
              refresh();
            }
          )
        ),
        field(
          'Span',
          textInput(formatLength(state.span, project.unitSystem), (v) => {
            const parsed = parseLength(v, project.unitSystem);
            if (parsed && parsed > 0) state.span = parsed;
            refresh();
          })
        ),
        field(
          'Live load (psf)',
          numberInput(state.livePsf, (v) => {
            state.livePsf = Math.max(0, v);
            refresh();
          })
        ),
        field(
          'Dead load (psf)',
          numberInput(state.deadPsf, (v) => {
            state.deadPsf = Math.max(0, v);
            refresh();
          })
        ),
        field(
          'Live-load deflection limit',
          select(
            Object.entries(DEFLECTION_LIMITS).map(([k, v]) => ({ value: k, label: `${v.label} (${v.applies})` })),
            state.deflectionLimit,
            (v) => {
              state.deflectionLimit = v;
              refresh();
            }
          )
        ),
      ])
    );

    // --- design values, the part the user must supply ---
    const valueInputs = ['fb', 'fv', 'fcPerp', 'e'].map((key) => {
      const labels = { fb: 'Fb — bending (psi)', fv: 'Fv — shear (psi)', fcPerp: 'Fc⊥ — bearing (psi)', e: 'E — stiffness (psi)' };
      return field(
        labels[key],
        numberInput(speciesRecord[key] ?? 0, (v) => {
          speciesRecord[key] = v > 0 ? v : null;
          speciesRecord.confirmedOn = new Date().toISOString().slice(0, 10);
          speciesRecord.verified = speciesConfirmed(speciesRecord);
          app.touch('Set design value');
          refresh();
        })
      );
    });

    body.appendChild(
      el('section', { class: 'report-section' }, [
        el('h3', {}, [
          el('span', { text: `Design values — ${speciesRecord.name} ${speciesRecord.grade}` }),
          el('span', { class: 'pill', text: ready ? `confirmed ${speciesRecord.confirmedOn}` : 'not confirmed' }),
        ]),
        ready
          ? null
          : el('div', { class: 'alert warn' }, [
              el('span', { class: 'ic', text: '!' }),
              el('div', {}, [
                el('b', { text: `Enter ${missingValues(speciesRecord).join(', ')} before this can calculate` }),
                el('span', {
                  text:
                    'Storystick ships no reference design values, because they are edition- and ' +
                    'grade-specific and could not be verified here. Take them from: ' +
                    VALUE_SOURCES.join(' '),
                }),
              ]),
            ]),
        el('div', { class: 'form-grid' }, valueInputs),
        field(
          'Where these came from',
          textInput(speciesRecord.source || '', (v) => {
            speciesRecord.source = v || null;
            app.touch('Set design value source');
          }, { placeholder: 'e.g. NDS Supplement 2018 Table 4A' })
        ),
      ])
    );

    if (ready) {
      const spec = {
        size: state.size,
        plies: state.plies,
        spacing: state.spacing,
        span: state.span,
        livePsf: state.livePsf,
        deadPsf: state.deadPsf,
        deflectionLimit: state.deflectionLimit,
        duration: state.member === 'rafter' ? 'snow' : 'occupancy',
        memberCount: state.plies > 1 ? 1 : 6,
      };
      const result = analyseMember(spec, speciesRecord);
      const suggestion = sizeMember(spec, speciesRecord);

      body.appendChild(
        el('section', { class: 'report-section' }, [
          el('h3', {}, [
            el('span', { text: result.passes ? 'The member works' : 'The member does not work' }),
            el('span', {
              class: 'pill',
              text: `governed by ${result.governing.name.toLowerCase()} at ${(result.governing.ratio * 100).toFixed(0)}%`,
            }),
          ]),
          el('div', { class: 'summary-row' }, [
            el('div', {}, [
              el('strong', { text: formatSpan(result.maxSpan) }),
              el('span', { text: 'longest span' }),
            ]),
            el('div', {}, [
              el('strong', { text: `${plf(result.loads.wTotal).toFixed(0)}` }),
              el('span', { text: 'lb per foot' }),
            ]),
            el('div', {}, [
              el('strong', { text: suggestion.chosen || '—' }),
              el('span', { text: 'smallest that works' }),
            ]),
            el('div', {}, [
              el('strong', { text: formatLength(result.requiredBearing, project.unitSystem, { forceInches: true }) }),
              el('span', { text: 'bearing needed' }),
            ]),
          ]),
          table(
            ['Check', 'Actual', 'Allowable', 'Used', 'Result', 'How it is worked out'],
            result.checks.map((c) => [
              c.name,
              `${c.actual.toFixed(c.unit === 'in' ? 3 : 0)} ${c.unit}`,
              `${c.allowable.toFixed(c.unit === 'in' ? 3 : 0)} ${c.unit}`,
              `${(c.ratio * 100).toFixed(0)}%`,
              c.passes ? 'OK' : 'over',
              c.basis,
            ]),
            { compact: true, mono: [1, 2, 3] }
          ),
        ])
      );

      body.appendChild(
        el('section', { class: 'report-section' }, [
          el('h3', { text: 'Longest span by size and spacing' }),
          table(
            ['Size', ...[12, 16, 19.2, 24].map((s) => `${s}" o.c.`)],
            spanTable(spec, speciesRecord).map((row) => [
              row.size,
              ...row.spans.map((s) => `${formatSpan(s.maxSpan)} (${s.governing.replace(/([A-Z])/g, ' $1').toLowerCase()})`),
            ]),
            { compact: true, mono: [1, 2, 3, 4] }
          ),
          el('p', {
            class: 'muted small',
            text:
              'Compare these against the published span table for your code edition. They will not match ' +
              'exactly — the tables round, and they make assumptions about dead load and bearing that your ' +
              'drawing may not share. A large disagreement means an input is wrong.',
          }),
        ])
      );
    }

    body.appendChild(
      el('section', { class: 'report-section' }, [
        el('h3', { text: 'What this calculation assumes' }),
        el('ul', { class: 'assumptions' }, ASSUMPTIONS.map((a) => el('li', { text: a }))),
        el('p', {
          class: 'muted small',
          text:
            'This is arithmetic on the values you entered — a design aid, not engineering. It covers one ' +
            'simply supported, uniformly loaded member and nothing else: no point loads, no cantilevers, ' +
            'no continuous spans, no notches or holes, and nothing about the load path below. Anything ' +
            'structural that matters should be reviewed by a licensed engineer.',
        }),
      ])
    );

    return body;
  };

  const refresh = () => {
    const host = document.querySelector('.modal-body');
    if (host) host.replaceChildren(render());
  };

  openModal({
    title: 'Structural check',
    subtitle: 'Allowable-stress arithmetic on values you supply',
    body: render(),
    wide: true,
    actions: [{ label: 'Done', primary: true, onClick: (close) => close() }],
  });
}
