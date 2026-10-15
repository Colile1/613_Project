# ui/server - HTTP server and JSON API

Standard-library `ThreadingHTTPServer` bound to 127.0.0.1.

- `http_handler.py` - serves `ui/static/` and dispatches `/api/*` routes; errors come back as JSON.
- `api_read.py` - GET endpoints: status, extract, ingest, transform, warehouse, analytics, card, files, azure, cosmos.
- `api_write.py` - POST endpoints: simulation start/stop/reset/advance/burst/config, transform policy, producer start/stop, pip install.