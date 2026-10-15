# build.py : loads the warehouse into an in-memory SQLite database
# One table per document shape (plus the raw events and the card reference data)
# and two views named after the Cosmos DB containers, so SQL written here reads
# like the Power BI model: aggregates, fraud_alerts, dead_letter.

import sqlite3

from ui.etl.generator import iso

# table -> (description, where it lives in the pipeline)
TABLES = {
    "events": ("Raw events as ingested by Event Hubs, before Stream Analytics", "Event Hubs \u00b7 transactions"),
    "cards": ("Card reference data joined in query 6", "Blob \u00b7 card_metadata.json"),
    "card_windows": ("Query 2 \u00b7 1-minute tumbling window per card", "Cosmos \u00b7 aggregates"),
    "category_trends": ("Query 3 \u00b7 5-minute hopping window per category", "Cosmos \u00b7 aggregates"),
    "transactions": ("Query 6 \u00b7 transactions enriched with card data", "Cosmos \u00b7 aggregates"),
    "velocity_alerts": ("Query 4 \u00b7 velocity fraud alerts", "Cosmos \u00b7 fraud_alerts"),
    "high_amount_alerts": ("Query 5 \u00b7 high-amount fraud alerts", "Cosmos \u00b7 fraud_alerts"),
    "dead_letter": ("Query 1 \u00b7 malformed events", "Cosmos \u00b7 dead_letter"),
}
COLLECTION_TABLE = {"card_windows": "card_windows", "category_trends": "category_trends", "enriched": "transactions",
                    "velocity": "velocity_alerts", "high_amount": "high_amount_alerts", "dead_letter": "dead_letter"}
VIEWS = {
    "aggregates": ("Cosmos container: all three aggregate shapes (record_type tells them apart)",
                   [("card_windows", "card_window"), ("category_trends", "category_trend"), ("transactions", "transaction")]),
    "fraud_alerts": ("Cosmos container: velocity and high-amount alerts", [("velocity_alerts", None), ("high_amount_alerts", None)]),
}


# Pure function: one raw event flattened into SQL-friendly columns.
def event_row(ev):
    loc = ev.get("location") or {}
    return {"sequence_number": ev["sequence_number"], "transaction_id": ev["transaction_id"], "card_id": ev["card_id"],
            "merchant_id": ev["merchant_id"], "merchant_category": ev["merchant_category"], "amount": ev["amount"],
            "currency": ev["currency"], "city": loc.get("city"), "lat": loc.get("lat"), "lng": loc.get("lng"),
            "event_time": ev["event_time"], "ingestion_time": ev["ingestion_time"], "is_duplicate": ev["is_duplicate"],
            "partition_id": ev.get("_partition"), "timing": ev.get("_timing"), "asa_time": iso(ev["_ts"]) if ev.get("_ts") else None,
            "adjusted": ev.get("_adjusted"), "malformed_field": ev.get("_malformed"), "fraud_spike": bool(ev.get("_fraud_injected")),
            "attack_id": ev.get("_attack"), "burst": bool(ev.get("_burst"))}


# Pure function: SQL type for a list of Python values.
def infer_type(values):
    present = [v for v in values if v is not None]
    if present and all(isinstance(v, bool) for v in present):
        return "BOOLEAN"
    if present and all(isinstance(v, int) and not isinstance(v, bool) for v in present):
        return "INTEGER"
    if present and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in present):
        return "REAL"
    return "TEXT"


# Pure function: ordered union of keys and their types.
def columns_of(rows):
    keys = []
    for r in rows:
        keys += [k for k in r if k not in keys]
    return {k: infer_type([r.get(k) for r in rows]) for k in keys} or {"id": "TEXT"}


# Pure function: a value as SQLite stores it.
def cell(v):
    return int(v) if isinstance(v, bool) else v if isinstance(v, (int, float, str)) or v is None else str(v)


# Creates and fills one table; returns its column types.
def create_table(conn, name, rows):
    cols = columns_of(rows)
    conn.execute(f'CREATE TABLE "{name}" (' + ", ".join(f'"{c}" {t}' for c, t in cols.items()) + ")")
    marks = ", ".join("?" for _ in cols)
    conn.executemany(f'INSERT INTO "{name}" VALUES ({marks})', [[cell(r.get(c)) for c in cols] for r in rows])
    return cols


# Creates a UNION ALL view over tables with different columns.
def create_view(conn, name, parts, types):
    cols = {}
    for table, _ in parts:
        cols.update({c: t for c, t in types[table].items() if c not in cols})
    selects = []
    for table, record_type in parts:
        exprs = [f'"{c}"' if c in types[table] else f'NULL AS "{c}"' for c in cols]
        if record_type:
            exprs.insert(0, f"'{record_type}' AS record_type")
        selects.append(f'SELECT {", ".join(exprs)} FROM "{table}"')
    conn.execute(f'CREATE VIEW "{name}" AS ' + " UNION ALL ".join(selects))
    return ({"record_type": "TEXT"} if parts[0][1] else {}) | cols


# Builds the database; returns (connection, {table: {column: type}}).
def build(events, collections, metadata):
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    types = {"events": create_table(conn, "events", [event_row(e) for e in events]),
             "cards": create_table(conn, "cards", list(metadata.values()))}
    for key, table in COLLECTION_TABLE.items():
        types[table] = create_table(conn, table, collections.get(key, []))
    for view, (_, parts) in VIEWS.items():
        types[view] = create_view(conn, view, parts, types)
    conn.commit()
    return conn, types