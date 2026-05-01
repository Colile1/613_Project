# Architecture: Real-Time Credit Card Fraud Monitoring Pipeline

## Scenario Justification

Credit card fraud monitoring is inherently a **streaming problem**. A batch job that detects fraud 6 hours after the fact has no value — the card has already been used repeatedly and funds recovered only through a costly dispute process. The core business requirement is to flag suspicious activity **within seconds** of each transaction, allowing the issuer to:

1. Alert the cardholder via push notification
2. Trigger an automated block or step-up authentication challenge
3. Feed a human analyst queue for high-confidence fraud cases

This justifies stream processing over batch. Specifically:
- **Velocity detection** (>5 transactions in 5 minutes) requires counting events continuously, not at midnight.
- **Amount anomaly detection** (single large transaction vs. rolling average) requires a window of recent history, continuously updated.
- **Dead-letter routing** must happen in real time so malformed events never contaminate the analytics store.

---

## UML Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Data Sources                                                           │
│                                                                         │
│  ┌───────────────────────────┐                                          │
│  │  Python Simulator         │                                          │
│  │  (producer.py)            │                                          │
│  │                           │                                          │
│  │  • Baseline: 10 evt/sec   │                                          │
│  │  • Burst: 50 evt/sec      │                                          │
│  │  • 2% duplicates          │                                          │
│  │  • 5% out-of-order        │                                          │
│  │  • 1% late arrivals       │                                          │
│  └────────────┬──────────────┘                                          │
└───────────────│─────────────────────────────────────────────────────────┘
                │ AMQP 1.0 (azure-eventhub SDK)
                │ Partition key = card_id
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Ingestion Layer                                                        │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │  Azure Event Hubs (Standard tier)                              │     │
│  │  Namespace: itri613-eh-<name>   Hub: transactions              │     │
│  │  Partitions: 4  |  Retention: 1 day                            │     │
│  │  Consumer group: stream-analytics                              │     │
│  └──────────────────────────────┬─────────────────────────────────┘     │
└─────────────────────────────────│───────────────────────────────────────┘
                                  │ Consumer group: stream-analytics
                                  │
                    ┌─────────────┴──────────────┐
                    │                            │
                    ▼                            ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Stream Processing Layer                                              │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Azure Stream Analytics Job (1 Streaming Unit)                  │  │
│  │                                                                 │  │
│  │  Input:  EventHubInput (streaming)  TIMESTAMP BY event_time     │  │
│  │  Input:  CardMetadata  (reference — Blob Storage snapshot)      │  │
│  │                                                                 │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  Query 1: Dead-letter filter                             │  │  │
│  │  │  WHERE amount ≤ 0 OR card_id IS NULL OR tx_id IS NULL    │  │  │
│  │  └────────────────────────────┬─────────────────────────────┘  │  │
│  │                               │                                 │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  Query 2: Tumbling 1-min aggregates (per card)           │  │  │
│  │  │  COUNT(*), SUM(amount), AVG, MAX, MIN                    │  │  │
│  │  └────────────────────────────┬─────────────────────────────┘  │  │
│  │                               │                                 │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  Query 3: Sliding 5-min velocity window                  │  │  │
│  │  │  HAVING COUNT(*) > 5 → VELOCITY alert                   │  │  │
│  │  └────────────────────────────┬─────────────────────────────┘  │  │
│  │                               │                                 │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  Query 4: Amount anomaly (amount > 3× 10-min avg)        │  │  │
│  │  │  Self-join pattern → HIGH_AMOUNT alert                   │  │  │
│  │  └────────────────────────────┬─────────────────────────────┘  │  │
│  │                               │                                 │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  Query 5: Reference join enrichment                      │  │  │
│  │  │  JOIN CardMetadata ON card_id → customer_tier, limit     │  │  │
│  │  └────────────────────────────┬─────────────────────────────┘  │  │
│  │                               │                                 │  │
│  │  Time policies:                                                 │  │
│  │    Late arrival tolerance:  5 minutes                           │  │
│  │    Out-of-order tolerance: 30 seconds                           │  │
│  └──────────────────┬────────────┬───────────────┬─────────────────┘  │
└─────────────────────│────────────│───────────────│─────────────────────┘
                      │            │               │
           ┌──────────┘    ┌───────┘       ┌──────┘
           ▼               ▼               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Storage Layer — Azure Cosmos DB (Core NoSQL API)                    │
│  Database: fraud_pipeline                                            │
│                                                                      │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐  │
│  │  aggregates    │  │  fraud_alerts  │  │  dead_letter           │  │
│  │                │  │                │  │                        │  │
│  │  /card_id      │  │  /card_id      │  │  /ingestion_date       │  │
│  │  400 RU/s      │  │  400 RU/s      │  │  400 RU/s              │  │
│  │  TTL: 7 days   │  │  TTL: 30 days  │  │  No TTL (audit)        │  │
│  └────────┬───────┘  └───────┬────────┘  └──────────┬─────────────┘  │
└───────────│──────────────────│─────────────────────│───────────────────┘
            │                  │                     │
            └──────────────────┼─────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Visualisation Layer                                                 │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Power BI Dashboard (Import mode, 1-min refresh)             │   │
│  │                                                              │   │
│  │  Page 1: Live Operations                                     │   │
│  │    • Transactions/min gauge                                  │   │
│  │    • Fraud alerts/min                                        │   │
│  │    • Avg pipeline latency (ingestion_time − event_time)      │   │
│  │                                                              │   │
│  │  Page 2: Fraud Trends                                        │   │
│  │    • Line chart: alerts over time                            │   │
│  │    • Bar chart: alerts by merchant category                  │   │
│  │    • Table: top-10 flagged cards (conditional red highlight) │   │
│  │    • Drill-through: card → all transactions                  │   │
│  │                                                              │   │
│  │  Page 3: Pipeline Health                                     │   │
│  │    • Dead-letter count trend                                 │   │
│  │    • Late arrival % over time                                │   │
│  │    • Event Hubs throughput (events/sec)                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Partition Strategy

**Event Hubs — partition key: `card_id`**

All transactions for a given card are routed to the same partition. This ensures:
1. **Per-card ordering** — events for CARD-0001 arrive in sequence within their partition, which is required for accurate velocity detection.
2. **Scalability** — 4 partitions support 4 MB/s ingress and 8 MB/s egress, well above the 10–50 events/sec demo load. Additional partitions can be added by recreating the hub if load increases.
3. **Trade-off** — hot partitions can occur if a small number of cards generate disproportionate volume (e.g., a test card sending bursts). Mitigated by the 50-card pool in the simulator.

---

## Why Stream Processing over Batch

| Requirement | Batch | Stream |
|-------------|-------|--------|
| Fraud detection latency | Hours | Seconds |
| Velocity detection (5-min window) | Impossible continuously | Native sliding window |
| Cardholder alerting | Delayed, post-fact | Real-time |
| Dead-letter routing | Next batch run | Immediate |
| Dashboard freshness | Hourly/daily | Sub-minute |

A batch job running at midnight would see the same transactions, but the fraud has already occurred across dozens of transactions by then.

---

## Data Flow Summary

1. **Simulator** generates a transaction event with `event_time` (when tx occurred) and `ingestion_time` (now).
2. Event is sent to **Event Hubs** partitioned by `card_id`.
3. **ASA** reads from the `stream-analytics` consumer group using `TIMESTAMP BY event_time`.
4. Malformed events route to `dead_letter` immediately.
5. Valid events go to three processing paths simultaneously:
   - 1-min tumbling aggregates → `aggregates`
   - 5-min velocity window → `fraud_alerts` (if >5 tx)
   - 10-min rolling average self-join → `fraud_alerts` (if amount > 3× avg)
   - Reference enrichment join → `aggregates` (with customer tier)
6. **Cosmos DB** persists all outputs as JSON documents.
7. **Power BI** queries Cosmos DB on a 1-minute refresh cycle, rendering the dashboard.
