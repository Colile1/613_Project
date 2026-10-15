// warehouse.js : Step 4 - the Cosmos DB warehouse. Three containers, six document sub-tabs,
// search, paging, JSON export, and an optional live view of the real Azure containers.
import { h, icon, clear, num, zar, time, card, pageHead, tabs, table, jsonDialog, download, callout, chip, code } from '../ui.js';
import { get } from '../api.js';
import { pref, setPref } from '../prefs.js';

const COLS = {
  card_windows: [['card_id', 'Card'], ['window_start', 'Start', time], ['window_end', 'End', time], ['tx_count', 'Tx', null, 1], ['total_amount_zar', 'Total', zar, 1], ['avg_amount_zar', 'Average', zar, 1], ['max_amount_zar', 'Max', zar, 1], ['distinct_merchants', 'Merchants', null, 1]],
  category_trends: [['merchant_category', 'Category'], ['window_end', 'Window end', time], ['tx_count', 'Tx', num, 1], ['total_amount_zar', 'Total', zar, 1], ['avg_amount_zar', 'Average', zar, 1]],
  enriched: [['card_id', 'Card'], ['customer_name', 'Customer'], ['customer_tier', 'Tier'], ['merchant_category', 'Category'], ['amount', 'Amount', zar, 1], ['credit_limit_zar', 'Limit', zar, 1], ['credit_flag', 'Credit flag', (v) => chip(v, v === 'NEAR_LIMIT' ? 'bad' : '')], ['event_time', 'Event time', time], ['is_duplicate', 'Dup', (v) => (v ? 'yes' : '')]],
  velocity: [['card_id', 'Card'], ['detected_at', 'Detected', time], ['velocity_count', 'Tx in 5 min', null, 1], ['total_amount_zar', 'Total', zar, 1], ['alert_description', 'Description']],
  high_amount: [['card_id', 'Card'], ['detected_at', 'Detected', time], ['amount', 'Amount', zar, 1], ['rolling_avg', 'Rolling avg', zar, 1], ['amount_ratio', 'Ratio', (v) => v + 'x', 1], ['merchant_category', 'Category'], ['merchant_id', 'Merchant']],
  dead_letter: [['ingestion_date', 'Date (partition)'], ['ingestion_time', 'Time', time], ['dead_letter_detail', 'Reason', (v) => chip(v, 'bad', 'report')], ['card_id', 'Card'], ['amount', 'Amount', (v) => (v === null ? '-' : zar(v)), 1], ['transaction_id', 'Transaction']],
};
const CONTAINER_ICON = { aggregates: 'stacked_bar_chart', fraud_alerts: 'crisis_alert', dead_letter: 'report' };
let refs = {}, st = { collection: 'card_windows', q: '', offset: 0, source: 'local' }, last = null;

function containers(d) {
  return h('div', { class: 'grid g3' }, Object.entries(d.containers).map(([name, meta]) => {
    const subs = d.collections.filter((c) => c.container === name);
    return h('section', { class: 'card' + (subs.some((s) => s.key === st.collection) ? ' tonal' : '') },
      h('div', { class: 'card-head' }, h('div', { class: 'row' }, icon(CONTAINER_ICON[name]), h('h3', {}, name)), h('span', { class: 'chip on' }, num(d.per_container[name] || 0) + ' docs')),
      h('dl', { class: 'kv' }, h('dt', {}, 'Partition key'), h('dd', {}, meta.partition_key), h('dt', {}, 'TTL'), h('dd', {}, meta.ttl),
        h('dt', {}, 'Throughput'), h('dd', {}, meta.throughput), h('dt', {}, 'ASA output'), h('dd', {}, meta.asa_output)),
      h('div', { class: 'chips', style: { marginTop: '12px' } }, subs.map((s) =>
        h('button', { class: 'chip' + (s.key === st.collection ? ' on' : ''), onclick: () => select(s.key) }, s.label))));
  }));
}

function select(key) { st.collection = key; st.offset = 0; remember(); render(); }
function remember() { setPref('warehouse', { collection: st.collection, q: st.q, source: st.source }); }

function columns(key) {
  return COLS[key].map(([k, label, fmt, isNum]) => ({ key: k, label, fmt: fmt || ((v) => (typeof v === 'number' ? num(v) : v)), num: !!isNum }));
}

async function render() {
  if (st.source === 'azure') return renderAzure();
  const d = await get('/api/warehouse', { collection: st.collection, q: st.q, limit: 100, offset: st.offset });
  last = d;
  clear(refs.containers, containers(d));
  clear(refs.tabs, tabs(d.collections.map((c) => ({ key: c.key, label: c.label, count: d.per_collection[c.key] })), st.collection, select));
  const info = d.collections.find((c) => c.key === st.collection);
  const pages = Math.max(1, Math.ceil(d.total / 100)), page = Math.floor(st.offset / 100) + 1;
  clear(refs.meta, h('div', { class: 'row between' },
    h('span', { class: 'muted small' }, `Container ${info.container} \u00b7 written by query ${info.step} \u00b7 ${num(d.total)} matching documents \u00b7 newest first \u00b7 click a row for the JSON document`),
    h('div', { class: 'row' },
      h('button', { class: 'icon-btn', title: 'Previous page', disabled: page <= 1, onclick: () => { st.offset -= 100; render(); } }, icon('chevron_left')),
      h('span', { class: 'small' }, `Page ${page} of ${pages}`),
      h('button', { class: 'icon-btn', title: 'Next page', disabled: page >= pages, onclick: () => { st.offset += 100; render(); } }, icon('chevron_right')))));
  clear(refs.table, table(columns(st.collection), d.rows, { onRow: (r) => jsonDialog(r.id, r), empty: 'No documents yet. Windows and alerts appear once the watermark passes them - generate a few simulated minutes.' }));
}

async function renderAzure() {
  const map = { card_windows: 'aggregates', category_trends: 'aggregates', enriched: 'aggregates', velocity: 'fraud_alerts', high_amount: 'fraud_alerts', dead_letter: 'dead_letter' };
  const container = map[st.collection];
  clear(refs.tabs, tabs(['aggregates', 'fraud_alerts', 'dead_letter'].map((k) => ({ key: k, label: k })), container,
    (k) => { st.collection = Object.keys(map).find((x) => map[x] === k); renderAzure(); }));
  clear(refs.meta, h('span', { class: 'muted small' }, 'Reading the newest 100 documents from Azure Cosmos DB (fraud_pipeline / ' + container + ')...'));
  clear(refs.table);
  const d = await get('/api/cosmos', { container, limit: 100 });
  if (d.error) return clear(refs.table, callout('cloud_off', [h('b', {}, 'Live Cosmos DB is not available. '), d.error, '. The local warehouse keeps working - switch the source back to Local.'], 'warn'));
  last = { rows: d.rows, collection: container };
  clear(refs.meta, h('span', { class: 'muted small' }, num(d.rows.length) + ' documents from Azure'));
  const keys = [...new Set(d.rows.flatMap((r) => Object.keys(r)))].slice(0, 9);
  clear(refs.table, table(keys.map((k) => ({ key: k, label: k, fmt: (v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v) })), d.rows, { onRow: (r) => jsonDialog(r.id || 'document', r) }));
}

export default {
  async mount(root, ctx) {
    st = { ...st, ...pref('warehouse', {}), offset: 0 };
    if (ctx.sub && COLS[ctx.sub]) st.collection = ctx.sub;
    refs = { containers: h('div'), tabs: h('div'), meta: h('div'), table: h('div') };
    const search = h('input', { type: 'search', class: 'grow', placeholder: 'Search documents (card, category, reason...)', value: st.q, 'aria-label': 'Search documents',
      oninput: (e) => { st.q = e.target.value; st.offset = 0; remember(); clearTimeout(refs.t); refs.t = setTimeout(render, 250); } });
    const source = h('select', { 'aria-label': 'Data source', onchange: (e) => { st.source = e.target.value; remember(); render(); } },
      h('option', { value: 'local', selected: st.source === 'local' }, 'Source: local pipeline'), h('option', { value: 'azure', selected: st.source === 'azure' }, 'Source: Azure Cosmos DB (live)'));
    root.append(pageHead('Step 4 · Load', 'Cosmos DB data warehouse',
      'Database fraud_pipeline holds three containers. The aggregates container receives three document shapes, so each output gets its own sub-tab. Partition keys follow the dashboard query paths: /card_id for card analysis, /ingestion_date for the dead-letter audit trail.'),
      refs.containers,
      h('section', { class: 'card' }, refs.tabs,
        h('div', { class: 'toolbar', style: { margin: '16px 0 8px' } }, search, source,
          h('button', { class: 'btn tonal', onclick: () => last && download(st.collection + '.json', last.rows) }, icon('download'), 'Export page')),
        refs.meta, h('div', { style: { marginTop: '8px' } }, refs.table)));
    await render();
  },
  async update() { if (st.source === 'local' && st.offset === 0) await render(); },
};