<#
deploy.ps1 : deploys the whole fraud pipeline to Azure, in order, from the project root.

  .\infra\deploy.ps1                  # everything: resource group, Event Hubs, Cosmos DB, storage, ASA job
  .\infra\deploy.ps1 -Start           # start the Stream Analytics job (billing starts)
  .\infra\deploy.ps1 -Stop            # stop the job between sessions (the biggest cost lever)
  .\infra\deploy.ps1 -Delete          # delete the whole resource group after the final demo

Requires the Azure CLI (az login first). Names match docs/ and the Control Centre.
#>
param(
    [switch]$Start,
    [switch]$Stop,
    [switch]$Delete,
    [string]$ResourceGroup = "rg-itri613-fraud",
    [string]$Location = "southafricanorth",
    [string]$Namespace = "itri613colile-ehns",
    [string]$CosmosAccount = "itri613colile-cosmos",
    [string]$Storage = "itri613colilestore",
    [string]$Job = "fraud-pipeline-asa"
)
$ErrorActionPreference = "Stop"

function Invoke-Step($title, [scriptblock]$action) {
    Write-Host "`n== $title" -ForegroundColor Cyan
    & $action
    if ($LASTEXITCODE -ne 0) { throw "Step failed: $title" }
}

if ($Start) { Invoke-Step "Start Stream Analytics job" { az stream-analytics job start --resource-group $ResourceGroup --name $Job --output-start-mode JobStartTime }; return }
if ($Stop) { Invoke-Step "Stop Stream Analytics job" { az stream-analytics job stop --resource-group $ResourceGroup --name $Job }; return }
if ($Delete) { Invoke-Step "Delete resource group $ResourceGroup" { az group delete --name $ResourceGroup --yes --no-wait }; return }

Invoke-Step "Resource group" { az group create --name $ResourceGroup --location $Location --output none }
Invoke-Step "Event Hubs" { az deployment group create --resource-group $ResourceGroup --template-file infra/eventhubs.bicep --parameters namespaceName=$Namespace eventHubName=transactions --output none }
Invoke-Step "Cosmos DB" { az deployment group create --resource-group $ResourceGroup --template-file infra/cosmosdb.bicep --parameters accountName=$CosmosAccount databaseName=fraud_pipeline --output none }
Invoke-Step "Storage account" { az storage account create --name $Storage --resource-group $ResourceGroup --location $Location --sku Standard_LRS --output none }
Invoke-Step "Reference data container" { az storage container create --name reference-data --account-name $Storage --auth-mode login --output none }
Invoke-Step "Upload card_metadata.json" { az storage blob upload --account-name $Storage --container-name reference-data --name card_metadata.json --file reference_data/card_metadata.json --auth-mode login --overwrite --output none }
Invoke-Step "Stream Analytics job" { az deployment group create --resource-group $ResourceGroup --template-file infra/streamanalytics.bicep --parameters eventHubNamespace=$Namespace storageAccountName=$Storage cosmosAccountName=$CosmosAccount --output none }

Write-Host "`nDeployed. Next:" -ForegroundColor Green
Write-Host "  1. Put the SimulatorSend connection string in simulator/.env:"
Write-Host "     az eventhubs namespace authorization-rule keys list -g $ResourceGroup --namespace-name $Namespace -n SimulatorSend --query primaryConnectionString -o tsv"
Write-Host "  2. .\infra\deploy.ps1 -Start, then run the producer (Control Centre > Azure, or python simulator/producer.py --duration 600)"
Write-Host "  3. .\infra\deploy.ps1 -Stop as soon as you are done."