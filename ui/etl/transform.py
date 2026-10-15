# transform.py : TRANSFORM stage, part 1 (Azure Stream Analytics model)
# Applies the ASA job's time policies (late-arrival and out-of-order tolerance,
# "Adjust" action), then runs query steps 1-3 of asa/query.sql:
# dead-letter routing, 1-min tumbling per card, 5-min hopping per category.

from collections import defaultdict
from datetime import timedelta

from ui.etl.timeutil import parse_iso, iso_s, floor_minute, MINUTE

DEFAULT_POLICY = {
    "late_tolerance_s": 120,      # asa/query.sql header: 2 minutes
    "out_of_order_tolerance_s": 30,
    "velocity_threshold": 5,      # query step 4: HAVING COUNT(*) > 5
    "velocity_window_s": 300,     # query step 4: SlidingWindow(minute, 5)
    "amount_multiplier": 3.0,     # query step 5: amount > 3 x rolling avg
}


# Pure function: ASA dead-letter predicate (query step 1).
def dead_letter_detail(ev):
    if ev["transaction_id"] is None:
        return "missing transaction_id"
    if ev["card_id"] is None:
        return "missing card_id"
    if ev["amount"] is None or ev["amount"] <= 0:
        return "non-positive amount"
    if ev["merchant_category"] is None:
        return "missing merchant_category"
    return None


# Pure function: ASA validity predicate used by steps 2-6 (the inverse of step 1).
def is_valid(ev):
    return dead_letter_detail(ev) is None


# Pure function: stamps the ASA application timestamp (_ts) on every event.
def apply_time_policy(events, policy):
    late_tol = timedelta(seconds=policy["late_tolerance_s"])
    ooo_tol = timedelta(seconds=policy["out_of_order_tolerance_s"])
    partition_max = {}
    for ev in events:
        arrival, ts = parse_iso(ev["ingestion_time"]), parse_iso(ev["event_time"])
        ev["_adjusted"] = None
        if arrival - ts > late_tol:
            ts, ev["_adjusted"] = arrival - late_tol, "late_arrival"
        high = partition_max.get(ev["_partition"])
        if high is not None and ts < high - ooo_tol:
            ts = high - ooo_tol
            ev["_adjusted"] = ev["_adjusted"] or "out_of_order"
        partition_max[ev["_partition"]] = max(high or ts, ts)
        ev["_ts"] = ts
    return events


# Pure function: ASA watermark = latest application time - out-of-order tolerance.
def watermark(events, policy):
    if not events:
        return None
    return max(ev["_ts"] for ev in events) - timedelta(seconds=policy["out_of_order_tolerance_s"])


# Pure function: query step 1 - dead-letter documents.
def dead_letters(events):
    docs = []
    for ev in events:
        detail = dead_letter_detail(ev)
        if detail:
            docs.append({
                "id": f"dl-{ev['sequence_number']}", "transaction_id": ev["transaction_id"],
                "card_id": ev["card_id"], "merchant_id": ev["merchant_id"],
                "merchant_category": ev["merchant_category"], "amount": ev["amount"],
                "event_time": ev["event_time"], "ingestion_time": iso_s(ev["_ts"]),
                "dead_letter_reason": "MALFORMED", "dead_letter_detail": detail,
                "ingestion_date": ev["_ts"].strftime("%Y-%m-%d"),
            })
    return docs


# Pure function: query step 2 - 1-minute tumbling aggregates per card.
def tumbling_per_card(valid, wm):
    groups = defaultdict(list)
    for ev in valid:
        groups[(ev["card_id"], floor_minute(ev["_ts"]) + MINUTE)].append(ev)
    docs = []
    for (card, end), evs in groups.items():
        if wm is None or end > wm:
            continue
        amounts = [e["amount"] for e in evs]
        docs.append({
            "id": f"{card}_{iso_s(end)}", "card_id": card, "tx_count": len(evs),
            "total_amount_zar": round(sum(amounts), 2), "avg_amount_zar": round(sum(amounts) / len(amounts), 2),
            "max_amount_zar": max(amounts), "min_amount_zar": min(amounts),
            "distinct_merchants": len({e["merchant_id"] for e in evs}),
            "window_start": iso_s(end - MINUTE), "window_end": iso_s(end),
        })
    return sorted(docs, key=lambda d: d["window_end"])


# Pure function: query step 3 - 5-minute hopping window (1-min hop) per category.
def hopping_per_category(valid, wm):
    groups = defaultdict(list)
    for ev in valid:
        first_end = floor_minute(ev["_ts"]) + MINUTE
        for k in range(5):
            groups[(ev["merchant_category"], first_end + k * MINUTE)].append(ev["amount"])
    docs = []
    for (cat, end), amounts in groups.items():
        if wm is None or end > wm:
            continue
        docs.append({
            "id": f"{cat}_{iso_s(end)}", "merchant_category": cat, "tx_count": len(amounts),
            "total_amount_zar": round(sum(amounts), 2), "avg_amount_zar": round(sum(amounts) / len(amounts), 2),
            "window_end": iso_s(end),
        })
    return sorted(docs, key=lambda d: d["window_end"])
