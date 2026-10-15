// transform.js : Step 3 - Azure Stream Analytics. Time policy, the six query steps, live counts.
import { h, icon, clear, num, time, stat, card, pageHead, tabs, code, callout, snackbar, chip } from '../ui.js';
import { get, post } from '../api.js';
import { pref, setPref } from '../prefs.js';
import { renderExplorer } from './threshold.js';

const STEP_KEYS = { 0: null, 1: 'dead_letter', 2: 'card_windows', 3: 'category_trends', 4: 'velocity', 5: 'high_amount', 6: 'enriched' };
const STEP_OUT = { 0: 'query 5', 1: 'dead_letter', 2: 'aggregates', 3: 'aggregates', 4: 'fraud_alerts', 5: 'fraud_alerts', 6: 'aggregates' };
const WINDOWS = { 0: 'hopping 10 min / 1 min', 1: 'filter', 2: 'tumbling 1 min', 3: 'hopping 5 min / 1 min', 4: 'sliding 5 min', 5: 'join to CategoryAvg (1 row)', 6: 'reference join' };
let refs = {}, tab = 'steps', sql = '';
const opened = new Set();

function sections(text) {
  return text.split(/\n(?=-- \u2500\u2500 \d\.)/).slice(1).map((part) => {
    const m = part.match(/^-- \u2500\u2500 (\d)\. ([^\u2500\n]+)/);
    return { n: +m[1], title: m[2].trim(), sql: part.trim() };
  });
}

function policy(p) {
  const values = { ...p };
  const field = (key, label, min, max, step, unit) => {
    const out = h('b', {}, values[key] + unit);
    return h('div', { class: 'field' }, h('label', {}, label, out),
      h('input', { type: 'range', min, max, step, value: values[key], 'aria-label': label, oninput: (e) => { values[key] = +e.target.value; out.textContent = values[key] + unit; } }));
  };
  return card('Job settings', 'Event-ordering policy (action: Adjust) and the alert thresholds used in queries 4 and 5',
    h('div', { class: 'grid g4' },
      field('late_tolerance_s', 'Late-arrival tolerance', 0, 900, 30, ' s'),
      field('out_of_order_tolerance_s', 'Out-of-order tolerance', 0, 120, 5, ' s'),
      field('velocity_threshold', 'Velocity: alert when count >', 1, 150, 1, ''),
      field('velocity_window_s', 'Velocity window', 30, 600, 30, ' s'),
      field('amount_multiplier', 'High amount: x rolling avg', 1.5, 10, 0.5, 'x')),
    h('button', { class: 'btn', onclick: async () => { await post('/api/transform/policy', values); snackbar('Re-processing every event with the new settings'); refs.refresh(true); } }, icon('replay'), 'Apply and re-process'));
}

function insight(d) {
  const per = d.insight.expected_per_card, thr = d.insight.threshold;
  const win = d.insight.window_s % 60 === 0 ? (d.insight.window_s / 60) + ' minute' + (d.insight.window_s === 60 ? '' : 's') : d.insight.window_s + ' seconds';
  const fired = d.stages.collections.velocity / Math.max(1, d.stages.valid);
  return per > thr
    ? callout('lightbulb', [h('b', {}, 'Tuning insight. '), `At the current rate each of the ${num(d.insight.cards)} cards averages about ${per} transactions per ${win} (baseline, before bursts), above the threshold of ${thr}. So the velocity rule fires on ${(fired * 100).toFixed(0)}% of valid events. Raise the threshold, or lower the rate in Extract, to make VELOCITY alerts meaningful. The Threshold explorer tab shows the evidence.`], 'warn')
    : callout('check_circle', `Each of the ${num(d.insight.cards)} cards averages about ${per} transactions per ${win} (baseline, before bursts), below the threshold of ${thr}, so VELOCITY alerts flag genuinely unusual cards. Evidence: Threshold explorer tab and docs/decisions/velocity_rule.md.`);
}

function steps(d) {
  const counts = d.stages.collections;
  return h('div', { class: 'grid g2' }, sections(sql).map((s) =>
    h('details', { class: 'card', open: opened.has(s.n), ontoggle: (e) => { e.target.open ? opened.add(s.n) : opened.delete(s.n); setPref('transform.open', [...opened]); } },
      h('summary', {}, h('div', { class: 'row between', style: { display: 'inline-flex', width: 'calc(100% - 24px)' } },
        h('span', {}, 'Query ' + s.n + ' · ' + s.title),
        h('span', { class: 'row' }, chip(WINDOWS[s.n], 'on'), chip((STEP_KEYS[s.n] ? num(counts[STEP_KEYS[s.n]]) + ' → ' : 'feeds ') + STEP_OUT[s.n], '', 'output')))),
      code(s.sql))));
}

function summary(d) {
  const adj = d.adjusted;
  return h('div', { class: 'grid g5' },
    stat('Events in', num(d.stages.ingested), 'from EventHubInput', 'login'),
    stat('Dead-lettered', num(d.stages.dead_letter), 'query 1', 'report'),
    stat('Valid events', num(d.stages.valid), 'feed queries 2-6', 'verified'),
    stat('Timestamps adjusted', num((adj.late_arrival || 0) + (adj.out_of_order || 0)), num(adj.late_arrival || 0) + ' late · ' + num(adj.out_of_order || 0) + ' out of order', 'history'),
    stat('Watermark', time(d.watermark), 'windows close at this point', 'water'));
}

async function render(force) {
  const d = await get('/api/transform');
  clear(refs.summary, summary(d));
  clear(refs.insight, insight(d));
  if (force || !refs.policy.firstChild) clear(refs.policy, policy(d.policy));
  clear(refs.tabs, tabs([{ key: 'steps', label: 'Query steps', icon: 'account_tree' }, { key: 'threshold', label: 'Threshold explorer', icon: 'tune' },
    { key: 'full', label: 'query.sql', icon: 'code' }], tab, (k) => { tab = k; setPref('transform.tab', k); render(true); }));
  if (tab === 'threshold') { if (force) await renderExplorer(refs.body, () => refs.refresh(true)); return; }
  clear(refs.body, tab === 'steps' ? steps(d) : code(sql));
}

export default {
  async mount(root, ctx) {
    tab = ctx.sub || pref('transform.tab', 'steps');
    pref('transform.open', []).forEach((n) => opened.add(n));
    sql = (await get('/api/file', { key: 'asa_query' })).content.replace(/\r/g, '');
    refs = { summary: h('div'), insight: h('div'), policy: h('div'), tabs: h('div'), body: h('div', { style: { marginTop: '16px' } }), refresh: (f) => { ctx.refreshStatus(true); render(f); } };
    root.append(pageHead('Step 3 · Transform', 'Azure Stream Analytics',
      'Job fraud-pipeline-asa reads with TIMESTAMP BY event_time, so windows follow when a payment happened rather than when it arrived. The local engine mirrors asa/query.sql step by step; change a setting and every event is processed again.'),
      refs.summary, refs.insight, refs.policy, h('div', {}, refs.tabs, refs.body));
    await render(true);
  },
  async update() { await render(false); },
};