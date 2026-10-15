// builder.js : the visual (drag-and-drop) query builder.
// Zones: Tables & joins, Columns, Filters, Group by, Having, Sort, Limit. Drop a
// column from another table and it is joined automatically (joins.js). Anything
// SQL can express fits: calculated columns, custom conditions, custom sort.
// Every zone also has a "+" menu, so the builder works without a mouse.
import { h, icon, clear, snackbar } from '../ui.js';
import { makeDraggable, dropZone } from './dnd.js';
import { AGGS, OPS, NO_VALUE, JOIN_TYPES, emptyState, sources, sourceName, colText, alias, autoGroup } from './sqlgen.js';
import { suggestJoin } from './joins.js';
import { zone, addMenu, removeBtn, field, matchToggle } from './builder_parts.js';

const TEXT_AGGS = new Set(['', 'COUNT', 'COUNT_DISTINCT', 'MIN', 'MAX']);

export function tableTypes(schema) {
  return Object.fromEntries(schema.tables.map((t) => [t.name, Object.fromEntries(t.columns.map((c) => [c.name, c.type]))]));
}

export function renderBuilder(box, state, schema, onChange) {
  const T = tableTypes(schema);
  const srcs = sources(state);
  const redraw = () => { onChange(); renderBuilder(box, state, schema, onChange); };
  const soft = () => onChange();
  const label = (c) => (state.joins.length && c.src ? `${c.src}.${c.field}` : c.field);
  const typeOf = (c) => (T[(srcs.find((s) => s.name === c.src) || {}).table] || {})[c.field];
  const fieldGroups = (filter = () => true) => srcs.map((s) => [s.name + (s.name !== s.table ? ` (${s.table})` : ''),
    Object.keys(T[s.table] || {}).filter((f) => filter(T[s.table][f])).map((f) => [JSON.stringify({ src: s.name, field: f }), f])]);

  const setBase = (name) => {
    if (name === state.table) return;
    const keep = T[name] || {};
    const fits = (x) => x.expr !== undefined || x.field === '*' || keep[x.field];
    Object.assign(state, { ...emptyState(name), limit: state.limit, offset: state.offset, distinct: state.distinct,
      columns: state.columns.filter(fits).map((c) => (c.src ? { ...c, src: name } : c)),
      filters: state.filters.filter(fits).map((f) => (f.src ? { ...f, src: name } : f)), sorts: state.sorts });
  };
  const addJoin = (table) => {
    const s = suggestJoin(schema, state, table);
    state.joins.push({ type: 'INNER', table, alias: s.alias, on: s.on, using: '' });
    snackbar(s.on ? `Joined ${table} on ${s.on}` + (s.why ? ` (${s.why})` : '') : `Joined ${table} - write its ON condition in Tables & joins`);
    return s.alias || table;
  };
  // Source name for a dropped column: uses the table already in the query, or joins it.
  const srcFor = (p) => {
    if (!state.table) { setBase(p.table); return sourceName(state); }
    const existing = sources(state).find((s) => s.table === p.table);
    return existing ? existing.name : addJoin(p.table);
  };
  const fromPayload = (p) => (p.kind === 'column' ? { src: srcFor(p), field: p.field } : p.kind === 'chip' ? p.item : null);

  // Tables & joins
  const joinRows = state.joins.map((j, i) => h('span', { class: 'qchip join-chip' },
    h('select', { 'aria-label': 'Join type', onchange: (e) => { j.type = e.target.value; redraw(); } }, JOIN_TYPES.map((t) => h('option', { value: t, selected: t === j.type }, t + ' JOIN'))),
    h('b', {}, j.table),
    field(j.alias, 'alias', (v) => { j.alias = v.trim(); soft(); }, { width: '80px', label: 'Alias for ' + j.table }),
    j.type === 'CROSS' || j.type === 'NATURAL' ? null : j.using
      ? h('span', {}, 'USING ', field(j.using, 'column', (v) => { j.using = v; soft(); }, { width: '140px', mono: true }))
      : h('span', { class: 'row', style: { gap: '4px' } }, 'ON', field(j.on, 'a.card_id = b.card_id', (v) => { j.on = v; soft(); }, { width: '260px', mono: true, label: 'Join condition' })),
    removeBtn(() => { state.joins.splice(i, 1); redraw(); })));
  const tables = schema.tables.map((t) => [t.name, `${t.name} (${t.kind}, ${t.rows} rows)`]);
  const source = zone('Tables & joins', 'table_chart', 'Drag a table (or any column) here', [
    h('select', { 'aria-label': 'Base table', onchange: (e) => { setBase(e.target.value); redraw(); } },
      h('option', { value: '' }, 'Choose a table...'), tables.map(([v, t]) => h('option', { value: v, selected: v === state.table }, t))),
    state.table ? field(state.alias, 'alias', (v) => { state.alias = v.trim(); soft(); }, { width: '80px', label: 'Alias for ' + state.table }) : null,
    ...joinRows],
  (p) => { if (p.kind === 'table') { if (!state.table) setBase(p.table); else addJoin(p.table); } else if (p.kind === 'column') srcFor(p); redraw(); },
  addMenu('join a table', [['Tables', tables]], (v) => { addJoin(v); redraw(); }, !state.table));

  // Columns
  const colChips = state.columns.map((c, i) => makeDraggable(h('span', { class: 'qchip' },
    c.expr !== undefined ? [icon('function'), field(c.expr, 'expression, e.g. ROUND(amount, 0)', (v) => { c.expr = v; soft(); }, { width: '240px', mono: true, label: 'Calculated column' })]
      : c.field === '*' ? 'COUNT(*)'
      : [label(c), h('select', { 'aria-label': 'Aggregate for ' + c.field, onchange: (e) => { c.agg = e.target.value; delete c.as; redraw(); } },
          AGGS.filter(([v]) => typeOf(c) !== 'TEXT' || TEXT_AGGS.has(v)).map(([v, t]) => h('option', { value: v, selected: v === (c.agg || '') }, t)))],
    field(c.as, alias(c) || 'name', (v) => { c.as = v.trim() || undefined; soft(); }, { width: '90px', label: 'Output name' }),
    removeBtn(() => { state.columns.splice(i, 1); redraw(); })), { kind: 'chip', item: c }));
  const columns = zone('Columns', 'view_column', 'Drop columns here - none means all columns (*)', colChips,
    (p) => { const it = fromPayload(p); if (it) state.columns.push(it.expr !== undefined ? { expr: it.expr } : { src: it.src, field: it.field, agg: it.agg || '' }); redraw(); },
    [h('label', { class: 'row small', title: 'Remove duplicate rows' }, h('input', { type: 'checkbox', checked: state.distinct, onchange: (e) => { state.distinct = e.target.checked; redraw(); } }), 'Distinct'),
     addMenu('column', [...fieldGroups(), ['Other', [['*', 'Row count - COUNT(*)'], ['calc', 'Calculated column (any expression)...']]]],
       (v) => { state.columns.push(v === '*' ? { field: '*', agg: 'COUNT' } : v === 'calc' ? { expr: '' } : { ...JSON.parse(v), agg: '' }); redraw(); }, !state.table)]);

  // Filters
  const filterChips = state.filters.map((f, i) => h('span', { class: 'qchip' },
    f.expr !== undefined ? [icon('code'), field(f.expr, "any condition, e.g. amount > 2 * 500 OR city = 'Durban'", (v) => { f.expr = v; soft(); }, { width: '300px', mono: true, label: 'Custom condition' })]
      : [label(f), h('select', { 'aria-label': 'Operator', onchange: (e) => { f.op = e.target.value; redraw(); } }, OPS.map((o) => h('option', { value: o, selected: o === f.op }, o))),
         NO_VALUE.has(f.op) ? null : field(f.value, f.op === 'in list' ? 'a, b, c' : typeOf(f) === 'BOOLEAN' ? 'true / false' : 'value', (v) => { f.value = v; delete f.kind; soft(); }, { label: 'Value for ' + f.field }),
         f.op === 'between' ? ['and', field(f.value2, 'value', (v) => { f.value2 = v; soft(); }, { label: 'Upper value' })] : null],
    removeBtn(() => { state.filters.splice(i, 1); redraw(); })));
  const filters = zone('Filters (WHERE)', 'filter_alt', 'Drop a column here to filter on it', filterChips,
    (p) => { const it = fromPayload(p); if (it && it.field !== '*') state.filters.push(it.expr !== undefined ? { expr: it.expr + ' IS NOT NULL' } : { src: it.src, field: it.field, op: '=', value: '' }); redraw(); },
    [matchToggle(state.match, (m) => { state.match = m; redraw(); }),
     addMenu('filter', [...fieldGroups(), ['Other', [['custom', 'Custom condition (any SQL)...']]]],
       (v) => { state.filters.push(v === 'custom' ? { expr: '' } : { ...JSON.parse(v), op: '=', value: '' }); redraw(); }, !state.table)]);

  // Group by and Having
  const auto = autoGroup(state);
  const custom = state.groupBy !== null && state.groupBy !== undefined;
  const group = h('div', { class: 'row', style: { marginTop: '12px' } }, h('h4', { class: 'row' }, icon('workspaces'), 'Group by'),
    custom ? [field(state.groupBy, state.groupBy === '' ? 'no GROUP BY' : 'columns or expressions', (v) => { state.groupBy = v; soft(); }, { width: '320px', mono: true, label: 'Group by' }),
      h('button', { class: 'btn text sm', onclick: () => { state.groupBy = null; redraw(); } }, 'Automatic')]
      : [h('span', { class: 'small muted' }, auto.length ? 'automatic: ' + auto.join(', ') : 'none (add an aggregate column to group)'),
         h('button', { class: 'btn text sm', onclick: () => { state.groupBy = auto.join(', '); redraw(); } }, 'Customize')]);
  const havingChips = state.having.map((f, i) => h('span', { class: 'qchip' }, icon('code'),
    field(f.expr, 'e.g. COUNT(*) > 5', (v) => { f.expr = v; soft(); }, { width: '240px', mono: true, label: 'Group condition' }), removeBtn(() => { state.having.splice(i, 1); redraw(); })));
  const having = zone('Having (filters on groups)', 'rule', 'Drop an aggregated column chip here, or add a condition such as COUNT(*) > 5', havingChips,
    (p) => { const it = p.kind === 'chip' ? p.item : null; state.having.push({ expr: it && (it.agg || it.field === '*' || it.expr) ? colText(state, it) + ' > 0' : '' }); redraw(); },
    [matchToggle(state.havingMatch, (m) => { state.havingMatch = m; redraw(); }),
     h('button', { class: 'btn text sm', disabled: !state.table, onclick: () => { state.having.push({ expr: '' }); redraw(); } }, icon('add'), 'condition')]);

  // Sort
  const sortChips = state.sorts.map((s, i) => h('span', { class: 'qchip' },
    field(s.expr, 'column or expression', (v) => { s.expr = v; soft(); }, { width: '180px', mono: true, label: 'Sort by' }),
    h('button', { class: 'x', title: 'Direction: ' + (s.dir || 'default'), onclick: () => { s.dir = s.dir === 'desc' ? 'asc' : 'desc'; redraw(); } }, icon(s.dir === 'asc' ? 'arrow_upward' : 'arrow_downward')),
    removeBtn(() => { state.sorts.splice(i, 1); redraw(); })));
  const outputs = state.columns.map((c) => alias(c) || colText(state, c)).filter(Boolean);
  const sort = zone('Sort (ORDER BY)', 'sort', 'Drop a column or a column chip here', sortChips,
    (p) => { const it = fromPayload(p); if (it) state.sorts.push({ expr: alias(it) || colText(state, it), dir: 'desc' }); redraw(); },
    addMenu('sort', [['Output columns', outputs.map((o) => [o, o])], ...fieldGroups().map(([g, opts]) => [g, opts.map(([v, t]) => [colText(state, JSON.parse(v)), t])]), ['Other', [['__custom', 'Custom expression...']]]],
      (v) => { state.sorts.push({ expr: v === '__custom' ? '' : v, dir: 'desc' }); redraw(); }, !state.table));

  clear(box, source, columns, filters, group, having, sort,
    h('div', { class: 'row', style: { marginTop: '12px' } },
      h('label', { class: 'row small' }, 'Limit', field(state.limit, 'all rows', (v) => { state.limit = v.trim(); soft(); }, { width: '90px', label: 'Limit' })),
      h('label', { class: 'row small' }, 'Offset', field(state.offset, '0', (v) => { state.offset = v.trim(); soft(); }, { width: '70px', label: 'Offset' })),
      h('button', { class: 'btn text sm', onclick: () => { Object.assign(state, emptyState(state.table)); redraw(); } }, icon('backspace'), 'Clear')));
}