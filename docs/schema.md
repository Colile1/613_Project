# Data Schema Definitions

## Transaction Event (Event Hubs payload)

Each message sent by the Python simulator represents a single card payment attempt.

```json
{
  "transaction_id": "3f4a9b12-8c7e-4d5f-a1b2-9c8d7e6f5a4b",
  "card_id": "CARD-0001",
  "merchant_id": "MERCH-007",
  "merchant_category": "grocery",
  "amount": 482.50,
  "currency": "ZAR",
  "location": {
    "city": "Johannesburg",
    "lat": -26.2041,
    "lng": 28.0473
  },
  "event_time": "2026-04-14T08:32:15.123Z",
  "ingestion_time": "2026-04-14T08:32:15.456Z",
  "is_duplicate": false,
  "sequence_number": 1042
}
```

| Field | Type | Description |
|-------|------|-------------|
| `transaction_id` | string (UUID4) | Globally unique transaction identifier. Duplicates share the same ID intentionally. |
| `card_id` | string | Card identifier — **Event Hubs partition key**. All events for a card land on the same partition. Format: `CARD-XXXX`. |
| `merchant_id` | string | Merchant identifier. Format: `MERCH-XXX`. |
| `merchant_category` | string | One of: `grocery`, `fuel`, `online`, `restaurant`, `travel`, `atm`, `pharmacy`. |
| `amount` | number | Transaction amount in ZAR. Log-normal distribution (mean ~R500). Always positive for valid events. |
| `currency` | string | Always `"ZAR"` in this scenario. |
| `location.city` | string | South African city name. |
| `location.lat` | number | Latitude with ±0.05° jitter. |
| `location.lng` | number | Longitude with ±0.05° jitter. |
| `event_time` | string (ISO8601) | **Event time** — when the transaction occurred. Used by ASA `TIMESTAMP BY`. May be in the past for out-of-order/late events. |
| `ingestion_time` | string (ISO8601) | **Processing time** — when the event was sent to Event Hubs. Always close to wall-clock. |
| `is_duplicate` | boolean | `true` if this is an intentional re-send of an existing `transaction_id`. |
| `sequence_number` | integer | Monotonically increasing counter from the simulator. Used to verify ordering. |

### Event-Time vs Processing-Time

Stream Analytics is configured with `TIMESTAMP BY event_time`. This means:
- Windows are based on **when the transaction happened**, not when it arrived.
- A late event (event_time = 10 min ago) is bucketed into the correct historical window, up to the late-arrival tolerance (5 min).
- Events outside the tolerance window are dropped or sent to a late-arrival output.

---

## Card Metadata (Reference Data — Blob Storage)

Loaded as a reference input into ASA for enrichment joins.

```json
{
  "card_id": "CARD-0001",
  "customer_name": "Thabo Nkosi",
  "customer_tier": "Gold",
  "credit_limit_zar": 50000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `card_id` | string | Join key — matches `card_id` in transaction events. |
| `customer_name` | string | Card holder name. |
| `customer_tier` | string | One of: `Standard`, `Gold`, `Platinum`. |
| `credit_limit_zar` | number | Card credit limit in ZAR. Used for `NEAR_LIMIT` flag. |

---

## Cosmos DB Document Schemas

### aggregates container

```json
{
  "id": "CARD-0001_2026-04-14T08:32:00Z",
  "card_id": "CARD-0001",
  "tx_count": 7,
  "total_amount_zar": 3412.80,
  "avg_amount_zar": 487.54,
  "max_amount_zar": 1230.00,
  "min_amount_zar": 92.50,
  "distinct_merchants": 4,
  "window_start": "2026-04-14T08:31:00Z",
  "window_end": "2026-04-14T08:32:00Z"
}
```

### fraud_alerts container

```json
{
  "id": "CARD-0001_VELOCITY_2026-04-14T08:35:00Z",
  "card_id": "CARD-0001",
  "alert_type": "VELOCITY",
  "velocity_count": 8,
  "total_amount_zar": 5640.00,
  "detected_at": "2026-04-14T08:35:00Z",
  "alert_description": "High transaction frequency detected"
}
```

```json
{
  "id": "3f4a9b12_HIGH_AMOUNT_2026-04-14T08:36:00Z",
  "card_id": "CARD-0003",
  "transaction_id": "3f4a9b12-...",
  "alert_type": "HIGH_AMOUNT",
  "amount": 12500.00,
  "rolling_avg": 420.30,
  "amount_ratio": 29.7,
  "detected_at": "2026-04-14T08:36:00Z",
  "alert_description": "Transaction amount exceeds 3x rolling 10-min average"
}
```

### dead_letter container

```json
{
  "id": "bad-event-uuid",
  "transaction_id": null,
  "card_id": "CARD-0015",
  "amount": -50.00,
  "event_time": "2026-04-14T08:30:00Z",
  "ingestion_time": "2026-04-14T08:30:01Z",
  "dead_letter_reason": "MALFORMED",
  "dead_letter_detail": "non-positive amount",
  "ingestion_date": "2026-04-14"
}
```
