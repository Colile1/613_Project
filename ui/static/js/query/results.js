// results.js : query results as a sortable table or an automatic chart, with export.
import { h, icon, clear, num, table, callout, chip } from '../ui.js';
import { lineChart, barChart } from '../charts.js';

const nf = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 });
const isNum = (v) => typeof v === 'number';
const looksTime = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);

// Picks a chart: first non-numeric column = labels; numeric columns = values.
function chartFor(res, rows) {
  const labelCol = res.columns.find((c) => rows.some((r) => r[c] !== null && !isNum(r[c])));
  const valueCols = res.columns.filter((c) => c !== labelCol && rows.some((r) => isNum(r[c]))).slice(0, 3);
  if (!labelCol || !valueCols.length) return h('div', { class: 'empty' }, 'Nothing to chart: a chart needs one text or time column for labels and at least one numeric column.');
  const colors = ['--s1', '--s2', '--s3'];
  if (rows.every((r) => r[labelCol] === null || looksTime(r[labelCol]) || /^\d{4}-\d{2}-\d{2}/.test(String(r[labelCol])))) {
    return lineChart({ series: valueCols.map((c, i) => ({ name: c, color: colors[i], points: rows.filter((r) => r[labelCol] !== null).map((r) => ({ t: String(r[labelCol]).length === 16 ? r[labelCol] + ':00Z' : r[labelCol], v: r[c] ?? 0 })) })), height: 280 });
  }
  return h('div', {}, valueCols.length > 1 ? h('p', { class: 'small muted' }, 'Showing ' + valueCols[0] + ' (bar charts show one measure).') : null,
    barChart({ items: rows.slice(0, 30).map((r) => ({ k: String(r[labelCol]), v: r[valueCols[0]] ?? 0 })), fmt: (v) => nf.format(v) }));
}

export function renderResults(box, res, sql, view, onView) {
  if (!res) return clear(box, h('div', { class: 'empty' }, 'Run a query to see results here (Ctrl + Enter).'));
  if (res.error) return clear(box, callout('error', [h('b', {}, 'Query failed. '), res.error], 'err'));
  const rows = res.rows.map((r) => Object.fromEntries(res.columns.map((c, i) => [c, r[i]])));
  const sortState = { key: null, dir: 'asc' };
  const out = h('div');
  const exportHref = (fmt) => '/api/sql/export?format=' + fmt + '&sql=' + encodeURIComponent(sql);
  const drawTable = () => {
    const sorted = sortState.key ? [...rows].sort((a, b) => {
      const x = a[sortState.key], y = b[sortState.key];
      if (x === y) return 0; if (x === null) return 1; if (y === null) return -1;
      return (x < y ? -1 : 1) * (sortState.dir === 'asc' ? 1 : -1);
    }) : rows;
    clear(out, table(res.columns.map((c) => ({ key: c, label: c, num: rows.some((r) => isNum(r[c])),
      fmt: (v) => (v === null ? h('span', { class: 'muted' }, 'null') : isNum(v) ? nf.format(v) : String(v)) })), sorted,
      { empty: 'The query returned no rows.', height: '520px',
        sort: { key: sortState.key, dir: sortState.dir, onSort: (k) => { sortState.dir = sortState.key === k && sortState.dir === 'asc' ? 'desc' : 'asc'; sortState.key = k; drawTable(); } } }));
  };
  clear(box,
    h('div', { class: 'result-bar' },
      h('div', { class: 'chips' }, chip(num(res.row_count) + ' rows', 'on', 'table_rows'), chip(res.ms + ' ms', '', 'timer'),
        res.truncated ? chip('first 5 000 rows shown - export for all', 'warn', 'warning') : null),
      h('div', { class: 'row' },
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Result view' },
          h('button', { class: view === 'table' ? 'on' : '', onclick: () => onView('table') }, icon('table'), 'Table'),
          h('button', { class: view === 'chart' ? 'on' : '', onclick: () => onView('chart') }, icon('bar_chart'), 'Chart')),
        h('a', { class: 'btn tonal sm', href: exportHref('csv') }, icon('download'), 'CSV'),
        h('a', { class: 'btn tonal sm', href: exportHref('json') }, icon('data_object'), 'JSON'))),
    out);
  if (view === 'chart') clear(out, chartFor(res, rows)); else drawTable();
}