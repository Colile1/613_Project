# saved_views.py : named SQL views the user adds to the warehouse
# Any read-only SELECT - including WITH, UNION and sub-queries - can be saved as
# a view. The view is recreated in every rebuilt copy of the warehouse, so it
# behaves like a table: it shows in the schema panel and the builder can use it.

import re

from ui.storage.db import now_iso

SCHEMA = """CREATE TABLE IF NOT EXISTS saved_views (
    name TEXT PRIMARY KEY,
    sql TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)"""
NAME = re.compile(r"^[a-z_][a-z0-9_]{0,40}$")


# Creates the table if this database predates saved views.
def ensure_table(db):
    with db.tx() as c:
        c.execute(SCHEMA)


# Pure function: why a view name is not allowed, or None.
def name_problem(name, taken):
    if not NAME.match(name or ""):
        return "Use lower-case letters, digits and _ (start with a letter), at most 41 characters."
    if name in taken:
        return f'"{name}" is already a table or view in the warehouse.'
    return None


# Lists saved views in creation order (a view may use an earlier one).
def list_views(db):
    return [{"name": r[0], "sql": r[1], "updated_at": r[2]}
            for r in db.query("SELECT name, sql, updated_at FROM saved_views ORDER BY created_at")]


# Inserts or replaces one view definition.
def save_view(db, name, sql):
    with db.tx() as c:
        c.execute("INSERT INTO saved_views (name, sql, created_at, updated_at) VALUES (?, ?, ?, ?) "
                  "ON CONFLICT(name) DO UPDATE SET sql = excluded.sql, updated_at = excluded.updated_at",
                  (name, sql, now_iso(), now_iso()))


# Deletes one view definition.
def delete_view(db, name):
    with db.tx() as c:
        c.execute("DELETE FROM saved_views WHERE name = ?", (name,))