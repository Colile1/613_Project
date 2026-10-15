# repositories.py : the SQL for every table, one small function per operation
# Functions that take `c` run inside a caller's transaction; the others take
# the Database and manage their own.

import json

from ui.storage.db import now_iso

INTERNAL_KEYS = {"_ts", "_offset", "_adjusted"}   # recomputed on load, never stored


# ---- sessions ---------------------------------------------------------------

# Creates a session row and returns its id.
def create_session(c, name, state):
    cur = c.execute("INSERT INTO sessions (name, created_at, updated_at, state) VALUES (?, ?, ?, ?)",
                    (name, now_iso(), now_iso(), json.dumps(state)))
    return cur.lastrowid


# Replaces a session's saved state.
def save_state(c, session_id, state):
    c.execute("UPDATE sessions SET state = ?, updated_at = ? WHERE id = ?", (json.dumps(state), now_iso(), session_id))


# Reads one session (name + state) or None.
def load_session(db, session_id):
    rows = db.query("SELECT id, name, state FROM sessions WHERE id = ?", (session_id,))
    return {"id": rows[0][0], "name": rows[0][1], "state": json.loads(rows[0][2])} if rows else None


# Lists every session with its stored event count, newest activity first.
def list_sessions(db):
    rows = db.query("""SELECT s.id, s.name, s.created_at, s.updated_at,
                              (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id)
                       FROM sessions s ORDER BY s.updated_at DESC""")
    return [{"id": r[0], "name": r[1], "created_at": r[2], "updated_at": r[3], "events": r[4]} for r in rows]


# Renames a session.
def rename_session(c, session_id, name):
    c.execute("UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?", (name, now_iso(), session_id))


# Deletes a session and (by cascade) its events.
def delete_session(c, session_id):
    c.execute("DELETE FROM events WHERE session_id = ?", (session_id,))
    c.execute("DELETE FROM sessions WHERE id = ?", (session_id,))


# ---- events (append-only log) -------------------------------------------------

# Pure function: the JSON stored for one event (body + audit flags, no derived fields).
def event_row(session_id, ev):
    body = {k: v for k, v in ev.items() if k not in INTERNAL_KEYS}
    return (session_id, ev["sequence_number"], ev["ingestion_time"], ev["card_id"], json.dumps(body, separators=(",", ":")))


# Appends events to a session's log.
def append_events(c, session_id, events):
    c.executemany("INSERT OR REPLACE INTO events (session_id, seq, ingestion_time, card_id, body) VALUES (?, ?, ?, ?, ?)",
                  [event_row(session_id, ev) for ev in events])


# Loads a session's events in generation order.
def load_events(db, session_id):
    return [json.loads(r[0]) for r in db.query("SELECT body FROM events WHERE session_id = ? ORDER BY seq", (session_id,))]


# Removes every event of a session.
def clear_events(c, session_id):
    c.execute("DELETE FROM events WHERE session_id = ?", (session_id,))


# ---- preferences (UI state shared by every browser tab) ----------------------

# Reads all preferences as a dict.
def get_prefs(db):
    return {k: json.loads(v) for k, v in db.query("SELECT key, value FROM prefs")}


# Upserts several preferences.
def set_prefs(c, values):
    c.executemany("INSERT INTO prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                  [(k, json.dumps(v)) for k, v in values.items()])


# ---- process runs (producer.py / pip output) ----------------------------------

# Records the start of a run and returns its id.
def start_run(c, label, command):
    return c.execute("INSERT INTO runs (label, command, started_at) VALUES (?, ?, ?)", (label, command, now_iso())).lastrowid


# Stores one output line of a run.
def add_run_line(c, run_id, n, line):
    c.execute("INSERT OR REPLACE INTO run_lines (run_id, n, line) VALUES (?, ?, ?)", (run_id, n, line))


# Records how a run ended.
def end_run(c, run_id, exit_code):
    c.execute("UPDATE runs SET ended_at = ?, exit_code = ? WHERE id = ?", (now_iso(), exit_code, run_id))


# Marks runs left open by a previous app instance as interrupted.
def close_open_runs(c):
    c.execute("UPDATE runs SET ended_at = ?, exit_code = -1 WHERE ended_at IS NULL", (now_iso(),))


# The most recent run with its last `limit` lines, or None.
def latest_run(db, limit=400):
    rows = db.query("SELECT id, label, command, started_at, ended_at, exit_code FROM runs ORDER BY id DESC LIMIT 1")
    if not rows:
        return None
    r = rows[0]
    lines = [x[0] for x in db.query("SELECT line FROM run_lines WHERE run_id = ? ORDER BY n DESC LIMIT ?", (r[0], limit))][::-1]
    return {"id": r[0], "label": r[1], "command": r[2], "started_at": r[3], "ended_at": r[4], "exit_code": r[5], "lines": lines}


# Run history for the Azure page.
def list_runs(db, limit=20):
    rows = db.query("SELECT id, label, command, started_at, ended_at, exit_code FROM runs ORDER BY id DESC LIMIT ?", (limit,))
    return [dict(zip(("id", "label", "command", "started_at", "ended_at", "exit_code"), r)) for r in rows]