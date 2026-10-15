# Development Log

## [2026-04-28] Project initialisation and scenario selection

**What was done:** Selected credit card fraud monitoring as the streaming scenario and defined the project scope.

**Why:** Fraud detection is a canonical streaming problem — the value of detection collapses to zero if you wait hours. Velocity checks (>5 transactions in 5 minutes per card) and amount anomaly detection (single transaction > 3× rolling average) are impossible to implement correctly with batch jobs. The scenario maps cleanly to every rubric criterion: data generation, ingestion, stream processing, storage, and real-time visualisation.

**Impact:** All downstream design decisions (partition key, window types, Cosmos DB schema) flow from this scenario choice. Choosing a different scenario at this stage would require rebuilding the schema and query logic.

---

## [2026-04-28] Architecture design — UML component diagram

**What was done:** Designed the full system architecture: Python Simulator → Azure Event Hubs → Azure Stream Analytics → Azure Cosmos DB → Power BI. Documented in `docs/architecture.md` with an ASCII UML component diagram.

**Why:** The UML diagram was designed before writing any code to lock in the data flow and identify all integration points. The component boundary between Event Hubs (ingestion) and ASA (processing) is critical — it determines the partition strategy, consumer group design, and TIMESTAMP BY semantics.

**Impact:** Architecture document serves as the specification for all implementation files. The layered structure (Sources → Ingestion → Processing → Storage → Visualisation) matches the rubric criteria 1-to-1.

---

## [2026-04-29] Partition key decision — card_id

**What was done:** Chose `card_id` as the Event Hubs partition key (4 partitions). Documented the trade-offs in `docs/architecture.md` under "Partition Strategy".

**Why:** Velocity detection requires counting transactions per card within a 5-minute window. If events for the same card scatter across partitions, ASA would need to aggregate across partitions — possible, but more complex and with higher watermark latency. Pinning a card to one partition guarantees in-order delivery within that card's stream, which simplifies sliding window correctness.

**Trade-off acknowledged:** Hot partitions are possible if a small number of cards dominate volume. Mitigated by the 50-card simulator pool, which distributes load approximately evenly across 4 partitions.

**Impact:** The simulator's `send_batch()` function passes `partition_key=card_id` explicitly. The ASA query uses `TIMESTAMP BY event_time` (not processing time) because the partition guarantee means event-time ordering is reliable within each card's stream.

---

## [2026-04-29] Event schema design

**What was done:** Defined the full JSON event schema in `docs/schema.md` and implemented it as Python dataclasses in `simulator/schema.py`. Schema includes: `transaction_id`, `card_id`, `merchant_id`, `merchant_category`, `amount`, `currency`, `location` (city, lat, lng), `event_time`, `ingestion_time`, `is_duplicate`, `sequence_number`.

**Why:** Separating `event_time` (when the transaction occurred) from `ingestion_time` (when the simulator sent it) is essential for demonstrating event-time vs processing-time awareness — a key rubric requirement. The `sequence_number` field allows downstream consumers to detect gaps or reordering without relying solely on timestamps.

**Impact:** ASA uses `TIMESTAMP BY event_time` throughout, so all windows are computed in event time. The latency metric in Power BI (ingestion_time − event_time) directly measures end-to-end pipeline delay and is only possible because both timestamps are present in every event.

---

## [2026-04-29] Simulator implementation

**What was done:** Implemented `simulator/producer.py` — a production-realistic event generator with: Poisson-distributed inter-arrival times, 5× burst mode (30s every 5 min), 2% duplicates (same transaction_id re-sent), 5% out-of-order (event_time 30–120s in the past), 1% late arrivals (event_time >5 min in the past), log-normal amount distribution (mean ~R500).

**Why:** The rubric requires evidence of "production-like behaviours." Each anomaly type maps to a specific ASA configuration requirement:
- Duplicates → deduplication logic (transaction_id uniqueness checking in downstream consumers)
- Out-of-order → ASA out-of-order tolerance: 30 seconds
- Late arrivals → ASA late arrival tolerance: 5 minutes
- Bursts → demonstrates throughput scaling; Event Hubs absorbs the spike without back-pressure

**Why log-normal amounts:** Most card transactions are small (groceries, petrol), but rare large ones exist (travel, electronics). A log-normal distribution captures this naturally — the median is ~R490, but the 99th percentile is ~R1,200, and occasional outliers reach the R50,000 cap.

**Impact:** The simulator is the only component that runs locally. Everything else is cloud-hosted. The `--duration` flag enables reproducible smoke tests without running indefinitely.

---

## [2026-04-29] Stream Analytics query design

**What was done:** Wrote `asa/query.sql` with 6 processing paths: (1) dead-letter filter, (2) 1-min tumbling aggregates per card, (3) 5-min hopping window per category, (4) 5-min sliding velocity alert, (5) 10-min rolling average anomaly alert, (6) reference join enrichment.

**Why each window type was chosen:**
- **Tumbling (1 min):** Non-overlapping, each event counted once. Clean for "transactions per minute" KPIs in Power BI.
- **Hopping (5 min, 1-min hop):** Overlapping, produces a smoothed trend line per category every minute. Better for trend charts than a tumbling window which would be jagged.
- **Sliding (5 min):** Fires on every event, checking if the trailing 5-min window exceeds the threshold. Only sliding windows can generate an alert the moment the 6th transaction occurs, not after the window closes.
- **Self-join with tumbling CTE:** The amount anomaly pattern requires comparing a current event against a windowed aggregate. ASA doesn't support direct subqueries in HAVING, so the WITH clause pre-computes the 10-min average and the JOIN links each event to its card's recent average.

**Why dead-letter first:** Invalid events are filtered in the first SELECT statement before any downstream query can see them. This matches event-driven architecture best practice (fail fast at ingestion, never propagate bad data).

**Impact:** Six outputs feed three Cosmos DB containers. The query is self-contained and can be validated in the ASA query test tool before deployment.

---

## [2026-04-29] Cosmos DB schema and Bicep template

**What was done:** Designed three Cosmos DB containers — `aggregates` (/card_id, TTL 7 days), `fraud_alerts` (/card_id, TTL 30 days), `dead_letter` (/ingestion_date, no TTL). Provisioned via `infra/cosmosdb.bicep`.

**Why three containers:** Mixing aggregates, alerts, and dead-letter events in one container would require complex filter queries in Power BI and prevent efficient partition pruning. Separate containers allow each Power BI page to connect to exactly the data it needs.

**Why card_id as partition key for aggregates/alerts:** Power BI's "top-10 flagged cards" visual and the drill-through page both query by card_id. Aligning the Cosmos DB partition key with the most common query predicate eliminates cross-partition fan-out for these queries.

**Why ingestion_date for dead_letter:** Dead-letter events are queried by time range (e.g., "how many bad events in the last hour?"), not by card. Partitioning by date prevents a single partition from accumulating all documents indefinitely and allows efficient time-range queries.

**Impact:** TTL policies prevent unbounded storage growth — the project runs within the $100 credit limit even if left running for several days.

---

## [2026-04-30] Infrastructure as code — Bicep templates

**What was done:** Wrote `infra/eventhubs.bicep` (Event Hubs namespace, hub, consumer group, SAS policies) and `infra/cosmosdb.bicep` (Cosmos DB account, database, 3 containers).

**Why Bicep over manual portal clicks:** Bicep templates are reproducible — if the resource group is deleted or needs to be recreated, running `az deployment group create` rebuilds the entire infrastructure in ~3 minutes with no manual steps. This also serves as living documentation of every configuration decision (partition count, retention, consistency level, RU/s).

**Impact:** Infrastructure is version-controlled alongside the application code. The Bicep templates will be part of the final submission, demonstrating infrastructure-as-code awareness.

---

## [2026-04-30] Cost management plan

**What was done:** Documented cost estimates per service and minimisation strategy in `docs/cost_tracking.md`. Budget alerts set at $20, $50, $80 to catch runaway costs before hitting the $100 limit.

**Key finding:** At ~$0.32/hr active, a 31-hour active run would exhaust the entire budget. Strategy: pause ASA between sessions ($0.11/hr when running), reduce Cosmos DB to serverless for idle periods, stop simulator when not needed.

**Impact:** Project is designed to cost ~$5–8 total for a typical demo + development workflow (approximately 15–25 active hours with the pipeline running).

---

## [2026-05-01] Documentation files completed

**What was done:** Created `todo.md`, `log.md`, and `starter_guide.md` as required by `rules.md`. Designed `powerbi/dashboard_design.md` with detailed visual specifications for all 3 dashboard pages.

**Why:** The `rules.md` coding conventions require these three files in every project. The `todo.md` provides an auditable trail of completed and remaining work. The `log.md` (this file) documents architectural decisions in a way that is useful for both submission review and future reference. The `starter_guide.md` enables any developer to deploy and test the pipeline from scratch without prior context.

**Impact:** Project documentation is now complete and satisfies the rubric's requirement for clear project structure and engineering maturity.

---

## [2026-10-14] Control Centre UI

**What was done:** Added `ui/`, a local web app (`python -m ui`) that presents the whole pipeline in one Material-style interface: Overview flow diagram, Extract (simulator settings and live feed), Ingest (partitions, throughput, arrival lag), Transform (time policy and the six query steps), Warehouse (three Cosmos DB containers with six document sub-tabs), Analytics (the three Power BI pages plus card drill-through), Azure controls, project files, a user guide and an about page.

**Why:** The pipeline is spread over Python, SQL, Bicep, Azure and Power BI, which makes it hard to demonstrate end to end. A local engine that mirrors each ASA query step lets the whole flow be shown, tested and screenshotted without spending Azure credit, while the Azure page still drives the real producer.

**Impact:** Uses only the Python standard library, reuses `simulator/schema.py` and `reference_data/card_metadata.json`, and leaves the existing pipeline files unchanged. Mirroring the query surfaced several findings (recorded on the About page): the late-arrival tolerance differs between `asa/query.sql` (2 min) and the docs (5 min); query 6 overwrites `ingestion_time`, so the Power BI latency measure reads close to zero; the velocity threshold fires on most events at 10 events/s over 50 cards; events with a null category reach both dead_letter and aggregates; and the producer's `--burst` flag has no visible effect.

---

## [2026-10-15] Persistence, sessions and pipeline fixes

**What was done:** Added `ui/storage/`, a SQLite database (`ui/data/control_centre.db`, WAL mode) that stores each session's raw event log, its settings, simulated clock and random-generator state, the UI preferences (page, tabs, filters, theme) and every Azure run log. Added saved sessions (switch, create, rename, delete, JSON export, database backup), a "welcome back" restore with an offer to resume a running stream, and cross-tab sync of the session and theme. Fixed the pipeline issues found while mirroring it: the late-arrival tolerance is 2 minutes everywhere, query 6 keeps the simulator's `ingestion_time` and adds `enqueued_time` / `processed_time` from the Event Hubs input, queries 2-6 exclude events with a null category, `producer.py --burst` now works (first scheduled burst after 5 minutes), and `producer.py` sends 1% malformed events (`--malformed`) so the dead-letter path is exercised on Azure.

**Why:** Closing the app used to lose the whole demo. SQLite ships with Python, needs no server, and gives transactional writes, so it suits a single-user local tool. Storing raw events (event sourcing) rather than derived documents keeps the database small and guarantees the warehouse is rebuilt identically.

**Impact:** Tested by hard-killing the server mid-stream: every event, setting and preference was restored, and a restarted session continued with exactly the same events as an uninterrupted one. The velocity threshold remains an open design decision.

---

## [2026-10-15] Architecture figure, velocity evidence, ASA as code, Power BI export

**What was done:** Drew the architecture as a UML component diagram (`docs/diagrams/build_architecture.py` writes `architecture.svg`, rendered to PNG): tiers from source to reporting, every connector a straight drop, one edge per container group, and observability as a band, so no connectors cross. Added simulated card-testing attacks and a Threshold explorer that sweeps the velocity threshold for 1, 2 and 5-minute windows and plots normal-traffic alert rate against attack detection. Added `infra/streamanalytics.bicep` (inputs, outputs, ordering policy, query loaded from `asa/query.sql`) and `infra/deploy.ps1` (deploy, start, stop, delete). Added a Power BI export (CSV tables named like the containers plus Power Query scripts).

**Why:** The rubric asks for a professionally presented UML diagram, a justified rule design, and a Power BI artefact; all three can be advanced without spending Azure credit. The sweep showed the velocity rule cannot work at 10 events/s over 50 cards (a normal card already makes ~79 transactions in 5 minutes); at 1 event/s a 1-minute window with count > 8 detects 92-97% of attacks (three random seeds) at under 0.5% noise.

**Impact:** The report gets Figure 1 and evidence for the threshold choice; deployment becomes one command (not yet validated, as the Azure CLI and Bicep are not installed on this machine); the Power BI report can be built from local data now and pointed at Cosmos DB later.

---

## [2026-10-15] Decision: velocity rule (Option 4, 5 000 cards)

**What was done:** Chose Option 4 from the velocity study: query 4 stays `COUNT(*) > 5` in a 5-minute sliding window, and the simulator now spreads its 10 events/s over 5 000 cards instead of 50. Added `reference_data/generate_cards.py` (seeded; keeps the original 50 cards, adds 4 950 with the same tier mix and limit ranges). `producer.py` and the local generator now read their card pool from `card_metadata.json`. Added `python -m ui.etl.velocity_study`, which measures every option over three seeds, and recorded the decision in `docs/decisions/velocity_rule.md` with the results in `velocity_study_results.md`.

**Why:** With 50 cards a normal card made ~79 transactions per 5 minutes, so the rule fired on 98% of normal payments. Of the four options, only this one keeps the query and the throughput demo intact: 0.14% noise, and every simulated card-testing attack caught.

**Impact:** VELOCITY alerts now point at specific cards. Side effect found while documenting: query 5 (amount > 3x the card's own 10-minute average) now catches only 13-18% of injected spikes, because most cards have no other payments in 10 minutes. A category baseline restores 97-100%; that change is left as a separate decision. The new reference file must be uploaded to Blob Storage, and the ASA job restarted.

---

## [2026-10-15] Decision: amount-anomaly rule uses a category baseline

**What was done:** Query 5 in `asa/query.sql` now compares each payment with the 10-minute average of its merchant category across all cards (self-join `ON curr.merchant_category = hist.merchant_category`, validity filters on both sides), instead of the card's own average. The local engine (`ui/etl/alerts.py`) mirrors it. Added `python -m ui.etl.amount_study` and recorded the evidence in `docs/decisions/amount_rule_results.md` and section 6 of `velocity_rule.md`.

**Why:** With the 5 000-card pool, a card rarely has other payments within 10 minutes, so the per-card rule compared a payment with itself and caught only 14% of injected spikes. The category baseline caught 97%, with fewer false alerts (0.05%), and was also slightly better on the old 50-card pool.

**Impact:** HIGH_AMOUNT alerts now mean "unusual for this kind of purchase". The join is heavier (about 850 rows per payment at 10 events/s) and spans partitions, so the job's SU % utilisation needs watching once it runs on Azure. A pre-aggregated category average is the fallback if it is too heavy.

---

## [2026-10-15] Query 5 pre-aggregated (performance)

**What was done:** Added step 0 `WITH CategoryAvg` at the top of `asa/query.sql` (10-minute hopping window, 1-minute hop, one row per merchant category). Query 5 now joins each payment to the category's latest completed window (`DATEDIFF(second, a, curr) BETWEEN 0 AND 59`) instead of self-joining every payment in the category. Alerts also record `baseline_count` and `baseline_window_end`. Mirrored in `ui/etl/alerts.py`; `python -m ui.etl.amount_study` now compares the original, rolling and pre-aggregated forms.

**Why:** The rolling category self-join compared each payment with about 876 others (about 11 000 comparisons per second at 10 events/s), and every query in the job shares one streaming unit, so a busy query 5 could delay all outputs.

**Impact:** One joined row per payment, with the same detection (97% of spikes at 5 000 cards, 0.05% false alerts). The baseline is up to one minute stale, which made no measurable difference. Still to confirm on Azure: that the job accepts the WITH step at the top, and its SU % utilisation.

---

## [2026-10-15] Query page and Data model

**What was done:** Added `ui/sqlwh/`, which loads the current session's warehouse into a read-only in-memory SQLite database (one table per document shape, plus `events` and `cards`, and views `aggregates` and `fraud_alerts` named after the Cosmos DB containers). Added a **Query** page with two interchangeable modes: a drag-and-drop builder (Table, Columns with aggregates, Filters, Sort, Limit; also usable by click and menus) and an SQL editor. Builder to SQL always works; SQL back to the builder works when the query fits one table with AND-ed filters, and otherwise the page explains why and keeps the SQL. Results show as a sortable table or an automatic chart, export as CSV or JSON, and queries can be saved (stored in the database) or reopened from history and eight examples. The Warehouse page gained column sorting, a field filter, full-tab CSV/JSON export, "Open in Query" and a **Data model** view (lineage diagram, relationships, field profiles).

**Why:** Users needed to see and question the whole warehouse, not only fixed pages. The builder lets non-SQL users ask questions; SQL mode gives full power (joins with the card reference data, window functions); switching between them shows the SQL behind each question.

**Impact:** Queries run in milliseconds and cannot change data (an SQLite authorizer allows only reads; 5-second limit). Tested in the browser: drag-and-drop produced the expected SQL, switching modes kept identical SQL, a JOIN was kept in SQL mode with an explanation, hand-written SQL (with its own aliases) reopened in the builder, and charts and exports worked.
