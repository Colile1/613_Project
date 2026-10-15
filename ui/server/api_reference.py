# api_reference.py : reference-data browsing and the velocity Threshold explorer

from ui.etl import threshold, transform


# GET /api/reference?q=&offset=&limit=  (or ?ids=1 for every card id)
def reference(ctx, q):
    rows = list(ctx.session.metadata.values())
    if q.get("ids"):
        return {"ids": [r["card_id"] for r in rows]}
    tiers = {}
    for r in rows:
        tiers[r["customer_tier"]] = tiers.get(r["customer_tier"], 0) + 1
    needle = q.get("q", "").lower()
    if needle:
        rows = [r for r in rows if needle in " ".join(str(v) for v in r.values()).lower()]
    offset, limit = int(q.get("offset", 0)), int(q.get("limit", 100))
    return {"total": len(rows), "cards": len(ctx.session.metadata), "tiers": tiers, "rows": rows[offset:offset + limit]}


# GET /api/threshold - velocity threshold sweep over the session's valid events
def threshold_view(ctx, q):
    events, result = ctx.session.result()
    valid = [e for e in events if transform.is_valid(e)]
    data = threshold.sweep(valid)
    data["current"] = {"threshold": ctx.session.policy["velocity_threshold"], "window_s": ctx.session.policy["velocity_window_s"]}
    data["rate"] = ctx.session.config["rate"]
    data["cards"] = len(ctx.session.metadata)
    return data
