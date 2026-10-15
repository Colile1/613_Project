# asa_files.py : writes the Transform page settings into the deployable files
# asa/query.sql (query 4 window and threshold, query 5 multiplier, header
# comment) and infra/streamanalytics.bicep (event-ordering tolerances).
# preview() shows exactly which lines change; apply() writes them.

import difflib
import re

from ui.integrations.project_files import ROOT, read_exact, write_exact

QUERY, BICEP = ROOT / "asa" / "query.sql", ROOT / "infra" / "streamanalytics.bicep"


# Pure function: a window length in ASA syntax.
def window(seconds):
    s = int(seconds)
    return f"SlidingWindow(minute, {s // 60})" if s % 60 == 0 else f"SlidingWindow(second, {s})"


# Pure function: query.sql with the policy applied.
def new_query(text, p):
    out = re.sub(r"(--\s+Late arrival tolerance:\s+)\d+ minutes?", lambda m: m.group(1) + f"{p['late_tolerance_s'] // 60} minutes" if p["late_tolerance_s"] % 60 == 0 else m.group(1) + f"{p['late_tolerance_s']} seconds", text)
    out = re.sub(r"(--\s+Out-of-order tolerance:\s+)\d+ seconds?", lambda m: m.group(1) + f"{p['out_of_order_tolerance_s']} seconds", out)
    # Query 4 only: between its heading and query 5's heading.
    start, end = out.find("4. VELOCITY FRAUD ALERT"), out.find("5. AMOUNT ANOMALY ALERT")
    if start > 0 and end > start:
        q4 = re.sub(r"SlidingWindow\((minute|second),\s*\d+\)", window(p["velocity_window_s"]), out[start:end])
        q4 = re.sub(r"HAVING COUNT\(\*\) > \d+", f"HAVING COUNT(*) > {int(p['velocity_threshold'])}", q4)
        out = out[:start] + q4 + out[end:]
    m = f"{p['amount_multiplier']:g}"
    out = re.sub(r"curr\.amount > [\d.]+ \* a\.category_avg", f"curr.amount > {m} * a.category_avg", out)
    out = re.sub(r"exceeds [\d.]+x its category 10-min average", f"exceeds {m}x its category 10-min average", out)
    return out


# Pure function: the Bicep template with the tolerances applied.
def new_bicep(text, p):
    out = re.sub(r"eventsLateArrivalMaxDelayInSeconds: \d+", f"eventsLateArrivalMaxDelayInSeconds: {int(p['late_tolerance_s'])}", text)
    return re.sub(r"eventsOutOfOrderMaxDelayInSeconds: \d+", f"eventsOutOfOrderMaxDelayInSeconds: {int(p['out_of_order_tolerance_s'])}", out)


def _read(path):
    raw = read_exact(path)
    return raw, ("\r\n" if "\r\n" in raw else "\n")


# Unified diffs of both files (empty when nothing would change).
def preview(policy):
    diffs = []
    for path, fn in ((QUERY, new_query), (BICEP, new_bicep)):
        raw, nl = _read(path)
        old, new = raw.replace("\r\n", "\n"), fn(raw.replace("\r\n", "\n"), policy)
        diff = "\n".join(difflib.unified_diff(old.splitlines(), new.splitlines(), str(path.relative_to(ROOT)), str(path.relative_to(ROOT)), n=1, lineterm=""))
        diffs.append({"file": str(path.relative_to(ROOT)), "diff": diff, "changed": old != new})
    return {"files": diffs}


# Writes both files (line endings preserved).
def apply(policy):
    written = []
    for path, fn in ((QUERY, new_query), (BICEP, new_bicep)):
        raw, nl = _read(path)
        old = raw.replace("\r\n", "\n")
        new = fn(old, policy)
        if new != old:
            write_exact(path, new.replace("\n", nl))
            written.append(str(path.relative_to(ROOT)))
    return {"ok": True, "written": written}