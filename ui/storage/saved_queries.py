# saved_queries.py : named queries kept across sessions and restarts
# Each row stores the SQL and, when it came from the visual builder, the
# builder layout, so a saved query reopens in the mode it was written in.

import json

from ui.storage.db import now_iso

SCHEMA = """CREATE TABLE IF NOT EXISTS saved_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mode TEXT NOT NULL,
    sql TEXT NOT NULL,
    builder TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)"""


# Creates the table if this database predates saved queries.
def ensure_table(db):
    with db.tx() as c:
        c.execute(SCHEMA)


# Lists saved queries, most recently changed first.
def list_queries(db):
    rows = db.query("SELECT id, name, mode, sql, builder, updated_at FROM saved_queries ORDER BY updated_at DESC")
    return [{"id": r[0], "name": r[1], "mode": r[2], "sql": r[3], "builder": json.loads(r[4]) if r[4] else None,
             "updated_at": r[5]} for r in rows]


# Inserts or updates (same name replaces) a saved query; returns its id.
def save_query(db, name, mode, sql, builder):
    name = (name or "").strip()[:120] or "Untitled query"
    data = json.dumps(builder) if builder else None
    with db.tx() as c:
        row = c.execute("SELECT id FROM saved_queries WHERE name = ?", (name,)).fetchone()
        if row:
            c.execute("UPDATE saved_queries SET mode = ?, sql = ?, builder = ?, updated_at = ? WHERE id = ?",
                      (mode, sql, data, now_iso(), row[0]))
            return row[0]
        return c.execute("INSERT INTO saved_queries (name, mode, sql, builder, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                         (name, mode, sql, data, now_iso(), now_iso())).lastrowid


# Deletes one saved query.
def delete_query(db, query_id):
    with db.tx() as c:
        c.execute("DELETE FROM saved_queries WHERE id = ?", (query_id,))