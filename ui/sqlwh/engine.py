# engine.py : keeps the SQL copy of the warehouse in step with the live session
# The copy is rebuilt only when the pipeline result changes (the session already
# throttles that while the stream runs), so queries see a consistent snapshot.

import csv
import io
import json
import threading

from ui.sqlwh import build, guard, profile
from ui.etl.generator import iso


class SqlWarehouse:
    # Starts empty; the first request builds the copy.
    def __init__(self, session):
        self.session, self.lock = session, threading.Lock()
        self.conn, self.types, self.source, self.snapshot = None, {}, None, {}

    # Rebuilds the copy when the session's pipeline result has changed.
    def ensure(self):
        events, result = self.session.result()
        with self.lock:
            if result is not self.source:
                if self.conn is not None:
                    self.conn.close()
                self.conn, self.types = build.build(events, result["collections"], self.session.metadata)
                self.source = result
                wm = result["watermark"]
                self.snapshot = {"events": len(events), "session": self.session.session_name,
                                 "watermark": iso(wm) if wm else None, "sim_clock": self.session.status()["sim_clock"]}
        return self

    # Schema plus snapshot facts.
    def schema(self):
        self.ensure()
        with self.lock:
            return {**profile.schema(self.conn, self.types), "snapshot": self.snapshot}

    # Field profile of one table or view.
    def profile(self, table):
        self.ensure()
        with self.lock:
            return profile.profile(self.conn, table, self.types)

    # Runs read-only SQL.
    def query(self, sql, max_rows=guard.MAX_ROWS):
        self.ensure()
        with self.lock:
            return {**guard.run(self.conn, sql, max_rows), "snapshot": self.snapshot}

    # Full result of a table or a query as a downloadable file (CSV or JSON).
    def export(self, table=None, sql=None, fmt="csv"):
        if table and table not in self.ensure().types:
            return {"error": "unknown table"}
        result = self.query(sql or f'SELECT * FROM "{table}"', max_rows=0)
        if "error" in result:
            return result
        name = (table or "query") + "." + ("json" if fmt == "json" else "csv")
        return {"__file__": {"name": name, "type": "application/json" if fmt == "json" else "text/csv",
                             "body": to_json(result) if fmt == "json" else to_csv(result)}}


# Pure function: CSV text of a query result.
def to_csv(result):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(result["columns"])
    writer.writerows(result["rows"])
    return buf.getvalue()


# Pure function: JSON text (list of objects) of a query result.
def to_json(result):
    return json.dumps([dict(zip(result["columns"], r)) for r in result["rows"]], indent=1)