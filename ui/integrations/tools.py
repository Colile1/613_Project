# tools.py : command lines for the Tools page (studies, reference data, diagram, screenshots)

import shutil
import sys
from pathlib import Path

from ui.integrations.project_files import ROOT

STUDIES = {
    "velocity": ("ui.etl.velocity_study", "docs/decisions/velocity_study_results.md", "velocity_results"),
    "amount": ("ui.etl.amount_study", "docs/decisions/amount_rule_results.md", "amount_results"),
}
CHROME_PATHS = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"]


# Input wrapper: a Chromium-based browser that can run headless, or None.
def browser_path():
    for name in ("chrome", "google-chrome", "chromium", "msedge"):
        found = shutil.which(name)
        if found:
            return found
    return next((p for p in CHROME_PATHS if Path(p).exists()), None)


# Pure function: python -m <study>.
def study_argv(name):
    return [sys.executable, "-m", STUDIES[name][0]] if name in STUDIES else None


# Pure function: regenerate the card reference file with `count` cards.
def cards_argv(count):
    return [sys.executable, str(ROOT / "reference_data" / "generate_cards.py"), str(max(50, min(int(count), 50000)))]


# Pure function: rebuild the architecture SVG, then render the PNG with a headless browser.
def diagram_argv(port):
    return [sys.executable, "-m", "ui.integrations.screenshots", "--diagram", "--port", str(port)]


# Pure function: capture every page of the running app.
def screenshots_argv(port, theme):
    return [sys.executable, "-m", "ui.integrations.screenshots", "--port", str(port), "--theme", theme]


# Facts the Tools page shows.
def info():
    return {"browser": browser_path(), "studies": {k: {"results": v[1], "file_key": v[2],
            "exists": (ROOT / v[1]).exists()} for k, v in STUDIES.items()}}