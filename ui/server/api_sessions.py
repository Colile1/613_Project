# api_sessions.py : endpoints for saved sessions, shared UI preferences and the database
# Preferences are stored server-side so every browser tab (and the next app
# start) sees the same page, tabs, filters and theme.

from ui.storage import repositories as repo
from ui.storage import codec


# GET /api/sessions
def sessions(ctx, q):
    return {"active": ctx.session.session_id, "sessions": repo.list_sessions(ctx.db), "storage": ctx.db.info()}


# GET /api/prefs  (keys starting with "_" are internal)
def prefs(ctx, q):
    return {"rev": ctx.prefs_rev, "prefs": {k: v for k, v in repo.get_prefs(ctx.db).items() if not k.startswith("_")}}


# POST /api/prefs {key: value, ...}
def save_prefs(ctx, body):
    clean = {str(k)[:80]: v for k, v in body.items() if not str(k).startswith("_")}
    with ctx.db.tx() as c:
        repo.set_prefs(c, clean)
    ctx.prefs_rev += 1
    return {"ok": True, "rev": ctx.prefs_rev}


# POST /api/sessions/new {name}
def new_session(ctx, body):
    ctx.session.new_session(str(body.get("name", "")))
    return {"ok": True, "id": ctx.session.session_id}


# POST /api/sessions/switch {id}
def switch_session(ctx, body):
    ctx.session.switch_session(int(body["id"]))
    return {"ok": True, "id": ctx.session.session_id}


# POST /api/sessions/rename {id, name}
def rename_session(ctx, body):
    ctx.session.rename_session(int(body["id"]), str(body.get("name", "")))
    return {"ok": True}


# POST /api/sessions/delete {id}
def delete_session(ctx, body):
    ctx.session.delete_session(int(body["id"]))
    return {"ok": True, "id": ctx.session.session_id}


# POST /api/sessions/backup
def backup(ctx, body):
    ctx.session.save()
    return {"ok": True, "path": ctx.db.backup()}


# GET /api/sessions/export?id=  - one session as portable JSON
def export_session(ctx, q):
    sid = int(q.get("id", ctx.session.session_id))
    row = repo.load_session(ctx.db, sid)
    if row is None:
        return {"error": "unknown session"}
    if sid == ctx.session.session_id:
        row["state"] = codec.to_state(ctx.session)
    return {"session": {"id": row["id"], "name": row["name"]}, "state": row["state"],
            "events": repo.load_events(ctx.db, sid)}