# alerts.py : TRANSFORM stage, part 2 (fraud detection)
# Query step 4: sliding 5-min velocity alert (> threshold tx per card).
# Query step 5: amount anomaly (amount > multiplier x its merchant category's
# 10-min average over all cards, pre-aggregated once a minute).
# amount_alerts() keeps the rolling self-join form for the comparison study.

from bisect import bisect_left
from collections import defaultdict, deque
from datetime import timedelta

from ui.etl.timeutil import iso_s, floor_minute


# Pure function: groups valid events by a field (card_id by default), ordered by time.
def by_card(valid, field="card_id"):
    groups = defaultdict(list)
    for ev in valid:
        groups[ev[field]].append(ev)
    for evs in groups.values():
        evs.sort(key=lambda e: e["_ts"])
    return groups


# Pure function: sliding-window velocity alerts, evaluated as each event enters.
def velocity_alerts(groups, threshold, wm, window_s=300):
    size, docs = timedelta(seconds=window_s), []
    for card, evs in groups.items():
        window, total = deque(), 0.0
        for ev in evs:
            window.append(ev)
            total += ev["amount"]
            while ev["_ts"] - window[0]["_ts"] >= size:
                total -= window.popleft()["amount"]
            if len(window) > threshold and (wm is None or ev["_ts"] <= wm):
                docs.append({
                    "id": f"{card}_VELOCITY_{iso_s(ev['_ts'])}_{ev['sequence_number']}",
                    "card_id": card, "velocity_count": len(window),
                    "total_amount_zar": round(total, 2), "detected_at": iso_s(ev["_ts"]),
                    "alert_type": "VELOCITY", "alert_description": "High transaction frequency detected",
                })
    return docs


# Pure function: amount-anomaly alerts using the self-join's 0-10 minute history.
# `groups` holds the events per merchant category (the comparison baseline).
def amount_alerts(groups, multiplier, wm, size=timedelta(minutes=10)):
    docs = []
    for category, evs in groups.items():
        window, total = deque(), 0.0
        for ev in evs:
            window.append(ev)
            total += ev["amount"]
            while ev["_ts"] - window[0]["_ts"] > size:
                total -= window.popleft()["amount"]
            avg = total / len(window)
            if ev["amount"] > multiplier * avg and (wm is None or ev["_ts"] <= wm):
                docs.append({
                    "id": f"{ev['transaction_id'][:8]}_HIGH_AMOUNT_{iso_s(ev['_ts'])}",
                    "card_id": ev["card_id"], "transaction_id": ev["transaction_id"], "amount": ev["amount"],
                    "merchant_id": ev["merchant_id"], "merchant_category": ev["merchant_category"],
                    "rolling_avg": round(avg, 2), "amount_ratio": round(ev["amount"] / avg, 2),
                    "detected_at": iso_s(ev["_ts"]), "alert_type": "HIGH_AMOUNT",
                    "alert_description": f"Transaction amount exceeds {multiplier:g}x its category 10-min average",
                })
    return docs


# Pure function: query step 5 as deployed - pre-aggregated category baseline.
# CategoryAvg = AVG(amount) per merchant category over a 10-minute hopping window
# that advances every minute. Each payment joins only the latest window that
# ended at or before it (DATEDIFF 0-59 s), so it is compared with one row
# instead of every payment in its category.
def category_amount_alerts(valid, multiplier, wm, size=timedelta(minutes=10)):
    docs = []
    for category, evs in by_card(valid, "merchant_category").items():
        times = [e["_ts"] for e in evs]
        prefix = [0.0]
        for e in evs:
            prefix.append(prefix[-1] + e["amount"])
        for ev in evs:
            end = floor_minute(ev["_ts"])
            lo, hi = bisect_left(times, end - size), bisect_left(times, end)
            if hi == lo or (wm is not None and ev["_ts"] > wm):
                continue
            avg = (prefix[hi] - prefix[lo]) / (hi - lo)
            if ev["amount"] > multiplier * avg:
                docs.append({
                    "id": f"{ev['transaction_id'][:8]}_HIGH_AMOUNT_{iso_s(ev['_ts'])}",
                    "card_id": ev["card_id"], "transaction_id": ev["transaction_id"], "amount": ev["amount"],
                    "merchant_id": ev["merchant_id"], "merchant_category": category,
                    "rolling_avg": round(avg, 2), "amount_ratio": round(ev["amount"] / avg, 2),
                    "baseline_count": hi - lo, "baseline_window_end": iso_s(end),
                    "detected_at": iso_s(ev["_ts"]), "alert_type": "HIGH_AMOUNT",
                    "alert_description": f"Transaction amount exceeds {multiplier:g}x its category 10-min average",
                })
    return docs
