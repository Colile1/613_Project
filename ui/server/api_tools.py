# api_tools.py : endpoints for the Tools page and the extra Azure / Transform options

from datetime import date

from ui.integrations import asa_files, azure_actions, env_file, tools, tracking
from ui.storage import backups, cost_log


def _names(body):
    return {k: str(body.get(k) or v).strip() for k, v in azure_actions.DEFAULTS.items()}


# GET /api/tools - facts for the Tools page
def info(ctx, q):
    return {**tools.info(), "backups": backups.list_backups(ctx.db), "cards": len(ctx.session.metadata)}


# POST /api/tools/study {name}
def run_study(ctx, body):
    argv = tools.study_argv(body.get("name"))
    if not argv:
        return {"error": "Unknown study."}
    return {"ok": ctx.runner.start_cmd("study:" + body["name"], argv)} if not ctx.runner.is_running() else {"error": "Another task is running."}


# POST /api/tools/cards {count} - regenerate card_metadata.json
def regenerate_cards(ctx, body):
    if ctx.runner.is_running():
        return {"error": "Another task is running."}
    return {"ok": ctx.runner.start_cmd("cards", tools.cards_argv(body.get("count", 5000)))}


# POST /api/tools/reload-cards - pick up a regenerated reference file
def reload_cards(ctx, body):
    ctx.session.reload_reference()
    return {"ok": True, "cards": len(ctx.session.metadata)}


# POST /api/tools/diagram and /api/tools/screenshots {theme}
def diagram(ctx, body):
    return {"ok": ctx.runner.start_cmd("diagram", tools.diagram_argv(ctx.port))} if not ctx.runner.is_running() else {"error": "Another task is running."}


def screenshots(ctx, body):
    if not tools.browser_path():
        return {"error": "Install Chrome or Edge to capture screenshots."}
    return {"ok": ctx.runner.start_cmd("screenshots", tools.screenshots_argv(ctx.port, body.get("theme", "light")))} if not ctx.runner.is_running() else {"error": "Another task is running."}


# Tracking: GET /api/tools/todo, POST /api/tools/todo/set, /todo/add; GET /api/tools/log, POST /api/tools/log/add
def todo(ctx, q):
    return tracking.get_todo()


def todo_set(ctx, body):
    return tracking.set_done(int(body["line"]), str(body.get("text", "")), bool(body.get("done")))


def todo_add(ctx, body):
    return tracking.add_item(str(body.get("section", "Control Centre UI (ui/)")), str(body.get("text", "")))


def log(ctx, q):
    return tracking.get_log(int(q.get("limit", 10)))


def log_add(ctx, body):
    return tracking.add_entry(*(str(body.get(k, "")) for k in ("title", "what", "why", "impact")))


# Backups: POST /api/tools/restore {name}, POST /api/tools/import {session json}
def restore(ctx, body):
    ctx.session.stop()
    result = backups.restore(ctx.db, str(body.get("name", "")))
    if result.get("ok"):
        ctx.after_restore()
    return result


def import_session(ctx, body):
    result = backups.import_session(ctx.db, body)
    if result.get("ok"):
        ctx.session.switch_session(result["id"])
    return result


# Azure settings: GET /api/azure/settings, POST /api/azure/settings {KEY: value}
def settings(ctx, q):
    return {"settings": env_file.get_settings(), "az": azure_actions.az_path(), "defaults": azure_actions.DEFAULTS}


def save_settings(ctx, body):
    return {"ok": True, "saved": env_file.save_settings(body)}


# POST /api/azure/login, /api/azure/deploy {action, names...}, /api/azure/fetch-connection, /api/azure/install-package {package}
def login(ctx, body):
    if not azure_actions.az_path():
        return {"error": "Azure CLI not found. Install it from https://aka.ms/installazurecli and restart the app."}
    return {"ok": ctx.runner.start_cmd("az login", azure_actions.login_argv())} if not ctx.runner.is_running() else {"error": "Another task is running."}


def deploy(ctx, body):
    action = body.get("action")
    if action not in azure_actions.DEPLOY_ACTIONS:
        return {"error": "Unknown action."}
    if not azure_actions.az_path():
        return {"error": "Azure CLI not found. Install it from https://aka.ms/installazurecli and sign in first."}
    if ctx.runner.is_running():
        return {"error": "Another task is running."}
    return {"ok": ctx.runner.start_cmd("deploy:" + action, azure_actions.deploy_argv(action, _names(body)))}


def fetch_connection(ctx, body):
    return azure_actions.fetch_connection_string(_names(body))


def install_package(ctx, body):
    argv = azure_actions.install_argv(body.get("package", ""))
    if not argv:
        return {"error": "Only azure-cosmos, azure-eventhub and python-dotenv can be installed from here."}
    return {"ok": ctx.runner.start_cmd("install " + body["package"], argv)} if not ctx.runner.is_running() else {"error": "Another task is running."}


# Cost log: GET /api/azure/cost-log, POST /api/azure/cost-log/add, /delete, /write-doc
def cost_entries(ctx, q):
    return {"entries": cost_log.list_entries(ctx.db)}


def cost_add(ctx, body):
    cost_log.add_entry(ctx.db, body.get("day") or date.today().isoformat(), body.get("session", "Session"), body.get("hours", 0), body.get("cost_usd", 0))
    return {"ok": True}


def cost_delete(ctx, body):
    cost_log.delete_entry(ctx.db, int(body["id"]))
    return {"ok": True}


def cost_write_doc(ctx, body):
    return cost_log.write_doc(ctx.db)


# Transform: GET /api/transform/files-preview, POST /api/transform/files-apply
def files_preview(ctx, q):
    return asa_files.preview(ctx.session.policy)


def files_apply(ctx, body):
    return asa_files.apply(ctx.session.policy)