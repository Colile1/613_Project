# ============================================
# Check and Install Required Python Packages
# ============================================

# Required packages and minimum versions
$requiredPackages = @{
    "azure-eventhub" = "5.11.0"
    "python-dotenv" = "1.0.0"
}

# Function: Compare versions
function Test-Version {
    param (
        [string]$Installed,
        [string]$Required
    )

    return ([version]$Installed -ge [version]$Required)
}

# Check if Python is installed
try {
    $pythonVersion = python --version 2>&1
    Write-Host "Detected $pythonVersion"
}
catch {
    Write-Host "Python is not installed or not added to PATH."
    exit 1
}

# Check if pip is available
try {
    python -m pip --version | Out-Null
}
catch {
    Write-Host "pip is not installed."
    exit 1
}

Write-Host "`nChecking required packages...`n"

foreach ($package in $requiredPackages.Keys) {

    $requiredVersion = $requiredPackages[$package]

    # Get installed package info
    $installedInfo = python -m pip show $package 2>$null

    if ($installedInfo) {

        $installedVersion = ($installedInfo |
            Select-String "^Version:" |
            ForEach-Object { $_.ToString().Split(":")[1].Trim() })

        if (Test-Version -Installed $installedVersion -Required $requiredVersion) {

            Write-Host "$package $installedVersion is already installed and meets requirement >= $requiredVersion"

        }
        else {

            Write-Host "$package version $installedVersion is outdated. Upgrading..."

            python -m pip install --upgrade "$package>=$requiredVersion"
        }

    }
    else {

        Write-Host "$package is not installed. Installing..."

        python -m pip install "$package>=$requiredVersion"
    }
}

Write-Host "`nAll prerequisite checks completed."