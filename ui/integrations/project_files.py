# project_files.py : read-only access to the project's source and docs
# Only the whitelisted files below can be served to the browser; secrets such
# as simulator/.env are never readable through this module.

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

FILES = {
    "producer": ("simulator/producer.py", "Event simulator (producer.py)", "python"),
    "schema_py": ("simulator/schema.py", "Event schema dataclasses (schema.py)", "python"),
    "requirements": ("simulator/requirements.txt", "Simulator requirements", "text"),
    "env_sample": ("simulator/config.env.sample", ".env template", "text"),
    "asa_query": ("asa/query.sql", "Stream Analytics query", "sql"),
    "eventhubs_bicep": ("infra/eventhubs.bicep", "Event Hubs Bicep template", "bicep"),
    "cosmosdb_bicep": ("infra/cosmosdb.bicep", "Cosmos DB Bicep template", "bicep"),
    "asa_bicep": ("infra/streamanalytics.bicep", "Stream Analytics Bicep template", "bicep"),
    "deploy_ps1": ("infra/deploy.ps1", "Deploy script (PowerShell)", "text"),
    "card_metadata": ("reference_data/card_metadata.json", "Card metadata reference data", "json"),
    "architecture": ("docs/architecture.md", "Architecture", "markdown"),
    "schema_md": ("docs/schema.md", "Schema definitions", "markdown"),
    "cost": ("docs/cost_tracking.md", "Cost tracking", "markdown"),
    "powerbi": ("powerbi/dashboard_design.md", "Power BI dashboard design", "markdown"),
    "starter": ("starter_guide.md", "Starter guide", "markdown"),
    "todo": ("todo.md", "Todo list", "markdown"),
    "log": ("log.md", "Development log", "markdown"),
    "readme": ("README.md", "Project brief and rubric", "markdown"),
    "rubric_review": ("docs/rubric_review.md", "Rubric review", "markdown"),
    "velocity_decision": ("docs/decisions/velocity_rule.md", "Decision: velocity rule", "markdown"),
    "velocity_results": ("docs/decisions/velocity_study_results.md", "Velocity study results", "markdown"),
    "amount_results": ("docs/decisions/amount_rule_results.md", "Amount rule study results", "markdown"),
}


# Pure function: the list of files the UI may open.
def catalogue():
    return [{"key": k, "path": p, "title": t, "lang": lang} for k, (p, t, lang) in FILES.items()]


# Input wrapper: reads one whitelisted file; returns None for unknown keys.
def get_file(key):
    if key not in FILES:
        return None
    path, title, lang = FILES[key]
    full = ROOT / path
    text = full.read_text(encoding="utf-8") if full.exists() else f"(file not found: {path})"
    return {"key": key, "path": path, "title": title, "lang": lang, "content": text}


# Input wrapper: reads text exactly as stored (keeps Windows line endings).
def read_exact(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


# Output logic: writes text exactly as given (no newline translation on Windows),
# so files keep their own line endings when the UI edits them.
def write_exact(path, text):
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


# Pure function: counts done and open checkboxes in todo.md text.
def todo_progress(text):
    return {"done": text.count("- [x]"), "open": text.count("- [ ]")}
