# powerbi_export.py : writes the local warehouse as CSV tables for Power BI Desktop
# Table names match the Cosmos DB containers (aggregates, fraud_alerts,
# dead_letter) so the DAX measures in powerbi/dashboard_design.md work as-is.
# Also writes queries.pq: Power Query (M) to paste into the Advanced Editor.

import csv
import json
from datetime import datetime

from ui.integrations.project_files import ROOT

OUT_DIR = ROOT / "powerbi" / "local_data"
TABLES = {
    "aggregates": [("card_windows", "card_window"), ("category_trends", "category_trend"), ("enriched", "transaction")],
    "fraud_alerts": [("velocity", None), ("high_amount", None)],
    "dead_letter": [("dead_letter", None)],
}
NUMBERS = ["tx_count", "total_amount_zar", "avg_amount_zar", "max_amount_zar", "min_amount_zar", "distinct_merchants",
           "amount", "credit_limit_zar", "sequence_number", "velocity_count", "rolling_avg", "amount_ratio"]
DATES = ["window_start", "window_end", "event_time", "ingestion_time", "detected_at"]


# Pure function: rows for one table, tagging aggregate shapes with record_type.
def table_rows(collections, parts):
    rows = []
    for key, record_type in parts:
        for doc in collections[key]:
            row = dict(doc)
            if record_type:
                row["record_type"] = record_type
            rows.append(row)
    return rows


# Pure function: CSV cell text (booleans lower-case, nested values as JSON).
def cell(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return value


# Output logic: writes one CSV with the union of all columns.
def write_csv(path, rows):
    columns = []
    for r in rows:
        columns += [k for k in r if k not in columns]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(columns)
        for r in rows:
            writer.writerow([cell(r.get(c)) for c in columns])
    return len(rows)


# Pure function: Power Query (M) for one CSV table with tolerant typing.
def m_query(name, folder):
    return f"""// ---- {name} ----
let
    Folder = "{folder}\\",
    Source = Csv.Document(File.Contents(Folder & "{name}.csv"), [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    Promoted = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),
    Present = (cols) => List.Intersect({{cols, Table.ColumnNames(Promoted)}}),
    Numbers = Table.TransformColumns(Promoted, List.Transform(Present({json.dumps(NUMBERS).replace('[', '{').replace(']', '}')}),
        (c) => {{c, each try Number.From(_, "en-US") otherwise null, type nullable number}})),
    Typed = Table.TransformColumns(Numbers, List.Transform(Present({json.dumps(DATES).replace('[', '{').replace(']', '}')}),
        (c) => {{c, each try DateTimeZone.RemoveZone(DateTimeZone.From(_)) otherwise null, type nullable datetime}}))
in
    Typed
"""


# Output logic: exports every table and the M queries; returns a summary.
def export(collections, metadata, session_name):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    counts = {name: write_csv(OUT_DIR / f"{name}.csv", table_rows(collections, parts)) for name, parts in TABLES.items()}
    counts["card_metadata"] = write_csv(OUT_DIR / "card_metadata.csv", list(metadata.values()))
    folder = str(OUT_DIR)          # M strings have no backslash escapes
    header = f"// Power Query for the local warehouse export of session '{session_name}' ({datetime.now():%Y-%m-%d %H:%M}).\n" \
             "// Power BI Desktop: Get Data > Blank Query > Advanced Editor, paste one block per query and name the query after the table.\n\n"
    (OUT_DIR / "queries.pq").write_text(header + "\n".join(m_query(n, folder) for n in [*TABLES, "card_metadata"]), encoding="utf-8")
    return {"folder": str(OUT_DIR), "tables": counts, "queries": str(OUT_DIR / "queries.pq")}