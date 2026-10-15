// about.js : About - the project, the author, how this app is built, and engineering notes.
import { h, icon, card, pageHead, table, chip } from '../ui.js';

const STACK = [
  ['Data source', 'Python simulator (simulator/producer.py, schema.py)', 'Poisson arrivals, bursts, 2% duplicates, 5% out-of-order, 1% late, log-normal ZAR amounts'],
  ['Ingestion', 'Azure Event Hubs (Standard)', 'Hub "transactions", 4 partitions, key card_id, consumer group stream-analytics'],
  ['Processing', 'Azure Stream Analytics', '6 query steps: dead-letter, tumbling, hopping, sliding velocity, amount anomaly, reference join'],
  ['Reference data', 'Azure Blob Storage', 'card_metadata.json - 5 000 cards with tier and credit limit'],
  ['Storage', 'Azure Cosmos DB (NoSQL)', 'fraud_pipeline: aggregates, fraud_alerts, dead_letter'],
  ['Visualisation', 'Power BI', 'Live operations, Fraud trends + drill-through, Pipeline health'],
  ['Infrastructure', 'Bicep', 'infra/eventhubs.bicep, infra/cosmosdb.bicep'],
  ['This app', 'Python standard library + plain HTML/CSS/JS', 'Material Design 3 styling, SVG charts, SQLite persistence, read-only SQL warehouse with a drag-and-drop query builder, no build step'],
];

const NOTES = [
  ['Late-arrival tolerance', 'asa/query.sql said 2 minutes; architecture.md and the starter guide said 5.', 'Resolved: 2 minutes everywhere (the latest query edit), also the default here.'],
  ['Latency measure', 'Query 6 wrote System.Timestamp() into ingestion_time, so the Power BI latency measure read close to zero.', 'Resolved: query 6 keeps e.ingestion_time and adds EventEnqueuedUtcTime / EventProcessedUtcTime for an ASA delay measure.'],
  ['Missing category', 'Events with a null merchant_category went to dead_letter and also reached aggregates.', 'Resolved: queries 2-6 now require merchant_category IS NOT NULL.'],
  ['--burst flag', 'A burst started on the first loop whether or not --burst was given.', 'Resolved: first burst after 5 minutes; --burst starts one immediately.'],
  ['Dead-letter path', 'producer.py never sent malformed events, so dead_letter stayed empty on Azure.', 'Resolved: producer.py sends 1% malformed events (--malformed P, 0 to disable).'],
  ['Velocity threshold', 'With 50 cards at 10 events/s a normal card made ~79 transactions per 5 minutes, so "> 5 in 5 min" fired on 98% of normal payments.', 'Decided: rule unchanged, card pool grown to 5 000 (0.14% noise, all simulated attacks caught). Record: docs/decisions/velocity_rule.md.'],
  ['Amount rule with 5 000 cards', 'Query 5 compared a payment with the same card’s 10-minute average; with 5 000 cards that history is usually empty, so only 14% of injected spikes were caught.', 'Decided: compare with the merchant category’s 10-minute average, pre-aggregated once a minute (97% caught, 0.05% false alerts, 1 joined row per payment instead of ~876). Record: velocity_rule.md section 6.'],
  ['Duplicates', 'Duplicate transaction_ids are kept by every query; counts and spend include them.', 'Documented: deduplication would need an extra step.'],
];

export default {
  mount(root) {
    root.append(
      pageHead('About', 'Real-time credit card fraud monitoring', 'ITRI613 Databases 1 \u00b7 Streaming data pipeline project, 2026'),
      h('div', { class: 'grid g2' },
        card('The project', null, h('div', {},
          h('p', {}, 'A bank must flag suspicious card activity within seconds, not after a nightly batch run. This project streams simulated South African card transactions through Azure: Event Hubs ingests them, Stream Analytics applies event-time windows and fraud rules, Cosmos DB stores the results as JSON documents, and Power BI turns them into an operational dashboard.'),
          h('p', {}, 'The two fraud rules are velocity (more than 5 transactions per card in 5 minutes) and amount anomaly (a payment above 3 times the card\u2019s 10-minute average). Malformed events go to a dead-letter container for audit.'),
          h('div', { class: 'chips' }, ['Event time vs processing time', 'Partitioning', 'Windowing', 'Reference joins', 'Dead-letter routing', 'Cost control'].map((t) => chip(t, 'on'))))),
        card('Author', null, h('div', {},
          h('div', { class: 'row' }, h('div', { class: 'icon-tile' }, icon('person')),
            h('div', {}, h('h3', {}, 'Colile Sibanda'), h('div', { class: 'muted' }, 'ITRI613 Databases 1 \u00b7 Semester 1'))),
          h('p', { style: { marginTop: '12px' } }, 'Azure resources live in resource group rg-itri613-fraud (namespace itri613colile-ehns, account itri613colile-cosmos).')))),
      card('Architecture', 'UML component diagram · docs/diagrams/architecture.svg (rebuild with python docs/diagrams/build_architecture.py)',
        h('a', { href: '/diagram/architecture.svg', target: '_blank', title: 'Open full size' },
          h('img', { src: '/diagram/architecture.svg', alt: 'Architecture: simulator, Event Hubs, Stream Analytics queries, Cosmos DB containers, Power BI', style: { width: '100%', height: 'auto', background: '#fff', borderRadius: '12px', border: '1px solid var(--outline-variant)' } }))),
      card('Technology stack', null, table([{ key: 0, label: 'Layer' }, { key: 1, label: 'Technology' }, { key: 2, label: 'Role in the pipeline' }], STACK, { wrap: true })),
      card('How this control centre works', null, h('div', {},
        h('p', {}, 'The app is a small Python web server (ui/) that serves this page on 127.0.0.1. Its ETL engine reuses simulator/schema.py and re-implements each Stream Analytics query step in Python, with the same time policies, windows, thresholds and document shapes, so the whole pipeline can be shown and tested without spending Azure credit.'),
        h('p', {}, 'The Azure page drives the real resources: it runs producer.py against Event Hubs and, when azure-cosmos is installed, reads the live containers. Secrets in simulator/.env are never sent to the browser.'),
        h('p', {}, 'Everything is saved in a SQLite database (ui/data/control_centre.db): the raw event log of each session, its settings, clock and random-generator state, the UI preferences and every Azure run log. The warehouse is rebuilt from the stored events, so a restart continues exactly where you stopped, with identical documents.'))),
      card('Engineering notes', 'Found while mirroring the pipeline step by step, and how each was handled',
        table([{ key: 0, label: 'Topic' }, { key: 1, label: 'Finding' }, { key: 2, label: 'Status' }], NOTES, { wrap: true })));
  },
};