# env_file.py : reads and writes simulator/.env from the UI
# Secret values are never sent back to the browser: the UI only learns whether
# each key is set, plus a short non-secret hint (e.g. the namespace host).

from ui.integrations.project_files import ROOT, read_exact, write_exact
from ui.integrations.env_status import ENV_PATH, parse_env, namespace_host

SAMPLE = ROOT / "simulator" / "config.env.sample"
KEYS = [
    ("EVENTHUB_CONNECTION_STRING", True, "Event Hubs SimulatorSend connection string (Endpoint=sb://...)"),
    ("EVENTHUB_NAME", False, "Event Hub name (default transactions)"),
    ("COSMOS_ENDPOINT", False, "Cosmos DB URI, e.g. https://itri613colile-cosmos.documents.azure.com:443/"),
    ("COSMOS_KEY", True, "Cosmos DB primary key (read-only key is enough)"),
]


# Pure function: what the UI may see about one value.
def describe(key, value, secret):
    if not value or "<YOUR_" in value:
        return {"key": key, "set": False, "hint": ""}
    if key == "EVENTHUB_CONNECTION_STRING":
        return {"key": key, "set": True, "hint": namespace_host(value) or "set"}
    return {"key": key, "set": True, "hint": ("\u2022" * 8 + value[-4:]) if secret else value}


# Input wrapper: current settings, safe to show.
def get_settings():
    values = parse_env(ENV_PATH.read_text(encoding="utf-8")) if ENV_PATH.exists() else {}
    return [{**describe(k, values.get(k, ""), secret), "secret": secret, "help": help_} for k, secret, help_ in KEYS]


# Pure function: the .env text with `updates` applied (existing lines and comments kept).
def apply_updates(text, updates):
    lines, done = text.splitlines(), set()
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0].strip()
        if key in updates and not line.lstrip().startswith("#"):
            lines[i] = f"{key}={updates[key]}"
            done.add(key)
    lines += [f"{k}={v}" for k, v in updates.items() if k not in done]
    return "\n".join(lines).rstrip() + "\n"


# Output logic: writes the given keys (blank values are ignored), creating .env from the sample.
def save_settings(updates):
    allowed = {k for k, _, _ in KEYS}
    clean = {k: str(v).strip() for k, v in updates.items() if k in allowed and str(v).strip() and "\n" not in str(v)}
    base = read_exact(ENV_PATH) if ENV_PATH.exists() else (read_exact(SAMPLE) if SAMPLE.exists() else "")
    write_exact(ENV_PATH, apply_updates(base, clean))
    return sorted(clean)