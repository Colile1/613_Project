# ui/storage - SQLite persistence

Keeps everything the control centre needs to continue after a restart or crash, in one file:
`ui/data/control_centre.db` (SQLite, WAL mode, git-ignored).

| Table | Holds |
|---|---|
| `sessions` | One row per saved session: name, timestamps and a JSON `state` (simulator config, ASA policy, simulated clock, sequence counter, random-generator state, recent ids for duplicates, burst state, speed, whether the stream was running) |
| `events` | The append-only raw event log of every session (`session_id`, `seq`, body JSON). This is the source of truth |
| `prefs` | UI preferences shared by every browser tab: last page, tabs, filters, warehouse search, theme, active session |
| `runs`, `run_lines` | Every `producer.py` / `pip install` run started from the Azure page and its full output |

## Design

- **Event sourcing.** Only raw events and settings are stored. The warehouse (all Cosmos DB documents) is rebuilt from them by
  `ui/etl`, which is deterministic, so a restored session produces identical documents. Saving the random-generator
  state means a restarted stream continues with exactly the events it would have produced without the restart.
- **Write-through.** Each simulated second of events is committed together with the session state in one transaction,
  so a crash loses at most the tick in flight.
- **Backups.** The Sessions dialog writes a consistent copy to `ui/data/backups/` (SQLite online backup) or exports a
  session as JSON.

| File | Purpose |
|---|---|
| `db.py` | Connection, schema, transactions, info, backup |
| `repositories.py` | All SQL, one small function per operation |
| `codec.py` | Session object <-> JSON state |
| `session_store.py` | Session lifecycle (open, create, switch, rename, delete, save) mixed into `PipelineSession` |