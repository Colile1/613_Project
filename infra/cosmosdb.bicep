@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Cosmos DB account name (globally unique, e.g. itri613-cosmos-<yourname>)')
param accountName string

@description('Database name')
param databaseName string = 'fraud_pipeline'

// Cosmos DB account — Core (NoSQL) API
// Serverless considered but ruled out: provisioned throughput is cheaper for
// sustained simulator load and gives predictable RU/s for demos.
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: accountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'  // sufficient for single-writer demo
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    enableFreeTier: false
    enableAutomaticFailover: false
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-04-15' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: { id: databaseName }
  }
}

// Container: aggregates
// Partition key: /card_id — aligns with ASA output and dashboard queries by card.
// TTL: 7 days — aggregates are short-lived operational data.
resource aggregatesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'aggregates'
  properties: {
    resource: {
      id: 'aggregates'
      partitionKey: {
        paths: ['/card_id']
        kind: 'Hash'
      }
      defaultTtl: 604800  // 7 days in seconds
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [{ path: '/*' }]
        excludedPaths: [
          { path: '/location/*' }  // geo coords not queried — reduces RU cost
        ]
      }
    }
    options: { throughput: 400 }
  }
}

// Container: fraud_alerts
// Partition key: /card_id — fraud investigation queries filter by card.
// TTL: 30 days — alerts need longer retention for audit and reporting.
resource fraudAlertsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'fraud_alerts'
  properties: {
    resource: {
      id: 'fraud_alerts'
      partitionKey: {
        paths: ['/card_id']
        kind: 'Hash'
      }
      defaultTtl: 2592000  // 30 days in seconds
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [{ path: '/*' }]
        excludedPaths: [
          { path: '/location/*' }
        ]
      }
    }
    options: { throughput: 400 }
  }
}

// Container: dead_letter
// Partition key: /ingestion_date — malformed events are queried by date for ops review.
// No TTL — keep indefinitely for audit trail.
resource deadLetterContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'dead_letter'
  properties: {
    resource: {
      id: 'dead_letter'
      partitionKey: {
        paths: ['/ingestion_date']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [{ path: '/*' }]
        excludedPaths: []
      }
    }
    options: { throughput: 400 }
  }
}

output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output cosmosPrimaryKey string = cosmosAccount.listKeys().primaryMasterKey
output databaseName string = database.name
