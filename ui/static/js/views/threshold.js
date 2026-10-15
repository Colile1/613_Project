// threshold.js : Threshold explorer for the velocity rule (query 4).
// Sweeps thresholds per sliding-window length and plots normal-traffic alert rate
// against card-testing attack detection, then recommends the smallest threshold
// that keeps noise under 1%.
import { h, icon, clear, num, card, callout, chip, code, snackbar, table } from '../ui.js';
import { get, post } from '../api.js';
import { lineChart } from '../charts.js';
import { pref, setPref } from '../prefs.js';

const pct = (v) => (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
const label = (s) => (s % 60 === 0 ? s / 60 + ' min' : s + ' s');

export async function renderExplorer(box, onApplied) {
  clear(box, h('div', { class: 'empty' }, 'Sweeping thresholds over every valid event...'));
  const d = await get('/api/threshold');
  let windowS = pref('threshold.window', d.best_window_s);
  const draw = () => {
    const w = d.windows.find((x) => x.window_s === windowS) || d.windows[0];
    const cur = w.window_s === d.current.window_s ? w.rows.find((r) => r.threshold === d.current.threshold) : null;
    const keep = !!cur && cur.normal_alert_rate <= d.target_normal_rate && cur.attack_detection >= w.recommended.attack_detection;
    const rec = keep ? cur : w.recommended;
    const cap = Math.min(w.rows.length, Math.max(20, Math.ceil(w.normal_p99 * 1.6)));
    const rows = w.rows.slice(0, cap);
    const sql = keep && w.window_s === 300
      ? `GROUP BY card_id, SlidingWindow(minute, 5)\nHAVING COUNT(*) > ${rec.threshold}`
      : `GROUP BY card_id, SlidingWindow(second, ${w.window_s})\nHAVING COUNT(*) > ${rec.threshold}`;
    const noAttacks = rec.attacks === 0;
    clear(box,
      callout('science', [h('b', {}, 'How to read this. '), 'For every valid transaction the engine counts the card\u2019s transactions in the sliding window ending at it - exactly what query 4 tests. Simulated card-testing attacks (one card firing 8-15 payments within a second, Extract \u203a settings) show whether a threshold would catch real abuse; payments made while an attack is still inside the window do not count as noise. Data: ' + d.rate + ' events/s, thresholds 1-' + num(d.windows[0].rows.length) + ' swept per window.']),
      h('div', { class: 'toolbar' }, h('span', { class: 'small muted' }, 'Sliding window:'),
        d.windows.map((x) => h('button', { class: 'chip' + (x.window_s === windowS ? ' on' : ''), onclick: () => { windowS = x.window_s; setPref('threshold.window', windowS); draw(); } },
          label(x.window_s), x.window_s === d.best_window_s ? ' (best)' : ''))),
      h('div', { class: 'grid g2' },
        card('Noise versus detection', `Window ${label(w.window_s)} \u00b7 normal cards: median ${w.normal_median}, 99th percentile ${w.normal_p99} transactions`,
          lineChart({ series: [
            { name: 'Normal transactions that alert', color: '--s2', points: rows.map((r) => ({ t: r.threshold, v: r.normal_alert_rate * 100 })) },
            { name: 'Card-testing attacks detected', color: '--s1', points: rows.map((r) => ({ t: r.threshold, v: r.attack_detection * 100 })) }],
          fmtY: (v) => v.toFixed(0) + '%', height: 260 }),
          h('div', { class: 'small muted' }, 'x axis: threshold (alert when count > x)')),
        card('Recommendation', keep ? 'Your current rule already meets the target (at most 1% noise) with full detection - keep it' : 'Smallest threshold with at most 1% of normal transactions alerting', h('div', { class: 'grid' },
          h('dl', { class: 'kv' },
            h('dt', {}, 'Window'), h('dd', {}, label(w.window_s)),
            h('dt', {}, 'Threshold'), h('dd', {}, 'count > ' + rec.threshold),
            h('dt', {}, 'Normal alert rate'), h('dd', {}, pct(rec.normal_alert_rate)),
            h('dt', {}, 'Attacks detected'), h('dd', {}, noAttacks ? 'no attacks in this session' : pct(rec.attack_detection) + ' of ' + rec.attacks),
            h('dt', {}, 'Current setting'), h('dd', {}, `> ${d.current.threshold} over ${label(d.current.window_s)}` + (cur ? ` \u00b7 ${pct(cur.normal_alert_rate)} noise, ${pct(cur.attack_detection)} detected` : ''))),
          rec.attack_detection < 0.5 && !noAttacks
            ? callout('warning', `No threshold separates attacks from normal traffic at ${d.rate} events/s over ${num(d.cards)} cards - each card is simply too busy. Spread the traffic over more cards (see docs/decisions/velocity_rule.md) or lower the rate in Extract.`, 'warn')
            : callout('check_circle', 'This setting catches most attacks while keeping alerts rare enough for an analyst queue.'),
          h('div', {}, h('div', { class: 'small muted', style: { marginBottom: '4px' } }, keep ? 'Query 4 stays as it is in asa/query.sql (decision: docs/decisions/velocity_rule.md):' : 'Query 4 in asa/query.sql would become:'), code(sql)),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: async () => { await post('/api/transform/policy', { velocity_threshold: rec.threshold, velocity_window_s: w.window_s }); snackbar('Applied: count > ' + rec.threshold + ' over ' + label(w.window_s)); onApplied(); } }, icon('check'), 'Apply to local pipeline'),
            h('button', { class: 'btn text', onclick: () => { navigator.clipboard.writeText(sql); snackbar('SQL copied'); } }, icon('content_copy'), 'Copy SQL'))))),
      card('All windows at a glance', null, table([{ key: 'window_s', label: 'Window', fmt: label }, { key: 'normal_median', label: 'Median count', num: true },
        { key: 'normal_p99', label: '99th percentile', num: true }, { key: 'recommended', label: 'Threshold', num: true, fmt: (r) => '> ' + r.threshold },
        { key: 'recommended', label: 'Noise', num: true, fmt: (r) => pct(r.normal_alert_rate) },
        { key: 'recommended', label: 'Detected', num: true, fmt: (r) => (r.attacks ? pct(r.attack_detection) : '-') }], d.windows)));
  };
  draw();
}