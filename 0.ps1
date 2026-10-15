<#
az deployment group create `
  --resource-group rg-itri613-fraud `
  --template-file infra/eventhubs.bicep `
  --parameters namespaceName=itri613colile-ehns eventHubName=transactions


az deployment group create `
  --resource-group rg-itri613-fraud `
  --template-file infra/cosmosdb.bicep `
  --parameters accountName=itri613colile-cosmos databaseName=fraud_pipeline
#>

<# Step 1e — Create Blob Storage
# 1. Create the storage account
az storage account create `
  --name itri613colilestore `
  --resource-group rg-itri613-fraud `
  --sku Standard_LRS

# 2. Create the container for reference data
az storage container create `
  --name reference-data `
  --account-name itri613colilestore `
  --auth-mode login

# 3. Upload the card metadata file
az storage blob upload `
  --account-name itri613colilestore `
  --container-name reference-data `
  --name card_metadata.json `
  --file reference_data/card_metadata.json `
  --auth-mode login

#>

az storage account create `
  --name itri613colilestore `
  --resource-group rg-itri613-fraud `
  --sku Standard_LRS