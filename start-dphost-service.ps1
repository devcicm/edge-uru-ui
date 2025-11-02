# start-dphost-service.ps1
# Script para reactivar el servicio DigitalPersona después de las pruebas

Write-Host "=== Reactivar Servicio DigitalPersona ===" -ForegroundColor Cyan
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
    Write-Host "  INFO: Servicio DpHost no encontrado" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 0
}

Write-Host "  Estado actual: $($service.Status)" -ForegroundColor Cyan

if ($service.Status -eq "Running") {
    Write-Host "  OK: El servicio ya está ejecutándose" -ForegroundColor Green
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 0
}

# Iniciar el servicio
Write-Host ""
Write-Host "[2] Iniciando servicio DpHost..." -ForegroundColor Yellow

try {
    Start-Service -Name "DpHost" -ErrorAction Stop
    Write-Host "  OK: Servicio iniciado exitosamente" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: No se pudo iniciar el servicio: $_" -ForegroundColor Red
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 1
}

# Verificar que se inició
Start-Sleep -Seconds 2
$service.Refresh()
Write-Host "  Estado final: $($service.Status)" -ForegroundColor Cyan

Write-Host ""
Write-Host "=== COMPLETADO ===" -ForegroundColor Green
Write-Host "El servicio DpHost ha sido reactivado." -ForegroundColor Cyan
Write-Host ""

Read-Host "Presiona Enter para salir"
