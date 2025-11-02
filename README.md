# EdgeUruBridgeCore - Sistema Biométrico DP4500

Sistema completo de captura, enrolamiento, verificación e identificación de huellas dactilares utilizando el lector DP4500 con integración Node.js + Edge.js + .NET Framework.

## 🌟 Características Principales

### Operaciones Biométricas
- **📝 Enrolamiento**: Registro de nuevos usuarios con captura de 4 muestras y control de calidad automático
- **✅ Verificación 1:1**: Verificación de identidad contra huellas enroladas específicas
- **🔍 Identificación 1:N**: Identificación de huellas desconocidas contra toda la galería
- **📸 Captura Simple**: Captura individual de huellas sin enrolamiento
- **🖐️ Gestión de Dedos**: Sistema avanzado de identificación por dedo específico (Pulgar, Índice, Medio, Anular, Meñique) por mano (Izquierda/Derecha)

### Funcionalidades Avanzadas
- **⚡ Eventos en Tiempo Real**: Actualización instantánea de progreso, imágenes y estado mediante Server-Sent Events (SSE)
- **🎨 Interfaz Modular**: Sistema de componentes reutilizables con arquitectura desacoplada
- **📊 Gestión de Plantillas**: Administración completa de plantillas biométricas almacenadas
- **🔧 Control de Dispositivo**: Inicialización, configuración y monitoreo del lector DP4500
- **📋 Logging en Vivo**: Sistema de logs en tiempo real con múltiples niveles de detalle
- **🏷️ Tags Estructurados**: Sistema de identificación por tag con formato `userId_HAND_FINGER` (ej: `juan_LEFT_THUMB`, `maria_RIGHT_INDEX`)
- **👐 Multibiometría**: Soporte completo para hasta 10 dedos por usuario (5 dedos × 2 manos)

### Experiencia de Usuario
- **🎯 Interfaz Responsive**: Diseño moderno adaptable a diferentes resoluciones
- **🔄 Progreso Visual**: Barras de progreso animadas y contadores en tiempo real
- **🎨 Feedback Inmediato**: Indicadores visuales de estado y resultados
- **⚠️ Validaciones Inteligentes**: Verificación de estado del lector antes de cada operación

---

## ⚠️ Funcionalidad Removida (Histórico)

### Detección de Dedo en Tiempo Real
**Fecha de eliminación**: 2025-11-01
**Commit de respaldo**: `441894f`
**Documentación completa**: [FINGER-DETECTION-COMPLETE.md](./docs/FINGER-DETECTION-COMPLETE.md)

La funcionalidad de **detección de dedo en tiempo real** (finger touch/release monitoring) fue implementada y posteriormente removida del proyecto. Esta funcionalidad incluía:

- Monitoreo continuo de presencia de dedo en el sensor (polling cada 200ms)
- Dos modos de implementación:
  - **Modo 1**: DPUruNet SDK con polling de `Reader.Status.FingerDetected`
  - **Modo 2**: DigitalPersona Web SDK con eventos nativos
- Eventos SSE: `FINGER_PLACED`, `FINGER_REMOVED`
- Interfaz de monitoreo en tiempo real

**Razón de la eliminación**: Se implementó como prueba de concepto y respaldo histórico. La funcionalidad está completamente documentada y puede ser recuperada del historial de git si es necesaria en el futuro.

**Para recuperar esta funcionalidad**:
```bash
# Checkout del commit con la implementación completa
git checkout 441894f

# O ver la documentación completa sin cambiar de rama
git show 441894f:docs/FINGER-DETECTION-COMPLETE.md
```

---

## 📋 Requisitos del Sistema

### Hardware
- **Lector DP4500**: DigitalPersona U.are.U 4500 (conectado vía USB 2.0)
- **Sistema Operativo**: Windows 7/8/10/11 (32-bit o 64-bit)
- **Puerto USB**: USB 2.0 o superior

### Software
- **Node.js**: Versión x86 (32-bit) - [Descargar](https://nodejs.org/)
  ```bash
  # Verificar versión instalada
  node --version  # Debe mostrar v16.x.x o superior (32-bit)
  ```
- **.NET Framework**: 4.7.2 o superior - [Descargar](https://dotnet.microsoft.com/download/dotnet-framework)
- **SDK de .NET**: .NET Framework 4.7.2 Targeting Pack

### DLL Dependencies
Coloca los siguientes archivos en el directorio `bin-deps/`:
- `DPUruNet.dll` - SDK de DigitalPersona
- `dpfpdd.dll` - Driver del dispositivo
- `dpfj.dll` - Motor de comparación

> **Nota**: Estos archivos se obtienen del SDK de DigitalPersona U.are.U

---

## 🚀 Instalación y Configuración

### 1. Clonar el Repositorio
```bash
git clone https://github.com/devcicm/edge-uru-ui.git
cd edge-uru-ui
git checkout EdgeUruBridgeCore  # Rama principal
```

### 2. Instalar Dependencias de Node.js
```bash
cd node
npm install
```

### 3. Compilar el Bridge de C#
```bash
# Desde la raíz del proyecto
dotnet build bridge-csharp/EdgeBridge.csproj -c Release
```

La compilación generará:
- `out/net472/bridge-csharp.dll`
- `out/net472/bridge-csharp.pdb`

### 4. Verificar DLL Dependencies
Asegúrate de que `bin-deps/` contenga:
```
bin-deps/
├── DPUruNet.dll
├── dpfpdd.dll
└── dpfj.dll
```

### 5. Build del Servidor TypeScript (Opcional)
```bash
cd node
npm run build
```

---

## ▶️ Ejecución de la Aplicación

### Iniciar el Servidor
```bash
cd node
npm start
```

El servidor se iniciará en: **http://localhost:8080**

### Logs de Inicio Esperados
```
[SERVER] 🚀 Servidor iniciando...
[SERVER] 📂 Sirviendo archivos estáticos desde: C:\...\node\public
[SERVER] ✅ Servidor escuchando en http://localhost:8080
[SERVER] 📡 SSE endpoint listo en /events
```

### Abrir la Interfaz Web
Navega a: http://localhost:8080/demo-avance.html

---

## 📖 Guía de Uso

### Inicialización del Sistema (Obligatorio)

1. **Encender el Lector** (ReaderControl):
   - Presiona el botón "Encender Lector"
   - Espera el mensaje: ✅ Lector DP4500 encendido
   - El status bar debe mostrar: "✅ Lector DP4500 encendido - Sistema listo"

> ⚠️ **IMPORTANTE**: Todas las operaciones requieren que el lector esté encendido primero

### Operaciones Biométricas

#### 📝 Enrolamiento de Usuario

1. **Ingresar ID de Usuario**:
   - Campo: "ID del Usuario"
   - Ejemplo: `Usuario001`, `John_Doe`, `Empleado_123`

2. **Iniciar Enrolamiento**:
   - Presiona "Iniciar Enrolamiento"
   - El sistema solicitará **4 muestras** del mismo dedo

3. **Captura de Muestras**:
   - Coloca el dedo cuando se solicite
   - Mantén el dedo quieto hasta ver confirmación
   - Progreso visual: `1/4 → 2/4 → 3/4 → 4/4`
   - Barra de progreso: `0% → 25% → 50% → 75% → 100%`

4. **Resultado**:
   - ✅ Éxito: "Enrolamiento completado exitosamente"
   - ❌ Error: Se mostrará el motivo (calidad baja, timeout, etc.)

#### ✅ Verificación 1:1

1. **Seleccionar Usuario**:
   - Despliega el menú de usuarios enrolados
   - Selecciona el usuario a verificar

2. **Verificar**:
   - Presiona "Verificar Usuario Seleccionado"
   - Coloca el dedo en el lector

3. **Resultado**:
   - ✅ VERIFICADO: Huella coincide con el usuario seleccionado
   - ❌ NO COINCIDE: Huella no pertenece al usuario
   - Score de comparación mostrado

#### 🔍 Identificación 1:N

1. **Iniciar Identificación**:
   - Presiona "Identificar 1:N"
   - El sistema buscará en toda la galería

2. **Capturar Huella**:
   - Coloca el dedo cuando se solicite
   - El sistema compara contra todos los usuarios

3. **Resultado**:
   - ✅ IDENTIFICADO: "Usuario_XXX" (con score)
   - ⚠️ NO MATCH: No se encontraron coincidencias

#### 📸 Captura Simple

1. **Capturar**:
   - Presiona "Capturar"
   - Coloca el dedo en el lector

2. **Resultado**:
   - Imagen de la huella capturada
   - Template FMD generado (base64)

#### 🖐️ Gestión de Dedos por Mano (FingerManagementControl)

**Sistema avanzado para gestión biométrica por dedo específico**

1. **Enrolamiento por Dedo**:
   - **Usuario**: Ingresa ID del usuario (ej: `juan`, `maria`)
   - **Mano**: Selecciona Izquierda o Derecha
   - **Dedo**: Selecciona entre Pulgar, Índice, Medio, Anular o Meñique
   - **Presiona**: "Enrolar Dedo Seleccionado"
   - **Tag generado**: `userId_HAND_FINGER` (ej: `juan_LEFT_THUMB`)

2. **Verificación por Dedo**:
   - Selecciona usuario, mano y dedo específicos
   - Presiona "Verificar Dedo"
   - Coloca el dedo correspondiente
   - **Resultado**: Verificación contra ese dedo específico

3. **Identificación Inteligente**:
   - Presiona "Identificar Dedo"
   - Coloca cualquier dedo enrolado
   - **Resultado**: Usuario + Mano + Dedo identificados
   - **Ejemplo**: `✅ IDENTIFICADO: juan | Índice 👈 Izquierda (Score: 98.5)`

4. **Visualización de Dedos Enrolados**:
   - Lista organizada por usuario
   - Agrupada por mano (Izquierda/Derecha)
   - Emojis representativos por dedo:
     - 👍 Pulgar
     - ☝️ Índice
     - 🖕 Medio
     - 💍 Anular
     - 🤙 Meñique

**Ventajas del Sistema de Dedos:**
- ✅ Hasta 10 huellas por usuario (redundancia)
- ✅ Identificación precisa de qué dedo se usó
- ✅ Verificación específica contra dedo correcto
- ✅ Gestión completa de multibiometría
- ✅ Tags estructurados y fáciles de parsear

### Gestión de Plantillas (TemplateManagerControl)

- **Cargar Plantillas**: Ver todas las plantillas almacenadas
- **Filtrado**: Por tipo de formato (DP_REGISTRATION, DP_VERIFICATION, ANSI, etc.)
- **Información**: Tag, formato, tamaño, SHA-1, fecha
- **Limpiar**: Eliminar todas las plantillas (⚠️ irreversible)

---

## 🏗️ Arquitectura del Sistema

### Diagrama de Alto Nivel

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Browser)                            │
│                                                                   │
│  demo-avance.html                                                │
│       ├── ComponentFactory (Auto-inicialización)                 │
│       ├── EnrollmentControl                                      │
│       ├── VerificationControl                                    │
│       ├── SimpleCaptureControl                                   │
│       ├── TemplateManagerControl                                 │
│       ├── ReaderControl                                          │
│       └── BiometricAdapter (SSE Client)                          │
│                                                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTP + Server-Sent Events (SSE)
                         │ Real-time biometric events
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                   NODE.JS SERVER (server.ts)                     │
│                                                                   │
│  Express.js                                                      │
│       ├── API Routes (/api/*)                                    │
│       ├── SSE Bridge (/events)                                   │
│       └── Edge.js Callback Handler                               │
│                                                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Edge.js Bridge (V8 ↔ CLR)
                         │ Async with Task.Run()
                         │
┌────────────────────────▼────────────────────────────────────────┐
│              C# BACKEND (.NET Framework 4.7.2)                   │
│                                                                   │
│  EdgeUruBridge.cs (Edge.js Interface)                            │
│       ├── Bootstrap & Init                                       │
│       ├── Enroll / Verify / Identify                             │
│       ├── Event Emission (SSE)                                   │
│       └── Template Store Management                              │
│                                                                   │
│  Dp4500Service.cs (Core Biometric Logic)                         │
│       ├── Enroll3() - 4 samples enrollment                       │
│       ├── VerifyLiveAgainstReg() - 1:1 verification              │
│       ├── IdentifyLive1N() - 1:N identification                  │
│       ├── SingleCapture() - Simple capture                       │
│       └── DPUruNet SDK Integration                               │
│                                                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ DPUruNet SDK API
                         │
                  ┌──────▼──────┐
                  │   DP4500    │
                  │   Hardware  │
                  └─────────────┘
```

### Arquitectura de Eventos en Tiempo Real

**Flujo de Eventos SSE:**

```
Backend C# (SendEvent)
    ↓
Edge.js Callback
    ↓
SseBridge (Node.js)
    ↓
EventSource (/events)
    ↓
BiometricAdapter.emit()
    ↓
Component Listeners (EnrollmentControl, etc.)
    ↓
UI Update (Real-time)
```

**Eventos Principales:**
- `READER_READY` - Lector inicializado
- `ENROLLMENT_STARTED` - Inicio de enrolamiento
- `SAMPLE_COLLECTED` - Muestra capturada (1/4, 2/4, etc.)
- `IMAGE_CAPTURED` - Imagen de huella disponible
- `ENROLLMENT_COMPLETED` - Enrolamiento exitoso
- `VERIFICATION_SUCCESS/FAILED` - Resultado de verificación
- `IDENTIFICATION_MATCH/NO_MATCH` - Resultado de identificación

> **Documentación Detallada**: Ver [SOLUCION-EVENTOS-TIEMPO-REAL.md](./docs/SOLUCION-EVENTOS-TIEMPO-REAL.md)

---

## 📁 Estructura del Proyecto

```
edge-uru-ui/
│
├── bridge-csharp/                    # C# .NET Bridge
│   ├── src/
│   │   ├── Bridge/
│   │   │   └── EdgeUruBridge.cs      # Interface Edge.js + Event handling
│   │   └── Core/
│   │       └── Dp4500Service.cs      # Core biometric operations
│   └── EdgeBridge.csproj             # Project file
│
├── node/                             # Node.js Server
│   ├── public/
│   │   ├── demo-avance.html          # Main UI (recommended)
│   │   ├── index.html                # Simple panel (legacy)
│   │   ├── js/
│   │   │   ├── adapter/
│   │   │   │   └── BiometricAdapter.js     # SSE client & API wrapper
│   │   │   ├── components/
│   │   │   │   ├── BaseComponent.js        # Base class for all controls
│   │   │   │   └── ComponentFactory.js     # Auto-initialization & creation
│   │   │   └── controls/
│   │   │       ├── EnrollmentControl.js    # Enrollment UI
│   │   │       ├── VerificationControl.js  # Verification 1:1 & 1:N
│   │   │       ├── SimpleCaptureControl.js # Simple capture
│   │   │       ├── TemplateManagerControl.js # Template management
│   │   │       ├── FingerManagementControl.js # Finger-by-hand management
│   │   │       ├── ReaderControl.js        # Reader initialization
│   │   │       ├── LogDeviceControl.js     # Live logging
│   │   │       └── TechDeviceControl.js    # Device info
│   │   └── css/
│   │       └── styles.css              # Shared styles
│   ├── server.ts                       # Express server + API endpoints
│   ├── sseBridge.ts                    # Server-Sent Events bridge
│   └── package.json                    # Dependencies
│
├── bin-deps/                           # Native DLL files
│   ├── DPUruNet.dll
│   ├── dpfpdd.dll
│   └── dpfj.dll
│
├── out/net472/                         # Compiled C# output
│   ├── bridge-csharp.dll
│   └── bridge-csharp.pdb
│
├── docs/                               # Documentation files
│   ├── ARQUITECTURA-EVENTOS.md        # Event architecture documentation
│   ├── SOLUCION-EVENTOS-TIEMPO-REAL.md # Real-time events solution
│   ├── FINGER-DETECTION-COMPLETE.md   # Finger detection (historical)
│   ├── ALMACENAMIENTO-ESTRUCTURADO.md # Structured storage documentation
│   ├── frontend/
│   │   └── COMPONENTES-MODULARES.md   # Modular components system
│   └── investigacion/
│       └── SCRIPTS-INVESTIGACION-SDK.md # SDK investigation scripts
│
└── README.md                           # This file
```

---

## 🔌 API Endpoints

### System Control
| Endpoint | Method | Descripción |
|----------|--------|-------------|
| `/api/bootstrap` | POST | Inicializar librerías nativas |
| `/api/init` | POST | Inicializar lector de huellas |
| `/api/dispose` | POST | Liberar recursos |
| `/api/reader-info` | GET | Obtener información del dispositivo DP4500 |
| `/api/store-stats` | GET | Obtener estadísticas del almacenamiento en RAM |

### Fingerprint Operations
| Endpoint | Method | Descripción | Parámetros |
|----------|--------|-------------|------------|
| `/api/single` | POST | Captura simple sin enrolar | `{ timeoutMs?: number }` |
| `/api/enroll` | POST | Enrolar nueva huella (4 muestras) | `{ tag?: string, timeoutMs?: number, targetFarn?: number, maxRetriesPerSample?: number, maxSamples?: number }` |
| `/api/enroll-all-fingers` | POST | Enrolar todos los dedos (10 dedos) | `{ userId: string, timeoutPerFingerMs?: number, targetFarn?: number, maxRetriesPerSample?: number, maxSamples?: number }` |
| `/api/verify` | POST | Verificar 1:1 contra usuario (multi-intento) | `{ tag: string, timeoutMs?: number, targetFarn?: number, maxAttempts?: number }` |
| `/api/identify` | POST | Identificar 1:N en galería (multi-intento) | `{ timeoutMs?: number, targetFarn?: number, top?: number, maxAttempts?: number }` |

### Gallery Management
| Endpoint | Method | Descripción |
|----------|--------|-------------|
| `/api/store` | GET | Listar todas las plantillas almacenadas en RAM |
| `/api/store` | DELETE | Limpiar toda la galería (elimina todas las huellas de RAM) |

### Real-time Events
| Endpoint | Method | Descripción |
|----------|--------|-------------|
| `/events` | GET | Server-Sent Events stream |

---

## 🎨 Componentes del Frontend

### Sistema de Componentes Modular

Todos los componentes heredan de `BaseComponent` y se auto-registran con `ComponentFactory`.

#### EnrollmentControl
- **Propósito**: Enrolamiento de usuarios con 4 muestras
- **Características**:
  - Progreso visual (barra + contador + indicadores)
  - Validación de lector antes de operar
  - Eventos: `enrolled`, `cleared`
  - Auto-limpieza después de completar

#### VerificationControl
- **Propósito**: Verificación 1:1 e Identificación 1:N
- **Características**:
  - Tabs para ambas operaciones
  - Lista de usuarios filtrada (solo DP_REGISTRATION)
  - Contador de plantillas disponibles
  - Eventos: `verified`, `identified`

#### SimpleCaptureControl
- **Propósito**: Captura simple de huella
- **Características**:
  - Captura sin enrolamiento
  - Generación de FMD template
  - Visualización de imagen
  - Evento: `captured`

#### TemplateManagerControl
- **Propósito**: Gestión de plantillas almacenadas
- **Características**:
  - Tabla con información detallada
  - Filtrado por formato
  - Refresh manual
  - Clear all (con confirmación)
  - Eventos: `templatesLoaded`, `templatesCleared`

#### ReaderControl
- **Propósito**: Control del dispositivo DP4500
- **Características**:
  - Encender/Apagar lector
  - Estado visual (ON/OFF)
  - Eventos: `readerInitialized`, `readerDisposed`

#### LogDeviceControl
- **Propósito**: Logging en tiempo real
- **Características**:
  - Logs categorizados por tipo
  - Auto-scroll
  - Límite de 500 mensajes
  - Clear logs

#### TechDeviceControl
- **Propósito**: Información técnica del DP4500
- **Características**:
  - Especificaciones del dispositivo (Modelo, Serie, Firmware)
  - Capacidades (Resolución, Área de captura, Profundidad)
  - Información del sistema (Driver, SDK, Plataforma)
  - Exportación de información a JSON

#### FingerManagementControl
- **Propósito**: Gestión avanzada de huellas por dedo y mano
- **Características**:
  - Selectores de mano (Izquierda/Derecha) y dedo (Pulgar-Meñique)
  - Tags estructurados: `userId_HAND_FINGER`
  - Enrolamiento por dedo específico (4 muestras)
  - Verificación contra dedo y mano específicos
  - Identificación inteligente con detección de dedo
  - Visualización gráfica de ambas manos (demo-avance.html)
  - Lista de dedos enrolados con emojis
  - Soporte para 10 dedos por usuario
  - Eventos: `fingerEnrolled`, `fingerVerified`, `fingerIdentified`

**Formato de Tags:**
```javascript
// Ejemplos de tags estructurados
"juan_LEFT_THUMB"      // Juan - Pulgar izquierdo
"maria_RIGHT_INDEX"    // María - Índice derecho
"pedro_LEFT_MIDDLE"    // Pedro - Medio izquierdo
```

**Parsing de Tags:**
```javascript
// El sistema parsea automáticamente
const tag = "juan_LEFT_THUMB";
const { userId, hand, finger } = parseFingerTag(tag);
// userId: "juan", hand: "LEFT", finger: "THUMB"
```

---

## ⚙️ Configuración

### Timeouts por Operación
```javascript
{
  enroll: 60000,      // 60 segundos (captura de 4 muestras)
  verify: 60000,      // 60 segundos (verificación 1:1)
  identify: 60000,    // 60 segundos (identificación 1:N)
  single: 10000       // 10 segundos (captura simple)
}
```

### Parámetros de Calidad
```javascript
{
  targetFarn: 21474,           // ~1% false accept rate
  maxSamples: 4,               // Muestras por enrolamiento
  maxRetriesPerSample: 3       // Reintentos por muestra
}
```

### Filtrado de Plantillas
```javascript
// Solo plantillas DP_REGISTRATION son válidas para verificación
validFormats: ['DP_REGISTRATION']
```

---

## 🐛 Solución de Problemas

### Problemas Comunes

#### 1. "⚠️ Lector apagado - Enciende el lector desde ReaderControl"
**Causa**: El lector no ha sido inicializado

**Solución**:
1. Ve a ReaderControl
2. Presiona "Encender Lector"
3. Espera confirmación: ✅ Lector DP4500 encendido

#### 2. "Error: Unknown operation: getReaderInfo"
**Causa**: Backend C# no compilado o DLL desactualizada

**Solución**:
```bash
dotnet build bridge-csharp/EdgeBridge.csproj -c Release
```
Reinicia el servidor Node.js

#### 3. "No hay usuarios registrados (hay X plantillas de otros formatos)"
**Causa**: Solo hay plantillas intermedias (PRE, VER, ANSI) pero no DP_REGISTRATION

**Solución**:
- Realiza un enrolamiento completo (4 muestras)
- Esto generará una plantilla DP_REGISTRATION válida

#### 4. "❌ Error: Operación cancelada" en Identificación
**Causas Posibles**:
- Timeout excedido (no colocaste el dedo a tiempo)
- Lector no detectó el dedo correctamente
- Galería vacía

**Solución**:
- Asegúrate de colocar el dedo cuando se solicite
- Limpia el sensor
- Verifica que hay usuarios enrolados

#### 5. Botones deshabilitados después de operación
**Causa**: Evento de finalización no llegó al componente

**Solución**: Ahora solucionado con mecanismo de respaldo en EnrollmentControl
- Si persiste, recarga la página (F5)

#### 6. "Network error" en navegador
**Causas**:
- Servidor no está corriendo
- Puerto 8080 ocupado
- Firewall bloqueando

**Solución**:
```bash
# Verificar que el servidor está corriendo
cd node
npm start

# Verificar puerto
netstat -ano | findstr :8080
```

### Consejos de Performance

1. **Limpia el Sensor**:
   - Usa un paño suave y seco
   - Evita huellas de grasa

2. **Posicionamiento del Dedo**:
   - Presiona firmemente pero sin deslizar
   - Centra el dedo en el sensor
   - Mantén quieto hasta ver confirmación

3. **Iluminación**:
   - Buena iluminación ambiental
   - Evita luz directa en el sensor

4. **Calidad de Captura**:
   - Si ves errores de calidad repetidos, intenta con otro dedo
   - Asegúrate de que el dedo esté limpio y seco

---

## 🔧 Desarrollo

### Agregar Nuevas Funcionalidades

#### 1. Nueva Operación Biométrica (Backend C#)

**Archivo**: `bridge-csharp/src/Bridge/EdgeUruBridge.cs`

```csharp
case "miNuevaOperacion":
{
    if (_reader == null)
    {
        return new { ok = false, error = "Reader not initialized" };
    }

    try
    {
        // ✅ IMPORTANTE: Usar await Task.Run() para no bloquear Node.js
        var result = await Task.Run(() => _reader.MiOperacion(...));

        SendEvent("MI_OPERACION_COMPLETED", "Operación exitosa", "SUCCESS");

        return new { ok = true, data = result };
    }
    catch (Exception ex)
    {
        SendEvent("MI_OPERACION_FAILED", ex.Message, "ERROR");
        return new { ok = false, error = ex.Message };
    }
}
```

#### 2. Nuevo Endpoint API (Node.js)

**Archivo**: `node/server.ts`

```typescript
app.post('/api/miOperacion', async (req, res) => {
    try {
        const result = await edgeBridge.invoke({
            op: 'miNuevaOperacion',
            ...req.body
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});
```

#### 3. Nuevo Control UI (Frontend)

**Archivo**: `node/public/js/controls/MiNuevoControl.js`

```javascript
class MiNuevoControl extends BaseComponent {
    constructor(containerId, adapter, config = {}) {
        super(containerId, adapter, config);

        // Tu código de inicialización
    }

    _createStructure() {
        this.container.innerHTML = `
            <div class="mi-control">
                <!-- Tu HTML aquí -->
            </div>
        `;
    }

    async miOperacion() {
        const result = await this.adapter.apiCall('/api/miOperacion', {
            // parámetros
        });

        if (result.ok) {
            this.emit('operacionCompletada', result);
        }
    }
}

window.MiNuevoControl = MiNuevoControl;
```

#### 4. Registrar en ComponentFactory

**Archivo**: `node/public/js/components/ComponentFactory.js`

```javascript
this.componentTypes.set('minuevocontrol', {
    class: MiNuevoControl,
    description: 'Descripción de mi control',
    defaultConfig: {
        // configuración por defecto
    }
});
```

### Testing

#### Test Manual de SSE
```javascript
// En consola del navegador
const eventSource = new EventSource('/events');
eventSource.onmessage = (event) => {
    console.log('SSE:', JSON.parse(event.data));
};
```

#### Test de API
```bash
# Test de enrolamiento
curl -X POST http://localhost:8080/api/enroll \
  -H "Content-Type: application/json" \
  -d '{"userId":"TestUser001","timeoutMs":30000}'
```

### Build y Deploy

#### Build C# (Release)
```bash
dotnet build bridge-csharp/EdgeBridge.csproj -c Release
```

#### Build TypeScript
```bash
cd node
npm run build
```

#### Limpiar Build
```bash
dotnet clean bridge-csharp/EdgeBridge.csproj
rm -rf node/dist/
```

---

## 📚 Documentación Adicional

- **[ARQUITECTURA-EVENTOS.md](./docs/ARQUITECTURA-EVENTOS.md)** - Arquitectura del sistema de eventos
- **[SOLUCION-EVENTOS-TIEMPO-REAL.md](./docs/SOLUCION-EVENTOS-TIEMPO-REAL.md)** - Cómo se solucionó el problema de eventos en tiempo real
- **[COMPONENTES-MODULARES.md](./docs/frontend/COMPONENTES-MODULARES.md)** - Sistema modular de componentes
- **[ARQUITECTURA-COMPONENTES-JS.md](./docs/frontend/ARQUITECTURA-COMPONENTES-JS.md)** - Arquitectura completa de componentes JavaScript
- **[ALMACENAMIENTO-ESTRUCTURADO.md](./docs/ALMACENAMIENTO-ESTRUCTURADO.md)** - Documentación de almacenamiento estructurado
- **[FINGER-DETECTION-COMPLETE.md](./docs/FINGER-DETECTION-COMPLETE.md)** - Detección de dedo en tiempo real (histórico)

---

## 📝 Changelog

### EdgeUruBridgeCore v1.2 (Actual - 28 Octubre 2025)

**Nuevas Características Principales:**
- ✅ **FingerManagementControl**: Sistema completo de gestión de huellas por dedo y mano
  - Tags estructurados: `userId_HAND_FINGER`
  - Soporte para 10 dedos por usuario (5 dedos × 2 manos)
  - Visualización gráfica de manos con estados de dedos
  - Identificación inteligente de usuario + dedo + mano
- ✅ **TechDeviceControl Expandido**: Información técnica completa del dispositivo
  - 12 campos de información organizados en 3 secciones
  - Exportación de datos a JSON
  - Información de dispositivo, capacidades y sistema
- ✅ **Multi-intentos en Verificación/Identificación**: Parámetro `maxAttempts` (hasta 4 intentos)
- ✅ **Control 8/8 Completo**: Todos los controles implementados en ambas versiones (demo-avance.html e index.html)

**Mejoras de Funcionalidad:**
- ✅ Verificación e identificación con múltiples intentos automáticos
- ✅ Sistema de tags estructurados para multibiometría
- ✅ Parsing automático de tags para identificación precisa
- ✅ Emojis representativos para cada dedo (👍☝️🖕💍🤙)
- ✅ Lista organizada de dedos enrolados por usuario y mano
- ✅ Integración completa en frontend (index.html) y backend (server.ts)

**Correcciones:**
- 🐛 Parámetro `maxAttempts` faltante en llamadas del frontend
- 🐛 RuntimeBinderException por falta de parámetro en C#
- 🐛 Sincronización de parámetros entre frontend y backend

### EdgeUruBridgeCore v1.0 (27 Octubre 2025)

**Nuevas Características Iniciales:**
- ✅ Sistema de componentes modular con ComponentFactory
- ✅ Eventos en tiempo real con SSE
- ✅ Progreso visual en enrolamiento
- ✅ Filtrado inteligente de plantillas
- ✅ Validación de estado del lector
- ✅ Operación `single` para captura simple
- ✅ Operación `getReaderInfo` para specs del dispositivo
- ✅ Sistema de eventos custom (BaseComponent)
- ✅ TemplateManagerControl para gestión de plantillas

**Correcciones Iniciales:**
- 🐛 Botones deshabilitados en EnrollmentControl
- 🐛 Verificación 1:1 mostrando plantillas inválidas
- 🐛 Propiedad `match` vs `matched` en identificación
- 🐛 Acceso a `user.tag` case-sensitive
- 🐛 Eventos SSE bloqueados por operaciones síncronas

---

## 🤝 Contribuciones

Este proyecto está en desarrollo activo. Si encuentras bugs o tienes sugerencias:

1. Abre un [Issue](https://github.com/devcicm/edge-uru-ui/issues)
2. Describe el problema con logs y pasos para reproducir
3. Incluye información del sistema (Windows version, Node.js version)

---

## 📄 Licencia

Este proyecto es para propósitos demostrativos y educativos.

**Componentes Propietarios:**
- DigitalPersona SDK (DPUruNet) - HID Global/DigitalPersona
- DP4500 Firmware y Drivers - HID Global

---

## 👨‍💻 Autor

**Proyecto**: EdgeUruBridgeCore
**Rama Principal**: `EdgeUruBridgeCore`
**Última Actualización**: 28 de Octubre, 2025

---

## 🆘 Soporte

### Hardware y SDK
- **DigitalPersona/HID Global**: Soporte oficial del DP4500
- **DPUruNet Documentation**: Referencia del SDK

### Aplicación
- **Issues**: [GitHub Issues](https://github.com/devcicm/edge-uru-ui/issues)
- **Documentación**: Ver archivos .md en la carpeta `docs/`
- **Troubleshooting**: Sección de solución de problemas arriba

---

**Nota Importante**: Este sistema requiere un lector físico DP4500 y la instalación correcta del SDK de DigitalPersona para funcionar adecuadamente.
