-- ============================================================
-- Azure Stream Analytics Query
-- Job: fraud-pipeline-asa
-- Input:  EventHubInput  (Azure Event Hubs — transactions hub)
-- Inputs: CardMetadata   (Azure Blob Storage — reference data)
-- Outputs:
--   CosmosAggregates  → Cosmos DB container: aggregates
--   CosmosFraudAlerts → Cosmos DB container: fraud_alerts
--   CosmosDeadLetter  → Cosmos DB container: dead_letter
--
-- Time handling:
--   TIMESTAMP BY event_time  — use event time for all windows
--   Late arrival tolerance:  5 minutes  (ASA job config)
--   Out-of-order tolerance:  30 seconds (ASA job config)
-- ============================================================


-- ── 1. DEAD-LETTER: Malformed / invalid events ────────────────────────────
-- Route these FIRST so downstream queries never see bad data.
-- Conditions: missing primary keys, non-positive amount, missing category.

SELECT
    transaction_id,
    card_id,
    merchant_id,
    merchant_category,
    amount,
    event_time,
    System.Timestamp()          AS ingestion_time,
    'MALFORMED'                 AS dead_letter_reason,
    CASE
        WHEN transaction_id IS NULL THEN 'missing transaction_id'
        WHEN card_id IS NULL        THEN 'missing card_id'
        WHEN amount <= 0            THEN 'non-positive amount'
        WHEN merchant_category IS NULL THEN 'missing merchant_category'
        ELSE 'unknown'
    END                         AS dead_letter_detail,
    DATEADD(day, 0, CAST(System.Timestamp() AS DATE)) AS ingestion_date
INTO CosmosDeadLetter
FROM EventHubInput TIMESTAMP BY event_time
WHERE
    transaction_id IS NULL
    OR card_id IS NULL
    OR amount <= 0
    OR merchant_category IS NULL;


-- ── 2. TUMBLING WINDOW: Per-card 1-minute aggregates ─────────────────────
-- Provides per-card throughput and spend metrics to Power BI.
-- Tumbling windows are non-overlapping; each event belongs to exactly one bucket.

SELECT
    card_id,
    COUNT(*)                    AS tx_count,
    SUM(amount)                 AS total_amount_zar,
    AVG(amount)                 AS avg_amount_zar,
    MAX(amount)                 AS max_amount_zar,
    MIN(amount)                 AS min_amount_zar,
    COUNT(DISTINCT merchant_id) AS distinct_merchants,
    System.Timestamp()          AS window_end,
    DATEADD(minute, -1, System.Timestamp()) AS window_start
INTO CosmosAggregates
FROM EventHubInput TIMESTAMP BY event_time
WHERE
    transaction_id IS NOT NULL
    AND card_id IS NOT NULL
    AND amount > 0
GROUP BY card_id, TumblingWindow(minute, 1);


-- ── 3. HOPPING WINDOW: Per-category 5-minute throughput (10s hop) ─────────
-- Overlapping window; useful for smoothed trend lines in Power BI.

SELECT
    merchant_category,
    COUNT(*)                    AS tx_count,
    SUM(amount)                 AS total_amount_zar,
    AVG(amount)                 AS avg_amount_zar,
    System.Timestamp()          AS window_end
INTO CosmosAggregates
FROM EventHubInput TIMESTAMP BY event_time
WHERE
    transaction_id IS NOT NULL
    AND card_id IS NOT NULL
    AND amount > 0
GROUP BY merchant_category, HoppingWindow(minute, 5, 1);


-- ── 4. VELOCITY FRAUD ALERT: >5 transactions in 5 minutes per card ────────
-- Sliding window: fires whenever the window slides and count exceeds threshold.
-- Sliding windows overlap; every event can trigger an evaluation.

SELECT
    card_id,
    COUNT(*)                    AS velocity_count,
    SUM(amount)                 AS total_amount_zar,
    System.Timestamp()          AS detected_at,
    'VELOCITY'                  AS alert_type,
    'High transaction frequency detected' AS alert_description
INTO CosmosFraudAlerts
FROM EventHubInput TIMESTAMP BY event_time
WHERE
    transaction_id IS NOT NULL
    AND card_id IS NOT NULL
    AND amount > 0
GROUP BY card_id, SlidingWindow(minute, 5)
HAVING COUNT(*) > 5;


-- ── 5. AMOUNT ANOMALY ALERT: Transaction > 3× card's 10-min rolling average ─
-- Uses a self-join pattern: compare current event against the windowed average.
-- Detects unusually large single transactions relative to recent behaviour.

WITH CardAvg AS (
    SELECT
        card_id,
        AVG(amount)             AS rolling_avg,
        System.Timestamp()      AS window_end
    FROM EventHubInput TIMESTAMP BY event_time
    WHERE
        transaction_id IS NOT NULL
        AND card_id IS NOT NULL
        AND amount > 0
    GROUP BY card_id, TumblingWindow(minute, 10)
)

SELECT
    e.card_id,
    e.transaction_id,
    e.amount,
    e.merchant_id,
    e.merchant_category,
    a.rolling_avg,
    e.amount / a.rolling_avg   AS amount_ratio,
    System.Timestamp()         AS detected_at,
    'HIGH_AMOUNT'              AS alert_type,
    'Transaction amount exceeds 3x rolling 10-min average' AS alert_description
INTO CosmosFraudAlerts
FROM EventHubInput e TIMESTAMP BY e.event_time
JOIN CardAvg a
    ON e.card_id = a.card_id
    AND DATEDIFF(minute, a, e) BETWEEN 0 AND 10
WHERE
    e.transaction_id IS NOT NULL
    AND e.card_id IS NOT NULL
    AND e.amount > 0
    AND a.rolling_avg > 0
    AND e.amount > (3 * a.rolling_avg);


-- ── 6. REFERENCE JOIN: Enrich transactions with card metadata ─────────────
-- Joins streaming events with static reference data from Blob Storage.
-- CardMetadata input is configured as a reference input (snapshot, auto-refresh).
-- Enriched output written to aggregates container with customer_tier and credit_limit.

SELECT
    e.transaction_id,
    e.card_id,
    e.merchant_id,
    e.merchant_category,
    e.amount,
    e.currency,
    e.event_time,
    System.Timestamp()          AS ingestion_time,
    e.is_duplicate,
    e.sequence_number,
    r.customer_tier,
    r.credit_limit_zar,
    r.customer_name,
    CASE
        WHEN e.amount > r.credit_limit_zar * 0.8 THEN 'NEAR_LIMIT'
        ELSE 'NORMAL'
    END                         AS credit_flag
INTO CosmosAggregates
FROM EventHubInput e TIMESTAMP BY e.event_time
JOIN CardMetadata r
    ON e.card_id = r.card_id
WHERE
    e.transaction_id IS NOT NULL
    AND e.card_id IS NOT NULL
    AND e.amount > 0;
