 # test-finger-detection.ps1
[CmdletBinding()]
param(
  [string]$BaseUrl = "http://localhost:8080",
  [int]$PollIntervalMs = 200
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Write-Host "=== TEST: Finger Detection DP4500 ===" -ForegroundColor Cyan
Write-Host

# [1] Inicializar lector
Write-Host "[1] Inicializando lector..." -ForegroundColor Yellow
try {
  $initResponse = Invoke-RestMethod -Uri "$BaseUrl/api/init" -Method POST -ContentType 'application/json'
  Write-Host ("  OK Respuesta: {0}" -f ($initResponse | ConvertTo-Json -Compress)) -ForegroundColor Green
} catch {
  Write-Host ("  ERROR: {0}" -f $_.Exception.Message) -ForegroundColor Red
  exit 1
}

Start-Sleep -Seconds 2

# [2] Iniciar monitoreo
Write-Host "[2] Iniciando monitoreo de dedo..." -ForegroundColor Yellow
try {
  $body = @{ pollIntervalMs = $PollIntervalMs } | ConvertTo-Json
  $monitorResponse = Invoke-RestMethod -Uri "$BaseUrl/api/start-finger-monitoring" -Method POST -Body $body -ContentType 'application/json'
  Write-Host ("  OK Respuesta: {0}" -f ($monitorResponse | ConvertTo-Json -Compress)) -ForegroundColor Green
} catch {
  Write-Host ("  ERROR: {0}" -f $_.Exception.Message) -ForegroundColor Red
  exit 1
}

Write-Host
Write-Host "=== MONITOREO ACTIVO ===" -ForegroundColor Green
Write-Host "Coloca y retira el dedo del sensor DP4500" -ForegroundColor Cyan
Write-Host "Observa los logs en la consola del servidor Node.js" -ForegroundColor Cyan
Write-Host "Deberias ver logs como: [FingerDetection] FINGER PLACED" -ForegroundColor Cyan
Write-Host
Write-Host "Presiona Enter para detener el monitoreo" -ForegroundColor Yellow
Write-Host

[void](Read-Host)

# [3] Detener monitoreo
Write-Host "[3] Deteniendo monitoreo..." -ForegroundColor Yellow
try {
  $stopResponse = Invoke-RestMethod -Uri "$BaseUrl/api/stop-finger-monitoring" -Method POST -ContentType 'application/json'
  Write-Host ("  OK Respuesta: {0}" -f ($stopResponse | ConvertTo-Json -Compress)) -ForegroundColor Green
} catch {
  Write-Host ("  ERROR: {0}" -f $_.Exception.Message) -ForegroundColor Red
}

Write-Host
Write-Host "=== TEST COMPLETADO ===" -ForegroundColor Cyan
