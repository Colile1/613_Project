# cosmos_live.py : optional read-only view of the real Cosmos DB containers
# Needs `pip install azure-cosmos` and COSMOS_ENDPOINT / COSMOS_KEY in
# simulator/.env. Without them the UI keeps using the local warehouse.

from ui.integrations.env_status import get_settings

DATABASE = "fraud_pipeline"
ALLOWED = {"aggregates", "fraud_alerts", "dead_letter"}


# Input wrapper: reads the newest `limit` documents of one container.
def get_documents(container, limit=100):
    if container not in ALLOWED:
        return {"error": "unknown container"}
    try:
        from azure.cosmos import CosmosClient
    except ImportError:
        return {"error": "azure-cosmos is not installed (pip install azure-cosmos)"}
    s = get_settings()
    if not (s.get("COSMOS_ENDPOINT") and s.get("COSMOS_KEY")):
        return {"error": "add COSMOS_ENDPOINT and COSMOS_KEY to simulator/.env"}
    try:
        client = CosmosClient(s["COSMOS_ENDPOINT"], credential=s["COSMOS_KEY"])
        box = client.get_database_client(DATABASE).get_container_client(container)
        query = "SELECT TOP %d * FROM c ORDER BY c._ts DESC" % int(limit)
        rows = list(box.query_items(query, enable_cross_partition_query=True))
        return {"rows": [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]}
    except Exception as exc:  # surface Azure errors to the UI instead of crashing
        return {"error": "%s: %s" % (type(exc).__name__, exc)}
