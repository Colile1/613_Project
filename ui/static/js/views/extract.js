// extract.js : Step 1 - the data source. Simulator controls, live event feed, schema, reference data.
import { h, icon, clear, num, zar, time, pct, stat, card, pageHead, tabs, table, jsonDialog, flagChips, snackbar, code, callout } from '../ui.js';
import { get, post } from '../api.js';
import { markdown } from '../markdown.js';
import { pref, setPref } from '../prefs.js';

const DEFAULTS = { rate: 10, duplicate_prob: 0.02, out_of_order_prob: 0.05, late_prob: 0.01, malformed_prob: 0.01, fraud_prob: 0.005, attack_prob: 0.01, burst_multiplier: 5, burst_duration: 30, burst_interval: 300 };
const SLIDERS = [
  ['rate', 'Baseline rate (events/s)', 1, 50, 1, (v) => v],
  ['duplicate_prob', 'Duplicates', 0, 0.2, 0.005, pct],
  ['out_of_order_prob', 'Out-of-order (30-120 s back)', 0, 0.3, 0.005, pct],
  ['late_prob', 'Late arrivals (5-15 min back)', 0, 0.1, 0.005, pct],
  ['malformed_prob', 'Malformed events (producer --malformed)', 0, 0.1, 0.005, pct],
  ['fraud_prob', 'Fraud spikes x8-x25 (local demo)', 0, 0.05, 0.001, pct],
  ['attack_prob', 'Card-testing attacks per second (local demo)', 0, 0.05, 0.001, pct],
  ['burst_multiplier', 'Burst multiplier', 1, 10, 1, (v) => v + 'x'],
  ['burst_duration', 'Burst length (s)', 5, 120, 5, (v) => v + ' s'],
  ['burst_interval', 'Burst every (s)', 60, 900, 30, (v) => v + ' s'],
];
let refs = {}, tab = 'feed', data = null;

function settings(cfg) {
  const values = { ...cfg };
  const fields = SLIDERS.map(([key, label, min, max, step, fmt]) => {
    const out = h('b', {}, fmt(values[key]));
    return h('div', { class: 'field' }, h('label', {}, label, out),
      h('input', { type: 'range', min, max, step, value: values[key], 'aria-label': label,
        oninput: (e) => { values[key] = +e.target.value; out.textContent = fmt(values[key]); } }));
  });
  const apply = async (v) => { await post('/api/sim/config', v); snackbar('Simulator settings applied to new events'); };
  return card('Simulator settings', 'Defaults match simulator/producer.py. Changes apply to events generated from now on.',
    h('div', { class: 'grid g3' }, fields),
    [h('button', { class: 'btn text', onclick: async () => { await apply(DEFAULTS); refs.settings.replaceWith(refs.settings = settings(DEFAULTS)); } }, 'Restore defaults'),
     h('button', { class: 'btn', onclick: () => apply(values) }, icon('check'), 'Apply')]);
}

function stats(d) {
  const t = d.total || 1;
  return h('div', { class: 'grid g5' },
    stat('Events generated', num(d.total), num(d.bursts) + ' during bursts', 'bolt'),
    stat('On time', num(d.by_timing.on_time), pct(d.by_timing.on_time / t), 'check_circle'),
    stat('Out of order / late', num(d.by_timing.out_of_order) + ' / ' + num(d.by_timing.late), 'event time in the past', 'swap_vert'),
    stat('Duplicates', num(d.duplicates), 'same transaction_id re-sent', 'content_copy'),
    stat('Malformed / fraud spikes', num(d.malformed) + ' / ' + num(d.fraud_injected), 'dead-letter test / local fraud demo', 'report'));
}

const FEED_COLS = [
  { key: 'sequence_number', label: '#', num: true },
  { key: 'event_time', label: 'Event time', fmt: time },
  { key: 'ingestion_time', label: 'Sent', fmt: time },
  { key: 'card_id', label: 'Card' },
  { key: 'merchant_category', label: 'Category' },
  { key: 'amount', label: 'Amount', num: true, fmt: (v) => (v === null ? '-' : zar(v)) },
  { key: 'location', label: 'City', fmt: (v) => v.city },
  { key: '_partition', label: 'Partition', num: true },
  { key: 'flags', label: 'Flags', fmt: (v, r) => flagChips(r) },
];

const ref = { q: '', offset: 0 };

// Reference data tab: 5 000 cards, searched and paged on the server.
function referenceTab() {
  const out = h('div');
  const load = async () => {
    const d = await get('/api/reference', { q: ref.q, offset: ref.offset, limit: 100 });
    const page = Math.floor(ref.offset / 100) + 1, pages = Math.max(1, Math.ceil(d.total / 100));
    clear(out, h('div', { class: 'row between', style: { margin: '8px 0' } },
      h('span', { class: 'small muted' }, num(d.total) + ' matching of ' + num(d.cards) + ' cards · ' + Object.entries(d.tiers).map(([t, n]) => t + ' ' + num(n)).join(' · ')),
      h('div', { class: 'row' },
        h('button', { class: 'icon-btn', title: 'Previous page', disabled: page <= 1, onclick: () => { ref.offset -= 100; load(); } }, icon('chevron_left')),
        h('span', { class: 'small' }, 'Page ' + page + ' of ' + pages),
        h('button', { class: 'icon-btn', title: 'Next page', disabled: page >= pages, onclick: () => { ref.offset += 100; load(); } }, icon('chevron_right')))),
      table([{ key: 'card_id', label: 'Card' }, { key: 'customer_name', label: 'Customer' }, { key: 'customer_tier', label: 'Tier' },
        { key: 'credit_limit_zar', label: 'Credit limit', num: true, fmt: zar }], d.rows, { empty: 'No card matches.' }));
  };
  const search = h('input', { type: 'search', class: 'grow', placeholder: 'Search cards (id, name, tier)', value: ref.q, 'aria-label': 'Search cards',
    oninput: (e) => { ref.q = e.target.value; ref.offset = 0; clearTimeout(ref.t); ref.t = setTimeout(load, 250); } });
  load();
  return h('div', { class: 'grid' },
    callout('info', 'Loaded by Stream Analytics as the CardMetadata reference input (Blob Storage) and joined on card_id in query 6. Generated by reference_data/generate_cards.py: the original 50 cards plus 4 950 more, so per-card traffic is realistic (docs/decisions/velocity_rule.md).'),
    h('div', { class: 'toolbar' }, search), out);
}

async function body() {
  if (tab === 'feed') return data.recent.length ? table(FEED_COLS, data.recent, { onRow: (r) => jsonDialog('Event #' + r.sequence_number, Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_')))) })
    : callout('info', 'No events yet. Press play in the top bar, or use the fast-forward button to generate one simulated minute.');
  if (tab === 'schema') return h('div', { class: 'md card outlined', html: markdown((await get('/api/file', { key: 'schema_md' })).content.split('## Card Metadata')[0]) });
  if (tab === 'reference') return referenceTab();
  return code((await get('/api/file', { key: 'producer' })).content);
}

async function renderBody() {
  clear(refs.tabs, tabs([{ key: 'feed', label: 'Live feed', icon: 'stream' }, { key: 'schema', label: 'Event schema', icon: 'schema' },
    { key: 'reference', label: 'Reference data', icon: 'badge', count: data.cards }, { key: 'source', label: 'producer.py', icon: 'code' }],
    tab, (k) => { tab = k; setPref('extract.tab', k); renderBody(); }));
  clear(refs.body, await body());
}

export default {
  async mount(root, ctx) {
    tab = ctx.sub || pref('extract.tab', 'feed');
    data = await get('/api/extract');
    refs = { stats: h('div'), tabs: h('div'), body: h('div'), settings: settings(data.config) };
    root.append(pageHead('Step 1 · Extract', 'Data sources',
      'The Python simulator produces realistic South African card transactions. Here it runs on a simulated clock, so you can create minutes of traffic in a second and still see every production behaviour the real producer sends to Azure.'),
      refs.stats, refs.settings, h('div', { class: 'card' }, refs.tabs, h('div', { style: { marginTop: '16px' } }, refs.body)));
    clear(refs.stats, stats(data));
    await renderBody();
  },
  async update() {
    data = await get('/api/extract');
    clear(refs.stats, stats(data));
    if (tab === 'feed') await renderBody();
  },
};