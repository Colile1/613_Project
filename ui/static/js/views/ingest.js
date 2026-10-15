// ingest.js : Step 2 - Azure Event Hubs. Partition distribution, throughput, arrival lag.
import { h, clear, num, pct, stat, card, pageHead, tabs, table, code, callout } from '../ui.js';
import { get } from '../api.js';
import { lineChart, barChart } from '../charts.js';
import { pref, setPref } from '../prefs.js';

let refs = {}, tab = 'live';

function live(d) {
  const shares = d.partitions.map((p) => p.share);
  const skew = d.total ? Math.max(...shares) / Math.min(...shares.filter((s) => s > 0).concat([1])) : 0;
  return h('div', { class: 'grid' },
    h('div', { class: 'grid g4' },
      stat('Events ingested', num(d.total), 'all partitions', 'move_to_inbox'),
      stat('Peak throughput', num(d.peak_eps) + ' /s', 'bursts are 5x baseline', 'speed'),
      stat('Partition skew', d.total ? skew.toFixed(2) + 'x' : '-', 'largest / smallest partition', 'balance'),
      stat('Duplicates received', num(d.duplicates), 'Event Hubs does not dedupe', 'content_copy')),
    h('div', { class: 'grid g2' },
      card('Throughput', 'Events per second by send time (last 3 simulated minutes)',
        lineChart({ series: [{ name: 'Events per second', color: '--s1', points: d.throughput.map((p) => ({ t: p.t, v: p.events })) }], height: 240 })),
      card('Events per partition', 'Partition key card_id - each card always maps to the same partition',
        h('div', { class: 'grid' },
          barChart({ items: d.partitions.map((p) => ({ k: 'Partition ' + p.partition, v: p.events })) }),
          table([{ key: 'partition', label: 'Partition', num: true }, { key: 'events', label: 'Events', num: true, fmt: num },
            { key: 'share', label: 'Share', num: true, fmt: (v) => pct(v) }, { key: 'cards', label: 'Cards', num: true }], d.partitions)))),
    card('Arrival lag', 'ingestion_time minus event_time: the gap Stream Analytics must absorb',
      barChart({ items: d.lag_bands.map((b, i) => ({ k: b.band, v: b.events, color: i === 0 ? '--s1' : i === 3 ? '--s2' : '--s3' })) })));
}

function design(cfg) {
  return h('div', { class: 'grid g2' },
    card('Hub configuration', 'From infra/eventhubs.bicep', h('dl', { class: 'kv' },
      Object.entries(cfg).flatMap(([k, val]) => [h('dt', {}, k.replace(/_/g, ' ')), h('dd', {}, String(val))]))),
    card('Why card_id is the partition key', null, h('div', {},
      h('p', {}, h('b', {}, 'Per-card ordering. '), 'All events of a card share a partition, so the 5-minute velocity window counts them in order.'),
      h('p', {}, h('b', {}, 'Scale. '), '4 partitions give about 4 MB/s ingress, far above the 10-50 events/s demo load.'),
      h('p', {}, h('b', {}, 'Trade-off. '), 'A very busy card creates a hot partition. The 5 000-card pool keeps the spread even - check the skew figure on the Live tab.'),
      callout('info', 'Event Hubs hashes keys internally; the partition numbers here use a stable CRC32 stand-in, so the distribution is realistic but the exact numbers differ from Azure.'))));
}

async function renderBody() {
  const d = await get('/api/ingest');
  clear(refs.tabs, tabs([{ key: 'live', label: 'Live metrics', icon: 'monitoring' }, { key: 'design', label: 'Partition design', icon: 'account_tree' }, { key: 'bicep', label: 'eventhubs.bicep', icon: 'code' }], tab, (k) => { tab = k; setPref('ingest.tab', k); renderBody(); }));
  clear(refs.body, tab === 'live' ? live(d) : tab === 'design' ? design(d.config) : code((await get('/api/file', { key: 'eventhubs_bicep' })).content));
}

export default {
  async mount(root, ctx) {
    tab = ctx.sub || pref('ingest.tab', 'live');
    refs = { tabs: h('div'), body: h('div', { style: { marginTop: '16px' } }) };
    root.append(pageHead('Step 2 · Ingest', 'Azure Event Hubs',
      'Events enter the "transactions" hub over AMQP. Four partitions keyed by card_id keep each card in order while spreading load. Stream Analytics reads through its own consumer group.'),
      h('div', {}, refs.tabs, refs.body));
    await renderBody();
  },
  async update() { if (tab === 'live') await renderBody(); },
};