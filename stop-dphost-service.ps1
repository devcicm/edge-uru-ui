# stop-dphost-service.ps1
# Script para detener el servicio DigitalPersona que bloquea el acceso al lector

Write-Host "=== Detener Servicio DigitalPersona ===" -ForegroundColor Cyan
Write-Host ""

# Verificar si se está ejecutando como administrador
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: Este script requiere permisos de administrador" -ForegroundColor Red
    Write-Host ""
    Write-Host "Ejecuta PowerShell como Administrador y vuelve a correr este script" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 1
}

# Verificar estado del servicio
Write-Host "[1] Verificando servicio DpHost..." -ForegroundColor Yellow
$service = Get-Service -Name "DpHost" -ErrorAction SilentlyContinue

if ($null -eq $service) {
    Write-Host "  INFO: Servicio DpHost no encontrado (esto es normal si no está instalado)" -ForegroundColor Green
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 0
}

Write-Host "  Estado actual: $($service.Status)" -ForegroundColor Cyan

if ($service.Status -eq "Stopped") {
    Write-Host "  OK: El servicio ya está detenido" -ForegroundColor Green
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 0
}

# Detener el servicio
Write-Host ""
Write-Host "[2] Deteniendo servicio DpHost..." -ForegroundColor Yellow

try {
    Stop-Service -Name "DpHost" -Force -ErrorAction Stop
    Write-Host "  OK: Servicio detenido exitosamente" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: No se pudo detener el servicio: $_" -ForegroundColor Red
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 1
}

# Verificar que se detuvo
Start-Sleep -Seconds 2
$service.Refresh()
Write-Host "  Estado final: $($service.Status)" -ForegroundColor Cyan

Write-Host ""
Write-Host "=== IMPORTANTE ===" -ForegroundColor Yellow
Write-Host "El servicio DpHost ha sido detenido temporalmente." -ForegroundColor Cyan
Write-Host "Esto permite que tu aplicacion personalizada acceda al lector DP4500." -ForegroundColor Cyan
Write-Host ""
Write-Host "Para reactivar el servicio despues:" -ForegroundColor Yellow
Write-Host "  Start-Service -Name DpHost" -ForegroundColor White
Write-Host ""
Write-Host "Ahora puedes:" -ForegroundColor Green
Write-Host "  1. Reiniciar el servidor Node.js (npm start)" -ForegroundColor White
Write-Host "  2. Ejecutar el test: .\test-finger-detection.ps1" -ForegroundColor White
Write-Host ""

Read-Host "Presiona Enter para salir"
