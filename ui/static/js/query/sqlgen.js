// sqlgen.js : builder layout -> SQL. Pure functions only.
// A layout holds a base table with optional joins, columns (plain, aggregated or
// calculated), filters and HAVING conditions (structured or custom, matched with
// AND or OR), an automatic or custom GROUP BY, sort expressions, LIMIT and OFFSET.

export const AGGS = [['', 'value'], ['COUNT', 'count'], ['COUNT_DISTINCT', 'count distinct'], ['SUM', 'sum'], ['AVG', 'average'], ['MIN', 'min'], ['MAX', 'max']];
export const OPS = ['=', '!=', '>', '>=', '<', '<=', 'contains', 'starts with', 'ends with', 'like', 'in list', 'between', 'is empty', 'is not empty'];
export const NO_VALUE = new Set(['is empty', 'is not empty']);
export const JOIN_TYPES = ['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL'];
const NUMERIC = new Set(['INTEGER', 'REAL', 'BOOLEAN']);
const AGG_IN_EXPR = /\b(COUNT|SUM|AVG|MIN|MAX|TOTAL|GROUP_CONCAT)\s*\(/i;

export const emptyState = (table = '') => ({ table, alias: '', joins: [], distinct: false, columns: [], filters: [], match: 'all',
  groupBy: null, having: [], havingMatch: 'all', sorts: [], limit: 100, offset: '' });

// Fills in fields missing from layouts saved by older versions.
export const normalize = (s) => {
  const st = { ...emptyState(), ...(s || {}) };
  st.sorts = st.sorts.map((x) => (x.expr !== undefined ? x : { expr: x.field === '*' ? alias(x) : x.agg ? alias(x) || x.field : x.field, dir: x.dir || 'desc' }));
  const base = st.alias || st.table;
  const withSrc = (x) => (x.expr === undefined && x.field && x.field !== '*' && !x.src ? { ...x, src: base } : x);
  st.columns = st.columns.map(withSrc);
  st.filters = st.filters.map(withSrc);
  return st;
};

export const sourceName = (state, j) => (j ? j.alias || j.table : state.alias || state.table);
export const sources = (state) => (state.table ? [{ name: sourceName(state), table: state.table }, ...state.joins.map((j) => ({ name: sourceName(state, j), table: j.table }))] : []);

export function ref(state, c) {
  const qualify = c.q ?? state.joins.length > 0;
  return c.src && qualify ? `${c.src}.${c.field}` : c.field;
}

export function colText(state, c) {
  if (c.expr !== undefined) return c.expr;
  if (c.field === '*') return 'COUNT(*)';
  if (!c.agg) return ref(state, c);
  return c.agg === 'COUNT_DISTINCT' ? `COUNT(DISTINCT ${ref(state, c)})` : `${c.agg}(${ref(state, c)})`;
}

// Output name: the user's own alias, else a readable default for aggregates.
// as === '' means "written without a name" (kept that way so results match).
export function alias(c) {
  if (c.as) return c.as;
  if (c.as === '') return null;
  if (c.expr !== undefined) return null;
  if (c.field === '*') return 'row_count';
  if (!c.agg) return null;
  return (c.agg === 'COUNT_DISTINCT' ? 'distinct' : c.agg.toLowerCase()) + '_' + c.field;
}

export const isAggregate = (c) => (c.expr !== undefined ? AGG_IN_EXPR.test(c.expr) && !/\bOVER\b/i.test(c.expr) : !!c.agg || c.field === '*');

// The GROUP BY the builder would write: every non-aggregated column, when any column aggregates.
export function autoGroup(state) {
  if (!state.columns.some(isAggregate)) return [];
  return state.columns.filter((c) => !isAggregate(c) && !(c.expr !== undefined && /\bOVER\b/i.test(c.expr))).map((c) => colText(state, c));
}

function typeOf(state, f, types) {
  const src = sources(state).find((s) => s.name === f.src);
  return ((types || {})[src ? src.table : state.table] || {})[f.field];
}

export function literal(value, kind, type) {
  const v = String(value ?? '').trim();
  if (kind === 's') return "'" + v.replace(/'/g, "''") + "'";
  if (kind === 'n') return v;
  if (type === 'BOOLEAN' && /^(true|false|1|0)$/i.test(v)) return /^(true|1)$/i.test(v) ? '1' : '0';
  if (NUMERIC.has(type) && /^-?\d+(\.\d+)?$/.test(v)) return v;
  return "'" + v.replace(/'/g, "''") + "'";
}

export function conditionText(state, f, types) {
  if (f.expr !== undefined) return f.expr.trim();
  const r = ref(state, f), t = typeOf(state, f, types), esc = (v) => String(v ?? '').replace(/'/g, "''");
  switch (f.op) {
    case 'is empty': return `${r} IS NULL`;
    case 'is not empty': return `${r} IS NOT NULL`;
    case 'contains': return `${r} LIKE '%${esc(f.value)}%'`;
    case 'starts with': return `${r} LIKE '${esc(f.value)}%'`;
    case 'ends with': return `${r} LIKE '%${esc(f.value)}'`;
    case 'like': return `${r} LIKE '${esc(f.value)}'`;
    case 'in list': return `${r} IN (${String(f.value ?? '').split(',').map((v) => literal(v, f.kind, t)).join(', ')})`;
    case 'between': return `${r} BETWEEN ${literal(f.value, f.kind, t)} AND ${literal(f.value2, f.kind, t)}`;
    default: return `${r} ${f.op} ${literal(f.value, f.kind, t)}`;
  }
}

const filled = (f) => (f.expr !== undefined ? f.expr.trim() !== '' : NO_VALUE.has(f.op) || (String(f.value ?? '') !== '' && (f.op !== 'between' || String(f.value2 ?? '') !== '')));

// Builder layout -> SQL text (empty string when no table is chosen).
export function generate(state, types = {}) {
  if (!state.table) return '';
  const cols = state.columns.filter((c) => c.expr === undefined || c.expr.trim());
  const items = cols.map((c) => (alias(c) ? `${colText(state, c)} AS ${alias(c)}` : colText(state, c)));
  const lines = [`SELECT ${state.distinct ? 'DISTINCT ' : ''}${items.length ? items.join(',\n       ') : '*'}`,
    `FROM ${state.table}${state.alias ? ' AS ' + state.alias : ''}`];
  for (const j of state.joins) {
    if (j.comma) { lines[lines.length - 1] += `, ${j.table}${j.alias ? ' AS ' + j.alias : ''}`; continue; }
    const kind = j.type === 'INNER' ? 'JOIN' : j.type + ' JOIN';
    const cond = j.type === 'CROSS' || j.type === 'NATURAL' ? '' : j.using ? ` USING (${j.using})` : j.on ? ` ON ${j.on}` : '';
    lines.push(`${kind} ${j.table}${j.alias ? ' AS ' + j.alias : ''}${cond}`);
  }
  const join = (list, match) => list.join(match === 'any' ? '\n   OR ' : '\n  AND ');
  const where = state.filters.filter(filled).map((f) => conditionText(state, f, types));
  if (where.length) lines.push('WHERE ' + join(where, state.match));
  const group = state.groupBy !== null && state.groupBy !== undefined ? state.groupBy : autoGroup(state).join(', ');
  if (group) lines.push('GROUP BY ' + group);
  const having = state.having.filter((f) => f.expr && f.expr.trim()).map((f) => f.expr.trim());
  if (having.length) lines.push('HAVING ' + join(having, state.havingMatch));
  const sorts = state.sorts.filter((s) => s.expr && s.expr.trim());
  if (sorts.length) lines.push('ORDER BY ' + sorts.map((s) => s.expr.trim() + (s.dir ? ' ' + s.dir.toUpperCase() : '')).join(', '));
  if (String(state.limit ?? '') !== '') lines.push(`LIMIT ${state.limit}` + (String(state.offset ?? '') !== '' ? ` OFFSET ${state.offset}` : ''));
  return lines.join('\n');
}