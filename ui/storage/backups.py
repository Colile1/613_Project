# backups.py : lists and restores database backups, and imports exported sessions
# Restoring first backs up the current database, so a restore can be undone.

import sqlite3
from datetime import datetime

from ui.storage import repositories as repo


# Input wrapper: backup files, newest first.
def list_backups(db):
    folder = db.path.parent / "backups"
    files = sorted(folder.glob("control_centre-*.db"), reverse=True) if folder.exists() else []
    return [{"name": f.name, "size_bytes": f.stat().st_size,
             "modified": datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")} for f in files]


# Replaces the live database contents with a backup (after backing up the current state).
def restore(db, name):
    folder = db.path.parent / "backups"
    source = (folder / name).resolve()
    if source.parent != folder.resolve() or not source.exists():
        return {"error": "Unknown backup."}
    safety = db.backup()
    with db.lock:
        src = sqlite3.connect(str(source))
        try:
            src.backup(db.conn)
        finally:
            src.close()
    return {"ok": True, "safety_backup": safety}


# Pure function: a problem with an exported session file, or None.
def import_problem(data):
    if not isinstance(data, dict) or not isinstance(data.get("events"), list) or not isinstance(data.get("state"), dict):
        return "This is not a session export (expected session, state and events)."
    if any(not isinstance(e, dict) or "sequence_number" not in e or "ingestion_time" not in e for e in data["events"][:50]):
        return "The events in this file are not in the expected format."
    return None


# Creates a new session from an exported JSON file; returns its id.
def import_session(db, data):
    problem = import_problem(data)
    if problem:
        return {"error": problem}
    name = (str((data.get("session") or {}).get("name") or "Imported session") + " (imported)")[:120]
    state = dict(data["state"], running=False)
    with db.tx() as c:
        sid = repo.create_session(c, name, state)
        repo.append_events(c, sid, data["events"])
    return {"ok": True, "id": sid, "name": name, "events": len(data["events"])}