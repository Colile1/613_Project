# threshold.py : evidence for choosing the velocity rule (query step 4)
# For every valid event, counts the card's transactions in the sliding window
# ending at that event - exactly what HAVING COUNT(*) > threshold tests - and
# sweeps thresholds to show how often normal traffic alerts versus how many
# card-testing attacks are caught.

from collections import deque
from datetime import timedelta

from ui.etl.alerts import by_card

WINDOWS = [60, 120, 300]
TARGET_NORMAL_RATE = 0.01      # at most 1% of normal transactions may raise an alert


# Pure function: (count in window, label) for every valid event. The label is the
# attack id, "near" for a normal payment whose window still contains an attack
# (alerting on a card under attack is not a false alarm), or None for normal.
def window_counts(valid, window_s):
    size, out = timedelta(seconds=window_s), []
    for evs in by_card(valid).values():
        window = deque()
        for ev in evs:
            window.append(ev)
            while ev["_ts"] - window[0]["_ts"] >= size:
                window.popleft()
            label = ev.get("_attack") or ("near" if any(w.get("_attack") for w in window) else None)
            out.append((len(window), label))
    return out


# Pure function: alert rate on normal events and attack detection for one threshold.
def score(counts, threshold):
    normal = [c for c, a in counts if a is None]
    attacks = {}
    for c, a in counts:
        if a not in (None, "near"):
            attacks[a] = attacks.get(a, False) or c > threshold
    return {"threshold": threshold,
            "normal_alert_rate": sum(1 for c in normal if c > threshold) / max(1, len(normal)),
            "attack_detection": sum(attacks.values()) / max(1, len(attacks)),
            "attacks": len(attacks)}


# Pure function: smallest threshold whose normal alert rate meets the target.
def recommend(rows):
    for r in rows:
        if r["normal_alert_rate"] <= TARGET_NORMAL_RATE:
            return r
    return rows[-1] if rows else None


# Pure function: full sweep for every candidate window.
def sweep(valid):
    result = []
    for window_s in WINDOWS:
        counts = window_counts(valid, window_s)
        top = max((c for c, _ in counts), default=1)
        rows = [score(counts, t) for t in range(1, top + 1)]
        normal = sorted(c for c, a in counts if a is None)
        result.append({"window_s": window_s, "rows": rows, "recommended": recommend(rows),
                       "normal_median": normal[len(normal) // 2] if normal else 0,
                       "normal_p99": normal[int(len(normal) * 0.99)] if normal else 0})
    best = max(result, key=lambda w: (w["recommended"] or {}).get("attack_detection", 0) if w["recommended"] else 0)
    return {"windows": result, "best_window_s": best["window_s"], "target_normal_rate": TARGET_NORMAL_RATE}