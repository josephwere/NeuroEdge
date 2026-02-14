Add this to your README:

## Kernel API (Local Run)

### 1) Start API
From `kernel/`:

```powershell
$env:NEUROEDGE_API_KEY="change-this-now"
$env:NEUROEDGE_RATE_LIMIT_PER_MIN="60"
go run ./cmd/api
2) Endpoints
Public health:
GET /healthz
Protected:
GET /kernel/health
GET /kernel/nodes
GET /kernel/capabilities
Base URL:

http://localhost:8080
3) Test from PowerShell
Public:

Invoke-WebRequest -Uri "http://localhost:8080/healthz"
Protected (with API key):

Invoke-WebRequest -Uri "http://localhost:8080/kernel/health" -Headers @{ "X-API-Key" = "change-this-now" }
Invoke-WebRequest -Uri "http://localhost:8080/kernel/nodes" -Headers @{ "X-API-Key" = "change-this-now" }
Invoke-WebRequest -Uri "http://localhost:8080/kernel/capabilities" -Headers @{ "X-API-Key" = "change-this-now" }
Protected (without API key, expected 401):

try {
  Invoke-WebRequest -Uri "http://localhost:8080/kernel/health" -ErrorAction Stop
} catch {
  $_.Exception.Response.StatusCode.value__
}
4) Build/Test
go test ./...
5) Stop API
Press Ctrl + C in the terminal running go run ./cmd/api.
