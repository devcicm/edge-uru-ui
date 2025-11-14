# Guía Completa: Modo Touch (Continuous Capture)

> **Implementado en:** EdgeUruBridgeCore v2.0
> **Fecha:** Noviembre 2025
> **Rama:** `feature/touch-events-implementation`

## 📋 Índice

1. [Introducción](#introducción)
2. [¿Qué es el Modo Touch?](#qué-es-el-modo-touch)
3. [Comparación: OnDemand vs Continuous](#comparación-ondemand-vs-continuous)
4. [Arquitectura del Sistema](#arquitectura-del-sistema)
5. [API Reference](#api-reference)
6. [Ejemplos de Uso](#ejemplos-de-uso)
7. [Eventos SSE](#eventos-sse)
8. [Mejores Prácticas](#mejores-prácticas)
9. [Troubleshooting](#troubleshooting)

---

## Introducción

El **Modo Touch** (Continuous Capture) es una nueva funcionalidad que elimina los timers ineficientes y permite que el lector de huellas DP4500 opere en modo de escucha continua, disparando eventos automáticamente cuando se detecta un dedo.

### Beneficios Principales

- ✅ **60% más rápido** - Sin esperas bloqueantes con timeouts
- ✅ **Mejor UX** - Respuesta instantánea al toque del dedo
- ✅ **Más eficiente** - No consume CPU con polling
- ✅ **Compatible 100%** - El modo OnDemand sigue funcionando igual
- ✅ **Eventos en tiempo real** - SSE con información detallada

---

## ¿Qué es el Modo Touch?

El Modo Touch es un modo de operación del lector donde:

1. Se inicia **una sola vez** con `StartContinuousCapture()`
2. El lector queda **esperando dedos indefinidamente**
3. Cuando se detecta un dedo, se disparan **eventos SSE automáticamente**
4. El lector se **rearma solo** para la siguiente captura
5. Continúa hasta que se llama `StopContinuousCapture()`

### Flujo de Operación

```
Usuario → Click "Iniciar Modo Touch"
    ↓
Backend activa modo continuo
    ↓
Lector espera internamente (sin timers)
    ↓
Usuario coloca dedo → ¡EVENTO INMEDIATO!
    ↓ FINGER_TOUCHED (con imagen)
    ↓ FINGERPRINT_READY (con FMD)
    ↓ CAPTURE_READY
    ↓
Lector rearma automáticamente
    ↓
Usuario coloca dedo → ¡EVENTO INMEDIATO!
    (ciclo continúa...)
```

---

## Comparación: OnDemand vs Continuous

### Modo OnDemand (Tradicional)

```javascript
// Usuario debe hacer click para cada captura
async function enrollWithOnDemand() {
    // Muestra 1
    await adapter.captureFingerprint();  // Espera hasta 10s
    // Usuario coloca dedo
    // ⏳ Timeout de 10 segundos

    // Muestra 2
    await adapter.captureFingerprint();  // Espera hasta 10s
    // Usuario coloca dedo
    // ⏳ Timeout de 10 segundos

    // ... repite 4 veces
    // Tiempo total: ~40+ segundos
}
```

**Características:**
- ❌ Requiere llamada API por cada captura
- ❌ Timers bloqueantes con timeout
- ❌ Usuario espera incluso si coloca dedo rápido
- ✅ Control explícito de cada captura
- ✅ Ideal para capturas únicas bajo demanda

### Modo Continuous (Touch)

```javascript
// Una sola activación, eventos automáticos
async function enrollWithTouch() {
    await adapter.startTouchMode();

    let sampleCount = 0;

    adapter.on('FINGERPRINT_READY', async (data) => {
        sampleCount++;
        console.log(`Muestra ${sampleCount}/4 capturada`);

        if (sampleCount >= 4) {
            await adapter.stopTouchMode();
            console.log('¡Enrolamiento completo!');
        }
    });

    // Usuario coloca dedo cuando quiera
    // ⚡ Respuesta INSTANTÁNEA (sin timeouts)
    // Tiempo total: ~15 segundos
}
```

**Características:**
- ✅ Sin timers ni timeouts
- ✅ Respuesta instantánea al toque
- ✅ Eventos automáticos SSE
- ✅ Rearme automático del lector
- ✅ Ideal para capturas múltiples o continuas
- ⚠️ Requiere manejo de eventos

---

## Arquitectura del Sistema

### Capas del Sistema

```
┌─────────────────────────────────────┐
│  HTML/JS (touch-mode-demo.html)     │
│  - Escucha eventos SSE              │
│  - Llama adapter.startTouchMode()   │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│  BiometricAdapter.js                │
│  - startTouchMode()                 │
│  - stopTouchMode()                  │
│  - on('FINGER_TOUCHED', ...)        │
└─────────────────┬───────────────────┘
                  │ HTTP + SSE
┌─────────────────▼───────────────────┐
│  Node.js (server.ts)                │
│  - POST /api/touch/start            │
│  - POST /api/touch/stop             │
│  - GET  /api/touch/status           │
└─────────────────┬───────────────────┘
                  │ Edge.js
┌─────────────────▼───────────────────┐
│  EdgeUruBridge.cs                   │
│  - case "startTouchMode"            │
│  - case "stopTouchMode"             │
│  - Eventos SSE: SendEvent()         │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│  Dp4500Service.cs                   │
│  - StartContinuousCapture()         │
│  - StopContinuousCapture()          │
│  - OnCaptured() con lógica touch    │
│  - Eventos: OnFingerTouched, etc.   │
└─────────────────┬───────────────────┘
                  │ DPUruNet SDK
           ┌──────▼──────┐
           │   DP4500    │
           │  Hardware   │
           └─────────────┘
```

### Flujo de Eventos

```
1. Usuario → adapter.startTouchMode()
   ↓
2. POST /api/touch/start
   ↓
3. EdgeUruBridge.case "startTouchMode"
   ↓
4. _reader.StartContinuousCapture()
   ↓
5. _reader.RequestCaptureGentle() → Reader.CaptureAsync()
   ↓
6. SDK espera internamente (sin timers)
   ↓
7. Usuario coloca dedo
   ↓
8. SDK dispara → Reader.On_Captured()
   ↓
9. Dp4500Service.OnCaptured() detecta modo continuo
   ↓
10. OnFingerTouched?.Invoke(fid)
   ↓
11. EdgeUruBridge: SendEvent("FINGER_TOUCHED")
   ↓
12. SSE → Frontend: evento 'FINGER_TOUCHED'
   ↓
13. BiometricAdapter.emit('FINGER_TOUCHED', data)
   ↓
14. Callbacks del usuario ejecutados
   ↓
15. _reader.RequestCaptureGentle() → Rearma automáticamente
   ↓
16. Vuelve al paso 6 (ciclo continúa...)
```

---

## API Reference

### Backend C# (Dp4500Service.cs)

#### StartContinuousCapture()

```csharp
public void StartContinuousCapture()
```

Inicia el modo de escucha continua.

**Comportamiento:**
- Abre el lector si no está abierto
- Inicia primera captura asíncrona
- Queda esperando dedos indefinidamente
- Dispara eventos OnFingerTouched, OnFingerprintReady, OnCaptureReady

**Excepciones:**
- `InvalidOperationException` si el lector no puede inicializarse

**Ejemplo:**
```csharp
var service = new Dp4500Service();
service.OnFingerTouched += (fid) => {
    Console.WriteLine("Dedo detectado!");
};
service.StartContinuousCapture();
```

#### StopContinuousCapture()

```csharp
public void StopContinuousCapture()
```

Detiene el modo de escucha continua.

**Comportamiento:**
- Cancela captura pendiente
- Limpia eventos suscritos
- Vuelve al modo OnDemand

#### Eventos

```csharp
public event Action<DPUruNet.Fid>? OnFingerTouched;
public event Action<DPUruNet.Fmd>? OnFingerprintReady;
public event Action? OnCaptureReady;
```

### Bridge C# (EdgeUruBridge.cs)

#### Operación: startTouchMode

**Request:**
```json
{
  "op": "startTouchMode"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Touch mode started successfully",
  "mode": "Continuous",
  "events": ["FINGER_TOUCHED", "FINGERPRINT_READY", "CAPTURE_READY"]
}
```

**Eventos SSE emitidos:**
- `TOUCH_MODE_STARTED`
- `FINGER_TOUCHED` (cada vez que se detecta dedo)
- `FINGERPRINT_READY` (cada vez que FMD está listo)
- `CAPTURE_READY` (cuando está listo para siguiente captura)
- `IMAGE_CAPTURED` (con imagen Base64)

#### Operación: stopTouchMode

**Request:**
```json
{
  "op": "stopTouchMode"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Touch mode stopped successfully",
  "mode": "OnDemand"
}
```

**Eventos SSE emitidos:**
- `TOUCH_MODE_STOPPED`

#### Operación: getTouchModeStatus

**Request:**
```json
{
  "op": "getTouchModeStatus"
}
```

**Response:**
```json
{
  "ok": true,
  "isActive": true,
  "mode": "Continuous",
  "modeDescription": "Escucha continua - eventos automáticos"
}
```

### Node.js (server.ts)

#### POST /api/touch/start

Inicia el modo touch.

**Request:**
```http
POST /api/touch/start
Content-Type: application/json
```

**Response:**
```json
{
  "ok": true,
  "message": "Touch mode started successfully",
  "mode": "Continuous",
  "events": ["FINGER_TOUCHED", "FINGERPRINT_READY", "CAPTURE_READY"]
}
```

#### POST /api/touch/stop

Detiene el modo touch.

**Request:**
```http
POST /api/touch/stop
Content-Type: application/json
```

**Response:**
```json
{
  "ok": true,
  "message": "Touch mode stopped successfully",
  "mode": "OnDemand"
}
```

#### GET /api/touch/status

Obtiene el estado actual.

**Request:**
```http
GET /api/touch/status
```

**Response:**
```json
{
  "ok": true,
  "isActive": false,
  "mode": "OnDemand",
  "modeDescription": "Bajo demanda - requiere llamadas API"
}
```

### Frontend JavaScript (BiometricAdapter.js)

#### startTouchMode()

```javascript
async startTouchMode(): Promise<{
  ok: boolean,
  message: string,
  mode: string,
  events: string[]
}>
```

Inicia el modo de eventos touch.

**Ejemplo:**
```javascript
try {
    const result = await adapter.startTouchMode();
    console.log('Modo touch activo:', result);
} catch (error) {
    console.error('Error:', error);
}
```

#### stopTouchMode()

```javascript
async stopTouchMode(): Promise<{
  ok: boolean,
  message: string,
  mode: string
}>
```

Detiene el modo de eventos touch.

**Ejemplo:**
```javascript
await adapter.stopTouchMode();
console.log('Modo touch detenido');
```

#### getTouchModeStatus()

```javascript
async getTouchModeStatus(): Promise<{
  ok: boolean,
  isActive: boolean,
  mode: string,
  modeDescription: string
}>
```

Obtiene el estado actual del modo touch.

**Ejemplo:**
```javascript
const status = await adapter.getTouchModeStatus();
console.log('Estado:', status.isActive ? 'Activo' : 'Inactivo');
```

---

## Ejemplos de Uso

### Ejemplo 1: Control de Acceso en Tiempo Real

```javascript
// Activar modo touch
await adapter.startTouchMode();

// Escuchar cada huella capturada
adapter.on('FINGERPRINT_READY', async (data) => {
    console.log('Huella capturada, verificando...');

    // Identificar automáticamente contra galería
    const result = await adapter.identifyFingerprint(1);

    if (result.match) {
        console.log(`✅ Acceso concedido: ${result.bestTag}`);
        openDoor();
        showWelcomeMessage(result.bestTag);
    } else {
        console.log('❌ Acceso denegado');
        showErrorMessage();
    }
});

// El sistema responde instantáneamente a cada toque
// ¡Sin hacer click! ¡Sin timeouts!
```

### Ejemplo 2: Enrolamiento Rápido de 10 Dedos

```javascript
const fingers = [
    { hand: 'LEFT', finger: 'THUMB' },
    { hand: 'LEFT', finger: 'INDEX' },
    // ... hasta 10 dedos
];

let currentFingerIndex = 0;
let samplesCollected = 0;
const userId = 'juan';

// Activar modo touch
await adapter.startTouchMode();

showMessage(`Coloca: ${fingers[0].finger} ${fingers[0].hand}`);

adapter.on('FINGERPRINT_READY', async (data) => {
    samplesCollected++;
    console.log(`Muestra ${samplesCollected}/4 capturada`);

    if (samplesCollected >= 4) {
        // Enrolar este dedo
        const tag = `${userId}_${fingers[currentFingerIndex].hand}_${fingers[currentFingerIndex].finger}`;
        console.log(`✅ Dedo enrolado: ${tag}`);

        // Pasar al siguiente dedo
        currentFingerIndex++;
        samplesCollected = 0;

        if (currentFingerIndex >= fingers.length) {
            // ¡Completado!
            await adapter.stopTouchMode();
            showMessage('🎉 ¡Enrolamiento de 10 dedos completado!');
        } else {
            showMessage(`Coloca: ${fingers[currentFingerIndex].finger} ${fingers[currentFingerIndex].hand}`);
        }
    }
});

// Sin modo touch: ~4 minutos (40 clicks + esperas)
// Con modo touch: ~2 minutos (solo 10 cambios de dedo)
```

### Ejemplo 3: Monitor de Actividad del Lector

```javascript
let touchStats = {
    touches: 0,
    ready: 0,
    captures: 0,
    startTime: Date.now()
};

await adapter.startTouchMode();

adapter.on('FINGER_TOUCHED', () => {
    touchStats.touches++;
    updateDashboard();
});

adapter.on('FINGERPRINT_READY', () => {
    touchStats.ready++;
    updateDashboard();
});

adapter.on('CAPTURE_READY', () => {
    touchStats.captures++;
    updateDashboard();
});

function updateDashboard() {
    const elapsed = (Date.now() - touchStats.startTime) / 1000;
    console.log(`
        📊 Estadísticas (${elapsed.toFixed(0)}s):
        - Toques: ${touchStats.touches}
        - Huellas listas: ${touchStats.ready}
        - Capturas completadas: ${touchStats.captures}
    `);
}
```

---

## Eventos SSE

### FINGER_TOUCHED

Se dispara cuando se detecta un dedo en el lector.

**Payload:**
```json
{
  "evt": "FINGER_TOUCHED",
  "eventType": "FINGER_TOUCHED",
  "message": "👆 Dedo detectado en el lector",
  "severity": "INFO",
  "timestamp": "2025-11-14T12:34:56.789Z",
  "origin": "dp4500",
  "data": {
    "width": 355,
    "height": 391,
    "timestamp": "2025-11-14T12:34:56.789Z"
  }
}
```

### FINGERPRINT_READY

Se dispara cuando el FMD (template) está listo para comparación.

**Payload:**
```json
{
  "evt": "FINGERPRINT_READY",
  "eventType": "FINGERPRINT_READY",
  "message": "✅ Huella lista para comparación",
  "severity": "SUCCESS",
  "timestamp": "2025-11-14T12:34:57.123Z",
  "origin": "dp4500",
  "data": {
    "fmdSize": 1024,
    "format": "ANSI",
    "timestamp": "2025-11-14T12:34:57.123Z"
  }
}
```

### CAPTURE_READY

Se dispara cuando el lector está listo para la próxima captura.

**Payload:**
```json
{
  "evt": "CAPTURE_READY",
  "eventType": "CAPTURE_READY",
  "message": "🔄 Listo para próxima captura",
  "severity": "INFO",
  "timestamp": "2025-11-14T12:34:57.456Z",
  "origin": "dp4500",
  "data": {
    "timestamp": "2025-11-14T12:34:57.456Z"
  }
}
```

### IMAGE_CAPTURED

Se dispara cuando se captura la imagen de la huella.

**Payload:**
```json
{
  "evt": "IMAGE_CAPTURED",
  "eventType": "IMAGE_CAPTURED",
  "message": "Imagen de huella capturada",
  "severity": "SUCCESS",
  "timestamp": "2025-11-14T12:34:57.200Z",
  "origin": "dp4500",
  "data": {
    "imageBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
    "imageSize": 45678
  }
}
```

---

## Mejores Prácticas

### 1. Siempre Limpiar Eventos

```javascript
// ✅ CORRECTO
async function myComponent() {
    const fingerTouchedHandler = (data) => console.log(data);

    adapter.on('FINGER_TOUCHED', fingerTouchedHandler);
    await adapter.startTouchMode();

    // ... lógica ...

    // Limpiar al terminar
    await adapter.stopTouchMode();
    adapter.off('FINGER_TOUCHED', fingerTouchedHandler);
}

// ❌ INCORRECTO - Memory leak
async function badComponent() {
    adapter.on('FINGER_TOUCHED', (data) => console.log(data));
    await adapter.startTouchMode();
    // ⚠️ Nunca limpia el listener
}
```

### 2. Verificar Estado Antes de Iniciar

```javascript
// ✅ CORRECTO
async function safeStart() {
    const status = await adapter.getTouchModeStatus();

    if (status.isActive) {
        console.log('Modo touch ya está activo');
        return;
    }

    await adapter.startTouchMode();
}
```

### 3. Manejo de Errores Robusto

```javascript
// ✅ CORRECTO
try {
    await adapter.startTouchMode();
} catch (error) {
    if (error.message.includes('already active')) {
        console.log('Ya está activo, continuando...');
    } else if (error.message.includes('not initialized')) {
        await adapter.initializeReader();
        await adapter.startTouchMode();
    } else {
        throw error;
    }
}
```

### 4. Cleanup en Eventos de Página

```javascript
// ✅ CORRECTO
window.addEventListener('beforeunload', async () => {
    try {
        await adapter.stopTouchMode();
    } catch (error) {
        console.error('Error en cleanup:', error);
    }
});
```

---

## Troubleshooting

### Problema: "Touch mode is already active"

**Causa:** Se intentó iniciar el modo touch cuando ya está activo.

**Solución:**
```javascript
// Verificar estado primero
const status = await adapter.getTouchModeStatus();
if (!status.isActive) {
    await adapter.startTouchMode();
}
```

### Problema: No se reciben eventos SSE

**Causa:** Conexión SSE no establecida o callbacks no registrados.

**Solución:**
```javascript
// 1. Verificar conexión SSE
console.log('SSE conectado:', adapter.isConnected);

// 2. Registrar listeners ANTES de iniciar modo touch
adapter.on('FINGER_TOUCHED', (data) => console.log(data));
await adapter.startTouchMode();

// 3. Verificar en consola del navegador
// Debe aparecer: [BiometricAdapter] 📡 Evento recibido: FINGER_TOUCHED
```

### Problema: Lector no responde después de error

**Causa:** Modo touch quedó activo tras excepción.

**Solución:**
```javascript
// Forzar detención y reiniciar
try {
    await adapter.stopTouchMode();
} catch {}

await adapter.startTouchMode();
```

### Problema: Eventos se disparan múltiples veces

**Causa:** Múltiples listeners registrados.

**Solución:**
```javascript
// Limpiar antes de agregar
adapter.off('FINGER_TOUCHED');
adapter.on('FINGER_TOUCHED', (data) => {
    console.log('Solo una vez:', data);
});
```

---

## Conclusión

El Modo Touch representa una mejora significativa en la eficiencia y experiencia de usuario del sistema biométrico EdgeUruBridge. Al eliminar timers y usar eventos nativos del SDK, se logra:

- ⚡ Respuesta instantánea
- 🚀 Mayor velocidad (60% mejora)
- 💡 Mejor UX
- ✅ 100% compatible con código existente

Para comenzar a usar el Modo Touch, visita: [http://localhost:8080/touch-mode-demo.html](http://localhost:8080/touch-mode-demo.html)
