# tracking.py : todo.md checklist and log.md entries, editable from the Tools page
# Only checkbox state and new lines are written; everything else in the files is kept.

import re
from datetime import date

from ui.integrations.project_files import ROOT, read_exact, write_exact

TODO, LOG = ROOT / "todo.md", ROOT / "log.md"
ITEM = re.compile(r"^(\s*)- \[( |x|X)\] (.*)$")


def _read(path):
    raw = read_exact(path)
    return raw, ("\r\n" if "\r\n" in raw else "\n")


# Input wrapper: sections with their checklist items (line numbers identify items).
def get_todo():
    raw, nl = _read(TODO)
    sections, current = [], {"title": "General", "items": []}
    for n, line in enumerate(raw.split(nl)):
        if line.startswith("#"):
            if current["items"]:
                sections.append(current)
            current = {"title": line.lstrip("#").strip(), "items": []}
            continue
        m = ITEM.match(line)
        if m:
            current["items"].append({"line": n, "done": m.group(2) != " ", "text": m.group(3), "indent": len(m.group(1)) // 2})
    if current["items"]:
        sections.append(current)
    done = sum(i["done"] for s in sections for i in s["items"])
    return {"sections": sections, "done": done, "total": sum(len(s["items"]) for s in sections)}


# Output logic: ticks or unticks the item on `line` (checked against its text).
def set_done(line, text, done):
    raw, nl = _read(TODO)
    lines = raw.split(nl)
    m = ITEM.match(lines[line]) if 0 <= line < len(lines) else None
    if not m or m.group(3) != text:
        return {"error": "todo.md changed on disk - reload and try again."}
    lines[line] = f"{m.group(1)}- [{'x' if done else ' '}] {m.group(3)}"
    write_exact(TODO, nl.join(lines))
    return {"ok": True}


# Output logic: adds an unticked item at the end of a section.
def add_item(section, text):
    text = " ".join(str(text).split())
    if not text:
        return {"error": "Write the task first."}
    raw, nl = _read(TODO)
    lines = raw.split(nl)
    start = next((i for i, l in enumerate(lines) if l.startswith("#") and l.lstrip("#").strip() == section), None)
    if start is None:
        lines += ["", f"## {section}", ""]
        start = len(lines) - 2
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("#")), len(lines))
    last = max([i for i in range(start + 1, end) if ITEM.match(lines[i])], default=start)
    lines.insert(last + 1, f"- [ ] {text}")
    write_exact(TODO, nl.join(lines))
    return {"ok": True}


# Input wrapper: the latest log entries (title, date, body).
def get_log(limit=10):
    raw, nl = _read(LOG)
    parts = re.split(r"\n(?=## \[)", raw.replace("\r\n", "\n"))
    entries = [{"title": p.split("\n", 1)[0].lstrip("# ").strip(), "body": p.split("\n", 1)[1].strip().rstrip("-").strip() if "\n" in p else ""}
               for p in parts if p.startswith("## [")]
    return {"entries": entries[::-1][:limit], "count": len(entries)}


# Output logic: appends a What/Why/Impact entry in the format rules.md asks for.
def add_entry(title, what, why, impact):
    if not (title.strip() and what.strip()):
        return {"error": "A title and 'What was done' are required."}
    raw, nl = _read(LOG)
    entry = [f"## [{date.today():%Y-%m-%d}] {title.strip()}", "", f"**What was done:** {what.strip()}", "",
             f"**Why:** {why.strip() or '-'}", "", f"**Impact:** {impact.strip() or '-'}"]
    write_exact(LOG, raw.rstrip() + nl + nl + "---" + nl + nl + nl.join(entry) + nl)
    return {"ok": True}