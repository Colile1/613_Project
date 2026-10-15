# screenshots.py : captures every page of the running control centre (or the diagram)
# with a headless Chromium browser. Run by the Tools page through the ProcessRunner:
#   python -m ui.integrations.screenshots --port 8613 [--theme light|dark]
#   python -m ui.integrations.screenshots --diagram

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from ui.integrations.project_files import ROOT
from ui.integrations.tools import browser_path

OUT = ROOT / "fraud-613" / "screenshots"
ROUTES = ["overview", "extract", "ingest", "transform", "transform/threshold", "warehouse", "warehouse/model", "query",
          "analytics/live", "analytics/fraud", "analytics/health", "analytics/card", "azure", "tools", "docs", "guide", "about"]


# Input wrapper: command-line options.
def get_options():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8613)
    parser.add_argument("--theme", default="light")
    parser.add_argument("--diagram", action="store_true")
    return parser.parse_args()


# Output logic: one headless screenshot.
def shoot(browser, url, target, size, profile, extra=()):
    cmd = [browser, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={profile}", f"--window-size={size}",
           "--virtual-time-budget=12000", f"--screenshot={target}", *extra, url]
    result = subprocess.run(cmd, capture_output=True, timeout=120)
    print(("Saved:" if result.returncode == 0 and Path(target).exists() else "FAILED:"), target, flush=True)


def main():
    options = get_options()
    browser = browser_path()
    if options.diagram:
        subprocess.run([sys.executable, str(ROOT / "docs" / "diagrams" / "build_architecture.py")], check=True)
    if not browser:
        print("No Chrome or Edge found - install one to render PNGs and screenshots.", flush=True)
        sys.exit(1)
    with tempfile.TemporaryDirectory() as profile:
        if options.diagram:
            svg = ROOT / "docs" / "diagrams" / "architecture.svg"
            shoot(browser, svg.as_uri(), ROOT / "docs" / "diagrams" / "architecture.png", "1200,810", profile, ["--force-device-scale-factor=2"])
            return
        OUT.mkdir(parents=True, exist_ok=True)
        extra = ["--force-dark-mode", "--blink-settings=preferredColorScheme=0"] if options.theme == "dark" else []
        for i, route in enumerate(ROUTES, 1):
            name = f"ui_auto_{i:02d}_{route.replace('/', '_')}" + ("_dark" if options.theme == "dark" else "") + ".png"
            shoot(browser, f"http://127.0.0.1:{options.port}/#/{route}", OUT / name, "1440,1700", profile, extra)
    print("Done:", len(ROUTES), "pages ->", OUT, flush=True)


if __name__ == "__main__":
    main()