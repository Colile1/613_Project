# engine.py : keeps the SQL copy of the warehouse in step with the live session
# The copy is rebuilt only when the pipeline result changes (the session already
# throttles that while the stream runs), so queries see a consistent snapshot.

import csv
import io
import json
import threading

from ui.sqlwh import build, guard, profile
from ui.etl.generator import iso
from ui.storage import saved_views


class SqlWarehouse:
    # Starts empty; the first request builds the copy.
    def __init__(self, session, db=None):
        self.session, self.db, self.lock = session, db, threading.Lock()
        self.conn, self.types, self.source, self.snapshot = None, {}, None, {}
        self.custom, self.view_errors = {}, {}

    # Rebuilds the copy when the session's pipeline result has changed.
    def ensure(self):
        events, result = self.session.result()
        with self.lock:
            if result is not self.source:
                if self.conn is not None:
                    self.conn.close()
                self.conn, self.types = build.build(events, result["collections"], self.session.metadata)
                self.add_saved_views()
                self.source = result
                wm = result["watermark"]
                self.snapshot = {"events": len(events), "session": self.session.session_name,
                                 "watermark": iso(wm) if wm else None, "sim_clock": self.session.status()["sim_clock"]}
        return self

    # Recreates every saved view in the fresh copy; a broken one is reported, not fatal.
    def add_saved_views(self):
        self.custom, self.view_errors = {}, {}
        for v in saved_views.list_views(self.db) if self.db else []:
            try:
                self.conn.execute(f'CREATE VIEW "{v["name"]}" AS {v["sql"]}')
                cur = self.conn.execute(f'SELECT * FROM "{v["name"]}" LIMIT 200')
                names, rows = [d[0] for d in cur.description], cur.fetchall()
                self.types[v["name"]] = {n: build.infer_type([r[i] for r in rows]) for i, n in enumerate(names)}
                self.custom[v["name"]] = v["sql"]
            except Exception as exc:  # e.g. the view refers to a column that no longer exists
                self.view_errors[v["name"]] = str(exc)

    # Validates and saves a view, then forces a rebuild so it appears everywhere.
    def save_view(self, name, sql):
        self.ensure()
        sql = (sql or "").strip().rstrip(";").strip()
        with self.lock:
            problem = saved_views.name_problem(name, set(self.types) - set(self.custom))
            if problem:
                return {"error": problem}
            check = guard.run(self.conn, sql, max_rows=1)
            if "error" in check:
                return {"error": "The view's query does not run: " + check["error"]}
            saved_views.save_view(self.db, name, sql)
            self.source = None
        return {"ok": True, "name": name}

    # Removes a saved view.
    def delete_view(self, name):
        saved_views.delete_view(self.db, name)
        with self.lock:
            self.source = None
        return {"ok": True}

    # Schema plus snapshot facts and saved views.
    def schema(self):
        self.ensure()
        with self.lock:
            return {**profile.schema(self.conn, self.types, self.custom), "snapshot": self.snapshot,
                    "saved_views": [{"name": n, "sql": q} for n, q in self.custom.items()], "view_errors": self.view_errors}

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