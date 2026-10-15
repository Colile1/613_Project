# cost_log.py : Azure session cost log, kept in the database and written to
# docs/cost_tracking.md (the "Session Log" table) on request.

from ui.integrations.project_files import ROOT, read_exact, write_exact
from ui.storage.db import now_iso

SCHEMA = """CREATE TABLE IF NOT EXISTS cost_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    session TEXT NOT NULL,
    hours REAL NOT NULL,
    cost_usd REAL NOT NULL,
    created_at TEXT NOT NULL
)"""
DOC = ROOT / "docs" / "cost_tracking.md"


# Creates the table if this database predates the cost log.
def ensure_table(db):
    with db.tx() as c:
        c.execute(SCHEMA)


# Lists entries oldest first with a running total.
def list_entries(db):
    rows, total = [], 0.0
    for r in db.query("SELECT id, day, session, hours, cost_usd FROM cost_log ORDER BY day, id"):
        total += r[4]
        rows.append({"id": r[0], "day": r[1], "session": r[2], "hours": r[3], "cost_usd": r[4], "running_total": round(total, 2)})
    return rows


# Adds one entry.
def add_entry(db, day, session, hours, cost):
    with db.tx() as c:
        c.execute("INSERT INTO cost_log (day, session, hours, cost_usd, created_at) VALUES (?, ?, ?, ?, ?)",
                  (str(day)[:10], str(session)[:120], float(hours), float(cost), now_iso()))


# Deletes one entry.
def delete_entry(db, entry_id):
    with db.tx() as c:
        c.execute("DELETE FROM cost_log WHERE id = ?", (entry_id,))


# Pure function: the Session Log markdown table.
def table(entries):
    lines = ["| Date | Session | Duration (active) | Approx cost | Running total |", "|------|---------|-------------------|-------------|---------------|"]
    lines += [f"| {e['day']} | {e['session']} | {e['hours']:g} h | ${e['cost_usd']:.2f} | ${e['running_total']:.2f} |" for e in entries]
    return lines


# Output logic: replaces the Session Log table in docs/cost_tracking.md.
def write_doc(db):
    raw = read_exact(DOC)
    nl = "\r\n" if "\r\n" in raw else "\n"
    lines = raw.split(nl)
    start = next((i for i, l in enumerate(lines) if l.strip().startswith("## Session Log")), None)
    if start is None:
        return {"error": "No '## Session Log' heading in docs/cost_tracking.md."}
    head = next((i for i in range(start, len(lines)) if lines[i].startswith("|")), None)
    end = head
    while end is not None and end < len(lines) and lines[end].startswith("|"):
        end += 1
    new = table(list_entries(db))
    lines = lines[:head] + new + lines[end:] if head is not None else lines[:start + 1] + [""] + new + lines[start + 1:]
    write_exact(DOC, nl.join(lines))
    return {"ok": True, "rows": len(new) - 2}