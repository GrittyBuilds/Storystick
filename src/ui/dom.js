// Tiny DOM helpers — enough structure to keep the UI modules declarative.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = !!value;
    else node.setAttribute(key, value);
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function field(label, control, hint) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'field-label', text: label }),
    control,
    hint ? el('span', { class: 'field-hint', text: hint }) : null,
  ]);
}

export function select(options, value, onChange) {
  const node = el(
    'select',
    { onchange: (e) => onChange(e.target.value) },
    options.map((opt) =>
      el('option', { value: opt.value, selected: opt.value === value, text: opt.label })
    )
  );
  node.value = value;
  return node;
}

export function numberInput(value, onCommit, opts = {}) {
  const node = el('input', {
    type: 'number',
    value: String(value),
    step: opts.step ?? 'any',
    min: opts.min,
    max: opts.max,
  });
  const commit = () => {
    const v = Number(node.value);
    if (Number.isFinite(v)) onCommit(v);
  };
  node.addEventListener('change', commit);
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commit();
      node.blur();
    }
    e.stopPropagation();
  });
  return node;
}

export function textInput(value, onCommit, opts = {}) {
  const node = el('input', { type: 'text', value: value ?? '', placeholder: opts.placeholder || '' });
  const commit = () => onCommit(node.value);
  node.addEventListener('change', commit);
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commit();
      node.blur();
    }
    e.stopPropagation();
  });
  return node;
}

/**
 * Build a table. `rows` is an array of cell arrays, or `{ cells, className }`.
 * Cells may be strings, numbers or DOM nodes.
 */
export function table(headers, rows, opts = {}) {
  const cellNode = (cell) =>
    cell instanceof Node ? el('td', {}, [cell]) : el('td', { text: String(cell ?? '') });
  return el('table', { class: `data-table${opts.compact ? ' compact' : ''}` }, [
    el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { text: h })))]),
    el(
      'tbody',
      {},
      rows.map((row) => {
        const cells = Array.isArray(row) ? row : row.cells;
        const className = Array.isArray(row) ? null : row.className;
        return el('tr', { class: className }, cells.map(cellNode));
      })
    ),
  ]);
}

export function money(value) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept, style: 'display:none' });
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: String(reader.result) });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
    document.body.appendChild(input);
    input.click();
  });
}
