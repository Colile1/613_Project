// query.js : "Query the warehouse" - drag-and-drop builder or SQL, switchable at any time.
// Builder -> SQL always works (the SQL is generated). SQL -> builder works for any single
// SELECT (joins, OR, CASE, window functions included); WITH / UNION / sub-queries in FROM
// can be saved as a view, which the builder then uses like a table.
import { h, icon, clear, num, time, card, pageHead, snackbar, dialog, code, tabs, promptDialog, confirmDialog } from '../ui.js';
import { get, post } from '../api.js';
import { pref, setPref } from '../prefs.js';
import { renderSchema } from '../query/schema_panel.js';
import { renderBuilder, tableTypes } from '../query/builder.js';
import { renderResults } from '../query/results.js';
import { generate, emptyState, normalize } from '../query/sqlgen.js';
import { parse } from '../query/sqlparse.js';
import { createEditor } from '../query/editor.js';

let S, schema, refs = {}, result = null, ranSql = '', resultView = 'table', stale = false;

const types = () => tableTypes(schema);
const currentSql = () => (S.mode === 'builder' ? generate(S.builder, types()) : S.sql);
const save = () => setPref('query.state', S);

function showResults() {
  renderResults(refs.results, result, ranSql, resultView, onView);
}
function onView(v) { resultView = v; setPref('query.view', v); showResults(); }

function editorSql() {
  refs.ed = createEditor({ value: S.sql, schema, onChange: (v) => { S.sql = v; save(); } });
  return h('div', {},
    h('div', { class: 'editor-tools' },
      h('button', { class: 'btn text sm', onclick: () => refs.ed.format(), title: 'Upper-case keywords, one clause per line' }, icon('format_align_left'), 'Format'),
      h('button', { class: 'btn text sm', onclick: () => saveView(), title: 'Save this query as a view you can use like a table' }, icon('layers'), 'Save as view')),
    refs.ed.el,
    h('p', { class: 'small muted', style: { marginTop: '6px' } },
      'Read-only SQLite. Autocomplete suggests tables, columns (type an alias and a dot for that table\u2019s columns), keywords and functions - Ctrl + Space to open it, Enter or Tab to accept. Ctrl + Enter runs.'));
}
function renderEditor() {
  if (S.mode === 'sql') return clear(refs.editor, editorSql());
  const preview = h('div', { class: 'sql-preview' });
  const showPreview = () => clear(preview, h('div', { class: 'small muted', style: { marginBottom: '4px' } }, 'Generated SQL - switch to SQL to edit it:'), code(currentSql() || '-- choose a table'));
  const box = h('div');
  renderBuilder(box, S.builder, schema, () => { save(); showPreview(); });
  refs.ed = null;
  showPreview();
  clear(refs.editor, box, preview);
}

function insertText(text) {
  if (refs.ed) refs.ed.insert(text);
}

function setMode(mode) {
  if (mode === S.mode) return;
  if (mode === 'sql') {
    const sql = currentSql();
    if (sql) S.sql = sql;
    S.mode = 'sql';
  } else if (!S.sql.trim()) {
    S.mode = 'builder';
  } else {
    const p = parse(S.sql, types());
    if (!p.ok) return cannotShow(p.reason);
    S.builder = p.state;
    S.mode = 'builder';
  }
  save();
  renderHead();
  renderEditor();
}

function cannotShow(reason) {
  const d = dialog('Use this query in the builder?', h('div', {},
    h('p', {}, 'The builder cannot open this query directly because ' + reason + '.'),
    h('p', {}, h('b', {}, 'Save it as a view'), ' and it becomes a table in the schema panel: the builder can then filter, group, join and chart it like any other table.'),
    h('p', { class: 'muted' }, 'Or keep working in SQL - nothing changes.')),
    [h('button', { class: 'btn', onclick: async () => { d.remove(); const name = await saveView(); if (name) { S.builder = emptyState(name); S.mode = 'builder'; save(); renderHead(); renderEditor(); run(); } } }, icon('layers'), 'Save as view'),
     h('button', { class: 'btn tonal', onclick: () => d.remove() }, 'Keep SQL')]);
}

// Saves the current SQL as a named view; returns its name (or null).
async function saveView() {
  const sql = currentSql();
  if (!sql.trim()) { snackbar('Write a query first.'); return null; }
  const name = await promptDialog('Save as view', 'View name (lower-case, e.g. big_spenders)', '');
  if (!name) return null;
  const r = await post('/api/sql/view', { name: name.trim(), sql });
  if (r.error) { snackbar(r.error); return null; }
  await reloadSchema();
  snackbar(`View "${r.name}" saved - it is now in the schema panel`);
  return r.name;
}

async function reloadSchema() {
  schema = await get('/api/sql/schema');
  drawSchema();
}

function drawSchema() {
  renderSchema(refs.schema, schema, {
    onTable: (t) => {
      if (S.mode === 'sql') return insertText(t);
      S.builder = { ...emptyState(t), limit: S.builder.limit }; save(); renderEditor();
    },
    onColumn: (t, c) => {
      if (S.mode === 'sql') return insertText(c);
      const b = S.builder;
      if (!b.table) Object.assign(b, emptyState(t));
      const src = [b.alias || b.table, ...b.joins.map((j) => j.alias || j.table)].find((n, i) => (i === 0 ? b.table : b.joins[i - 1].table) === t);
      if (!src) { snackbar('Drag the column into a zone to join ' + t + ' automatically.'); return; }
      b.columns.push({ src, field: c, agg: '' }); save(); renderEditor();
    },
    onDeleteView: async (name) => {
      if (!(await confirmDialog('Delete view?', `Delete the saved view "${name}"? Queries that use it will stop working.`))) return;
      await post('/api/sql/view/delete', { name });
      await reloadSchema();
      snackbar('View deleted');
    },
  });
}
function remember(sql) {
  const history = pref('query.history', []).filter((x) => x.sql !== sql);
  history.unshift({ sql, at: new Date().toISOString() });
  setPref('query.history', history.slice(0, 20));
}

async function run() {
  const sql = currentSql();
  if (!sql.trim()) return snackbar(S.mode === 'builder' ? 'Choose a table first.' : 'Write a query first.');
  clear(refs.results, h('div', { class: 'empty' }, 'Running...'));
  result = await post('/api/sql/query', { sql });
  ranSql = sql;
  stale = false;
  if (!result.error) remember(sql);
  if (result.snapshot) schema.snapshot = result.snapshot;
  renderSnapshot();
  showResults();
}

// Loads a query (example, saved or history) into the right mode.
function load(sql, builder, preferredMode) {
  if (builder && preferredMode === 'builder') { S.builder = normalize(builder); S.sql = sql; S.mode = 'builder'; }
  else {
    const p = parse(sql, types());
    S.sql = sql;
    if (S.mode === 'builder' && p.ok) S.builder = p.state; else S.mode = 'sql';
  }
  save(); renderHead(); renderEditor(); run();
}

async function library() {
  const saved = (await get('/api/sql/saved')).queries;
  let tab = 'examples';
  const body = h('div');
  const row = (title, sql, actions) => h('div', { class: 'card outlined', style: { padding: '10px 14px' } },
    h('div', { class: 'row between' }, h('b', {}, title), h('div', { class: 'row' }, actions)),
    h('pre', { class: 'code', style: { maxHeight: '96px', marginTop: '6px' } }, sql));
  const open = (sql, builder, mode) => h('button', { class: 'btn sm', onclick: () => { d.remove(); load(sql, builder, mode); } }, 'Open');
  const del = (q) => h('button', { class: 'icon-btn', title: 'Delete', onclick: async () => {
    if (!(await confirmDialog('Delete saved query?', 'Delete "' + q.name + '"?'))) return;
    await post('/api/sql/delete', { id: q.id });
    saved.splice(saved.indexOf(q), 1);
    draw();
  } }, icon('delete'));
  const items = () => {
    const history = pref('query.history', []);
    if (tab === 'examples') return schema.examples.map((e) => row(e.name, e.sql, [open(e.sql)]));
    if (tab === 'saved') return saved.length ? saved.map((q) => row(q.name + ' \u00b7 ' + q.mode, q.sql, [open(q.sql, q.builder, q.mode), del(q)]))
      : [h('div', { class: 'empty' }, 'No saved queries yet. Use Save to keep one.')];
    return history.length ? history.map((x) => row(new Date(x.at).toLocaleString('en-ZA', { hour12: false }), x.sql, [open(x.sql)]))
      : [h('div', { class: 'empty' }, 'Queries you run appear here.')];
  };
  const draw = () => clear(body,
    tabs([{ key: 'examples', label: 'Examples', count: schema.examples.length }, { key: 'saved', label: 'Saved', count: saved.length },
      { key: 'history', label: 'History', count: pref('query.history', []).length }], tab, (k) => { tab = k; draw(); }),
    h('div', { class: 'grid', style: { marginTop: '12px', maxHeight: '55vh', overflow: 'auto' } }, items()));
  const d = dialog('Query library', body);
  draw();
}

async function saveQuery() {
  const sql = currentSql();
  if (!sql.trim()) return snackbar('Nothing to save yet.');
  const name = await promptDialog('Save query', 'Name', S.name || '');
  if (!name) return;
  await post('/api/sql/save', { name, mode: S.mode, sql, builder: S.mode === 'builder' ? S.builder : null });
  S.name = name; save();
  snackbar('Saved "' + name + '" - find it under Library');
}

function renderHead() {
  clear(refs.head, pageHead('Warehouse', 'Query the warehouse',
    'Build a query by dragging tables and columns - drop a column from another table and it joins automatically - or write SQL with highlighting and autocomplete. Switch between the two at any time; queries run on a read-only copy of the current session\u2019s warehouse.',
    [h('div', { class: 'segmented', role: 'group', 'aria-label': 'Query mode' },
       h('button', { class: S.mode === 'builder' ? 'on' : '', 'aria-pressed': S.mode === 'builder' ? 'true' : 'false', onclick: () => setMode('builder') }, icon('drag_indicator'), 'Drag & drop'),
       h('button', { class: S.mode === 'sql' ? 'on' : '', 'aria-pressed': S.mode === 'sql' ? 'true' : 'false', onclick: () => setMode('sql') }, icon('code'), 'SQL')),
     h('button', { class: 'btn tonal', onclick: library }, icon('menu_book'), 'Library'),
     h('button', { class: 'btn tonal', onclick: saveQuery }, icon('bookmark_add'), 'Save'),
     h('button', { class: 'btn', onclick: run, title: 'Run (Ctrl + Enter)' }, icon('play_arrow'), 'Run')]));
}

function renderSnapshot() {
  const s = schema.snapshot || {};
  clear(refs.snapshot, h('div', { class: 'row between small muted' },
    h('span', {}, `Snapshot of session "${s.session}" \u00b7 ${num(s.events)} events \u00b7 watermark ${time(s.watermark)}`),
    stale ? h('span', { class: 'chip warn' }, icon('update'), 'New data arrived - run again to include it') : null));
}

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.body.contains(refs.editor)) { e.preventDefault(); run(); }
}

export default {
  async mount(root, ctx) {
    S = { mode: 'builder', sql: '', builder: emptyState('transactions'), ...pref('query.state', {}) };
    S.builder = normalize(S.builder);
    resultView = pref('query.view', 'table');
    schema = await get('/api/sql/schema');
    refs = { head: h('div'), snapshot: h('div'), editor: h('div'), results: h('div'), schema: h('div', { class: 'card tonal schema-panel' }) };
    drawSchema();
    root.append(refs.head, refs.snapshot,
      h('div', { class: 'query-layout' }, refs.schema,
        h('div', { class: 'grid' }, card(null, null, refs.editor), card('Results', null, refs.results))));
    renderHead(); renderSnapshot(); renderEditor(); showResults();
    document.removeEventListener('keydown', onKey);
    document.addEventListener('keydown', onKey);
    if (pref('query.autorun', false)) { setPref('query.autorun', false); run(); }
  },
  update() { stale = true; renderSnapshot(); },
};