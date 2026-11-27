$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot 'backend'
$frontend = Join-Path $PSScriptRoot 'frontend'
$appUrl = 'http://127.0.0.1:3000/product-forecast'
$healthPath = '/product-forecast/api/v1/health'
$jobs = @()

function Test-Listening($port) {
    return $port -in [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port
}

function Wait-Ready($url, [switch]$Health) {
    $deadline = (Get-Date).AddSeconds(120)
    do {
        foreach ($job in $jobs) {
            if ($job.State -ne 'Running') {
                Receive-Job $job
                throw "Server stopped while waiting for $url"
            }
        }
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5
            if (!$Health -or ($response.Content | ConvertFrom-Json).status -eq 'ok') { return }
        } catch {}
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    throw "Timed out waiting for $url. Check the service and port."
}

try {
    if (!(Test-Listening 3000)) {
        Push-Location $frontend
        try {
            $stamp = 'node_modules/.product-forecast-lock'
            $hash = (Get-FileHash 'package-lock.json').Hash
            if (!(Test-Path $stamp) -or (Get-Content $stamp -Raw).Trim() -ne $hash) {
                & npm.cmd ci
                if ($LASTEXITCODE) { throw 'npm ci failed.' }
                Set-Content $stamp $hash
            }
        } finally { Pop-Location }
    }
    if (!(Test-Listening 8000)) {
        $jobs += Start-Job -ArgumentList $backend -ScriptBlock {
            param($dir)
            Set-Location -LiteralPath $dir
            & .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
        }
    }
    Wait-Ready "http://127.0.0.1:8000$healthPath" -Health
    if (!(Test-Listening 3000)) {
        $jobs += Start-Job -ArgumentList $frontend -ScriptBlock {
            param($dir)
            Set-Location -LiteralPath $dir
            & npm.cmd run dev -- --port 3000
        }
    }
    Wait-Ready "http://127.0.0.1:3000$healthPath" -Health
    Wait-Ready $appUrl
    Start-Process $appUrl
    if ($jobs.Count) {
        Write-Host "App ready at $appUrl. Press Ctrl+C to stop."
        while (@($jobs | Where-Object State -eq 'Running').Count -eq $jobs.Count) {
            foreach ($job in $jobs) { Receive-Job $job -ErrorAction Continue }
            Start-Sleep -Seconds 1
        }
        throw 'A development server stopped.'
    }
} finally {
    foreach ($job in $jobs) { Remove-Job $job -Force }
}
