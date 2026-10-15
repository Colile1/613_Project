// sqlparse.js : SQL tokenizer, SELECT parser and formatter for the Query page.
// parse() turns a SELECT into a builder layout; anything it cannot place in a
// structured box becomes a calculated column / custom condition, so almost any
// single SELECT opens in the builder. Only WITH, UNION/INTERSECT/EXCEPT,
// sub-queries in FROM and multiple statements stay SQL-only (use "Save as view").
import { emptyState, autoGroup } from './sqlgen.js';

export const KEYWORDS = new Set(('SELECT DISTINCT ALL FROM WHERE AND OR NOT IN IS NULL LIKE GLOB BETWEEN GROUP BY HAVING ORDER ASC DESC LIMIT ' +
  'OFFSET AS JOIN LEFT RIGHT FULL INNER OUTER CROSS NATURAL ON USING UNION INTERSECT EXCEPT WITH RECURSIVE CASE WHEN THEN ELSE END ' +
  'EXISTS CAST OVER PARTITION ROWS RANGE GROUPS PRECEDING FOLLOWING UNBOUNDED CURRENT ROW COLLATE ESCAPE NULLS FIRST LAST FILTER WINDOW VALUES TRUE FALSE').split(' '));
export const FUNCTIONS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'TOTAL', 'GROUP_CONCAT', 'ROUND', 'ABS', 'LENGTH', 'LOWER', 'UPPER', 'SUBSTR', 'TRIM',
  'REPLACE', 'INSTR', 'COALESCE', 'IFNULL', 'NULLIF', 'IIF', 'PRINTF', 'JULIANDAY', 'DATE', 'TIME', 'DATETIME', 'STRFTIME', 'UNIXEPOCH',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE', 'CAST'];
const AGG_FNS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);
const JOIN_WORDS = new Set(['JOIN', 'LEFT', 'RIGHT', 'FULL', 'INNER', 'CROSS', 'NATURAL']);

export function tokenize(sql) {
  const s = String(sql ?? ''), out = [];
  let i = 0;
  const push = (type, start) => out.push({ type, text: s.slice(start, i), up: s.slice(start, i).toUpperCase(), start, end: i });
  while (i < s.length) {
    const ch = s[i], start = i;
    if (/\s/.test(ch)) { while (i < s.length && /\s/.test(s[i])) i++; push('ws', start); continue; }
    if (ch === '-' && s[i + 1] === '-') { while (i < s.length && s[i] !== '\n') i++; push('comment', start); continue; }
    if (ch === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; push('comment', start); continue; }
    if (ch === "'") { i++; while (i < s.length) { if (s[i] === "'" && s[i + 1] === "'") i += 2; else if (s[i++] === "'") break; } push('string', start); continue; }
    if (ch === '"' || ch === '`' || ch === '[') { const close = ch === '[' ? ']' : ch; i++; while (i < s.length && s[i] !== close) i++; i++; push('qident', start); continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(s[i + 1] || ''))) { while (i < s.length && /[0-9.]/.test(s[i])) i++; push('number', start); continue; }
    if (/[A-Za-z_]/.test(ch)) { while (i < s.length && /[A-Za-z0-9_$]/.test(s[i])) i++; push(KEYWORDS.has(s.slice(start, i).toUpperCase()) ? 'keyword' : 'ident', start); continue; }
    const two = s.slice(i, i + 2);
    if (['<=', '>=', '<>', '!=', '==', '||'].includes(two)) { i += 2; push('op', start); continue; }
    i++;
    push('(),;.'.includes(ch) ? 'punct' : 'op', start);
  }
  return out;
}

const unquote = (t) => (t.type === 'qident' ? t.text.slice(1, -1) : t.text);
const isName = (t) => t && (t.type === 'ident' || t.type === 'qident');

// Splits [a, b) at depth 0 (outside parentheses and CASE ... END) where isSep says so.
function splitTop(toks, a, b, isSep) {
  const parts = []; let depth = 0, cases = 0, start = a, between = false;
  for (let i = a; i < b; i++) {
    const t = toks[i];
    if (t.text === '(') depth++; else if (t.text === ')') depth--;
    else if (t.up === 'CASE') cases++; else if (t.up === 'END' && cases) cases--;
    if (depth || cases) continue;
    if (t.up === 'BETWEEN') { between = true; continue; }
    if (t.up === 'AND' && between) { between = false; continue; }
    if (isSep(t)) { parts.push([start, i, t.up]); start = i + 1; }
  }
  parts.push([start, b, null]);
  return parts.filter(([x, y]) => y > x);
}

export function parse(sql, tables) {
  const all = tokenize(sql);
  const toks = all.filter((t) => t.type !== 'ws' && t.type !== 'comment');
  while (toks.length && toks[toks.length - 1].text === ';') toks.pop();
  const text = (a, b) => (b > a ? all.filter((t) => t.start >= toks[a].start && t.end <= toks[b - 1].end)
    .map((t) => (t.type === 'ws' || t.type === 'comment' ? ' ' : t.text)).join('').replace(/ {2,}/g, ' ').trim() : '');
  const fail = (reason) => ({ ok: false, reason });
  if (!toks.length) return fail('the SQL editor is empty');
  if (toks[0].up === 'WITH') return fail('it starts with WITH (a common table expression)');
  if (toks[0].up !== 'SELECT') return fail('it is not a SELECT query');
  // Find top-level clauses.
  const at = {}; let depth = 0, cases = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.text === '(') depth++; else if (t.text === ')') depth--;
    else if (t.up === 'CASE') cases++; else if (t.up === 'END' && cases) cases--;
    if (depth || cases) continue;
    if (t.text === ';') return fail('it contains more than one statement');
    if (['UNION', 'INTERSECT', 'EXCEPT'].includes(t.up)) return fail(`it combines queries with ${t.up}`);
    if (t.up === 'WINDOW' || t.up === 'VALUES') return fail(`it uses a ${t.up} clause`);
    if (['FROM', 'WHERE', 'HAVING', 'LIMIT'].includes(t.up) && !(t.up in at)) at[t.up] = i;
    if ((t.up === 'GROUP' || t.up === 'ORDER') && toks[i + 1]?.up === 'BY' && !(t.up in at)) at[t.up] = i;
  }
  if (!('FROM' in at)) return fail('it has no FROM clause');
  const order = Object.entries(at).sort((x, y) => x[1] - y[1]);
  const range = (k) => { const idx = order.findIndex(([n]) => n === k); if (idx < 0) return null; const s0 = order[idx][1] + (k === 'GROUP' || k === 'ORDER' ? 2 : 1); return [s0, idx + 1 < order.length ? order[idx + 1][1] : toks.length]; };
  const state = emptyState();
  state.limit = '';
  // FROM and joins
  const [fa, fb] = range('FROM');
  if (toks[fa]?.text === '(') return fail('it selects FROM a sub-query');
  let i = fa;
  const readSource = () => {
    if (!isName(toks[i])) return null;
    const table = unquote(toks[i++]); let alias = '';
    if (toks[i]?.up === 'AS') i++;
    if (isName(toks[i]) && i < fb) alias = unquote(toks[i++]);
    return { table, alias };
  };
  const base = readSource();
  if (!base) return fail('its FROM clause is not a table name');
  if (!tables[base.table]) return fail(`table "${base.table}" does not exist`);
  Object.assign(state, base);
  while (i < fb) {
    let type = 'INNER';
    let comma = false;
    if (toks[i].text === ',') { type = 'CROSS'; comma = true; i++; }
    else {
      const words = [];
      while (i < fb && (JOIN_WORDS.has(toks[i].up) || toks[i].up === 'OUTER')) words.push(toks[i++].up);
      if (!words.includes('JOIN')) return fail(`it has "${text(i, Math.min(i + 3, fb))}" where a JOIN was expected`);
      type = words.find((w) => ['LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL'].includes(w)) || 'INNER';
    }
    if (toks[i]?.text === '(') return fail('it joins a sub-query');
    const src = readSource();
    if (!src) return fail('a JOIN is not followed by a table name');
    if (!tables[src.table]) return fail(`table "${src.table}" does not exist`);
    const join = { type, ...src, on: '', using: '', ...(comma ? { comma: true } : {}) };
    if (toks[i]?.up === 'ON' || toks[i]?.up === 'USING') {
      const kw = toks[i++].up, s0 = i;
      let d = 0;
      while (i < fb && !(d === 0 && (JOIN_WORDS.has(toks[i].up) || toks[i].text === ','))) { if (toks[i].text === '(') d++; if (toks[i].text === ')') d--; i++; }
      if (kw === 'ON') join.on = text(s0, i); else join.using = text(s0, i).replace(/^\(|\)$/g, '').trim();
    }
    state.joins.push(join);
  }
  const sources = [state.alias || state.table, ...state.joins.map((j) => j.alias || j.table)];
  const tableOf = (src) => (src === (state.alias || state.table) ? state.table : (state.joins.find((j) => (j.alias || j.table) === src) || {}).table);
  // [src.]field -> column ref, if the tokens are exactly that.
  const refAt = (a, b) => {
    if (b - a === 1 && isName(toks[a])) {
      const field = unquote(toks[a]);
      const owners = sources.filter((s) => (tables[tableOf(s)] || {})[field]);
      return owners.length ? { src: owners[0], field, q: false } : null;
    }
    if (b - a === 3 && isName(toks[a]) && toks[a + 1].text === '.' && isName(toks[a + 2])) {
      const src = unquote(toks[a]), field = unquote(toks[a + 2]);
      return sources.includes(src) && (tables[tableOf(src)] || {})[field] ? { src, field, q: true } : null;
    }
    return null;
  };
  // SELECT list
  let s0 = 1;
  if (toks[1]?.up === 'DISTINCT') { state.distinct = true; s0 = 2; } else if (toks[1]?.up === 'ALL') s0 = 2;
  const items = splitTop(toks, s0, at.FROM, (t) => t.text === ',');
  if (!(items.length === 1 && items[0][1] - items[0][0] === 1 && toks[items[0][0]].text === '*')) {
    for (const [a, b0] of items) {
      let b = b0, as = '';
      const last = toks[b - 1], prev = toks[b - 2];
      if (b - a > 1 && isName(last) && prev?.up === 'AS') { as = unquote(last); b -= 2; }
      else if (b - a > 1 && isName(last) && prev && prev.text !== '.' && (isName(prev) || ['number', 'string'].includes(prev.type) || prev.text === ')' || prev.up === 'END')) { as = unquote(last); b -= 1; }
      const ref = refAt(a, b);
      if (ref) { state.columns.push({ ...ref, agg: '', as }); continue; }
      const fn = toks[a]?.up;
      if (AGG_FNS.has(fn) && toks[a + 1]?.text === '(' && toks[b - 1]?.text === ')') {
        const distinct = toks[a + 2]?.up === 'DISTINCT';
        const ia = a + 2 + (distinct ? 1 : 0);
        if (fn === 'COUNT' && !distinct && b - 1 - ia === 1 && toks[ia].text === '*') { state.columns.push({ field: '*', agg: 'COUNT', as }); continue; }
        const inner = refAt(ia, b - 1);
        if (inner && (!distinct || fn === 'COUNT')) { state.columns.push({ ...inner, agg: distinct ? 'COUNT_DISTINCT' : fn, as }); continue; }
      }
      state.columns.push({ expr: text(a, b), as });
    }
  }
  // WHERE / HAVING conditions
  const conditions = (k, structured) => {
    const r = range(k);
    if (!r) return { list: [], match: 'all' };
    const parts = splitTop(toks, r[0], r[1], (t) => t.up === 'AND' || t.up === 'OR');
    const seps = new Set(parts.map((p) => p[2]).filter(Boolean));
    if (seps.size > 1) return { list: [{ expr: text(r[0], r[1]) }], match: 'all' };
    return { list: parts.map(([a, b]) => (structured && condition(a, b)) || { expr: text(a, b) }), match: seps.has('OR') ? 'any' : 'all' };
  };
  const literal = (t) => (t?.type === 'string' ? { v: t.text.slice(1, -1).replace(/''/g, "'"), kind: 's' } : t?.type === 'number' ? { v: t.text, kind: 'n' } : null);
  const condition = (a, b) => {
    for (let k = a + 1; k <= Math.min(a + 3, b); k++) {
      const ref = refAt(a, k);
      if (!ref) continue;
      const rest = toks.slice(k, b), up = rest.map((t) => t.up);
      if (up.join(' ') === 'IS NULL') return { ...ref, op: 'is empty', value: '' };
      if (up.join(' ') === 'IS NOT NULL') return { ...ref, op: 'is not empty', value: '' };
      if (rest.length === 2 && up[0] === 'LIKE' && rest[1].type === 'string') {
        const p = literal(rest[1]).v;
        if (/^%[^%_]*%$/.test(p)) return { ...ref, op: 'contains', value: p.slice(1, -1) };
        if (/^[^%_]+%$/.test(p)) return { ...ref, op: 'starts with', value: p.slice(0, -1) };
        if (/^%[^%_]+$/.test(p)) return { ...ref, op: 'ends with', value: p.slice(1) };
        return { ...ref, op: 'like', value: p };
      }
      if (rest.length === 4 && up[0] === 'BETWEEN' && up[2] === 'AND' && literal(rest[1]) && literal(rest[3])) {
        const x = literal(rest[1]), y = literal(rest[3]);
        return { ...ref, op: 'between', value: x.v, value2: y.v, kind: x.kind };
      }
      if (up[0] === 'IN' && rest[1]?.text === '(' && rest[rest.length - 1].text === ')') {
        const vals = rest.slice(2, -1).filter((t) => t.text !== ',');
        const lits = vals.map(literal);
        if (lits.length && lits.every(Boolean) && rest.slice(2, -1).length === vals.length * 2 - 1 && !lits.some((x) => x.v.includes(','))) {
          return { ...ref, op: 'in list', value: lits.map((x) => x.v).join(', '), kind: lits[0].kind };
        }
      }
      const ops = { '=': '=', '==': '=', '!=': '!=', '<>': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
      if (rest.length === 2 && ops[rest[0].text] && literal(rest[1])) { const x = literal(rest[1]); return { ...ref, op: ops[rest[0].text], value: x.v, kind: x.kind }; }
      if (rest.length === 3 && ops[rest[0].text] && rest[1].text === '-' && rest[2].type === 'number') return { ...ref, op: ops[rest[0].text], value: '-' + rest[2].text, kind: 'n' };
    }
    return null;
  };
  const where = conditions('WHERE', true);
  state.filters = where.list; state.match = where.match;
  const having = conditions('HAVING', false);
  state.having = having.list; state.havingMatch = having.match;
  // GROUP BY: keep "automatic" when it equals what the builder would write; an
  // explicit empty value means "no GROUP BY" so a bare aggregate is not regrouped.
  const norm = (x) => x.replace(/\s+/g, ' ').trim().toLowerCase();
  if (at.GROUP !== undefined) { const [ga, gb] = range('GROUP'); state.groupBy = text(ga, gb); }
  if (state.groupBy !== null && norm(state.groupBy) === norm(autoGroup(state).join(', '))) state.groupBy = null;
  else if (state.groupBy === null && autoGroup(state).length) state.groupBy = '';
  if (at.ORDER !== undefined) {
    const [oa, ob] = range('ORDER');
    state.sorts = splitTop(toks, oa, ob, (t) => t.text === ',').map(([a, b]) => {
      const dir = toks[b - 1].up === 'ASC' || toks[b - 1].up === 'DESC' ? toks[b - 1].up.toLowerCase() : '';
      return { expr: text(a, dir ? b - 1 : b), dir };
    });
  }
  if (at.LIMIT !== undefined) {
    const [la, lb] = range('LIMIT');
    const parts = splitTop(toks, la, lb, (t) => t.up === 'OFFSET' || t.text === ',');
    if (parts.length === 2 && parts[0][2] === ',') { state.offset = text(...parts[0]); state.limit = text(...parts[1]); }
    else { state.limit = text(...parts[0]); state.offset = parts[1] ? text(...parts[1]) : ''; }
  }
  return { ok: true, state };
}

// Pretty-prints SQL: keywords upper-case, one clause per line, AND/OR on new lines.
export function format(sql) {
  const all = tokenize(sql).filter((t) => t.type !== 'ws');
  const NEWLINE = new Set(['SELECT', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT', 'WITH']);
  let out = '', depth = 0, prev = null, cases = 0, inSelect = false;
  for (const t of all) {
    const word = t.type === 'keyword' ? t.up : (t.type === 'ident' && FUNCTIONS.includes(t.up) ? t.up : t.text);
    if (t.text === ')') depth--;
    const top = depth === 0 && cases === 0;
    let sep = prev === null ? '' : ' ';
    if (top && NEWLINE.has(t.up) && prev) sep = '\n';
    else if (top && JOIN_WORDS.has(t.up) && !JOIN_WORDS.has(prev?.up) && prev?.up !== 'OUTER') sep = '\n';
    else if (top && (t.up === 'AND' || t.up === 'OR') && !out.match(/BETWEEN [^\n]*$/i)) sep = '\n  ';
    else if (t.text === ',' || t.text === ')' || t.text === '.' || prev?.text === '(' || prev?.text === '.' || t.type === 'comment') sep = t.type === 'comment' ? ' ' : '';
    else if (t.text === '(' && prev && (prev.type === 'ident' || FUNCTIONS.includes(prev.up))) sep = '';
    if (top && t.up === 'SELECT') inSelect = true;
    if (top && t.up === 'FROM') inSelect = false;
    if (prev?.text === ',' && top && inSelect) sep = '\n       ';
    out += sep + word + (t.type === 'comment' && t.text.startsWith('--') ? '\n' : '');
    if (t.text === '(') depth++;
    if (t.up === 'CASE') cases++; else if (t.up === 'END' && cases) cases--;
    prev = t;
  }
  return out.replace(/\n\n+/g, '\n').trim();
}