# warehouse.py : LOAD stage (Azure Cosmos DB model)
# Runs the full transform over the ingested events and lands every output in
# the three containers defined by infra/cosmosdb.bicep. The aggregates
# container receives three document shapes (query steps 2, 3 and 6), which the
# UI shows as sub-tabs of the same container.

from collections import Counter

from ui.etl import transform, alerts, enrich

CONTAINERS = {
    "aggregates": {"partition_key": "/card_id", "ttl": "7 days", "throughput": "400 RU/s",
                   "indexing": "all paths except /location/*", "asa_output": "CosmosAggregates"},
    "fraud_alerts": {"partition_key": "/card_id", "ttl": "30 days", "throughput": "400 RU/s",
                     "indexing": "all paths except /location/*", "asa_output": "CosmosFraudAlerts"},
    "dead_letter": {"partition_key": "/ingestion_date", "ttl": "none (audit)", "throughput": "400 RU/s",
                    "indexing": "all paths", "asa_output": "CosmosDeadLetter"},
}

# Sub-tabs: (key, container, label, query step)
COLLECTIONS = [
    ("card_windows", "aggregates", "Card windows (tumbling 1 min)", 2),
    ("category_trends", "aggregates", "Category trends (hopping 5 min)", 3),
    ("enriched", "aggregates", "Enriched transactions", 6),
    ("velocity", "fraud_alerts", "Velocity alerts", 4),
    ("high_amount", "fraud_alerts", "High-amount alerts", 5),
    ("dead_letter", "dead_letter", "Dead-letter events", 1),
]


# Pure function: runs ASA steps 1-6 and returns every output collection.
def run_pipeline(events, policy, metadata):
    transform.apply_time_policy(events, policy)
    wm = transform.watermark(events, policy)
    valid = [ev for ev in events if transform.is_valid(ev)]
    groups = alerts.by_card(valid)
    return {
        "watermark": wm,
        "valid_count": len(valid),
        "adjusted": Counter(ev["_adjusted"] for ev in events if ev["_adjusted"]),
        "collections": {
            "dead_letter": transform.dead_letters(events),
            "card_windows": transform.tumbling_per_card(valid, wm),
            "category_trends": transform.hopping_per_category(valid, wm),
            "velocity": alerts.velocity_alerts(groups, policy["velocity_threshold"], wm, policy["velocity_window_s"]),
            "high_amount": alerts.category_amount_alerts(valid, policy["amount_multiplier"], wm),
            "enriched": enrich.enrich(valid, metadata, wm),
        },
    }


# Pure function: document counts per sub-tab and per container.
def counts(result):
    per_collection = {k: len(v) for k, v in result["collections"].items()}
    per_container = Counter()
    for key, container, _, _ in COLLECTIONS:
        per_container[container] += per_collection[key]
    return per_collection, dict(per_container)


# Pure function: the timestamp a document is ordered by.
def time_key(doc):
    for key in ("detected_at", "window_end", "ingestion_time", "event_time"):
        if doc.get(key):
            return doc[key]
    return ""


# Pure function: filters, sorts newest-first and pages one collection.
def query_collection(docs, text="", field=None, value=None, limit=200, offset=0):
    rows = docs
    if field and value:
        rows = [d for d in rows if str(d.get(field)) == value]
    if text:
        needle = text.lower()
        rows = [d for d in rows if needle in " ".join(str(v) for v in d.values()).lower()]
    rows = sorted(rows, key=time_key, reverse=True)
    return {"total": len(rows), "rows": rows[offset:offset + limit]}
