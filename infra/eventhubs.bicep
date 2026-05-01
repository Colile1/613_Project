@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Globally unique namespace name (e.g. itri613-eh-<yourname>)')
param namespaceName string

@description('Event Hub name')
param eventHubName string = 'transactions'

@description('Number of partitions (4 balances ordering + scalability)')
param partitionCount int = 4

@description('Message retention in days')
param messageRetentionInDays int = 1

// Event Hubs Namespace — Standard tier required for consumer groups
resource ehNamespace 'Microsoft.EventHub/namespaces@2022-10-01-preview' = {
  name: namespaceName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
    capacity: 1
  }
  properties: {
    minimumTlsVersion: '1.2'
    isAutoInflateEnabled: false
    maximumThroughputUnits: 0
  }
}

// Event Hub: transactions
// Partition key = card_id (set by producer SDK, not defined here)
// 4 partitions: all events for a given card land on the same partition,
// preserving per-card ordering needed for velocity fraud detection.
// Scaling: each partition handles ~1 MB/s ingress independently.
resource eventHub 'Microsoft.EventHub/namespaces/eventhubs@2022-10-01-preview' = {
  parent: ehNamespace
  name: eventHubName
  properties: {
    messageRetentionInDays: messageRetentionInDays
    partitionCount: partitionCount
    status: 'Active'
  }
}

// Consumer group for Stream Analytics
resource asaConsumerGroup 'Microsoft.EventHub/namespaces/eventhubs/consumergroups@2022-10-01-preview' = {
  parent: eventHub
  name: 'stream-analytics'
}

// Shared Access Policy: send (for simulator)
resource sendRule 'Microsoft.EventHub/namespaces/authorizationRules@2022-10-01-preview' = {
  parent: ehNamespace
  name: 'SimulatorSend'
  properties: {
    rights: ['Send']
  }
}

// Shared Access Policy: listen (for Stream Analytics)
resource listenRule 'Microsoft.EventHub/namespaces/authorizationRules@2022-10-01-preview' = {
  parent: ehNamespace
  name: 'AsaListen'
  properties: {
    rights: ['Listen']
  }
}

// Outputs for use in simulator config and ASA setup
output namespaceFQDN string = '${ehNamespace.name}.servicebus.windows.net'
output eventHubName string = eventHub.name
output sendConnectionString string = listKeys(sendRule.id, sendRule.apiVersion).primaryConnectionString
output listenConnectionString string = listKeys(listenRule.id, listenRule.apiVersion).primaryConnectionString
