# azure_actions.py : command lines for the Azure page buttons
# Long-running commands go through the ProcessRunner (live output in the UI);
# fetching the connection string runs synchronously and writes simulator/.env.

import shutil
import subprocess
import sys

from ui.integrations import env_file
from ui.integrations.project_files import ROOT

DEFAULTS = {"resource_group": "rg-itri613-fraud", "namespace": "itri613colile-ehns", "cosmos": "itri613colile-cosmos",
            "storage": "itri613colilestore", "job": "fraud-pipeline-asa", "location": "southafricanorth"}
DEPLOY_ACTIONS = {"deploy": [], "start": ["-Start"], "stop": ["-Stop"], "delete": ["-Delete"], "upload-cards": None}


# Input wrapper: full path of the Azure CLI, or None.
def az_path():
    return shutil.which("az") or shutil.which("az.cmd")


# Pure function: az command that uploads reference_data/card_metadata.json (after regenerating cards).
def upload_cards_argv(names):
    return [az_path() or "az", "storage", "blob", "upload", "--account-name", names["storage"], "--container-name", "reference-data",
            "--name", "card_metadata.json", "--file", str(ROOT / "reference_data" / "card_metadata.json"), "--auth-mode", "login", "--overwrite"]


# Pure function: powershell command for infra/deploy.ps1 with one action.
def deploy_argv(action, names):
    if action == "upload-cards":
        return upload_cards_argv(names)
    shell = shutil.which("pwsh") or shutil.which("powershell") or "powershell"
    params = ["-ResourceGroup", names["resource_group"], "-Location", names["location"], "-Namespace", names["namespace"],
              "-CosmosAccount", names["cosmos"], "-Storage", names["storage"], "-Job", names["job"]]
    return [shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ROOT / "infra" / "deploy.ps1"), *DEPLOY_ACTIONS[action], *params]


# Pure function: az login command (opens the browser sign-in).
def login_argv():
    return [az_path() or "az", "login", "--output", "table"]


# Pure function: pip install command for an optional package.
def install_argv(package):
    allowed = {"azure-cosmos", "azure-eventhub", "python-dotenv"}
    return [sys.executable, "-m", "pip", "install", package] if package in allowed else None


# Fetches the SimulatorSend connection string with the Azure CLI and saves it to .env.
def fetch_connection_string(names):
    az = az_path()
    if not az:
        return {"error": "Azure CLI not found. Install it from https://aka.ms/installazurecli, then sign in."}
    cmd = [az, "eventhubs", "namespace", "authorization-rule", "keys", "list", "--resource-group", names["resource_group"],
           "--namespace-name", names["namespace"], "--name", "SimulatorSend", "--query", "primaryConnectionString", "--output", "tsv"]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=90, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"error": f"Could not run the Azure CLI: {exc}"}
    value = out.stdout.strip()
    if out.returncode != 0 or not value.startswith("Endpoint="):
        return {"error": (out.stderr.strip() or "No connection string returned")[:400]}
    env_file.save_settings({"EVENTHUB_CONNECTION_STRING": value})
    return {"ok": True, "namespace": env_file.namespace_host(value)}