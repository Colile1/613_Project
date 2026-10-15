// ui.js : DOM helpers and small Material components (cards, tabs, tables, dialogs).

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const icon = (name, extra = '') => h('span', { class: 'icon ' + extra, 'aria-hidden': 'true' }, name);
export const clear = (el, ...children) => { el.replaceChildren(); append(el, children); return el; };

const nf = new Intl.NumberFormat('en-ZA');
const zf = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 });
export const num = (n) => (n === null || n === undefined ? '-' : nf.format(n));
export const zar = (n) => (n === null || n === undefined ? '-' : zf.format(n));
export const pct = (n, d = 1) => (n * 100).toFixed(d) + '%';
export function time(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-ZA', { hour12: false });
}

export function stat(label, value, hint, iconName) {
  return h('div', { class: 'card stat' },
    h('div', { class: 'label' }, iconName ? icon(iconName) : null, label),
    h('div', { class: 'value' }, value),
    hint ? h('div', { class: 'hint' }, hint) : null);
}

export function card(title, sub, body, actions, cls = '') {
  return h('section', { class: 'card ' + cls },
    title || actions ? h('div', { class: 'card-head' },
      h('div', {}, h('h3', {}, title), sub ? h('div', { class: 'sub' }, sub) : null),
      actions ? h('div', { class: 'row' }, actions) : null) : null,
    body);
}

export function pageHead(eyebrow, title, text, actions) {
  return h('div', { class: 'page-head' },
    h('div', {}, h('div', { class: 'eyebrow' }, eyebrow), h('h1', {}, title), text ? h('p', {}, text) : null),
    actions ? h('div', { class: 'row' }, actions) : null);
}

export function tabs(items, active, onSelect) {
  const bar = h('div', { class: 'tabs', role: 'tablist' });
  for (const it of items) {
    bar.append(h('button', { class: 'tab' + (it.key === active ? ' active' : ''), role: 'tab',
      'aria-selected': it.key === active ? 'true' : 'false', onclick: () => onSelect(it.key) },
      it.icon ? icon(it.icon) : null, it.label, it.count !== undefined ? h('span', { class: 'count' }, num(it.count)) : null));
  }
  return bar;
}

export function table(columns, rows, opts = {}) {
  if (!rows.length) return h('div', { class: 'empty' }, opts.empty || 'No rows yet. Generate some traffic first.');
  const head = h('tr', {}, columns.map((c) => h('th', { class: c.num ? 'num' : '' }, c.label)));
  const body = rows.map((r) => h('tr', {
    class: [opts.onRow ? 'click' : '', opts.rowClass ? opts.rowClass(r) : ''].join(' '),
    onclick: opts.onRow ? () => opts.onRow(r) : null },
    columns.map((c) => {
      const v = c.fmt ? c.fmt(r[c.key], r) : r[c.key];
      return h('td', { class: c.num ? 'num' : '', title: typeof v === 'string' ? v : null }, v === null || v === undefined ? '-' : v);
    })));
  return h('div', { class: 'table-wrap' + (opts.wrap ? ' wrap' : ''), style: opts.height ? { maxHeight: opts.height } : null },
    h('table', {}, h('thead', {}, head), h('tbody', {}, body)));
}

export function dialog(title, content, actions = []) {
  const back = h('div', { class: 'dialog-back', onclick: (e) => { if (e.target === back) back.remove(); } });
  const close = h('button', { class: 'btn text', onclick: () => back.remove() }, 'Close');
  back.append(h('div', { class: 'dialog', role: 'dialog', 'aria-label': title },
    h('h2', {}, title), content, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, actions, close)));
  document.body.append(back);
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { back.remove(); document.removeEventListener('keydown', esc); } });
  return back;
}

// Material replacement for window.prompt: resolves to the text, or null on cancel.
export function promptDialog(title, label, value = '') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', value, 'aria-label': label, style: { width: '100%' } });
    const d = dialog(title, h('div', { class: 'field' }, h('label', {}, label), input),
      [h('button', { class: 'btn', onclick: () => { d.remove(); resolve(input.value.trim() || null); } }, 'Save')]);
    d.querySelector('.btn.text').addEventListener('click', () => resolve(null));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { d.remove(); resolve(input.value.trim() || null); } });
    setTimeout(() => input.focus(), 0);
  });
}

// Material replacement for window.confirm: resolves true only when the action is pressed.
export function confirmDialog(title, text, action = 'Delete') {
  return new Promise((resolve) => {
    const d = dialog(title, h('p', {}, text), [h('button', { class: 'btn danger', onclick: () => { d.remove(); resolve(true); } }, action)]);
    d.querySelector('.btn.text').addEventListener('click', () => resolve(false));
  });
}

export function jsonDialog(title, obj) {
  const text = JSON.stringify(obj, null, 2);
  const copy = h('button', { class: 'btn tonal', onclick: () => { navigator.clipboard.writeText(text); snackbar('Copied to clipboard'); } }, icon('content_copy'), 'Copy');
  return dialog(title, h('pre', { class: 'code' }, text), [copy]);
}

let snackTimer;
export function snackbar(msg) {
  document.querySelector('.snackbar')?.remove();
  const s = h('div', { class: 'snackbar', role: 'status' }, msg);
  document.body.append(s);
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => s.remove(), 3200);
}

export const code = (text) => h('pre', { class: 'code' }, text);
export const callout = (iconName, body, kind = '') => h('div', { class: 'callout ' + kind }, icon(iconName), h('div', {}, body));
export const chip = (label, kind = '', iconName) => h('span', { class: 'chip ' + kind }, iconName ? icon(iconName) : null, label);
export const status = (ok, label) => chip(label, ok ? 'good' : 'warn', ok ? 'check_circle' : 'error');

export function flagChips(ev) {
  const out = [];
  if (ev._timing === 'out_of_order') out.push(chip('Out of order', 'warn', 'swap_vert'));
  if (ev._timing === 'late') out.push(chip('Late', 'warn', 'schedule'));
  if (ev.is_duplicate) out.push(chip('Duplicate', '', 'content_copy'));
  if (ev._malformed) out.push(chip('Malformed: ' + ev._malformed, 'bad', 'report'));
  if (ev._fraud_injected) out.push(chip('Fraud spike', 'bad', 'crisis_alert'));
  if (ev._attack) out.push(chip('Card testing', 'bad', 'speed'));
  if (ev._burst) out.push(chip('Burst', 'on', 'bolt'));
  return h('div', { class: 'chips' }, out);
}

export function download(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}