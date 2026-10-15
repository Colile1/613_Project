# Rubric Review

Status of each criterion in the 2026 project rubric (README.md), the evidence in this repository, and what is still needed for full marks. Reviewed 2026-10-15.

| # | Criterion (max) | Evidence in the project | Status | Still needed |
|---|---|---|---|---|
| 1 | Problem definition, scenario justification, UML architecture (12) | `docs/architecture.md` (scenario, stream-vs-batch table, component diagram, data flow); UI Overview and About | Excellent | Done: `docs/diagrams/architecture.svg` / `.png` (UML component diagram, tiers from source to reporting, zero crossing connectors). Use it as Figure 1 in the report |
| 2 | Data generation, realism, schema (15) | `simulator/producer.py`, `schema.py`, `docs/schema.md`; Poisson rate, bursts, 2% duplicates, 5% out-of-order, 1% late, 1% malformed, event vs processing time, sequence numbers | Excellent | Nothing structural. Show the live feed (UI Extract page) in the report |
| 3 | Ingestion and Event Hubs design (15) | `infra/eventhubs.bicep` (4 partitions, consumer group, SAS policies); partition-key justification in `docs/architecture.md`; UI Ingest page (partition spread, skew, throughput) | Excellent on paper | Deploy and capture Event Hubs metrics (incoming messages, throughput) |
| 4 | Stream processing design and correctness (25) | `asa/query.sql`: dead-letter, tumbling, hopping, sliding velocity, self-join anomaly, reference join; TIMESTAMP BY event_time; late (2 min) and out-of-order (30 s) policies; fixes from 2026-10-15 | Excellent on paper | Run the job; capture ASA metrics (input/output events, watermark delay). Velocity rule decided with evidence (`docs/decisions/velocity_rule.md`: 0.14% noise, all simulated attacks caught). Query 5 now uses a pre-aggregated category baseline (section 6: 97% of spikes caught, one joined row per payment). Use the decision record in the report as the design justification |
| 5 | Storage and Cosmos DB modelling (10) | `infra/cosmosdb.bicep` (3 containers, partition keys, TTLs, indexing exclusions); justification in `log.md`; UI Warehouse page | Excellent on paper | Record document counts per container after a 10-minute run |
| 6 | Power BI analytics and actionable insight (18) | `powerbi/dashboard_design.md` (3 pages, drill-through, DAX measures incl. latency and ASA delay, red-row threshold insight); UI Analytics page mirrors it | Design complete | Build the .pbix now from the local export (Analytics > Export for Power BI, `powerbi/local_data/queries.pq`), then switch the source to Cosmos DB. Screenshot all pages and the drill-through |
| 7 | Observability, performance, cost (10) | `docs/cost_tracking.md` (rates, budget alerts, cleanup); UI Pipeline health, arrival lag, cost estimator, run history | Strong | Fill in the session cost log with real figures; measure end-to-end latency (Avg Latency / Avg ASA Delay measures) on Azure |
| 8 | Advanced features (5) | Control centre UI: local ASA mirror, live re-processing, fraud injection, persistent sessions, Azure runner, live Cosmos reader | Strong to excellent | Describe it in the report as an observability and testing tool, with screenshots (`fraud-613/screenshots/ui_*.png`) |

## Remaining work, in order

1. Deploy everything with `.\infra\deploy.ps1` (includes the new `infra/streamanalytics.bicep`, which sets the 2-minute / 30-second ordering policy and loads `asa/query.sql`), then `.\infra\deploy.ps1 -Start`.
2. Install the simulator requirements and run `producer.py --duration 600` (UI Azure page, or the starter guide).
3. Capture the Event Hubs, ASA and Cosmos DB metrics; build and screenshot the Power BI report.
4. Fill in the cost session log, then stop the ASA job and delete the resource group.
5. Write the report (Figure 1: `docs/diagrams/architecture.png`) and package the folder.