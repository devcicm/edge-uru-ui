# Instalación DigitalPersona Web SDK para Modo 2

## ⚠️ Requisitos Previos

Para usar **Modo 2: Monitoreo Pasivo con DpHost**, necesitas instalar el **DigitalPersona WebSDK Agent**.

---

## 📥 Paso 1: Descargar DigitalPersona Lite Client

**URL Oficial**: https://crossmatch.hid.gl/lite-client

O busca en Google: `"DigitalPersona Lite Client download"`

### Alternativa: DigitalPersona Workstation
Si ya tienes el lector DP4500, probablemente vino con un CD de instalación que incluye:
- DigitalPersona Workstation
- WebSDK Agent
- Drivers

---

## ⚙️ Paso 2: Instalar el Software

1. Ejecuta el instalador descargado
2. Durante la instalación, **asegúrate de seleccionar**:
   - ✅ DigitalPersona Agent (WebSDK Agent)
   - ✅ Device Drivers
   - ✅ Web Components (si aparece)

3. Completa la instalación y reinicia si se solicita

---

## ✅ Paso 3: Verificar Instalación

### Opción A: Verificar Servicio Windows

Abre PowerShell como Administrador y ejecuta:

```powershell
# Verifica el servicio principal
sc query DpHost

# Busca el proceso del Agent
Get-Process | Where-Object {$_.ProcessName -like "*DPAgent*"}
```

### Opción B: Verificar Endpoint WebSocket

Abre tu navegador y ve a:

```
https://127.0.0.1:52181/get_connection
```

**Respuesta esperada**:
```json
{
  "version": "...",
  "websocket": "wss://127.0.0.1:9001"
}
```

Si ves un error de certificado SSL, acéptalo (es un certificado autofirmado local).

---

## 🔧 Paso 4: Solución de Problemas

### Problema: No se puede conectar a localhost:52181

**Causa**: El servicio DpHost o DPAgent no está corriendo

**Solución**:
```powershell
# Como administrador
Start-Service DpHost

# O busca DPAgent.exe y ejecútalo manualmente
C:\Program Files\DigitalPersona\....\DPAgent.exe
```

### Problema: Certificado SSL inválido

**Causa**: El navegador no confía en el certificado autofirmado

**Solución**:
1. Ve a `https://127.0.0.1:52181/get_connection`
2. Click en "Avanzado" o "Advanced"
3. Click en "Proceder a 127.0.0.1" o "Proceed to 127.0.0.1"
4. Acepta el certificado

### Problema: Error "No se encontró el dispositivo"

**Causa**: El lector DP4500 no está conectado o no tiene drivers

**Solución**:
1. Conecta el lector USB
2. Ve a Administrador de Dispositivos
3. Verifica que aparece en "Dispositivos Biométricos"
4. Si no aparece, instala drivers desde el CD o descarga de HID Global

---

## 📦 Paso 5: Instalar Dependencias NPM (Después de instalar WebSDK Agent)

Cuando hayas verificado que el WebSDK Agent funciona, regresa a tu proyecto:

```bash
cd "C:\Users\Carlos Ivan\Documents\Proyectos VSCODE\edge-uru-ui\node"
npm install @digitalpersona/devices
```

---

## ✅ Confirmación Final

Ejecuta este test en tu navegador (abre la consola F12):

```javascript
// Test rápido de conectividad
fetch('https://127.0.0.1:52181/get_connection')
  .then(r => r.json())
  .then(data => console.log('WebSDK Agent OK:', data))
  .catch(err => console.error('WebSDK Agent Error:', err));
```

**Si ves** `WebSDK Agent OK: { version: "...", websocket: "wss://..." }` → ✅ Listo para continuar

**Si ves** `WebSDK Agent Error` → ❌ Vuelve al Paso 3

---

## 🔄 Siguiente Paso

Una vez que el WebSDK Agent esté instalado y funcionando, avísame y continuaré con:
- Instalación del paquete @digitalpersona/devices
- Implementación del código de finger detection
- Creación de la página de prueba

---

## 📚 Referencias

- **Documentación Oficial**: https://hidglobal.github.io/digitalpersona-devices/
- **GitHub**: https://github.com/hidglobal/digitalpersona-devices
- **NPM Package**: https://www.npmjs.com/package/@digitalpersona/devices
