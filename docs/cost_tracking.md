# Azure Cost Tracking

**Budget: $100 total credit | Target: ≤$10 for this project**

## Cost Alerts Configured

| Threshold | Alert email |
|-----------|-------------|
| $20 spent | Send notification |
| $50 spent | Send notification |
| $80 spent | Send notification |

Set via: Azure Portal → Cost Management → Budgets → Create Budget

## Estimated Cost per Service

| Service | SKU / Config | Cost basis | Est. per active hour | Notes |
|---------|-------------|------------|----------------------|-------|
| Event Hubs | Standard, 1 TU, 4 partitions | $0.015 per million events + $0.10/hr namespace | ~$0.11/hr | Stop when not running simulator |
| Stream Analytics | 1 Streaming Unit | $0.11/SU/hr | $0.11/hr | **Pause job between sessions** |
| Cosmos DB | 3 containers × 400 RU/s | $0.00008/RU-hr each | ~$0.10/hr | Pause not possible; reduce to 100 RU/s when idle |
| Blob Storage | Reference data (~1 KB) | $0.02/GB/month | <$0.001/hr | Negligible |
| **Total** | | | **~$0.32/hr active** | |

## Cost Minimisation Strategy

1. **Stop the ASA job** when not actively testing. Running 1 SU for 30 hrs = $3.30 — the single biggest cost lever.
2. **Kill the simulator** between sessions. Event Hubs charges per event ingested; 10 evt/sec × 3600 = 36K events/hr ≈ $0.0005 — negligible, but bursts cost more.
3. **Reduce Cosmos DB RU/s to 100** when not running demos (minimum billable is 400 for shared throughput — use serverless mode for lowest idle cost).
4. **Delete all resources** after final demo to prevent ongoing charges.

## Session Log

| Date | Session | Duration (active) | Approx cost | Running total |
|------|---------|-------------------|-------------|---------------|
| | Initial setup | | | |
| | | | | |

## Resource Cleanup Checklist

Before deleting resources, capture:
- [ ] Screenshot of Event Hubs metrics (throughput graph)
- [ ] Screenshot of ASA job metrics (events in/out, latency)
- [ ] Cosmos DB document counts for all 3 containers
- [ ] Power BI dashboard screenshots (all 3 pages)

Delete order:
1. Stop ASA job → delete ASA job
2. Stop simulator
3. Delete Event Hubs namespace
4. Delete Cosmos DB account
5. Delete resource group (catches anything missed)
