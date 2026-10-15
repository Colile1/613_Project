# env_status.py : what is configured on this machine
# Reports whether the simulator .env, Azure SDKs and Azure CLI are available.
# Only non-secret facts leave this module (e.g. the namespace host name).

import importlib.util
import os
import shutil

from ui.integrations.project_files import ROOT

ENV_PATH = ROOT / "simulator" / ".env"


# Pure function: parses KEY=VALUE lines of a .env file.
def parse_env(text):
    values = {}
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    return values


# Input wrapper: reads simulator/.env merged over the process environment.
def get_settings():
    values = dict(os.environ)
    if ENV_PATH.exists():
        values.update(parse_env(ENV_PATH.read_text(encoding="utf-8")))
    return values


# Pure function: extracts the namespace host from an Event Hubs connection string.
def namespace_host(conn):
    for part in conn.split(";"):
        if part.startswith("Endpoint="):
            return part.split("//", 1)[-1].strip("/")
    return None


# Pure function: True when a connection string still holds the sample placeholders.
def is_placeholder(conn):
    return not conn or "<YOUR_" in conn


# Input wrapper: True when a dotted module (e.g. azure.eventhub) is importable.
def has_module(name):
    try:
        return importlib.util.find_spec(name) is not None
    except ModuleNotFoundError:
        return False


# Input wrapper: overall environment status for the UI.
def get_status():
    s = get_settings()
    conn = s.get("EVENTHUB_CONNECTION_STRING", "")
    return {
        "env_file": ENV_PATH.exists(),
        "eventhub_configured": not is_placeholder(conn),
        "eventhub_namespace": None if is_placeholder(conn) else namespace_host(conn),
        "eventhub_name": s.get("EVENTHUB_NAME", "transactions"),
        "sdk_eventhub": has_module("azure.eventhub"),
        "sdk_dotenv": has_module("dotenv"),
        "sdk_cosmos": has_module("azure.cosmos"),
        "cosmos_configured": bool(s.get("COSMOS_ENDPOINT") and s.get("COSMOS_KEY")),
        "az_cli": shutil.which("az") is not None,
    }
