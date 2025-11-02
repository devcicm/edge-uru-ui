# toggle-reader-mode.ps1
# Alternar entre modo de operaciones biométricas y monitoreo pasivo

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("biometric", "monitor")]
    [string]$Mode
)

$ErrorActionPreference = 'Stop'

# Verificar permisos de administrador
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: Este script requiere permisos de administrador" -ForegroundColor Red
    exit 1
}

$service = Get-Service -Name "DpHost" -ErrorAction SilentlyContinue

if ($null -eq $service) {
    Write-Host "INFO: Servicio DpHost no instalado" -ForegroundColor Yellow
    exit 0
}

Write-Host "=== Cambiar Modo del Lector DP4500 ===" -ForegroundColor Cyan
Write-Host ""

if ($Mode -eq "biometric") {
    Write-Host "MODO: Operaciones Biometricas (DPUruNet SDK)" -ForegroundColor Green
    Write-Host "  - Enrolamiento, Verificacion, Identificacion" -ForegroundColor White
    Write-Host "  - Control manual del lector" -ForegroundColor White
    Write-Host ""

    if ($service.Status -eq "Running") {
        Write-Host "Deteniendo servicio DpHost..." -ForegroundColor Yellow
        Stop-Service -Name "DpHost" -Force
        Write-Host "  OK: Servicio detenido" -ForegroundColor Green
    } else {
        Write-Host "  OK: Servicio ya esta detenido" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Ahora puedes iniciar el servidor Node.js:" -ForegroundColor Cyan
    Write-Host "  cd node && npm start" -ForegroundColor White
}
elseif ($Mode -eq "monitor") {
    Write-Host "MODO: Monitoreo Pasivo (DpHost + Web SDK)" -ForegroundColor Green
    Write-Host "  - Captura automatica global" -ForegroundColor White
    Write-Host "  - Funciona sin foco en ventana" -ForegroundColor White
    Write-Host ""

    if ($service.Status -eq "Stopped") {
        Write-Host "Iniciando servicio DpHost..." -ForegroundColor Yellow
        Start-Service -Name "DpHost"
        Write-Host "  OK: Servicio iniciado" -ForegroundColor Green
    } else {
        Write-Host "  OK: Servicio ya esta corriendo" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "IMPORTANTE: Para usar este modo necesitas:" -ForegroundColor Yellow
    Write-Host "  1. Instalar DigitalPersona WebSDK Agent" -ForegroundColor White
    Write-Host "  2. Implementar Web SDK en el frontend" -ForegroundColor White
    Write-Host "  3. Usar eventos SamplesAcquired" -ForegroundColor White
}

Write-Host ""
