# guard.py : runs user SQL safely against the warehouse copy
# Read-only (an SQLite authorizer allows only SELECT, reads and functions),
# one statement at a time, a 5-second time limit and at most 5 000 rows back.

import sqlite3
import time

MAX_ROWS = 5000
TIME_LIMIT_S = 5.0
ALLOWED = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, getattr(sqlite3, "SQLITE_RECURSIVE", 33)}


# Pure function: the authorizer callback - anything but reading is denied.
def authorize(action, *_):
    return sqlite3.SQLITE_OK if action in ALLOWED else sqlite3.SQLITE_DENY


# Pure function: a friendlier message for common SQLite errors.
def explain(error):
    text = str(error)
    if "not authorized" in text:
        return "Only read-only SELECT queries are allowed here (the warehouse is a read-only copy)."
    if "interrupted" in text:
        return f"The query ran longer than {TIME_LIMIT_S:g} seconds and was stopped. Add a filter or a LIMIT."
    if "one statement at a time" in text:
        return "Run one statement at a time (remove the extra ';' statements)."
    return text


# Runs one query; returns columns, rows (lists), counts and timing, or an error.
def run(conn, sql, max_rows=MAX_ROWS):
    sql = (sql or "").strip().rstrip(";").strip()
    if not sql:
        return {"error": "Write a query first."}
    deadline = time.monotonic() + TIME_LIMIT_S
    started = time.perf_counter()
    conn.set_authorizer(authorize)
    conn.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 20000)
    try:
        cur = conn.execute(sql)
        columns = [d[0] for d in cur.description or []]
        rows = cur.fetchmany(max_rows + 1) if max_rows else cur.fetchall()
    except (sqlite3.Error, sqlite3.Warning) as exc:
        return {"error": explain(exc)}
    finally:
        conn.set_authorizer(None)
        conn.set_progress_handler(None, 0)
    truncated = bool(max_rows) and len(rows) > max_rows
    rows = rows[:max_rows] if max_rows else rows
    return {"columns": columns, "rows": [list(r) for r in rows], "row_count": len(rows),
            "truncated": truncated, "ms": round((time.perf_counter() - started) * 1000, 1)}