# ui/sqlwh - the warehouse as SQL

Backs the **Query** page (drag-and-drop builder and SQL editor), the Warehouse **Data model** view and the full CSV/JSON exports.

| File | Purpose |
|---|---|
| `build.py` | Loads the current session into an in-memory SQLite database: tables `events`, `cards`, `card_windows`, `category_trends`, `transactions`, `velocity_alerts`, `high_amount_alerts`, `dead_letter`, and views `aggregates` and `fraud_alerts` named after the Cosmos DB containers |
| `guard.py` | Runs user SQL safely: an SQLite authorizer allows only SELECT, reads and functions; one statement at a time; 5-second limit; at most 5 000 rows on screen |
| `profile.py` | Schema, relationships between tables, field profiles (empty %, distinct, min, max, average, most common values), example queries |
| `engine.py` | Rebuilds the copy only when the session's pipeline result changes; exports a table or query as CSV/JSON |

The copy is rebuilt from the session's stored events, so it can never change the saved data. Saved queries live in the main database (`ui/storage/saved_queries.py`).

The visual builder and the SQL editor share one query: `ui/static/js/query/sqlgen.js` generates SQL from a builder layout and parses SQL back into a layout when it fits (one table, AND-ed filters, aggregates, sort, limit). Anything else (JOIN, OR, CASE, expressions) stays in SQL mode with an explanation.
