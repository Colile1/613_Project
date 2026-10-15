# app.py : entry point for the Fraud Pipeline Control Centre
# Opens the SQLite database, restores the last session, starts the local web
# server on 127.0.0.1 and opens the browser.
# Run from the project root:  python -m ui   (or: python -m ui --port 8613 --no-browser)

import argparse
import sys
import webbrowser
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ui.etl.session import PipelineSession  # noqa: E402
from ui.integrations.process_runner import ProcessRunner  # noqa: E402
from ui.server.http_handler import make_handler  # noqa: E402
from ui.storage.db import Database, DB_PATH  # noqa: E402
from ui.storage import saved_queries, saved_views, cost_log  # noqa: E402
from ui.sqlwh.engine import SqlWarehouse  # noqa: E402


# Input wrapper: reads command-line options.
def get_options():
    parser = argparse.ArgumentParser(description="Fraud pipeline control centre")
    parser.add_argument("--port", type=int, default=8613)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--db", default=str(DB_PATH), help="SQLite database file")
    return parser.parse_args()


# Creates tables added after the first release (older databases and restored backups lack them).
def ensure_tables(db):
    for module in (saved_queries, saved_views, cost_log):
        module.ensure_table(db)


# Reopens everything after a backup was restored into the live database.
def after_restore(ctx):
    ensure_tables(ctx.db)
    ctx.session.open_session(ctx.session.initial_session_id())
    ctx.sql.source = None
    ctx.prefs_rev += 1


# Output logic: prints where the UI is running and which session was restored.
def display_start(url, session, db):
    print("Control centre running at:", url)
    print("Database:", db.path)
    print("Restored session:", session.session_name, "-", len(session.events), "events")
    print("Press Ctrl+C to stop (everything is saved).")


def main():
    options = get_options()
    db = Database(Path(options.db))
    ensure_tables(db)
    session = PipelineSession(db)
    ctx = SimpleNamespace(db=db, session=session, runner=ProcessRunner(db), prefs_rev=0, sql=SqlWarehouse(session, db), port=options.port)
    ctx.after_restore = lambda: after_restore(ctx)
    server = ThreadingHTTPServer(("127.0.0.1", options.port), make_handler(ctx))
    url = "http://127.0.0.1:%d/" % options.port
    display_start(url, ctx.session, db)
    if not options.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        ctx.session.stop()
        ctx.runner.stop()
        db.close()


if __name__ == "__main__":
    main()