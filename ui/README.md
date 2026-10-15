# ui - Fraud Pipeline Control Centre

A local web app that shows and controls the whole fraud-monitoring pipeline in one Material-style interface:
Extract (simulator) -> Ingest (Event Hubs) -> Transform (Stream Analytics) -> Load (Cosmos DB warehouse) -> Analyse (Power BI pages),
plus Azure controls, project files, a user guide and an about page.

## Run

From the project root (Python 3.10+, standard library only):

```
python -m ui                 # opens http://127.0.0.1:8613
python -m ui --port 8700 --no-browser
python -m ui --db path/to/other.db    # use a different database file
```

Nothing needs saving by hand: the session, its events and settings, the open page, tabs, filters and theme are
stored in `ui/data/control_centre.db` as they change, and restored on the next start.

## How it fits into the system

- **Local mode** (default): `etl/` re-implements each step of `asa/query.sql` in Python on a simulated clock, using
  `simulator/schema.py` and `reference_data/card_metadata.json`. Nothing touches Azure and nothing costs credit.
- **Azure mode**: the Azure page runs the real `simulator/producer.py` against Event Hubs, and the Warehouse page can
  read the real Cosmos DB containers when `azure-cosmos` is installed and `COSMOS_ENDPOINT` / `COSMOS_KEY` are in `simulator/.env`.

## Layout

| Folder | Purpose |
|---|---|
| `app.py`, `__main__.py` | Entry point: starts the server and opens the browser |
| `etl/` | Local pipeline engine (generator, ingest, transform, alerts, enrich, warehouse, analytics, session) |
| `server/` | HTTP server and JSON API (`api_read.py` GET routes, `api_write.py` POST routes) |
| `integrations/` | Project file access, environment checks, producer runner, live Cosmos DB reader |
| `storage/` | SQLite persistence: sessions, raw event log, UI preferences, run logs (see `storage/README.md`) |
| `static/` | The single-page interface: `index.html`, `css/`, `js/` (one module per page in `js/views/`) |

The server listens on 127.0.0.1 only. Only whitelisted project files can be read, and `simulator/.env` secrets never reach the browser.