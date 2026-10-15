# analytics.py : ANALYTICS stage (Power BI model)
# Builds the datasets behind the three report pages in
# powerbi/dashboard_design.md: Live Operations, Fraud Trends, Pipeline Health,
# plus the Card Detail drill-through. Slicers: tier, category, alert type.

from collections import Counter, defaultdict
from datetime import timedelta

from ui.etl.timeutil import iso_s, floor_minute, parse_iso
from ui.etl.ingest import lag_seconds


# Pure function: keeps docs whose card tier / category pass the slicers.
def slice_docs(docs, tiers, filters):
    tier, cat = filters.get("tier"), filters.get("category")
    out = []
    for d in docs:
        if tier and tiers.get(d.get("card_id")) != tier:
            continue
        if cat and "merchant_category" in d and d["merchant_category"] != cat:
            continue
        out.append(d)
    return out


# Pure function: per-minute counts of docs by a time field, newest n minutes.
def per_minute(docs, field, n=30):
    counts = Counter(iso_s(floor_minute(parse_iso_s(d[field]))) for d in docs)
    keys = sorted(counts)[-n:]
    return [{"t": k, "v": counts[k]} for k in keys]


# Pure function: parses whole-second ISO strings written by iso_s.
def parse_iso_s(text):
    return parse_iso(text.replace("Z", ".000Z")) if "." not in text else parse_iso(text)


# Pure function: Live Operations page.
def live_operations(c, events, tiers, f):
    windows = slice_docs(c["card_windows"], tiers, f)
    per_end = defaultdict(int)
    for w in windows:
        per_end[w["window_end"]] += w["tx_count"]
    ends = sorted(per_end)[-30:]
    enriched = slice_docs(c["enriched"], tiers, f)
    spend = Counter()
    for d in enriched:
        spend[d["merchant_category"] or "(missing)"] += d["amount"]
    lags = [lag_seconds(e) for e in events]
    alerts = c["velocity"] + c["high_amount"]
    latest = max((a["detected_at"] for a in alerts), default=None)
    recent = [a for a in alerts if latest and parse_iso_s(a["detected_at"]) >= parse_iso_s(latest) - timedelta(minutes=5)]
    return {
        "kpi": {
            "tx_per_min": per_end[ends[-1]] if ends else 0,
            "tx_processed": sum(w["tx_count"] for w in windows),
            "alerts_5min": len(slice_docs(recent, tiers, f)),
            "avg_lag_s": round(sum(lags) / len(lags), 2) if lags else 0,
            "total_spend": round(sum(d["amount"] for d in enriched), 2),
        },
        "tx_per_minute": [{"t": e, "v": per_end[e]} for e in ends],
        "spend_by_category": [{"k": k, "v": round(v, 2)} for k, v in spend.most_common()],
    }


# Pure function: Fraud Trends page incl. top-10 flagged cards.
def fraud_trends(c, metadata, tiers, f):
    types = {"VELOCITY": c["velocity"], "HIGH_AMOUNT": c["high_amount"]}
    if f.get("alert_type"):
        types = {f["alert_type"]: types[f["alert_type"]]}
    types = {k: slice_docs(v, tiers, f) for k, v in types.items()}
    all_alerts = [a for v in types.values() for a in v]
    by_cat = Counter(a["merchant_category"] or "(missing)" for a in types.get("HIGH_AMOUNT", []))
    spend = Counter()
    for d in c["enriched"]:
        spend[d["card_id"]] += d["amount"]
    per_card = defaultdict(list)
    for a in all_alerts:
        per_card[a["card_id"]].append(a)
    top = sorted(per_card.items(), key=lambda kv: -len(kv[1]))[:10]
    return {
        "series": {k: per_minute(v, "detected_at") for k, v in types.items()},
        "high_amount_by_category": [{"k": k, "v": v} for k, v in by_cat.most_common()],
        "top_cards": [{
            "card_id": card, "customer_name": metadata.get(card, {}).get("customer_name", "?"),
            "customer_tier": tiers.get(card, "?"), "alert_count": len(al),
            "total_amount_zar": round(spend[card], 2),
            "last_alert": max(a["detected_at"] for a in al),
        } for card, al in top],
        "total_alerts": len(all_alerts),
    }


# Pure function: Pipeline Health page.
def pipeline_health(c, events, result):
    dl = c["dead_letter"]
    return {
        "kpi": {
            "dead_letter": len(dl), "events_ingested": len(events),
            "late_arrivals": sum(1 for e in events if e["_timing"] == "late"),
            "out_of_order": sum(1 for e in events if e["_timing"] == "out_of_order"),
            "duplicates": sum(1 for e in events if e["is_duplicate"]),
            "adjusted": dict(result["adjusted"]),
        },
        "dead_letter_per_minute": per_minute(dl, "ingestion_time"),
        "reasons": [{"k": k, "v": v} for k, v in Counter(d["dead_letter_detail"] for d in dl).most_common()],
        "sample": list(reversed(dl[-50:])),
    }


# Pure function: Card Detail drill-through for one card.
def card_detail(c, metadata, card_id):
    tx = [d for d in c["enriched"] if d["card_id"] == card_id]
    al = [a for a in c["velocity"] + c["high_amount"] if a["card_id"] == card_id]
    return {"card": metadata.get(card_id, {"card_id": card_id}), "transactions": tx[-200:],
            "alerts": len(al), "high_amount": sum(1 for a in al if a["alert_type"] == "HIGH_AMOUNT")}
