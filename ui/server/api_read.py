# api_read.py : GET endpoints of the JSON API
# Each function takes the shared context and the query parameters and
# returns a JSON-serialisable dict. No printing, no HTTP details.

from ui.etl import ingest, warehouse, analytics, threshold, transform
from ui.etl.generator import iso
from ui.integrations import project_files, env_status, cosmos_live

TIMINGS = ["on_time", "out_of_order", "late"]


# Pure function: drops non-serialisable internals (_ts) from an event for display.
def public_event(ev):
    return {k: v for k, v in ev.items() if k != "_ts"}


# Pure function: counts of documents for each stage of the pipeline.
def stage_counts(events, result):
    per_collection, per_container = warehouse.counts(result)
    return {"extracted": len(events), "ingested": len(events), "dead_letter": per_collection["dead_letter"],
            "valid": result["valid_count"], "alerts": per_collection["velocity"] + per_collection["high_amount"],
            "collections": per_collection, "containers": per_container}


# GET /api/status
def status(ctx, q):
    events, result = ctx.session.result()
    wm = result["watermark"]
    return {"sim": ctx.session.status(), "env": env_status.get_status(), "runner": ctx.runner.is_running(),
            "stages": stage_counts(events, result), "watermark": iso(wm) if wm else None,
            "storage": {"saved_at": ctx.db.saved_at, "path": str(ctx.db.path)}, "prefs_rev": ctx.prefs_rev}


# GET /api/extract
def extract(ctx, q):
    events, _ = ctx.session.result()
    by_timing = {t: sum(1 for e in events if e["_timing"] == t) for t in TIMINGS}
    return {"config": ctx.session.config, "total": len(events), "by_timing": by_timing,
            "duplicates": sum(1 for e in events if e["is_duplicate"]),
            "malformed": sum(1 for e in events if e["_malformed"]),
            "fraud_injected": sum(1 for e in events if e["_fraud_injected"]),
            "bursts": sum(1 for e in events if e["_burst"]),
            "recent": [public_event(e) for e in events[-80:]][::-1],
            "cards": len(ctx.session.metadata)}


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


# GET /api/ingest
def ingest_view(ctx, q):
    events, _ = ctx.session.result()
    return ingest.summarise(events)


# GET /api/transform
def transform_view(ctx, q):
    events, result = ctx.session.result()
    cfg, policy = ctx.session.config, ctx.session.policy
    window_s = policy["velocity_window_s"]
    per_card = cfg["rate"] * window_s / len(ctx.session.metadata)
    return {"policy": policy, "stages": stage_counts(events, result),
            "adjusted": dict(result["adjusted"]), "watermark": iso(result["watermark"]) if result["watermark"] else None,
            "insight": {"expected_per_card": round(per_card, 2), "window_s": window_s, "cards": len(ctx.session.metadata),
                        "threshold": policy["velocity_threshold"]}}


# GET /api/threshold - velocity threshold sweep over the session's valid events
def threshold_view(ctx, q):
    events, result = ctx.session.result()
    valid = [e for e in events if transform.is_valid(e)]
    data = threshold.sweep(valid)
    data["current"] = {"threshold": ctx.session.policy["velocity_threshold"], "window_s": ctx.session.policy["velocity_window_s"]}
    data["rate"] = ctx.session.config["rate"]
    data["cards"] = len(ctx.session.metadata)
    return data


# GET /api/warehouse
def warehouse_view(ctx, q):
    events, result = ctx.session.result()
    key = q.get("collection", "card_windows")
    docs = result["collections"].get(key, [])
    page = warehouse.query_collection(docs, q.get("q", ""), q.get("field"), q.get("value"),
                                      int(q.get("limit", 100)), int(q.get("offset", 0)))
    per_collection, per_container = warehouse.counts(result)
    return {"containers": warehouse.CONTAINERS, "per_container": per_container, "per_collection": per_collection,
            "collections": [{"key": k, "container": c, "label": l, "step": s} for k, c, l, s in warehouse.COLLECTIONS],
            "collection": key, **page}


# GET /api/analytics?page=live|fraud|health
def analytics_view(ctx, q):
    events, result = ctx.session.result()
    c, s = result["collections"], ctx.session
    filters = {k: q.get(k) for k in ("tier", "category", "alert_type") if q.get(k)}
    page = q.get("page", "live")
    if page == "fraud":
        return analytics.fraud_trends(c, s.metadata, s.tiers, filters)
    if page == "health":
        return analytics.pipeline_health(c, events, result)
    return analytics.live_operations(c, events, s.tiers, filters)


# GET /api/card?card_id=
def card(ctx, q):
    _, result = ctx.session.result()
    return analytics.card_detail(result["collections"], ctx.session.metadata, q.get("card_id", ""))


# GET /api/files and /api/file?key=
def files(ctx, q):
    return {"files": project_files.catalogue()}


def file(ctx, q):
    found = project_files.get_file(q.get("key", ""))
    if found and found["key"] == "todo":
        found["progress"] = project_files.todo_progress(found["content"])
    return found or {"error": "unknown file"}


# GET /api/azure and /api/cosmos?container=
def azure(ctx, q):
    return {"env": env_status.get_status(), "runner": ctx.runner.status()}


def cosmos(ctx, q):
    return cosmos_live.get_documents(q.get("container", ""), int(q.get("limit", 100)))
