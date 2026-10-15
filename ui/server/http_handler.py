# http_handler.py : HTTP plumbing for the local UI server
# Serves files from ui/static and dispatches /api/* to api_read / api_write.

import json
import mimetypes
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qsl

from ui.server import api_read, api_write, api_sessions, api_query, api_reference

STATIC = Path(__file__).resolve().parents[1] / "static"
DIAGRAMS = {"/diagram/architecture.svg": Path(__file__).resolve().parents[2] / "docs" / "diagrams" / "architecture.svg"}

GET_ROUTES = {
    "/api/status": api_read.status, "/api/extract": api_read.extract,
    "/api/ingest": api_read.ingest_view, "/api/transform": api_read.transform_view,
    "/api/warehouse": api_read.warehouse_view, "/api/threshold": api_reference.threshold_view, "/api/reference": api_reference.reference, "/api/analytics": api_read.analytics_view,
    "/api/card": api_read.card, "/api/files": api_read.files, "/api/file": api_read.file,
    "/api/azure": api_read.azure, "/api/cosmos": api_read.cosmos,
    "/api/sessions": api_sessions.sessions, "/api/prefs": api_sessions.prefs,
    "/api/sessions/export": api_sessions.export_session,
    "/api/sql/schema": api_query.schema, "/api/sql/profile": api_query.profile,
    "/api/sql/export": api_query.export, "/api/sql/saved": api_query.saved,
}
POST_ROUTES = {
    "/api/sim/start": api_write.sim_start, "/api/sim/stop": api_write.sim_stop, "/api/sim/speed": api_write.sim_speed,
    "/api/sim/reset": api_write.sim_reset, "/api/sim/advance": api_write.sim_advance,
    "/api/sim/burst": api_write.sim_burst, "/api/sim/config": api_write.sim_config,
    "/api/transform/policy": api_write.transform_policy,
    "/api/azure/producer": api_write.azure_producer, "/api/azure/install": api_write.azure_install,
    "/api/azure/stop": api_write.azure_stop, "/api/export/powerbi": api_write.export_powerbi,
    "/api/prefs": api_sessions.save_prefs, "/api/sessions/new": api_sessions.new_session,
    "/api/sessions/switch": api_sessions.switch_session, "/api/sessions/rename": api_sessions.rename_session,
    "/api/sessions/delete": api_sessions.delete_session, "/api/sessions/backup": api_sessions.backup,
    "/api/sql/query": api_query.run, "/api/sql/save": api_query.save, "/api/sql/delete": api_query.delete,
    "/api/sql/view": api_query.save_view, "/api/sql/view/delete": api_query.delete_view,
}


# Pure function: resolves a URL path to a file inside ui/static (None if outside).
def static_path(url_path):
    rel = "index.html" if url_path in ("", "/") else url_path.lstrip("/")
    target = (STATIC / rel).resolve()
    return target if STATIC in target.parents and target.is_file() else None


# Builds a handler class bound to the shared context (session + runner).
def make_handler(ctx):
    class Handler(BaseHTTPRequestHandler):
        # Output logic: writes a JSON response.
        def send_json(self, payload, code=200):
            data = json.dumps(payload, default=str).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        # Output logic: writes a generated file as a download.
        def send_download(self, spec):
            data = spec["body"].encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", spec["type"] + "; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="%s"' % spec["name"])
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        # Output logic: writes a static file.
        def send_file(self, path):
            data = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        # Dispatches one request to a route function, reporting errors as JSON.
        def dispatch(self, routes, args):
            url = urlparse(self.path)
            route = routes.get(url.path)
            if route is None:
                return self.send_json({"error": "not found"}, 404)
            try:
                payload = route(ctx, args(url))
                if isinstance(payload, dict) and "__file__" in payload:
                    return self.send_download(payload["__file__"])
                self.send_json(payload)
            except Exception as exc:  # keep the server alive; show the error in the UI
                self.send_json({"error": "%s: %s" % (type(exc).__name__, exc)}, 500)

        def do_GET(self):
            if self.path.startswith("/api/"):
                return self.dispatch(GET_ROUTES, lambda url: dict(parse_qsl(url.query)))
            url_path = urlparse(self.path).path
            if url_path in DIAGRAMS and DIAGRAMS[url_path].exists():
                return self.send_file(DIAGRAMS[url_path])
            path = static_path(url_path)
            return self.send_file(path) if path else self.send_json({"error": "not found"}, 404)

        def do_POST(self):
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            self.dispatch(POST_ROUTES, lambda url: json.loads(raw or b"{}"))

        def log_message(self, fmt, *args):
            pass  # keep the console quiet; API calls poll every second

    return Handler
