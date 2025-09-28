@echo off
echo ========================================
echo   Limpieza de Archivos Duplicados
echo   Edge URU UI - Static Routes Setup
echo ========================================
echo.

echo [INFO] Archivos fuente (EDITAR ESTOS):
echo - node\public\index.html
echo - node\server.ts
echo.

echo [INFO] Archivos generados (NO EDITAR):
echo - node\dist\public\index.html (se sobrescribe en build)
echo - node\dist\server.js (se sobrescribe en build)
echo.

if exist "node\dist\public\index.html" (
    echo [ACCION] Eliminando archivo duplicado obsoleto...
    del "node\dist\public\index.html"
    echo [OK] Archivo duplicado eliminado: dist\public\index.html
) else (
    echo [INFO] No se encontro archivo duplicado para eliminar
)

echo.
echo [INFO] Reconstruyendo proyecto...
call npm run build

echo.
echo ========================================
echo   CONFIGURACION COMPLETADA
echo ========================================
echo.
echo IMPORTANTE:
echo - SIEMPRE editar: node\public\index.html
echo - NUNCA editar: node\dist\public\index.html
echo.
echo Para iniciar servidor:
echo - Desarrollo: npm run dev
echo - Produccion: npm run start:source
echo.
pause