# Power BI Dashboard Design

## Overview

The dashboard connects to Azure Cosmos DB and provides three pages covering live operations, fraud trend analysis, and pipeline health monitoring. It functions as both a real-time operational dashboard and an analytical reporting tool.

**Connection mode:** Import with 1-minute scheduled refresh (Power BI Pro required for automatic refresh; use manual refresh for free-tier demo).

**Data sources:**
- `fraud_pipeline` / `aggregates` — per-card 1-min window summaries and enriched transactions
- `fraud_pipeline` / `fraud_alerts` — VELOCITY and HIGH_AMOUNT alert events
- `fraud_pipeline` / `dead_letter` — malformed events routed by the dead-letter filter

---

## DAX Measures

Define these measures before building visuals. They are shared across all pages.

```dax
-- Transactions per minute (from aggregates)
Transactions Per Minute =
    AVERAGE(aggregates[tx_count])

-- Total spend in current view
Total Spend ZAR =
    SUM(aggregates[total_amount_zar])

-- Average spend per transaction
Avg Transaction ZAR =
    AVERAGE(aggregates[avg_amount_zar])

-- Alert count
Alert Count =
    COUNTROWS(fraud_alerts)

-- VELOCITY alerts only
Velocity Alerts =
    CALCULATE(COUNTROWS(fraud_alerts), fraud_alerts[alert_type] = "VELOCITY")

-- HIGH_AMOUNT alerts only
High Amount Alerts =
    CALCULATE(COUNTROWS(fraud_alerts), fraud_alerts[alert_type] = "HIGH_AMOUNT")

-- Dead-letter event count
Dead Letter Count =
    COUNTROWS(dead_letter)

-- Pipeline latency in seconds
-- (requires ingestion_time and event_time as datetime columns; the enriched
--  transaction documents from query 6 carry both)
Avg Latency Seconds =
    AVERAGEX(
        aggregates,
        DATEDIFF(aggregates[event_time], aggregates[ingestion_time], SECOND)
    )

-- Stream Analytics processing delay: Event Hubs enqueue to ASA processing
-- (query 6 copies the input's EventEnqueuedUtcTime / EventProcessedUtcTime)
Avg ASA Delay Seconds =
    AVERAGEX(
        FILTER(aggregates, NOT ISBLANK(aggregates[processed_time])),
        DATEDIFF(aggregates[enqueued_time], aggregates[processed_time], SECOND)
    )
```

---

## Page 1: Live Operations

**Purpose:** Real-time operational overview — answers "what is happening right now?"

### Layout (3-column grid)

```
┌─────────────────┬─────────────────┬─────────────────┐
│  Gauge:         │  Card:          │  Card:          │
│  Tx/min         │  Active Alerts  │  Avg Latency    │
│                 │  (last 5 min)   │  (seconds)      │
├─────────────────┴─────────────────┴─────────────────┤
│  Line chart: Transactions per minute over time      │
│  X axis: window_end  |  Y axis: tx_count (sum)      │
├─────────────────────────────────────────────────────┤
│  Bar chart: Spend by merchant category              │
│  X axis: merchant_category  |  Y axis: SUM(amount) │
├─────────────────────────────────────────────────────┤
│  Slicer: Date range  |  Slicer: Card tier           │
└─────────────────────────────────────────────────────┘
```

### Visuals in detail

**Gauge — Transactions per minute**
- Value: `[Transactions Per Minute]`
- Min: 0, Max: 60
- Target: 10 (baseline rate)
- Colour: green ≤ 10, amber 10–30, red > 30 (burst traffic visible)
- Title: "Current Tx/min"

**Card — Active Alerts**
- Value: `[Alert Count]` (filtered to last 5 minutes via relative date slicer)
- Conditional formatting: red background if value > 0
- Title: "Fraud Alerts (last 5 min)"

**Card — Average Pipeline Latency**
- Value: `[Avg Latency Seconds]`
- Format: "0.0 sec"
- Conditional formatting: green < 5s, amber 5–30s, red > 30s
- Title: "Avg Pipeline Latency"

**Line chart — Transactions per minute over time**
- X axis: `window_end` (time axis, 1-min granularity)
- Y axis: SUM(`tx_count`)
- Legend: none (single series)
- Enable analytics → trend line
- Annotations: burst periods visible as spikes

**Clustered bar chart — Spend by merchant category**
- X axis: `merchant_category`
- Y axis: `[Total Spend ZAR]`
- Sort: descending by Y
- Data labels: on
- Title: "Total Spend by Category"

---

## Page 2: Fraud Trends

**Purpose:** Analytical deep-dive into fraud alerts — answers "which cards, which patterns, when?"

### Layout

```
┌──────────────────────────────┬──────────────────────────────┐
│  Line chart:                 │  Bar chart:                  │
│  Alerts over time            │  Alerts by category          │
│  (VELOCITY vs HIGH_AMOUNT)   │                              │
├──────────────────────────────┴──────────────────────────────┤
│  Table: Top 10 flagged cards                                │
│  Columns: card_id | customer_name | tier | alert_count |   │
│           total_amount | last_alert_time                    │
│  Conditional formatting: red rows where alert_count > 5    │
├─────────────────────────────────────────────────────────────┤
│  Slicer: alert_type | Slicer: Date range                    │
└─────────────────────────────────────────────────────────────┘
```

### Visuals in detail

**Line chart — Alerts over time**
- X axis: `detected_at` (1-min granularity)
- Y axis: COUNTROWS(`fraud_alerts`)
- Legend: `alert_type` (two series: VELOCITY, HIGH_AMOUNT)
- Colour: VELOCITY = orange, HIGH_AMOUNT = red
- Title: "Fraud Alerts Over Time"

**Clustered bar chart — Alerts by merchant category**
- X axis: `merchant_category`
- Y axis: COUNTROWS(`fraud_alerts`)
- Legend: `alert_type`
- Sort: descending
- Title: "Alerts by Merchant Category"

**Table — Top 10 flagged cards**
- Sort by: alert_count descending
- Top N filter: 10
- Columns:
  - `card_id`
  - `customer_name` (from enriched aggregates via card_id relationship)
  - `customer_tier` (from enriched aggregates)
  - Alert Count (measure)
  - `[Total Spend ZAR]`
  - Last Alert Time: MAX(`detected_at`)
- Conditional formatting on Alert Count column:
  - Background: red scale (higher = darker red)
  - Font: white when background is dark
- Enable drill-through to card detail page (see below)

### Drill-through page: Card Detail

Triggered by right-clicking a card_id in the Top 10 table and selecting "Drill through → Card Detail".

```
┌─────────────────────────────────────────────────────────────┐
│  Card: CARD-0001 — Thabo Nkosi — PREMIUM — R50,000 limit   │
├─────────────────────────────────────────────────────────────┤
│  Line chart: Transaction amounts over time for this card    │
├─────────────────────────────────────────────────────────────┤
│  Table: All transactions for this card                      │
│  Columns: event_time | merchant_id | category | amount |   │
│           credit_flag | is_duplicate                        │
└─────────────────────────────────────────────────────────────┘
```

- The drill-through filter carries `card_id` from the source page
- Back button: enabled automatically by Power BI

---

## Page 3: Pipeline Health

**Purpose:** Engineering monitoring view — answers "is the pipeline working correctly?"

### Layout

```
┌─────────────────┬─────────────────┬─────────────────┐
│  Card:          │  Card:          │  Card:          │
│  Dead-letter    │  Total events   │  Late arrival   │
│  count          │  processed      │  count          │
├─────────────────┴─────────────────┴─────────────────┤
│  Line chart: Dead-letter count over time             │
│  X axis: ingestion_time  |  Y axis: COUNTROWS        │
├─────────────────────────────────────────────────────┤
│  Pie chart: Dead-letter reasons                      │
│  Legend: dead_letter_detail                          │
├─────────────────────────────────────────────────────┤
│  Table: Sample dead-letter events                    │
│  Columns: ingestion_time | dead_letter_detail |     │
│           card_id | amount | transaction_id          │
└─────────────────────────────────────────────────────┘
```

### Visuals in detail

**Card — Dead-letter count**
- Value: `[Dead Letter Count]`
- Conditional formatting: green = 0, red > 0
- Title: "Invalid Events (Dead Letter)"

**Card — Total events processed**
- Value: SUM(aggregates[tx_count])
- Title: "Total Transactions Processed"

**Card — Late arrival count**
- Note: late arrivals are handled by ASA's 2-min late-arrival tolerance (Adjust policy); they appear in `aggregates` with a large gap between `event_time` and `ingestion_time`
- Value: COUNTROWS filtered where `[Avg Latency Seconds]` > 300
- Title: "Late Arrivals (>5 min)"

**Line chart — Dead-letter trend**
- X axis: `ingestion_date` + `ingestion_time` (day + hour granularity)
- Y axis: COUNTROWS(`dead_letter`)
- Title: "Dead-Letter Events Over Time"

**Pie chart — Dead-letter reasons**
- Legend: `dead_letter_detail`
- Values: COUNTROWS
- Data labels: percentage + count
- Title: "Invalid Event Breakdown"

**Table — Sample dead-letter events**
- Top 50 most recent (sort by `ingestion_time` descending)
- Useful for debugging: shows exactly which events were malformed and why

---

## Actionable Insight

The dashboard implements threshold-based alerting through conditional formatting on the Top 10 flagged cards table (Page 2). When `alert_count > 5` for a card, the row turns red, signalling that a human analyst should review that card immediately.

This constitutes an "actionable insight" as required by the rubric: it does not merely display data, it prioritises which cards need analyst attention right now, enabling the fraud team to triage the queue without reading raw numbers.

A further actionable insight is the `credit_flag` field in the enriched transactions table. When `credit_flag = 'NEAR_LIMIT'` (transaction > 80% of card's credit limit), the transaction is highlighted in the Card Detail drill-through, allowing analysts to distinguish between fraud and genuine high-spend behaviour.

---

## Building the report before Azure is running

The Control Centre can export its local warehouse in the same table shape as Cosmos DB, so the report can be built and screenshotted now:

1. Start the Control Centre (`python -m ui`), generate a few minutes of data, then **Analytics > Export for Power BI**.
2. This writes `powerbi/local_data/aggregates.csv`, `fraud_alerts.csv`, `dead_letter.csv`, `card_metadata.csv` and `queries.pq`.
3. In Power BI Desktop: **Get Data > Blank Query > Advanced Editor**, paste one block from `queries.pq` per table, and name each query after its table. Numbers and dates are typed by the script.
4. Build the pages below; the DAX measures work unchanged. The `aggregates` table has a `record_type` column (`card_window`, `category_trend`, `transaction`) to filter the three document shapes.
5. When Azure is live, replace each query's `Source` step with the Azure Cosmos DB connector (next section). Visuals and measures stay as they are.

## Connecting Power BI to Cosmos DB

1. Open Power BI Desktop
2. Home → Get Data → Azure → Azure Cosmos DB
3. URL: `https://itri613colile-cosmos.documents.azure.com:443/`
4. Database: `fraud_pipeline`
5. Expand each collection: `aggregates`, `fraud_alerts`, `dead_letter`
6. For each, expand the document column to extract JSON fields
7. Set data types:
   - `event_time`, `ingestion_time`, `detected_at`, `window_end`: DateTime
   - `amount`, `tx_count`, `total_amount_zar`, `credit_limit_zar`: Decimal Number
   - All other fields: Text

## Relationships

Create the following relationship in Model view:
- `aggregates[card_id]` → `fraud_alerts[card_id]` (many-to-many, bidirectional)

This enables cross-filtering: clicking a card in the Top 10 table filters the aggregates line chart to show only that card's transaction history.

---

## Screenshot Checklist for Submission

- [ ] Page 1 — Live Operations (during active simulator run, showing Tx/min gauge and spend bars)
- [ ] Page 2 — Fraud Trends (showing at least one VELOCITY and one HIGH_AMOUNT alert)
- [ ] Page 2 — Drill-through page for the top-flagged card
- [ ] Page 3 — Pipeline Health (showing dead-letter count and reason breakdown)
- [ ] Power BI query editor showing the Cosmos DB data transformation steps
