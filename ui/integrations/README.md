# ui/integrations - bridges to the project and to Azure

- `project_files.py` - read-only access to a whitelist of project files (docs, code, Bicep, reference data).
- `env_status.py` - reports whether `simulator/.env`, the Azure SDKs and the Azure CLI are available (never returns secrets).
- `process_runner.py` - runs `simulator/producer.py` or `pip install -r requirements.txt` as a child process and keeps its output.
- `powerbi_export.py` - writes the local warehouse to `powerbi/local_data/` as CSV tables named like the Cosmos DB containers, plus Power Query (M) scripts.
- `cosmos_live.py` - optional reader for the real Cosmos DB containers (`pip install azure-cosmos`, plus `COSMOS_ENDPOINT` and `COSMOS_KEY` in `simulator/.env`).