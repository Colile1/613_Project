# ui/sqlwh - the warehouse as SQL

Backs the **Query** page (drag-and-drop builder and SQL editor), the Warehouse **Data model** view and the full CSV/JSON exports.

| File | Purpose |
|---|---|
| `build.py` | Loads the current session into an in-memory SQLite database: tables `events`, `cards`, `card_windows`, `category_trends`, `transactions`, `velocity_alerts`, `high_amount_alerts`, `dead_letter`, and views `aggregates` and `fraud_alerts` named after the Cosmos DB containers |
| `guard.py` | Runs user SQL safely: an SQLite authorizer allows only SELECT, reads and functions; one statement at a time; 5-second limit; at most 5 000 rows on screen |
| `profile.py` | Schema, relationships between tables, field profiles (empty %, distinct, min, max, average, most common values), example queries |
| `engine.py` | Rebuilds the copy only when the session's pipeline result changes; exports a table or query as CSV/JSON |

The copy is rebuilt from the session's stored events, so it can never change the saved data. Saved queries live in the main database (`ui/storage/saved_queries.py`).

Saved views (`ui/storage/saved_views.py`) are recreated in every rebuilt copy, so any read-only SELECT - including WITH, UNION and sub-queries - becomes a table the builder can use.

## Query page modules (`ui/static/js/query/`)

| Module | Purpose |
|---|---|
| `sqlparse.js` | Tokenizer, SELECT parser (SQL to builder layout) and formatter. Anything it cannot place in a structured box becomes a calculated column or custom condition, so any single SELECT opens in the builder |
| `sqlgen.js` | Builder layout to SQL: joins, aggregates, calculated columns, AND/OR filters, automatic or custom GROUP BY, HAVING, sort, LIMIT/OFFSET |
| `joins.js` | Suggests the join condition when a column from another table is dropped (Data model relationships, then shared key columns) |
| `builder.js`, `builder_parts.js` | The drag-and-drop builder and its zones |
| `editor.js` | SQL editor: syntax highlighting, autocomplete (alias-aware), formatting |
| `schema_panel.js`, `dnd.js`, `results.js` | Schema tree, drag-and-drop helpers, result table/chart/export |

Tested by parsing 30 varied queries, regenerating them and executing both against the warehouse: every query the builder accepts returned identical results; WITH, UNION and FROM sub-queries are offered "Save as view".
