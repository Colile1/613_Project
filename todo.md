# Project Todo List

## Completed

- [x] Define project scenario (credit card fraud monitoring)
- [x] Write scenario justification (streaming vs batch rationale)
- [x] Design UML component diagram (docs/architecture.md)
- [x] Design partition strategy and justify card_id partitioning
- [x] Define event schema with all fields (docs/schema.md)
- [x] Create Cosmos DB data model with 3 containers (docs/schema.md)
- [x] Write Python event simulator (simulator/producer.py)
  - [x] Baseline 10 evt/sec with Poisson inter-arrival
  - [x] Burst traffic 5× rate for 30s every ~5 min
  - [x] 2% duplicate events (same transaction_id)
  - [x] 5% out-of-order events (30–120s back-dated event_time)
  - [x] 1% late-arriving events (>5 min back-dated event_time)
  - [x] Log-normal amount distribution (mean ~R500)
- [x] Write simulator schema dataclasses (simulator/schema.py)
- [x] Create card reference dataset (reference_data/card_metadata.json; 5 000 cards since 2026-10-15)
- [x] Write Azure Stream Analytics query (asa/query.sql)
  - [x] Dead-letter filter (malformed events)
  - [x] 1-min tumbling window aggregates per card
  - [x] 5-min hopping window per category
  - [x] 5-min sliding velocity alert (>5 tx → VELOCITY)
  - [x] 10-min rolling average anomaly (amount > 3× avg → HIGH_AMOUNT)
  - [x] Reference join enrichment (card metadata → customer tier, credit limit)
- [x] Write Event Hubs Bicep template (infra/eventhubs.bicep)
- [x] Write Cosmos DB Bicep template (infra/cosmosdb.bicep)
- [x] Set up cost tracking and budget alerts (docs/cost_tracking.md)
- [x] Write architecture documentation (docs/architecture.md)

## In Progress

- [ ] Deploy Bicep templates to Azure resource group
- [x] Configure simulator .env file with Event Hubs connection string
- [ ] Upload card_metadata.json to Blob Storage (reference input)
- [ ] Deploy and start ASA job

## Pending — Azure Deployment

- [ ] Create Azure resource group: `rg-itri613-fraud`
- [ ] Deploy infra/eventhubs.bicep
- [ ] Deploy infra/cosmosdb.bicep
- [ ] Create Blob Storage account for reference data
- [ ] Upload reference_data/card_metadata.json to Blob Storage
- [ ] Create ASA job and import asa/query.sql
- [ ] Configure ASA inputs (EventHubInput streaming + CardMetadata reference)
- [ ] Configure ASA outputs (CosmosAggregates, CosmosFraudAlerts, CosmosDeadLetter)
- [ ] Set ASA late arrival tolerance: 2 min; out-of-order tolerance: 30s
- [ ] Start ASA job and verify it reaches Running state

## Pending — Simulator

- [x] Copy simulator/config.env.sample → simulator/.env
- [x] Fill in EVENTHUB_CONNECTION_STRING in .env
- [ ] Run `pip install -r simulator/requirements.txt`
- [ ] Run simulator: `python simulator/producer.py --duration 60` (smoke test)
- [ ] Verify events appear in Event Hubs metrics (portal)
- [ ] Verify ASA processes events (check Cosmos DB document counts)

## Pending — Power BI

- [ ] Open Power BI Desktop
- [ ] Connect to Cosmos DB using Azure Cosmos DB connector
  - [ ] aggregates container (for Live Operations page)
  - [ ] fraud_alerts container (for Fraud Trends page)
  - [ ] dead_letter container (for Pipeline Health page)
- [ ] Build Page 1: Live Operations
  - [ ] Transactions/min gauge (from aggregates)
  - [ ] Fraud alerts/min card (from fraud_alerts)
  - [ ] Avg pipeline latency measure (ingestion_time − event_time)
- [ ] Build Page 2: Fraud Trends
  - [ ] Line chart: alerts over time (detected_at axis)
  - [ ] Bar chart: alerts by merchant_category
  - [ ] Table: top-10 flagged cards (conditional red highlight via rules)
  - [ ] Drill-through page: card → all transactions
- [ ] Build Page 3: Pipeline Health
  - [ ] Dead-letter count trend (line chart)
  - [ ] Dead-letter reason breakdown (pie chart)
  - [ ] Event throughput indicator
- [ ] Add slicers: date range, alert_type, merchant_category
- [ ] Configure auto-refresh (1-minute dataset refresh)
- [ ] Export screenshots of all 3 pages for submission

## Pending — Observability & Performance

- [ ] Capture Event Hubs metrics screenshot (events in/out, throughput)
- [ ] Capture ASA metrics screenshot (events in, events out, latency, watermark delay)
- [ ] Record Cosmos DB document counts after 10-min simulator run
- [ ] Calculate end-to-end latency: avg(ingestion_time − event_time)
- [ ] Update docs/cost_tracking.md with actual session costs

## Pending — Submission

- [ ] Final review of all rubric criteria (README.md rubric section)
- [ ] Ensure all 3 Power BI pages are captured as screenshots
- [ ] Package project folder for submission

## Control Centre UI (ui/)

- [x] Build local pipeline engine mirroring asa/query.sql (ui/etl)
- [x] Build standard-library web server and JSON API (ui/server)
- [x] Build Material-style interface: Overview, Extract, Ingest, Transform, Warehouse (6 sub-tabs), Analytics (4 pages), Azure, Project files, User guide, About
- [x] Connect Azure page to the real producer.py and optional live Cosmos DB reader
- [x] Resolve engineering notes: late-arrival tolerance aligned to 2 min, query 6 keeps ingestion_time (+ enqueued/processed time), null category excluded from queries 2-6, producer --burst fixed, producer sends 1% malformed events
- [x] Gather evidence for the velocity threshold (Transform > Threshold explorer, simulated card-testing attacks)
- [x] Choose the velocity rule: Option 4 - rule unchanged (> 5 in 5 min), card pool grown to 5 000 (docs/decisions/velocity_rule.md)
- [x] Query 5 (amount anomaly) now compares with the merchant category's 10-minute average across all cards (97% of spikes caught, 0.07% false alerts; velocity_rule.md section 6)
- [x] Pre-aggregate query 5's category average (WITH CategoryAvg, one joined row per payment instead of ~876)
- [ ] After deploying, confirm the job accepts the WITH step at the top of asa/query.sql and check SU % utilisation
- [ ] Upload the new card_metadata.json to Blob Storage and restart the ASA job
- [x] Architecture diagram as a proper UML component figure (docs/diagrams/architecture.svg/.png, zero crossing connectors)
- [x] Stream Analytics job as code (infra/streamanalytics.bicep) and one-command deploy script (infra/deploy.ps1) - not yet validated: Azure CLI/Bicep not installed on this machine
- [x] Power BI export from the local warehouse (CSV + Power Query) so the report can be built before Azure is live
- [ ] Build the Power BI report from powerbi/local_data (Analytics > Export for Power BI), then switch the source to Cosmos DB
- [x] Query page: drag-and-drop builder and SQL editor, switchable at any time; Library (examples, saved, history); table/chart results; CSV/JSON export
- [x] Warehouse page: column sort, field filter, full-tab CSV/JSON export, Open in Query, Data model view (lineage, relationships, field profiles)
- [x] Builder: automatic joins, calculated columns, AND/OR filters, in list / between / like, custom GROUP BY, HAVING, Distinct, Offset
- [x] SQL editor: syntax highlighting, alias-aware autocomplete, Format; any single SELECT opens in the builder
- [x] Save any query (WITH, UNION, sub-queries) as a view the builder can use
- [x] UI options for everything that needed a terminal: Tools page (studies, cards, diagram, screenshots, todo/log, backups/restore/import), Azure Settings/Deploy/Cost tabs, producer rate, Transform > Write to project files
- [ ] Install the Azure CLI so the Azure > Deploy buttons can run
- [x] Capture UI screenshots for the report (fraud-613/screenshots/ui_*.png)
- [x] Persist everything in SQLite (sessions, event log, settings, UI preferences, run logs) with restart/crash recovery
- [x] Saved sessions: switch, create, rename, delete, export JSON, back up database
- [x] Write rubric review (docs/rubric_review.md)