// editor.js : SQL editor with syntax highlighting, autocomplete and formatting.
// A transparent <textarea> sits over a highlighted <pre>, so typing, selection,
// undo and screen readers all use the native textarea. Autocomplete offers
// tables, columns (only that table's after "alias."), keywords and functions.
import { h } from '../ui.js';
import { tokenize, KEYWORDS, FUNCTIONS, format } from './sqlparse.js';

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function createEditor({ value, schema, onChange }) {
  const tableCols = Object.fromEntries(schema.tables.map((t) => [t.name, t.columns.map((c) => c.name)]));
  const allCols = [...new Set(Object.values(tableCols).flat())];
  const pre = h('pre', { class: 'sql-hl', 'aria-hidden': 'true' });
  const ta = h('textarea', { class: 'sql-editor', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'SQL editor',
    'aria-autocomplete': 'list', placeholder: 'SELECT ... FROM transactions ...   (Ctrl + Enter runs, Ctrl + Space suggests)' });
  const pop = h('div', { class: 'ac-pop', role: 'listbox', 'aria-label': 'Suggestions' });
  pop.hidden = true;
  const wrap = h('div', { class: 'sql-wrap' }, pre, ta, pop);
  ta.value = value || '';
  let items = [], active = 0, wordStart = 0;

  const paint = () => {
    pre.innerHTML = tokenize(ta.value).map((t) => {
      const cls = t.type === 'keyword' ? 'kw' : t.type === 'string' ? 'str' : t.type === 'number' ? 'num' : t.type === 'comment' ? 'cmt'
        : t.type === 'ident' && FUNCTIONS.includes(t.up) ? 'fn' : t.type === 'ident' && tableCols[t.text] ? 'tbl' : t.type === 'ident' && allCols.includes(t.text) ? 'col' : '';
      return cls ? `<span class="${cls}">${esc(t.text)}</span>` : esc(t.text);
    }).join('') + '\n';
    sync();
  };
  const sync = () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; };
  const changed = () => { paint(); onChange(ta.value); };

  // Aliases in the current SQL: FROM/JOIN table [AS] alias.
  const aliases = () => {
    const map = {};
    for (const m of ta.value.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_]\w*)(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?/gi)) {
      map[m[1]] = m[1];
      if (m[2] && !KEYWORDS.has(m[2].toUpperCase())) map[m[2]] = m[1];
    }
    return map;
  };
  const close = () => { pop.hidden = true; items = []; };
  const suggest = (force) => {
    const before = ta.value.slice(0, ta.selectionStart);
    const m = before.match(/([A-Za-z_]\w*)\.(\w*)$/) || before.match(/()(\w*)$/);
    const word = m[2];
    if (!force && word.length < 1) return close();
    wordStart = ta.selectionStart - word.length;
    let pool;
    if (m[1]) pool = (tableCols[aliases()[m[1]]] || []).map((c) => ({ text: c, kind: 'column' }));
    else {
      const inQuery = Object.values(aliases()).flatMap((t) => tableCols[t] || []);
      pool = [...new Set(inQuery)].map((c) => ({ text: c, kind: 'column' }))
        .concat(Object.keys(tableCols).map((t) => ({ text: t, kind: 'table' })))
        .concat(allCols.filter((c) => !inQuery.includes(c)).map((c) => ({ text: c, kind: 'column' })))
        .concat([...KEYWORDS].map((k) => ({ text: k, kind: 'keyword' })), FUNCTIONS.map((f) => ({ text: f, kind: 'function' })));
    }
    const w = word.toLowerCase();
    items = pool.filter((p) => p.text.toLowerCase().startsWith(w) && p.text.toLowerCase() !== w).slice(0, 8);
    if (!items.length) return close();
    active = 0;
    drawPop(before);
  };
  const drawPop = (before) => {
    const cs = getComputedStyle(ta);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
    const lines = before.split('\n');
    const lh = parseFloat(cs.lineHeight) || 20;
    pop.style.top = Math.min(ta.clientHeight - 8, lines.length * lh + parseFloat(cs.paddingTop) - ta.scrollTop + 4) + 'px';
    pop.style.left = Math.min(ta.clientWidth - 220, parseFloat(cs.paddingLeft) + ctx.measureText(lines[lines.length - 1]).width - ta.scrollLeft) + 'px';
    pop.replaceChildren(...items.map((it, i) => h('div', { class: 'ac-item' + (i === active ? ' on' : ''), role: 'option', 'aria-selected': i === active ? 'true' : 'false',
      onmousedown: (e) => { e.preventDefault(); accept(i); } }, h('span', {}, it.text), h('span', { class: 'ac-kind' }, it.kind))));
    pop.hidden = false;
  };
  const accept = (i) => {
    const it = items[i];
    const text = it.kind === 'function' ? it.text + '(' : it.text;
    ta.setRangeText(text, wordStart, ta.selectionStart, 'end');
    close();
    changed();
    ta.focus();
  };

  ta.addEventListener('input', () => { changed(); suggest(false); });
  ta.addEventListener('scroll', sync);
  ta.addEventListener('blur', () => setTimeout(close, 150));
  ta.addEventListener('keydown', (e) => {
    if (!pop.hidden) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; drawPop(ta.value.slice(0, ta.selectionStart)); return; }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') { e.preventDefault(); accept(active); return; }
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    }
    if (e.key === ' ' && e.ctrlKey) { e.preventDefault(); suggest(true); return; }
    if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); changed(); }
  });
  paint();
  return {
    el: wrap,
    get value() { return ta.value; },
    set value(v) { ta.value = v; paint(); },
    insert(text) { ta.focus(); ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); changed(); },
    format() { ta.value = format(ta.value); changed(); },
    focus() { ta.focus(); },
  };
}