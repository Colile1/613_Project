# profile.py : schema, field profiles, relationships and example queries

from ui.sqlwh.build import TABLES, VIEWS

# (from table.column, to table.column, meaning) - drawn by the Data model view
RELATIONSHIPS = [
    ("events.card_id", "cards.card_id", "each event belongs to one card"),
    ("transactions.transaction_id", "events.transaction_id", "query 6 enriches valid events"),
    ("transactions.card_id", "cards.card_id", "query 6 joins the reference data"),
    ("card_windows.card_id", "cards.card_id", "query 2 groups by card"),
    ("velocity_alerts.card_id", "cards.card_id", "query 4 alerts per card"),
    ("high_amount_alerts.transaction_id", "transactions.transaction_id", "query 5 flags one payment"),
    ("high_amount_alerts.merchant_category", "transactions.merchant_category", "query 5 compares with the category's 10-minute average (step 0)"),
    ("dead_letter.transaction_id", "events.transaction_id", "query 1 routes invalid events (id may be missing)"),
]

EXAMPLES = [
    ("Top 10 flagged cards", "SELECT card_id, COUNT(*) AS alerts, MAX(detected_at) AS last_alert\nFROM fraud_alerts\nGROUP BY card_id\nORDER BY alerts DESC\nLIMIT 10"),
    ("Alerts with customer details (join)", "SELECT a.alert_type, a.card_id, c.customer_name, c.customer_tier, a.detected_at\nFROM fraud_alerts a\nJOIN cards c ON c.card_id = a.card_id\nORDER BY a.detected_at DESC\nLIMIT 50"),
    ("Spend by tier and category", "SELECT customer_tier, merchant_category, COUNT(*) AS payments, ROUND(SUM(amount), 2) AS total_zar\nFROM transactions\nGROUP BY customer_tier, merchant_category\nORDER BY total_zar DESC"),
    ("Dead-letter reasons", "SELECT dead_letter_detail, COUNT(*) AS events\nFROM dead_letter\nGROUP BY dead_letter_detail\nORDER BY events DESC"),
    ("Late and out-of-order events", "SELECT timing, adjusted, COUNT(*) AS events,\n       ROUND(AVG((julianday(ingestion_time) - julianday(event_time)) * 86400), 1) AS avg_lag_s\nFROM events\nGROUP BY timing, adjusted"),
    ("Events per partition", "SELECT partition_id, COUNT(*) AS events, COUNT(DISTINCT card_id) AS cards\nFROM events\nGROUP BY partition_id\nORDER BY partition_id"),
    ("Transactions per minute", "SELECT substr(window_end, 1, 16) AS minute, SUM(tx_count) AS transactions\nFROM card_windows\nGROUP BY minute\nORDER BY minute"),
    ("Near-limit payments", "SELECT card_id, customer_name, amount, credit_limit_zar, event_time\nFROM transactions\nWHERE credit_flag = 'NEAR_LIMIT'\nORDER BY amount DESC"),
]


# Schema for the Query page and the Data model view.
def schema(conn, types, custom=None):
    custom, out = custom or {}, []
    for name, cols in types.items():
        is_view = name in VIEWS or name in custom
        if name in custom:
            desc, where = "Saved view: " + " ".join(custom[name].split())[:140], "Saved view (yours)"
        else:
            desc, where = (VIEWS[name][0], "Cosmos \u00b7 " + name) if name in VIEWS else TABLES[name]
        rows = conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
        out.append({"name": name, "kind": "saved view" if name in custom else "view" if is_view else "table", "description": desc, "location": where,
                    "rows": rows, "columns": [{"name": c, "type": t} for c, t in cols.items()]})
    return {"tables": out, "relationships": [{"from": a, "to": b, "label": l} for a, b, l in RELATIONSHIPS],
            "examples": [{"name": n, "sql": s} for n, s in EXAMPLES]}


# Field profile of one table: nulls, distinct values, range and most common values.
def profile(conn, table, types):
    if table not in types:
        return {"error": "unknown table"}
    total = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
    fields = []
    for col, typ in types[table].items():
        q = f'SELECT COUNT("{col}"), COUNT(DISTINCT "{col}"), MIN("{col}"), MAX("{col}") FROM "{table}"'
        filled, distinct, low, high = conn.execute(q).fetchone()
        top = conn.execute(f'SELECT "{col}", COUNT(*) AS n FROM "{table}" WHERE "{col}" IS NOT NULL '
                           f'GROUP BY "{col}" ORDER BY n DESC LIMIT 3').fetchall() if typ in ("TEXT", "BOOLEAN") else []
        avg = conn.execute(f'SELECT AVG("{col}") FROM "{table}"').fetchone()[0] if typ in ("INTEGER", "REAL") else None
        fields.append({"name": col, "type": typ, "null_pct": (total - filled) / total if total else 0, "distinct": distinct,
                       "min": low, "max": high, "avg": avg, "top": [{"value": v, "count": n} for v, n in top]})
    return {"table": table, "rows": total, "fields": fields}