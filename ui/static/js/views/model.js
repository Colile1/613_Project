// model.js : Data model view - how the warehouse tables are produced and related,
// with on-demand field profiles (nulls, distinct values, range, most common values).
import { h, icon, clear, num, card, table, callout, chip } from '../ui.js';
import { get } from '../api.js';
import { setPref } from '../prefs.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, text) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); if (text !== undefined) el.textContent = text; return el; };
const SUB = { transactions: 'Query 6 \u00b7 enriched payments', card_windows: 'Query 2 \u00b7 1-min tumbling per card', category_trends: 'Query 3 \u00b7 5-min hopping per category',
  velocity_alerts: 'Query 4 \u00b7 sliding 5 min per card', high_amount_alerts: 'Query 5 \u00b7 3x category average', dead_letter: 'Query 1 \u00b7 invalid events' };
const MIDDLE = ['transactions', 'card_windows', 'category_trends', 'velocity_alerts', 'high_amount_alerts', 'dead_letter'];
const RIGHT = [['aggregates', [0, 2]], ['fraud_alerts', [3, 4]], ['dead_letter', [5, 5]]];

// Lineage: sources -> Stream Analytics outputs -> Cosmos containers. No crossing edges by layout.
function diagram(schema, onPick) {
  const rows = Object.fromEntries(schema.tables.map((t) => [t.name, t.rows]));
  const W = 960, rowH = 66, top = 40, nodeH = 50, X = [10, 350, 690], NW = [250, 270, 260];
  const H = top + MIDDLE.length * rowH + 10;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'model-svg', role: 'img', 'aria-label': 'Data lineage from Event Hubs and card reference data through the six Stream Analytics queries into the three Cosmos DB containers' });
  [['SOURCES', X[0]], ['STREAM ANALYTICS OUTPUTS (tables)', X[1]], ['COSMOS DB CONTAINERS', X[2]]].forEach(([t, x]) => svg.append(s('text', { x, y: 18, class: 'lane' }, t)));
  const yMid = (i) => top + i * rowH + nodeH / 2;
  const edge = (x1, y1, x2, y2, cls = '') => svg.append(s('path', { d: `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`, class: 'edge ' + cls }));
  const node = (x, w, y, title, sub, cls, pick) => {
    const g = s('g', { class: 'node ' + cls, tabindex: 0, role: 'button' });
    g.append(s('rect', { x, y: y - nodeH / 2, width: w, height: nodeH, rx: 10 }));
    g.append(s('text', { x: x + 12, y: y - 4, 'font-size': 13, 'font-weight': 600 }, title));
    g.append(s('text', { x: x + 12, y: y + 13, class: 'sub' }, sub));
    g.addEventListener('click', () => onPick(pick));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter') onPick(pick); });
    svg.append(g);
  };
  const cardsY = yMid(0), eventsY = (yMid(2) + yMid(3)) / 2;
  MIDDLE.forEach((t, i) => edge(X[0] + NW[0], eventsY, X[1], yMid(i)));
  edge(X[0] + NW[0], cardsY, X[1], yMid(0), 'ref');
  RIGHT.forEach(([c, [a, b]]) => { for (let i = a; i <= b; i++) edge(X[1] + NW[1], yMid(i), X[2], (yMid(a) + yMid(b)) / 2); });
  node(X[0], NW[0], cardsY, 'cards', `Blob reference \u00b7 ${num(rows.cards)} rows`, 'src', 'cards');
  node(X[0], NW[0], eventsY, 'events', `Event Hubs \u00b7 ${num(rows.events)} rows`, 'src', 'events');
  MIDDLE.forEach((t, i) => node(X[1], NW[1], yMid(i), t, `${SUB[t]} \u00b7 ${num(rows[t])}`, '', t));
  RIGHT.forEach(([c, [a, b]]) => node(X[2], NW[2], (yMid(a) + yMid(b)) / 2, c, (c === 'dead_letter' ? 'container \u00b7 table above' : 'container \u00b7 SQL view') + ` \u00b7 ${num(rows[c])}`, c === 'dead_letter' ? '' : 'view', c));
  return h('div', {}, svg, h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: 'var(--outline)' } }), 'produced by a Stream Analytics query'),
    h('span', {}, h('i', { style: { background: 'var(--s2)' } }), 'reference join (query 6)'), h('span', {}, 'Click any box to profile it')));
}

async function profileOf(name, box) {
  clear(box, h('div', { class: 'empty' }, 'Profiling ' + name + '...'));
  const p = await get('/api/sql/profile', { table: name });
  const fmt = (v) => (v === null || v === undefined ? '-' : typeof v === 'number' ? v.toLocaleString('en-ZA', { maximumFractionDigits: 2 }) : String(v));
  clear(box, table([
    { key: 'name', label: 'Field' }, { key: 'type', label: 'Type' },
    { key: 'null_pct', label: 'Empty', num: true, fmt: (v) => (v * 100).toFixed(1) + '%' },
    { key: 'distinct', label: 'Distinct', num: true, fmt: num },
    { key: 'min', label: 'Min', fmt }, { key: 'max', label: 'Max', fmt },
    { key: 'avg', label: 'Average', num: true, fmt },
    { key: 'top', label: 'Most common', fmt: (t) => t.length ? h('div', { class: 'chips' }, t.map((x) => chip(fmt(x.value) + ' \u00b7 ' + num(x.count)))) : '-' }],
    p.fields, { height: '420px' }));
}

export async function renderModel(box, go) {
  clear(box, h('div', { class: 'empty' }, 'Loading the data model...'));
  const schema = await get('/api/sql/schema');
  const detail = h('div');
  const pick = (name) => {
    const t = schema.tables.find((x) => x.name === name);
    const prof = h('div');
    clear(detail, card(name, `${t.kind} \u00b7 ${t.description} \u00b7 ${t.location} \u00b7 ${num(t.rows)} rows`, prof,
      h('button', { class: 'btn tonal sm', onclick: () => { setPref('query.state', { mode: 'builder', sql: '', builder: { table: name, columns: [], filters: [], sorts: [], limit: 100 } }); setPref('query.autorun', true); go('query'); } }, icon('manage_search'), 'Open in Query')));
    profileOf(name, prof);
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  clear(box,
    callout('account_tree', 'Every table is derived from the raw events by one Stream Analytics query and lands in one of three Cosmos DB containers. The local warehouse mirrors this exactly; the Query page exposes the same tables to SQL.'),
    card('Lineage', 'Sources \u2192 query outputs \u2192 containers', diagram(schema, pick)),
    card('Relationships', 'Keys that connect the tables (used for JOINs in SQL mode)',
      table([{ key: 'from', label: 'From' }, { key: 'to', label: 'To' }, { key: 'label', label: 'Meaning' }], schema.relationships, { wrap: true })),
    card('Tables and views', 'Click one to see its field profile',
      table([{ key: 'name', label: 'Name' }, { key: 'kind', label: 'Kind' }, { key: 'rows', label: 'Rows', num: true, fmt: num },
        { key: 'columns', label: 'Fields', num: true, fmt: (c) => c.length }, { key: 'description', label: 'What it holds' }, { key: 'location', label: 'Where' }],
        schema.tables, { onRow: (r) => pick(r.name), wrap: true })),
    detail);
}