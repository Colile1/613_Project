# ui/etl - local pipeline engine

Mirrors the Azure pipeline stage by stage so it can be demonstrated and tested without Azure.

| File | Stage | Responsibility |
|---|---|---|
| `generator.py` | Extract | Same behaviour as `simulator/producer.py` (Poisson rate, bursts, duplicates, out-of-order, late, malformed) on a simulated clock, plus local-only fraud spikes and card-testing attacks |
| `ingest.py` | Ingest | Partition assignment by `card_id` (CRC32 stand-in for the Event Hubs hash), throughput and arrival-lag summaries |
| `transform.py` | Transform | ASA time policy (late-arrival / out-of-order "Adjust"), watermark, query steps 1-3 |
| `alerts.py` | Transform | Query step 4 (sliding velocity) and step 5 (amount anomaly self-join) |
| `enrich.py` | Transform | Query step 6 (reference join with card metadata, `credit_flag`) |
| `warehouse.py` | Load | Runs steps 1-6 and lands outputs in the three Cosmos DB containers; search and paging |
| `analytics.py` | Analyse | Datasets for the Power BI pages and the card drill-through |
| `threshold.py` | Transform | Velocity-threshold sweep (noise vs card-testing attack detection) for the Threshold explorer |
| `session.py` | - | Holds events, runs the background clock, saves every tick to SQLite |
| `result_cache.py` | - | Caches the pipeline result; reuses a recent one while the clock runs |
| `timeutil.py` | - | Shared time parsing and flooring helpers |

All stage functions are pure by convention (no printing, no input); `session.py` owns the state.