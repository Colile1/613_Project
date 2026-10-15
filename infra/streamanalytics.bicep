@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Stream Analytics job name')
param jobName string = 'fraud-pipeline-asa'

@description('Existing Event Hubs namespace (from eventhubs.bicep)')
param eventHubNamespace string

@description('Event Hub name')
param eventHubName string = 'transactions'

@description('Consumer group reserved for Stream Analytics')
param consumerGroup string = 'stream-analytics'

@description('Existing storage account holding reference-data/card_metadata.json')
param storageAccountName string

@description('Existing Cosmos DB account (from cosmosdb.bicep)')
param cosmosAccountName string

@description('Cosmos DB database name')
param databaseName string = 'fraud_pipeline'

@description('Streaming units (1 is enough for the 10-50 events/s demo load)')
param streamingUnits int = 1

// ── Existing resources: only their keys are read ─────────────────────────────
resource ehNamespace 'Microsoft.EventHub/namespaces@2022-10-01-preview' existing = {
  name: eventHubNamespace
}

resource listenRule 'Microsoft.EventHub/namespaces/authorizationRules@2022-10-01-preview' existing = {
  parent: ehNamespace
  name: 'AsaListen'
}

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' existing = {
  name: cosmosAccountName
}

// One Cosmos DB output per container; ASA output names match asa/query.sql.
var cosmosOutputs = [
  { name: 'CosmosAggregates', container: 'aggregates' }
  { name: 'CosmosFraudAlerts', container: 'fraud_alerts' }
  { name: 'CosmosDeadLetter', container: 'dead_letter' }
]

// ── The job ──────────────────────────────────────────────────────────────────
// Event ordering matches the asa/query.sql header: late arrivals up to 2 minutes,
// out-of-order up to 30 seconds, both with the "Adjust" action.
resource job 'Microsoft.StreamAnalytics/streamingjobs@2021-10-01-preview' = {
  name: jobName
  location: location
  properties: {
    sku: {
      name: 'Standard'
    }
    compatibilityLevel: '1.2'
    dataLocale: 'en-US'
    eventsOutOfOrderPolicy: 'Adjust'
    eventsOutOfOrderMaxDelayInSeconds: 30
    eventsLateArrivalMaxDelayInSeconds: 120
    outputErrorPolicy: 'Drop'
    inputs: [
      {
        name: 'EventHubInput'
        properties: {
          type: 'Stream'
          datasource: {
            type: 'Microsoft.ServiceBus/EventHub'
            properties: {
              serviceBusNamespace: eventHubNamespace
              eventHubName: eventHubName
              consumerGroupName: consumerGroup
              sharedAccessPolicyName: listenRule.name
              sharedAccessPolicyKey: listenRule.listKeys().primaryKey
            }
          }
          serialization: {
            type: 'Json'
            properties: {
              encoding: 'UTF8'
            }
          }
        }
      }
      {
        name: 'CardMetadata'
        properties: {
          type: 'Reference'
          datasource: {
            type: 'Microsoft.Storage/Blob'
            properties: {
              storageAccounts: [
                {
                  accountName: storageAccountName
                  accountKey: storage.listKeys().keys[0].value
                }
              ]
              container: 'reference-data'
              pathPattern: 'card_metadata.json'
            }
          }
          serialization: {
            type: 'Json'
            properties: {
              encoding: 'UTF8'
            }
          }
        }
      }
    ]
    outputs: [for o in cosmosOutputs: {
      name: o.name
      properties: {
        datasource: {
          type: 'Microsoft.Storage/DocumentDB'
          properties: {
            accountId: cosmosAccountName
            accountKey: cosmos.listKeys().primaryMasterKey
            database: databaseName
            collectionNamePattern: o.container
          }
        }
      }
    }]
    transformation: {
      name: 'Transformation'
      properties: {
        streamingUnits: streamingUnits
        query: loadTextContent('../asa/query.sql')
      }
    }
  }
}

output jobName string = job.name