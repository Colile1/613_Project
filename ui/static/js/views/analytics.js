// analytics.js : Step 5 - the Power BI report rebuilt live: Live Operations, Fraud Trends,
// Pipeline Health and the Card Detail drill-through, with tier / category / alert-type slicers.
import { h, icon, clear, num, zar, time, stat, card, pageHead, tabs, table, callout, chip, dialog, code } from '../ui.js';
import { get, post } from '../api.js';
import { lineChart, barChart } from '../charts.js';
import { pref, setPref } from '../prefs.js';

const CATEGORIES = ['grocery', 'fuel', 'online', 'restaurant', 'travel', 'atm', 'pharmacy'];
let refs = {}, page = 'live', filters = {}, cardId = null, cardIds = null;

function slicers() {
  const sel = (key, label, options) => h('select', { 'aria-label': label, onchange: (e) => { filters[key] = e.target.value; setPref('analytics.filters', filters); render(); } },
    h('option', { value: '' }, label + ': all'), options.map((o) => h('option', { value: o, selected: filters[key] === o }, o)));
  return h('div', { class: 'toolbar' }, icon('filter_alt'),
    sel('tier', 'Tier', ['Standard', 'Gold', 'Platinum']),
    sel('category', 'Category', CATEGORIES),
    page === 'fraud' ? sel('alert_type', 'Alert type', ['VELOCITY', 'HIGH_AMOUNT']) : null);
}

function live(d) {
  const k = d.kpi;
  return h('div', { class: 'grid' },
    h('div', { class: 'grid g5' },
      stat('Current tx/min', num(k.tx_per_min), k.tx_per_min > 300 ? 'burst traffic' : 'latest closed minute', 'speed'),
      stat('Fraud alerts (last 5 min)', num(k.alerts_5min), 'velocity + high amount', 'crisis_alert'),
      stat('Avg arrival lag', k.avg_lag_s + ' s', k.avg_lag_s < 5 ? 'healthy' : 'out-of-order and late events', 'timer'),
      stat('Transactions processed', num(k.tx_processed), 'in closed windows', 'receipt_long'),
      stat('Total spend', zar(k.total_spend), 'enriched transactions', 'payments')),
    h('div', { class: 'grid g2' },
      card('Transactions per minute', 'Sum of tx_count per tumbling window - spikes are bursts',
        lineChart({ series: [{ name: 'Transactions', color: '--s1', points: d.tx_per_minute }] })),
      card('Total spend by category', 'From enriched transactions',
        barChart({ items: d.spend_by_category, fmt: zar }))));
}

function fraud(d) {
  const series = Object.entries(d.series).map(([name, pts]) => ({ name, color: name === 'VELOCITY' ? '--s1' : '--s2', points: pts }));
  return h('div', { class: 'grid' },
    h('div', { class: 'grid g2' },
      card('Fraud alerts over time', num(d.total_alerts) + ' alerts in view', lineChart({ series })),
      card('High-amount alerts by category', 'Only HIGH_AMOUNT alerts carry a merchant category',
        barChart({ items: d.high_amount_by_category, color: '--s2' }))),
    card('Top 10 flagged cards', 'Actionable insight: rows turn red above 5 alerts - send these to an analyst. Click a card to drill through.',
      table([{ key: 'card_id', label: 'Card' }, { key: 'customer_name', label: 'Customer' }, { key: 'customer_tier', label: 'Tier' },
        { key: 'alert_count', label: 'Alerts', num: true, fmt: num }, { key: 'total_amount_zar', label: 'Total spend', num: true, fmt: zar },
        { key: 'last_alert', label: 'Last alert', fmt: time }], d.top_cards,
        { rowClass: (r) => (r.alert_count > 5 ? 'flag' : ''), onRow: (r) => { cardId = r.card_id; page = 'card'; setPref('analytics.page', page); setPref('analytics.card', cardId); render(); }, empty: 'No alerts yet.' })));
}

function health(d) {
  const k = d.kpi;
  return h('div', { class: 'grid' },
    h('div', { class: 'grid g5' },
      stat('Invalid events (dead letter)', num(k.dead_letter), k.dead_letter ? 'review the reasons below' : 'none', 'report'),
      stat('Events ingested', num(k.events_ingested), null, 'move_to_inbox'),
      stat('Late arrivals (> 5 min)', num(k.late_arrivals), 'timestamp adjusted by ASA', 'schedule'),
      stat('Out-of-order events', num(k.out_of_order), '30-120 s behind', 'swap_vert'),
      stat('Duplicates', num(k.duplicates), 'not removed by the query', 'content_copy')),
    h('div', { class: 'grid g2' },
      card('Dead-letter events over time', 'Per minute', lineChart({ series: [{ name: 'Dead-letter events', color: '--s2', points: d.dead_letter_per_minute }], empty: 'No dead-letter events. Raise "Malformed events" in Extract to see this path.' })),
      card('Invalid event breakdown', 'dead_letter_detail', barChart({ items: d.reasons, color: '--s2', empty: 'No invalid events.' }))),
    card('Latest dead-letter events', 'Newest 50 - shows exactly which field was wrong',
      table([{ key: 'ingestion_time', label: 'Time', fmt: time }, { key: 'dead_letter_detail', label: 'Reason' }, { key: 'card_id', label: 'Card' },
        { key: 'amount', label: 'Amount', num: true, fmt: (v) => (v === null ? '-' : zar(v)) }, { key: 'transaction_id', label: 'Transaction' }], d.sample, { empty: 'No dead-letter events.' })));
}

async function cardDetail() {
  if (!cardIds) cardIds = (await get('/api/reference', { ids: 1 })).ids;
  cardId = cardId || cardIds[0];
  const d = await get('/api/card', { card_id: cardId });
  const c = d.card;
  const go = (id) => { if (cardIds.includes(id)) { cardId = id; setPref('analytics.card', cardId); render(); } };
  const pick = h('span', { class: 'row' },
    h('input', { type: 'search', list: 'card-ids', value: cardId, 'aria-label': 'Card id', style: { width: '140px' },
      onchange: (e) => go(e.target.value.trim().toUpperCase()) }),
    h('datalist', { id: 'card-ids' }, cardIds.map((i) => h('option', { value: i }))),
    h('button', { class: 'icon-btn', title: 'Previous card', onclick: () => go(cardIds[Math.max(0, cardIds.indexOf(cardId) - 1)]) }, icon('chevron_left')),
    h('button', { class: 'icon-btn', title: 'Next card', onclick: () => go(cardIds[Math.min(cardIds.length - 1, cardIds.indexOf(cardId) + 1)]) }, icon('chevron_right')));
  const near = d.transactions.filter((t) => t.credit_flag === 'NEAR_LIMIT').length;
  return h('div', { class: 'grid' },
    h('div', { class: 'row' }, pick, h('h2', {}, `${c.card_id} \u2014 ${c.customer_name || ''}`), chip(c.customer_tier || '?', 'on'), chip('Limit ' + zar(c.credit_limit_zar), '')),
    h('div', { class: 'grid g4' }, stat('Transactions', num(d.transactions.length), 'latest 200 shown', 'receipt_long'),
      stat('Alerts', num(d.alerts), num(d.high_amount) + ' high amount', 'crisis_alert'),
      stat('Near-limit transactions', num(near), '> 80% of credit limit', 'warning'),
      stat('Average amount', zar(d.transactions.reduce((a, t) => a + t.amount, 0) / Math.max(1, d.transactions.length)), null, 'payments')),
    card('Transaction amounts over time', null, lineChart({ series: [{ name: 'Amount', color: '--s1', points: d.transactions.map((t) => ({ t: t.event_time, v: t.amount })) }], fmtY: (v) => zar(v) })),
    card('All transactions for this card', 'NEAR_LIMIT rows separate genuine big spenders from fraud',
      table([{ key: 'event_time', label: 'Event time', fmt: time }, { key: 'merchant_id', label: 'Merchant' }, { key: 'merchant_category', label: 'Category' },
        { key: 'amount', label: 'Amount', num: true, fmt: zar }, { key: 'credit_flag', label: 'Credit flag', fmt: (v) => chip(v, v === 'NEAR_LIMIT' ? 'bad' : '') },
        { key: 'is_duplicate', label: 'Duplicate', fmt: (v) => (v ? 'yes' : '') }], d.transactions.slice().reverse(), { rowClass: (r) => (r.credit_flag === 'NEAR_LIMIT' ? 'flag' : '') })));
}

async function exportPowerBI() {
  const r = await post('/api/export/powerbi');
  dialog('Exported for Power BI', h('div', { class: 'grid' },
    h('p', {}, 'The local warehouse was written as CSV tables named like the Cosmos DB containers, so the DAX measures in the dashboard design work unchanged.'),
    table([{ key: 0, label: 'Table' }, { key: 1, label: 'Rows', num: true, fmt: num }], Object.entries(r.tables)),
    h('ol', { class: 'steps' },
      h('li', {}, h('div', {}, 'Power BI Desktop › Get Data › Blank Query › Advanced Editor.')),
      h('li', {}, h('div', {}, 'Paste one block from ', h('code', {}, 'queries.pq'), ' per table and name the query aggregates, fraud_alerts, dead_letter or card_metadata.')),
      h('li', {}, h('div', {}, 'Build the pages from powerbi/dashboard_design.md. Later, swap each Source step for the Azure Cosmos DB connector.'))),
    code(r.folder)),
    [h('button', { class: 'btn tonal', onclick: () => navigator.clipboard.writeText(r.folder) }, icon('content_copy'), 'Copy folder path')]);
}

async function render() {
  clear(refs.tabs, tabs([{ key: 'live', label: 'Live operations', icon: 'speed' }, { key: 'fraud', label: 'Fraud trends', icon: 'crisis_alert' },
    { key: 'health', label: 'Pipeline health', icon: 'health_and_safety' }, { key: 'card', label: 'Card detail', icon: 'credit_card' }], page, (k) => { page = k; setPref('analytics.page', k); render(); }));
  clear(refs.slicers, page === 'live' || page === 'fraud' ? slicers() : null);
  const body = page === 'card' ? await cardDetail() : (page === 'fraud' ? fraud : page === 'health' ? health : live)(await get('/api/analytics', { page, ...filters }));
  clear(refs.body, body);
}

export default {
  async mount(root, ctx) {
    page = ctx.sub || pref('analytics.page', 'live');
    filters = { ...pref('analytics.filters', {}) };
    cardId = pref('analytics.card', null);
    refs = { tabs: h('div'), slicers: h('div', { style: { margin: '16px 0' } }), body: h('div') };
    root.append(pageHead('Step 5 · Analyse', 'Power BI report',
      'The three report pages from powerbi/dashboard_design.md, computed from the warehouse as it fills. Use the slicers to filter, and click a flagged card to drill through.',
        [h('button', { class: 'btn tonal', onclick: exportPowerBI }, icon('ios_share'), 'Export for Power BI')]),
      h('div', {}, refs.tabs, refs.slicers, refs.body),
      callout('info', 'In Power BI Desktop: Get Data \u2192 Azure Cosmos DB \u2192 fraud_pipeline, load aggregates, fraud_alerts and dead_letter, then build these pages. The measures are listed under Project files \u203a Power BI dashboard design.'));
    await render();
  },
  async update() { await render(); },
};