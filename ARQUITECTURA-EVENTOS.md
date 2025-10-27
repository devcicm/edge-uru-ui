# Arquitectura de Eventos - EdgeUruBridgeCore

## 🎯 Resumen

El sistema utiliza **DOS sistemas de eventos independientes** con responsabilidades claramente separadas:

1. **BiometricAdapter** - Eventos SSE del backend (bajo nivel)
2. **BaseComponent** - Eventos custom del frontend (alto nivel)

**NO HAY DUPLICACIÓN**, son capas diferentes de abstracción.

---

## 📊 Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (C# + Edge.js)                        │
│                                                                   │
│  EdgeUruBridge.cs emite eventos en tiempo real:                 │
│  - READER_READY                                                  │
│  - ENROLLMENT_STARTED                                            │
│  - ENROLLMENT_COMPLETED                                          │
│  - IMAGE_CAPTURED                                                │
│  - VERIFICATION_SUCCESS                                          │
│  - etc.                                                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Server-Sent Events (SSE)
                         │ /events endpoint
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              BiometricAdapter (Capa de Transporte)               │
│                                                                   │
│  this.callbacks = new Map()                                      │
│                                                                   │
│  Métodos:                                                        │
│  - on(eventType, callback)  ← Registrar listener SSE            │
│  - emit(eventType, data)    ← Emitir evento SSE recibido        │
│                                                                   │
│  Eventos emitidos (desde backend):                               │
│  ✓ READER_READY                                                  │
│  ✓ ENROLLMENT_COMPLETED                                          │
│  ✓ IMAGE_CAPTURED                                                │
│  ✓ VERIFICATION_SUCCESS                                          │
│  ✓ * (wildcard para TODOS los eventos)                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ adapter.on('*', handler)
                         │ Componentes escuchan eventos SSE
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│             BaseComponent (Capa de Lógica de Negocio)            │
│                                                                   │
│  this.eventListeners = new Map()                                 │
│                                                                   │
│  1. Escucha eventos SSE del adapter                              │
│  2. Procesa lógica interna del componente                        │
│  3. Emite eventos custom de alto nivel                           │
│                                                                   │
│  Métodos:                                                        │
│  - on(eventType, handler)   ← Registrar listener custom         │
│  - emit(eventType, data)    ← Emitir evento custom              │
│  - off(eventType, handler)  ← Remover listener                  │
│                                                                   │
│  Eventos emitidos (custom, alto nivel):                          │
│  ✓ enrolled         (EnrollmentControl)                         │
│  ✓ verified         (VerificationControl)                       │
│  ✓ captured         (SimpleCaptureControl)                      │
│  ✓ templatesLoaded  (TemplateManagerControl)                    │
│  ✓ templatesCleared (TemplateManagerControl)                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ component.on('enrolled', handler)
                         │ Listeners externos (demo-avance.html)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Aplicación (demo-avance.html)                    │
│                                                                   │
│  components.enrollment.on('enrolled', (data) => {                │
│      console.log('Usuario enrolado:', data.userId);              │
│      // Actualizar UI global                                     │
│      // Refrescar otros componentes                              │
│  });                                                             │
│                                                                   │
│  components.verification.on('verified', (result) => {            │
│      console.log('Verificado:', result.verified);                │
│  });                                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Ejemplo Completo: Flujo de Enrolamiento

### Paso 1: Usuario hace clic en "Iniciar Enrolamiento"
```javascript
// demo-avance.html
await components.enrollment.enroll('Usuario_123');
```

### Paso 2: EnrollmentControl llama al backend
```javascript
// EnrollmentControl.js
async enroll() {
    await this.adapter.enrollFingerprint(this.userId);
    // No espera respuesta, los eventos SSE notificarán el progreso
}
```

### Paso 3: Backend procesa y envía eventos SSE
```csharp
// EdgeUruBridge.cs
SendEvent("ENROLLMENT_STARTED", "Iniciando enrolamiento", "INFO");
SendEvent("IMAGE_CAPTURED", "Imagen capturada", "SUCCESS");
SendEvent("SAMPLE_COLLECTED", "Muestra 1/4", "SUCCESS");
// ...
SendEvent("ENROLLMENT_COMPLETED", "Enrolamiento exitoso", "SUCCESS");
```

### Paso 4: BiometricAdapter recibe y distribuye eventos SSE
```javascript
// BiometricAdapter.js
_handleBackendEvent(event) {
    const data = JSON.parse(event.data);
    const eventType = data.eventType; // "ENROLLMENT_COMPLETED"

    this.emit(eventType, data);  // Emitir evento específico
    this.emit('*', data);         // Emitir wildcard
}
```

### Paso 5: EnrollmentControl escucha y procesa
```javascript
// EnrollmentControl.js
constructor() {
    // Escuchar TODOS los eventos SSE
    this.adapter.on('*', (data) => {
        this.handleRouterEvent(data.eventType, data);
    });
}

handleRouterEvent(eventType, eventData) {
    if (eventType === 'ENROLLMENT_COMPLETED') {
        this._onEnrollmentCompleted(eventData);
    }
}

_onEnrollmentCompleted(eventData) {
    this.isEnrolling = false;
    this._updateUI();

    // ⚡ Emitir evento custom de alto nivel
    this.emit('enrolled', {
        userId: this.userId,
        eventData: eventData
    });
}
```

### Paso 6: demo-avance.html recibe evento custom
```javascript
// demo-avance.html
components.enrollment.on('enrolled', (data) => {
    console.log('✅ Usuario enrolado:', data.userId);
    updateGlobalStatus(`✅ Usuario enrolado: ${data.userId}`, true);

    // Refrescar otros componentes
    components.verification._loadUsers();
    components.templateManager.loadTemplates();
});
```

---

## 📋 Comparación de Sistemas

| Característica | BiometricAdapter | BaseComponent |
|----------------|------------------|---------------|
| **Propósito** | Transporte SSE | Eventos de negocio |
| **Eventos** | Bajo nivel (backend) | Alto nivel (custom) |
| **Almacenamiento** | `this.callbacks` | `this.eventListeners` |
| **Métodos** | `on()`, `emit()` | `on()`, `emit()`, `off()` |
| **Ejemplo eventos** | `ENROLLMENT_COMPLETED`, `IMAGE_CAPTURED` | `enrolled`, `verified`, `captured` |
| **Listeners** | Componentes internos | Aplicación externa |
| **Origen** | Backend C# | Frontend component |

---

## ✅ Ventajas de esta Arquitectura

### 1. **Separación de Responsabilidades**
- BiometricAdapter: Solo transporte de eventos SSE
- BaseComponent: Lógica de negocio y abstracción

### 2. **Desacoplamiento**
- La aplicación (demo-avance.html) no necesita conocer eventos SSE del backend
- Solo escucha eventos custom de alto nivel (`enrolled`, `verified`)

### 3. **Flexibilidad**
- Podemos cambiar el backend sin afectar la aplicación
- Los componentes pueden emitir eventos adicionales sin modificar el adapter

### 4. **Mantenibilidad**
- Clara separación entre transporte y lógica
- Fácil de debuggear: logs específicos por capa
- Fácil de testear: mock adapter vs mock components

### 5. **Reutilización**
- BaseComponent puede usarse con otros adapters (WebSocket, HTTP polling, etc.)
- BiometricAdapter puede usarse con otros componentes

---

## 🚫 NO hay Duplicación

### Pregunta: "¿No estamos duplicando el manejo de eventos?"

**Respuesta**: NO. Son dos capas diferentes:

```javascript
// ❌ INCORRECTO: Esto SÍ sería duplicación
adapter.on('ENROLLMENT_COMPLETED', handler);     // Escuchar evento SSE
component.on('ENROLLMENT_COMPLETED', handler);   // Escuchar el mismo evento

// ✅ CORRECTO: Arquitectura actual (transformación de eventos)
adapter.on('ENROLLMENT_COMPLETED', data => {     // Capa 1: Transporte SSE
    component._processInternally(data);          // Capa 2: Lógica de negocio
    component.emit('enrolled', transformed);     // Capa 3: Evento custom
});
```

### Analogía: Correo Postal

```
Backend C# = Remitente (escribe la carta)
         ↓
    SSE Stream = Servicio postal (entrega física)
         ↓
BiometricAdapter = Buzón (recibe correo)
         ↓
BaseComponent = Persona (lee, procesa, decide qué hacer)
         ↓
Custom Events = Notificar a otros miembros de la familia
```

---

## 🔍 Debugging: Cómo Verificar el Flujo

### 1. Eventos SSE (Backend → Adapter)
```javascript
// En consola del navegador
BiometricAdapter.on('*', (data) => {
    console.log('📨 SSE:', data.eventType);
});
```

### 2. Eventos Custom (Component → App)
```javascript
// En consola del navegador
components.enrollment.on('enrolled', (data) => {
    console.log('✅ Custom:', data);
});
```

### 3. Ver todos los listeners registrados
```javascript
// BiometricAdapter listeners
console.log(BiometricAdapter.callbacks);

// Component listeners
console.log(components.enrollment.eventListeners);
```

---

## 📚 Referencias

- **BiometricAdapter.js**: `node/public/js/adapter/BiometricAdapter.js`
- **BaseComponent.js**: `node/public/js/components/BaseComponent.js`
- **EnrollmentControl.js**: `node/public/js/controls/EnrollmentControl.js`
- **demo-avance.html**: `node/public/demo-avance.html`

---

**Última Actualización**: 2025-10-27
**Versión**: EdgeUruBridgeCore v1.0
**Autor**: Sistema de Arquitectura Edge-Uru-UI
