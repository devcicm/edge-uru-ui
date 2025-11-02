# 🌐 Usar Monitoreo de Dedo con Web SDK (Modo 2)

## ✅ Modo 2: Control Exclusivo Global con DpHost

Esta implementación usa **DigitalPersona Web SDK** que funciona **con DpHost activo**, permitiendo:

- ✅ Control exclusivo global del lector
- ✅ Funciona sin importar si la ventana tiene foco
- ✅ Captura automática en segundo plano
- ✅ No requiere detener DpHost

---

## 🚀 Pasos para Usar

### 1. Asegúrate que DpHost esté corriendo

```powershell
# Verificar estado
sc query DpHost

# Si está detenido, iniciarlo (como admin)
Start-Service DpHost
```

### 2. Inicia el Servidor Node.js

```powershell
cd node
npm start
```

**Servidor iniciará en**: http://localhost:8080

### 3. Abre la Página de Prueba

Abre tu navegador y ve a:

```
http://localhost:8080/finger-monitor-websdk.html
```

### 4. Sigue los Pasos en la Interfaz

#### Paso A: Conectar al WebSDK
1. Presiona el botón **"🔌 Conectar a WebSDK"**
2. Espera a ver: **"✅ WebSDK conectado correctamente"**
3. El estado cambiará a: **"WebSDK Conectado - Dispositivo listo"**

#### Paso B: Iniciar Captura
1. Presiona el botón **"▶️ Iniciar Captura"**
2. El estado cambiará a: **"Esperando Dedo..."**
3. La captura ya está activa

#### Paso C: Colocar Dedo
1. **Coloca tu dedo** en el sensor DP4500
2. Verás:
   - Emoji cambia a **✋**
   - Fondo verde agua
   - Texto: **"¡Dedo Detectado!"**
   - Calidad reportada
   - Evento en el log: **"✋ Dedo detectado (Calidad: X)"**

#### Paso D: Retirar Dedo
1. **Retira tu dedo** del sensor
2. El sistema capturará la muestra
3. Verás:
   - Emoji cambia a **👋**
   - Fondo normal
   - Texto: **"Dedo Retirado"**
   - Evento: **"📸 Muestra capturada (#N)"**
   - Evento: **"👋 Dedo retirado del sensor"**

#### Paso E: Detener Captura (Opcional)
1. Presiona **"⏹️ Detener Captura"** cuando termines
2. El sistema dejará de monitorear

---

## 📊 Información Mostrada

La interfaz muestra:

| Campo | Descripción |
|-------|-------------|
| **Dispositivo** | Nombre del lector (ej: DP4500) |
| **Estado** | Conectado / Capturando / Detenido |
| **Última Calidad** | Valor de calidad de la última lectura |
| **Muestras Capturadas** | Contador de muestras totales |

---

## 🎯 Diferencias vs Modo 1 (DPUruNet SDK)

| Característica | Modo 1 (DPUruNet) | Modo 2 (Web SDK) |
|----------------|-------------------|------------------|
| **DpHost** | Debe estar detenido | Debe estar corriendo |
| **Control Global** | ❌ No | ✅ Sí |
| **Sin foco ventana** | ❌ No funciona | ✅ Funciona |
| **Detección** | Polling manual | Eventos del SDK |
| **Eventos** | FINGER_PLACED/REMOVED | QualityReported/SamplesAcquired |
| **Página** | finger-monitor.html | finger-monitor-websdk.html |

---

## 🐛 Solución de Problemas

### Error: "No se puede conectar al WebSDK"

**Causa**: DpHost no está corriendo o WebSDK Agent no está instalado

**Solución**:
```powershell
# Verificar DpHost
sc query DpHost

# Iniciar DpHost
Start-Service DpHost

# Verificar endpoint WebSDK
Invoke-RestMethod -Uri https://127.0.0.1:52181/get_connection
```

### Error: "No se detectaron dispositivos de huella"

**Causa**: Lector DP4500 no está conectado o sin drivers

**Solución**:
1. Conecta el lector USB
2. Ve a Administrador de Dispositivos
3. Verifica en "Dispositivos Biométricos"
4. Reinstala drivers si es necesario

### Error: Certificado SSL inválido

**Causa**: El navegador no confía en el certificado autofirmado de WebSDK

**Solución**:
1. Ve a `https://127.0.0.1:52181/get_connection` en el navegador
2. Click en "Avanzado"
3. Click en "Proceder a 127.0.0.1"
4. Acepta el certificado
5. Recarga la página de prueba

### No detecta cuando pongo el dedo

**Causa**: La captura no está iniciada

**Solución**:
1. Verifica que presionaste "▶️ Iniciar Captura"
2. Espera a que el estado cambie a "Esperando Dedo..."
3. Coloca el dedo firmemente en el sensor
4. Mantén el dedo 1-2 segundos

---

## 📝 Eventos del Log

Los eventos que verás en el registro:

| Evento | Tipo | Descripción |
|--------|------|-------------|
| **🔌 Conectando al WebSDK Agent...** | SYSTEM | Iniciando conexión |
| **✅ WebSDK conectado correctamente** | SUCCESS | Conexión exitosa |
| **📱 Dispositivo encontrado: DP4500** | DEVICE | Lector detectado |
| **▶️ Iniciando captura continua...** | CONTROL | Iniciando monitoreo |
| **✋ Dedo detectado (Calidad: X)** | FINGER | Dedo en sensor |
| **📸 Muestra capturada (#N)** | SAMPLE | Muestra obtenida |
| **👋 Dedo retirado del sensor** | FINGER | Dedo removido |
| **⏹️ Captura detenida** | CONTROL | Monitoreo detenido |
| **❌ Error: ...** | ERROR | Error ocurrido |

---

## 🔄 Alternar entre Modos

### Para usar Modo 1 (DPUruNet SDK):
```powershell
# Como administrador
.\toggle-reader-mode.ps1 biometric
```
Luego abre: http://localhost:8080/finger-monitor.html

### Para usar Modo 2 (Web SDK):
```powershell
# Como administrador
.\toggle-reader-mode.ps1 monitor
```
Luego abre: http://localhost:8080/finger-monitor-websdk.html

---

## 📚 Referencias

- **Página Web SDK**: http://localhost:8080/finger-monitor-websdk.html
- **Página DPUruNet**: http://localhost:8080/finger-monitor.html
- **Documentación Web SDK**: https://hidglobal.github.io/digitalpersona-devices/
- **GitHub**: https://github.com/hidglobal/digitalpersona-devices

---

## ✅ Ventajas del Modo 2

1. **Control Global**: Captura huellas sin importar qué aplicación tenga foco
2. **Segundo Plano**: Funciona incluso con ventana minimizada
3. **Integración Oficial**: Usa SDK oficial de HID Global
4. **Eventos Nativos**: No requiere polling manual
5. **Compatible con DpHost**: Trabaja CON el servicio, no contra él

---

**¿Listo para probar?** Inicia el servidor y abre http://localhost:8080/finger-monitor-websdk.html
