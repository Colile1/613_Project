# db.py : SQLite connection and schema for the control centre
# One file database (ui/data/control_centre.db) in WAL mode: every simulated
# second of events and every settings change is committed as it happens, so a
# restart or crash loses nothing.

import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "control_centre.db"
SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS events (
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    ingestion_time TEXT NOT NULL,
    card_id TEXT,
    body TEXT NOT NULL,
    PRIMARY KEY (session_id, seq)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS prefs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    command TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    exit_code INTEGER
);
CREATE TABLE IF NOT EXISTS run_lines (
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    n INTEGER NOT NULL,
    line TEXT NOT NULL,
    PRIMARY KEY (run_id, n)
) WITHOUT ROWID;
"""


# Pure function: current UTC time as ISO8601 text.
def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Database:
    # Opens (or creates) the database file and applies the schema.
    def __init__(self, path=DB_PATH):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(str(self.path), check_same_thread=False, isolation_level=None)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        with self.tx() as c:
            for statement in SCHEMA.split(";"):
                if statement.strip():
                    c.execute(statement)
            c.execute("PRAGMA user_version=%d" % SCHEMA_VERSION)
        self.saved_at = None

    # Runs a block inside one transaction (all-or-nothing).
    @contextmanager
    def tx(self):
        with self.lock:
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                yield self.conn
                self.conn.execute("COMMIT")
                self.saved_at = now_iso()
            except Exception:
                self.conn.execute("ROLLBACK")
                raise

    # Runs one read query and returns all rows.
    def query(self, sql, params=()):
        with self.lock:
            return self.conn.execute(sql, params).fetchall()

    # File size and row counts for the UI.
    def info(self):
        size = sum(p.stat().st_size for p in self.path.parent.glob(self.path.name + "*") if p.is_file())
        counts = {t: self.query("SELECT COUNT(*) FROM " + t)[0][0] for t in ("sessions", "events", "prefs", "runs", "run_lines")}
        return {"path": str(self.path), "size_bytes": size, "saved_at": self.saved_at, "tables": counts,
                "engine": "SQLite " + sqlite3.sqlite_version + " (WAL)"}

    # Writes a consistent copy of the database to ui/data/backups/.
    def backup(self):
        folder = self.path.parent / "backups"
        folder.mkdir(exist_ok=True)
        target = folder / ("control_centre-" + datetime.now().strftime("%Y%m%d-%H%M%S") + ".db")
        with self.lock:
            dest = sqlite3.connect(str(target))
            self.conn.backup(dest)
            dest.close()
        return str(target)

    # Flushes the WAL into the main file and closes the connection.
    def close(self):
        with self.lock:
            self.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            self.conn.close()