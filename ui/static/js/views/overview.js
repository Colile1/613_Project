// overview.js : the whole pipeline on one page - live flow diagram, KPIs, environment, rubric map.
import { h, icon, clear, num, time, stat, card, pageHead, status, snackbar, table } from '../ui.js';
import { post } from '../api.js';
import { openSessions } from '../sessions.js';

let refs = {};

const STAGES = [
  { key: 'extract', step: 'Step 1 · Extract', name: 'Data sources', tech: 'Python simulator · producer.py', icon: 'input', metric: (s) => s.extracted, unit: 'events generated' },
  { key: 'ingest', step: 'Step 2 · Ingest', name: 'Event Hubs', tech: 'transactions · 4 partitions · key card_id', icon: 'move_to_inbox', metric: (s) => s.ingested, unit: 'events ingested' },
  { key: 'transform', step: 'Step 3 · Transform', name: 'Stream Analytics', tech: '6 queries · TIMESTAMP BY event_time', icon: 'transform', metric: (s) => s.valid, unit: 'valid events' },
  { key: 'warehouse', step: 'Step 4 · Load', name: 'Cosmos DB warehouse', tech: 'fraud_pipeline · 3 containers', icon: 'database', metric: (s) => Object.values(s.containers).reduce((a, b) => a + b, 0), unit: 'documents stored' },
  { key: 'analytics', step: 'Step 5 · Analyse', name: 'Power BI report', tech: '3 pages + drill-through', icon: 'monitoring', metric: (s) => s.alerts, unit: 'fraud alerts raised' },
];

const RUBRIC = [
  ['Problem definition & UML architecture', 'Overview flow, About, Project files › Architecture'],
  ['Data generation, realism & schema', 'Extract › Live feed, Event schema, Reference data'],
  ['Ingestion & Event Hubs design', 'Ingest › partitions, throughput, arrival lag'],
  ['Stream processing design & correctness', 'Transform › time policy, 6 query steps'],
  ['Storage & Cosmos DB modelling', 'Warehouse › 3 containers, 6 sub-tabs'],
  ['Power BI analytics & actionable insight', 'Analytics › Live ops, Fraud trends, Health, Card detail'],
  ['Observability, performance & cost', 'Analytics › Pipeline health, Azure › cost estimator'],
  ['Advanced features', 'Local ASA mirror, fraud injection, live Cosmos reader'],
];

function flow(ctx) {
  const st = ctx.status.stages;
  return h('div', { class: 'flow' + (ctx.status.sim.running ? ' running' : '') }, STAGES.map((s) =>
    h('div', { class: 'flow-node', role: 'link', tabindex: 0, onclick: () => ctx.go(s.key), onkeydown: (e) => e.key === 'Enter' && ctx.go(s.key) },
      h('div', { class: 'row between' }, h('div', { class: 'icon-box' }, icon(s.icon)), h('span', { class: 'stage' }, s.step)),
      h('div', { class: 'name' }, s.name), h('div', { class: 'tech' }, s.tech),
      h('div', { class: 'big' }, num(s.metric(st))), h('div', { class: 'tech' }, s.unit))));
}

function kpis(ctx) {
  const st = ctx.status.stages, sim = ctx.status.sim;
  return h('div', { class: 'grid g5' },
    stat('Events extracted', num(st.extracted), sim.running ? 'stream is live' : 'stream paused', 'bolt'),
    stat('Dead-lettered', num(st.dead_letter), 'malformed events routed out', 'report'),
    stat('Fraud alerts', num(st.alerts), num(st.collections.high_amount) + ' high-amount', 'crisis_alert'),
    stat('Simulated clock', time(sim.sim_clock), num(sim.elapsed_s) + ' s simulated', 'schedule'),
    stat('ASA watermark', time(ctx.status.watermark), 'windows closed up to here', 'water'));
}

function environment(env) {
  return card('Environment', 'What this machine can reach', h('div', { class: 'chips' },
    status(true, 'Local pipeline engine'),
    status(env.eventhub_configured, env.eventhub_configured ? 'Event Hubs: ' + env.eventhub_namespace : 'Event Hubs .env not set'),
    status(env.sdk_eventhub, 'azure-eventhub SDK'),
    status(env.sdk_cosmos && env.cosmos_configured, 'Cosmos DB live reader'),
    status(env.az_cli, 'Azure CLI')),
    h('button', { class: 'btn text', onclick: () => location.hash = '#/azure' }, 'Open Azure'));
}

function saved(ctx) {
  const s = ctx.status.sim, st = ctx.status.storage;
  return card('Saved data', 'SQLite database · every event and setting is committed as it happens', h('div', { class: 'grid' },
    h('dl', { class: 'kv' },
      h('dt', {}, 'Open session'), h('dd', {}, s.session_name),
      h('dt', {}, 'Events stored'), h('dd', {}, num(s.events) + ' of ' + num(s.max_events)),
      h('dt', {}, 'Last write'), h('dd', {}, st.saved_at ? new Date(st.saved_at).toLocaleString('en-ZA', { hour12: false }) : 'nothing yet'),
      h('dt', {}, 'Database file'), h('dd', {}, st.path)),
    h('p', { class: 'muted small' }, 'Close the app or the browser at any time: the next start reopens this session, page, tabs and filters. The warehouse is rebuilt from the stored events, so it always matches them exactly.')),
    h('button', { class: 'btn tonal', onclick: () => openSessions(() => ctx.refreshStatus(true)) }, icon('folder_open'), 'Sessions'));
}

async function quick(seconds, msg, ctx) {
  await post('/api/sim/advance', { seconds });
  snackbar(msg);
  ctx.refreshStatus(true);
}

export default {
  async mount(root, ctx) {
    refs = { flow: h('div'), kpis: h('div') };
    root.append(
      pageHead('Real-time credit card fraud monitoring', 'Pipeline overview',
        'Follow a card transaction from the moment it is generated, through Event Hubs and Stream Analytics, into the Cosmos DB warehouse and out to the Power BI report. Click any stage to open it.',
        [h('button', { class: 'btn', onclick: () => quick(300, 'Generated 5 simulated minutes of traffic', ctx) }, icon('play_circle'), 'Generate 5 min of data'),
         h('button', { class: 'btn tonal', onclick: () => post('/api/sim/start', { speed: 10 }).then(() => ctx.refreshStatus(true)) }, icon('stream'), 'Start live stream')]),
      refs.flow, refs.kpis,
      h('div', { class: 'grid g2' },
        card('How the data moves', null, h('ol', { class: 'steps' },
          h('li', {}, h('div', {}, h('b', {}, 'Extract. '), 'The simulator creates ZAR card transactions with Poisson arrivals, bursts, duplicates, out-of-order and late events.')),
          h('li', {}, h('div', {}, h('b', {}, 'Ingest. '), 'Each event is sent to the Event Hub with partition key card_id, so one card always lands on one partition.')),
          h('li', {}, h('div', {}, h('b', {}, 'Transform. '), 'Stream Analytics stamps event time, routes malformed events to dead-letter, windows, detects fraud and enriches with card metadata.')),
          h('li', {}, h('div', {}, h('b', {}, 'Load. '), 'Outputs land as JSON documents in three Cosmos DB containers: aggregates, fraud_alerts and dead_letter.')),
          h('li', {}, h('div', {}, h('b', {}, 'Analyse. '), 'The Power BI report reads the containers: live KPIs, fraud trends with drill-through, and pipeline health.')))),
        h('div', { class: 'grid' }, refs.env = h('div', { class: 'grid' }),
          card('Where each rubric criterion lives', null, table([{ key: 0, label: 'Criterion' }, { key: 1, label: 'Open in this app' }], RUBRIC, { height: '340px', wrap: true })))));
    this.update(ctx);
  },
  update(ctx) {
    if (!ctx.status) return;
    clear(refs.flow, flow(ctx));
    clear(refs.kpis, kpis(ctx));
    clear(refs.env, saved(ctx), environment(ctx.status.env));
  },
};