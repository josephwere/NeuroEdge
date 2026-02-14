# scripts/smoke-all.ps1
$ErrorActionPreference = "Stop"

param(
  [string]$KernelApiKey = "change-this-now",
  [string]$KernelBase = "http://localhost:8080",
  [string]$MlBase = "http://localhost:8090",
  [string]$OrchestratorBase = "http://localhost:7070",
  [string]$FrontendBase = "http://localhost:5173"
)

Write-Host "Running smoke checks..."

function Assert-Status200 {
  param(
    [string]$Url,
    [hashtable]$Headers = @{},
    [string]$Method = "GET",
    [string]$Body = ""
  )

  if ($Method -eq "POST") {
    $res = Invoke-WebRequest -Uri $Url -Method Post -Headers $Headers -ContentType "application/json" -Body $Body
  } else {
    $res = Invoke-WebRequest -Uri $Url -Method Get -Headers $Headers
  }

  if ($res.StatusCode -ne 200) {
    throw "Smoke failed: $Url returned $($res.StatusCode)"
  }
  Write-Host "OK  $Url"
  return $res
}

# ML
Assert-Status200 -Url "$MlBase/health"
Assert-Status200 -Url "$MlBase/readyz"
$inferBody = '{"text":"build failed with error"}'
Assert-Status200 -Url "$MlBase/infer" -Method "POST" -Body $inferBody | Out-Null

# Kernel (public + protected)
Assert-Status200 -Url "$KernelBase/healthz"
Assert-Status200 -Url "$KernelBase/readyz"
$kernelHeaders = @{ "X-API-Key" = $KernelApiKey }
Assert-Status200 -Url "$KernelBase/kernel/health" -Headers $kernelHeaders | Out-Null
$kernelExecBody = '{"id":"smoke-kernel","type":"execute","payload":{"command":"smoke check"}}'
Assert-Status200 -Url "$KernelBase/execute" -Method "POST" -Headers $kernelHeaders -Body $kernelExecBody | Out-Null

# Orchestrator
Assert-Status200 -Url "$OrchestratorBase/status"
Assert-Status200 -Url "$OrchestratorBase/health"
$kernelsBody = '{}'
Assert-Status200 -Url "$OrchestratorBase/kernels" -Method "POST" -Body $kernelsBody | Out-Null
$aiBody = '{"kernelId":"local","input":"build failed with error"}'
Assert-Status200 -Url "$OrchestratorBase/ai" -Method "POST" -Body $aiBody | Out-Null
$execBody = '{"kernelId":"local","command":"echo smoke"}'
Assert-Status200 -Url "$OrchestratorBase/execute" -Method "POST" -Body $execBody | Out-Null

# Frontend
Assert-Status200 -Url $FrontendBase | Out-Null

Write-Host "All services healthy."
