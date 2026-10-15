# Starter Guide — Real-Time Fraud Monitoring Pipeline

This guide explains how to deploy the full pipeline from scratch and how to test each component individually.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.11+ | Run the event simulator |
| Azure CLI | 2.50+ | Deploy Bicep infrastructure |
| Azure subscription | Active | Host all cloud resources |
| Power BI Desktop | Latest | Build the dashboard |

Install Python dependencies for the simulator:

```
cd simulator
pip install -r requirements.txt
```

---

## Step 1 — Deploy Azure Infrastructure

### 1a. Login and set subscription

```
az login
az account set --subscription "<your-subscription-id>"
```

### 1b. Create resource group

```
az group create --name rg-itri613-fraud --location southafricanorth
```

### 1c. Deploy Event Hubs

```
az deployment group create \
  --resource-group rg-itri613-fraud \
  --template-file infra/eventhubs.bicep \
  --parameters namePrefix=itri613colile
```

This creates:
- Event Hubs namespace: `itri613colile-ehns`
- Event hub: `transactions` (4 partitions, 1-day retention)
- Consumer group: `stream-analytics`
- SAS policy: `SimulatorSend` (Send permission)
- SAS policy: `ASAListen` (Listen permission)

### 1d. Deploy Cosmos DB

```
az deployment group create \
  --resource-group rg-itri613-fraud \
  --template-file infra/cosmosdb.bicep \
  --parameters namePrefix=itri613colile
```

This creates:
- Cosmos DB account: `itri613colile-cosmos`
- Database: `fraud_pipeline`
- Containers: `aggregates`, `fraud_alerts`, `dead_letter`

### 1e. Create Blob Storage for reference data

```
az storage account create \
  --name itri613colilestore \
  --resource-group rg-itri613-fraud \
  --sku Standard_LRS

az storage container create \
  --name reference-data \
  --account-name itri613colilestore

az storage blob upload \
  --account-name itri613colilestore \
  --container-name reference-data \
  --name card_metadata.json \
  --file reference_data/card_metadata.json
```

---

## Step 2 — Configure the Simulator

### 2a. Get Event Hubs connection string

```
az eventhubs namespace authorization-rule keys list \
  --resource-group rg-itri613-fraud \
  --namespace-name itri613colile-ehns \
  --name SimulatorSend \
  --query primaryConnectionString \
  --output tsv
```

### 2b. Create .env file

```
cp simulator/config.env.sample simulator/.env
```

Edit `simulator/.env` and paste the connection string:

```
EVENTHUB_CONNECTION_STRING=Endpoint=sb://itri613colile-ehns.servicebus.windows.net/;SharedAccessKeyName=SimulatorSend;SharedAccessKey=<key>
EVENTHUB_NAME=transactions
```

---

## Step 3 — Deploy Azure Stream Analytics

**Quickest:** `infra/streamanalytics.bicep` creates the job with both inputs, the three Cosmos DB outputs, the event-ordering policy (late arrival 2 min, out of order 30 s) and the query loaded from `asa/query.sql`:

```
az deployment group create --resource-group rg-itri613-fraud --template-file infra/streamanalytics.bicep --parameters eventHubNamespace=itri613colile-ehns storageAccountName=itri613colilestore cosmosAccountName=itri613colile-cosmos
az stream-analytics job start --resource-group rg-itri613-fraud --name fraud-pipeline-asa --output-start-mode JobStartTime
```

Or run every deployment step at once with `.\infra\deploy.ps1` (then `-Start`, `-Stop`, `-Delete`). The portal steps below do the same by hand.

### 3a. Create the ASA job (portal alternative)

1. Go to Azure Portal → Create resource → Stream Analytics job
2. Job name: `fraud-pipeline-asa`
3. Resource group: `rg-itri613-fraud`
4. Streaming units: 1

### 3b. Add inputs

**Streaming input — EventHubInput:**
- Input alias: `EventHubInput`
- Source: Event Hub
- Namespace: `itri613colile-ehns`
- Event hub: `transactions`
- Consumer group: `stream-analytics`
- Event serialisation: JSON, UTF-8

**Reference input — CardMetadata:**
- Input alias: `CardMetadata`
- Source: Blob Storage
- Storage account: `itri613colilestore`
- Container: `reference-data`
- Path pattern: `card_metadata.json`
- Event serialisation: JSON, UTF-8

### 3c. Add outputs

| Output alias | Sink | Database | Collection |
|---|---|---|---|
| `CosmosAggregates` | Cosmos DB | `fraud_pipeline` | `aggregates` |
| `CosmosFraudAlerts` | Cosmos DB | `fraud_pipeline` | `fraud_alerts` |
| `CosmosDeadLetter` | Cosmos DB | `fraud_pipeline` | `dead_letter` |

For each output:
- Account: `itri613colile-cosmos`
- Document id: leave blank (auto-generated)

### 3d. Set time handling (job configuration)

- Late arrival tolerance: **2 minutes**
- Out-of-order tolerance: **30 seconds**

### 3e. Import and save the query

Paste the full contents of `asa/query.sql` into the query editor and save.

### 3f. Start the job

Click **Start** → Start time: **Now** → Start.

Allow 2–3 minutes for the job to reach Running state.

---

## Step 4 — Run the Simulator

### Smoke test (60 seconds)

```
cd simulator
python producer.py --duration 60
```

Expected output:
```
2026-05-01 10:00:00 [INFO] Simulator running. Baseline rate: 10 events/sec. Ctrl+C to stop.
2026-05-01 10:00:10 [INFO] Stats: sent=98 total | 9.8 events/sec | burst=False
```

### Trigger a burst immediately

```
python producer.py --burst --duration 120
```

This triggers the 5× burst (50 evt/sec) from the first second, useful for testing velocity alerts.

### Continuous run (for demo)

```
python producer.py
```

Runs indefinitely. Stop with Ctrl+C. Remember to stop the ASA job and simulator after demo to avoid unnecessary costs.

---

## Step 5 — Verify the Pipeline

### Check Event Hubs (portal)

1. Portal → `itri613colile-ehns` → `transactions` → Metrics
2. Confirm: **Incoming Messages** rising, no throttling

### Check ASA job metrics (portal)

1. Portal → `fraud-pipeline-asa` → Metrics
2. Confirm: **Input Events** > 0, **Output Events** > 0
3. Check **Watermark Delay** — should be < 30s for normal traffic

### Check Cosmos DB documents

Run in portal Data Explorer (or use Azure CLI):

```
az cosmosdb sql container show \
  --account-name itri613colile-cosmos \
  --database-name fraud_pipeline \
  --name aggregates \
  --resource-group rg-itri613-fraud
```

Or browse documents directly in Data Explorer. After running the simulator for 2 minutes, you should see:
- `aggregates` — documents with `tx_count`, `total_amount_zar`, `window_end`
- `fraud_alerts` — documents with `alert_type` = `VELOCITY` or `HIGH_AMOUNT`
- `dead_letter` — documents if any malformed events were generated

---

## Step 6 — Build the Power BI Dashboard

See `powerbi/dashboard_design.md` for the full visual specification.

Quick start:
1. Open Power BI Desktop
2. Get Data → Azure → Azure Cosmos DB
3. Connection string: from Azure portal (Cosmos DB → Keys → Primary Connection String)
4. Database: `fraud_pipeline`
5. Load all three collections: `aggregates`, `fraud_alerts`, `dead_letter`
6. Build the three pages per the design document

---

## Testing Components in Isolation

### Test the simulator schema (no Azure needed)

```
cd simulator
python -c "from schema import TransactionEvent, Location; print('Schema OK')"
```

### Test event building (no Azure needed)

```
cd simulator
python -c "
import os
os.environ['EVENTHUB_CONNECTION_STRING'] = 'dummy'
os.environ['EVENTHUB_NAME'] = 'dummy'
# Patch out the azure import before importing producer
import importlib.util, sys
# Just test schema directly
from schema import TransactionEvent, Location, MERCHANT_CATEGORIES, CITIES
import json, uuid, math, random
from datetime import datetime, timezone

loc = Location(city='Johannesburg', lat=-26.2, lng=28.0)
ev = TransactionEvent(
    transaction_id=str(uuid.uuid4()),
    card_id='CARD-0001',
    merchant_id='MERCH-001',
    merchant_category='groceries',
    amount=450.00,
    currency='ZAR',
    location=loc,
    event_time='2026-05-01T10:00:00.000Z',
    ingestion_time='2026-05-01T10:00:00.100Z',
    is_duplicate=False,
    sequence_number=1,
)
print(json.dumps(ev.to_event_hub_body(), indent=2))
"
```

### Validate the ASA query (without running the job)

In the Azure portal, use **Test query** under the ASA job's Query blade. Upload a sample event JSON from `docs/schema.md` as test input. The query editor will show the output rows for each SELECT statement.

Sample test event JSON for the query tester:

```json
[
  {
    "transaction_id": "abc-123",
    "card_id": "CARD-0001",
    "merchant_id": "MERCH-001",
    "merchant_category": "groceries",
    "amount": 450.00,
    "currency": "ZAR",
    "event_time": "2026-05-01T10:00:00.000Z",
    "ingestion_time": "2026-05-01T10:00:00.100Z",
    "is_duplicate": false,
    "sequence_number": 1
  },
  {
    "transaction_id": null,
    "card_id": "CARD-0002",
    "merchant_id": "MERCH-002",
    "merchant_category": "fuel",
    "amount": -100.00,
    "currency": "ZAR",
    "event_time": "2026-05-01T10:00:01.000Z",
    "ingestion_time": "2026-05-01T10:00:01.050Z",
    "is_duplicate": false,
    "sequence_number": 2
  }
]
```

The second event (null transaction_id, negative amount) should route to `CosmosDeadLetter` only.

---

## Cost Control Reminders

- **Stop the ASA job** when not actively testing. It costs $0.11/hr even when idle.
- **Stop the simulator** (Ctrl+C) when done. Event Hubs charges per event.
- **Current session cost:** update `docs/cost_tracking.md` after each session.
- **Delete all resources** after final submission: `az group delete --name rg-itri613-fraud`

---

## Control Centre UI (optional, recommended for demos)

Start the local interface from the project root (no extra packages needed):

```
python -m ui
```

Your browser opens at http://127.0.0.1:8613. Everything is saved automatically in `ui/data/control_centre.db`, so the next start continues the same session, page and filters. Press **Generate 5 min of data** on the Overview, or the play button in the top bar for a live stream. Every stage of the pipeline has its own page; the **User guide** page inside the app explains each one and gives a five-minute demo script.

To drive Azure from the UI, fill in `simulator/.env`, then use the **Azure** page to install the requirements and start `producer.py`. To browse the real containers, `pip install azure-cosmos` and add `COSMOS_ENDPOINT` and `COSMOS_KEY` to `simulator/.env`.

### Test the local engine without the browser

```
python -c "from ui.etl.session import PipelineSession; s=PipelineSession(); s.advance(300); e,r=s.result(); print('Events:', len(e)); print('Docs:', {k: len(v) for k, v in r['collections'].items()})"
```