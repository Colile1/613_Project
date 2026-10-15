# ui/integrations - bridges to the project and to Azure

- `project_files.py` - read-only access to a whitelist of project files (docs, code, Bicep, reference data).
- `env_status.py` - reports whether `simulator/.env`, the Azure SDKs and the Azure CLI are available (never returns secrets).
- `process_runner.py` - runs `simulator/producer.py` or `pip install -r requirements.txt` as a child process and keeps its output.
- `powerbi_export.py` - writes the local warehouse to `powerbi/local_data/` as CSV tables named like the Cosmos DB containers, plus Power Query (M) scripts.
- `env_file.py` - reads and writes `simulator/.env` for the Azure page (secrets are never returned, only whether they are set).
- `azure_actions.py` - command lines for sign-in, `infra/deploy.ps1` actions, card upload and package installs; fetches the connection string.
- `tools.py`, `screenshots.py` - studies, card generator, diagram rebuild and headless-browser screenshots.
- `tracking.py` - ticks `todo.md` items and appends `log.md` entries.
- `asa_files.py` - previews and writes the Transform settings into `asa/query.sql` and the Bicep template.
- All file writers keep each file's own line endings (`project_files.read_exact` / `write_exact`).
- `cosmos_live.py` - optional reader for the real Cosmos DB containers (`pip install azure-cosmos`, plus `COSMOS_ENDPOINT` and `COSMOS_KEY` in `simulator/.env`).