# Sistema Modular Biométrico

## 🎯 Objetivo

Crear un sistema de componentes frontend que emule la funcionalidad del **DPCtlUruNet.EnrollmentControl** del SDK de DigitalPersona, pero para aplicaciones web. El sistema utiliza patrones de diseño como **Adapter** y **Factory** para proporcionar:

- **Simplicidad**: Componentes drag-and-drop listos para usar
- **Abstracción**: Comunicación transparente entre frontend y backend
- **Modularidad**: Intercambio de UIs sin afectar la lógica
- **Reutilización**: Componentes que funcionan como "enchufes universales"

## 🏗️ Arquitectura

### Patrón Adapter - "Enchufe Universal"
```
Frontend UI ←→ BiometricAdapter ←→ Backend API
    ↓              ↓                   ↓
 Legacy UI      Abstracción       Node.js + C#
 Modular UI    (Eventos/APIs)     DigitalPersona SDK
```

El **BiometricAdapter** funciona como un transformador eléctrico que permite conectar cualquier UI al backend sin modificaciones.

### Patrón Factory - "Fábrica de Componentes"
```javascript
ComponentFactory.create('enrollment', 'myDiv', config)
                    ↓
                Componente listo para usar
```

## 📁 Estructura del Sistema

```
js/
├── infrastructure/
│   ├── BiometricAdapter.js      # Comunicación backend-frontend
│   ├── BaseComponent.js         # Clase base para componentes
│   ├── ComponentFactory.js      # Factory para crear componentes
│   └── EventRouter.js           # Enrutador de eventos SSE
├── biometric-controls/
│   ├── EnrollmentControl.js     # Componente de enrolamiento
│   ├── SimpleCaptureControl.js  # Componente de captura
│   ├── VerificationControl.js   # Componente de verificación
│   ├── ReaderControl.js         # Control del estado del lector
│   ├── LogDeviceControl.js      # Logs del dispositivo
│   └── TechDeviceControl.js     # Información técnica avanzada
└── styles/
    └── components.css           # Estilos modulares
```

## 🚀 Uso Básico

### 1. Configuración Automática
```html
<!-- Simplemente agrega el atributo data-component -->
<div id="enrollment" data-component="enrollment"></div>
<div id="capture" data-component="simplecapture"></div>
<div id="verify" data-component="verification"></div>

<script>
// Auto-inicialización automática al cargar
// No requiere código adicional
</script>
```

### 2. Creación Manual
```javascript
// Crear componente con configuración personalizada
const enrollment = ComponentFactory.create('enrollment', 'myDiv', {
    maxSamples: 6,
    autoCancel: true
});

// Escuchar eventos
enrollment.on('enrolled', (data) => {
    console.log('Usuario enrolado:', data.userId);
});
```

### 3. Creación Dinámica
```javascript
// Crear automáticamente basado en el ID del contenedor
ComponentFactory.autoCreate('enrollment'); // Busca div con id="enrollment"
ComponentFactory.autoCreate('capture');    // Busca div con id="capture"
ComponentFactory.autoCreate('verify');     // Busca div con id="verify"
```

## 🧩 Componentes Disponibles

### EnrollmentControl
**Equivalente a**: `DPCtlUruNet.EnrollmentControl`

```javascript
const enrollment = ComponentFactory.create('enrollment', 'container', {
    maxSamples: 4,      // Número de muestras requeridas
    autoCancel: false   // Cancelación automática en error
});

enrollment.on('enrolled', (data) => {
    console.log('Enrolamiento completado:', data);
});
```

**Características**:
- ✅ Barra de progreso visual
- ✅ Validación en tiempo real
- ✅ Manejo automático de intentos
- ✅ Eventos de estado detallados

### SimpleCaptureControl
**Para**: Captura simple de huellas dactilares

```javascript
const capture = ComponentFactory.create('simplecapture', 'container', {
    autoCapture: false,     // Captura automática
    captureInterval: 5000   // Intervalo de captura automática
});

capture.on('captured', (data) => {
    console.log('Huella capturada:', data);
});
```

**Características**:
- ✅ Captura manual y automática
- ✅ Función de prueba con imagen generada
- ✅ Información de estado en tiempo real
- ✅ Historial de capturas

### VerificationControl
**Para**: Verificación 1:1 e Identificación 1:N

```javascript
const verification = ComponentFactory.create('verification', 'container', {
    scoreThreshold: 60,     // Umbral de score
    autoRefreshUsers: true  // Actualizar lista automáticamente
});

verification.on('verified', (result) => {
    console.log('Verificación:', result.verified ? 'ÉXITO' : 'FALLO');
});
```

**Características**:
- ✅ Verificación 1:1 y identificación 1:N
- ✅ Lista dinámica de usuarios
- ✅ Panel de resultados detallado
- ✅ Configuración de umbrales

## 🔌 BiometricAdapter - El "Enchufe Universal"

### Conexión Automática
```javascript
// Conexión automática al backend
BiometricAdapter.connect();

// Escuchar todos los eventos
BiometricAdapter.on('*', (data) => {
    console.log('Evento:', data);
});
```

### APIs Simplificadas
```javascript
// Operaciones del lector
await BiometricAdapter.initializeReader();
await BiometricAdapter.captureFingerprint();
await BiometricAdapter.enrollFingerprint('usuario123');
await BiometricAdapter.verifyFingerprint('usuario123');

// Obtener información
const users = await BiometricAdapter.getStoredFingerprints();
const readerInfo = await BiometricAdapter.getReaderInfo();
```

### Eventos en Tiempo Real
```javascript
// Eventos específicos
BiometricAdapter.on('status', (data) => console.log('Estado:', data.msg));
BiometricAdapter.on('image', (data) => console.log('Imagen recibida'));
BiometricAdapter.on('attempt', (data) => console.log('Intento:', data.i));
BiometricAdapter.on('count', (data) => console.log('Muestras:', data.n));
```

## 🏭 ComponentFactory - Gestión Inteligente

### Tipos de Componentes
```javascript
// Ver tipos disponibles
console.log(ComponentFactory.getAvailableTypes());

// Resultado:
[
    { type: 'enrollment', description: 'Componente para enrolamiento...' },
    { type: 'simplecapture', description: 'Componente para captura...' },
    { type: 'verification', description: 'Componente para verificación...' }
]
```

### Gestión de Ciclo de Vida
```javascript
// Crear componente
const component = ComponentFactory.create('enrollment', 'myDiv');

// Obtener componente existente
const existing = ComponentFactory.get('enrollment', 'myDiv');

// Destruir componente específico
ComponentFactory.destroy('enrollment', 'myDiv');

// Destruir todos
ComponentFactory.destroyAll();

// Ver componentes activos
console.log(ComponentFactory.getActiveComponents());
```

### Auto-Inicialización Inteligente
```javascript
// Inicializar todos los componentes con data-component
ComponentFactory.autoInit();

// Con prefijo personalizado
ComponentFactory.autoInit('demo-');

// Con configuración global
ComponentFactory.autoInit('', {
    maxSamples: 6,
    scoreThreshold: 70
});
```

## 🎨 Personalización de Estilos

### Temas Disponibles
```css
/* Tema por defecto */
.biometric-component { /* glassmorphism */ }

/* Tema oscuro */
.biometric-component.theme-dark { /* fondo negro */ }

/* Tema claro */
.biometric-component.theme-light { /* fondo blanco */ }

/* Tema minimal */
.biometric-component.theme-minimal { /* sin bordes ni sombras */ }
```

### Variables CSS Personalizables
```css
:root {
    --primary-color: #4fd1c7;
    --secondary-color: #06b6d4;
    --success-color: #10b981;
    --error-color: #ef4444;
    --warning-color: #f59e0b;
}
```

## 📋 Ejemplos Completos

### Ejemplo 1: Sistema Completo Simple
```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="js/styles/components.css">
</head>
<body>
    <!-- Componentes auto-inicializados -->
    <div id="enrollment" data-component="enrollment"></div>
    <div id="verification" data-component="verification"></div>

    <!-- Scripts -->
    <script src="js/infrastructure/BiometricAdapter.js"></script>
    <script src="js/infrastructure/BaseComponent.js"></script>
    <script src="js/biometric-controls/EnrollmentControl.js"></script>
    <script src="js/biometric-controls/VerificationControl.js"></script>
    <script src="js/infrastructure/ComponentFactory.js"></script>
</body>
</html>
```

### Ejemplo 2: Configuración Avanzada
```javascript
// Configuración global
window.BiometricComponentConfig = {
    maxSamples: 6,
    scoreThreshold: 70,
    autoCapture: true
};

// Crear componentes con configuración específica
const enrollment = ComponentFactory.create('enrollment', 'enrollment-container', {
    maxSamples: 8,
    autoCancel: true
});

const verification = ComponentFactory.create('verification', 'verify-container', {
    scoreThreshold: 80,
    autoRefreshUsers: false
});

// Manejar eventos
enrollment.on('enrolled', async (data) => {
    console.log('Usuario enrolado:', data.userId);

    // Actualizar lista de verificación automáticamente
    await verification._loadUsers();
});
```

### Ejemplo 3: Integración con Framework
```javascript
// React
function BiometricEnrollment({ onEnrolled }) {
    useEffect(() => {
        const component = ComponentFactory.create('enrollment', 'react-enrollment');
        component.on('enrolled', onEnrolled);

        return () => ComponentFactory.destroy('enrollment', 'react-enrollment');
    }, []);

    return <div id="react-enrollment"></div>;
}

// Vue
export default {
    mounted() {
        this.enrollment = ComponentFactory.create('enrollment', 'vue-enrollment');
        this.enrollment.on('enrolled', this.handleEnrolled);
    },
    beforeDestroy() {
        ComponentFactory.destroy('enrollment', 'vue-enrollment');
    },
    template: '<div id="vue-enrollment"></div>'
}
```

## 🔧 Desarrollo y Extensión

### Crear Nuevo Componente
```javascript
class MyCustomControl extends BaseComponent {
    constructor(containerId, adapter) {
        super(containerId, adapter);
        this._setupCustomUI();
    }

    _createBaseStructure() {
        this.container.innerHTML = `
            <div class="my-custom-control">
                <h3>Mi Componente Personalizado</h3>
                <div class="component-status">Listo</div>
            </div>
        `;
    }

    async doSomething() {
        this.showLoading('Procesando...');

        try {
            const result = await this.adapter.apiCall('/my-endpoint');
            this.showSuccess('Completado!');
            this.emit('completed', result);
        } catch (error) {
            this.showError(error.message);
        }
    }
}

// Registrar en el factory
ComponentFactory.registerComponent('mycustom', MyCustomControl, 'Mi componente personalizado');
```

### Registrar Nuevo Tipo
```javascript
ComponentFactory.registerComponent('readercontrol', ReaderControl, 'Control del lector', {
    autoInit: false,
    showTechnicalInfo: true
});

// Ahora disponible para usar
const reader = ComponentFactory.create('readercontrol', 'reader-container');
```

## 🚦 Estados y Eventos

### Estados de Componentes
- `idle`: Inactivo, listo para usar
- `loading`: Procesando operación
- `processing`: Ejecutando acción específica
- `completed`: Operación completada exitosamente
- `error`: Error en la operación

### Eventos Comunes
```javascript
component.on('ready', () => console.log('Componente listo'));
component.on('error', (error) => console.log('Error:', error));
component.on('statusChanged', (status) => console.log('Estado:', status));
```

## 🎯 Ventajas del Sistema

### ✅ Para Desarrolladores
- **Plug & Play**: Solo agrega `data-component="tipo"` al div
- **Zero Configuration**: Funciona sin configuración adicional
- **TypeScript Ready**: Interfaces tipadas disponibles
- **Framework Agnostic**: Funciona con React, Vue, Angular, Vanilla JS

### ✅ Para Proyectos
- **Mantenibilidad**: UI y lógica completamente separadas
- **Escalabilidad**: Agregar nuevos componentes es trivial
- **Consistencia**: Todos los componentes siguen el mismo patrón
- **Testing**: Cada componente es testeable independientemente

### ✅ Para UX
- **Responsive**: Adaptativo a móviles y desktop
- **Accesible**: Cumple estándares de accesibilidad
- **Intuitivo**: Interfaz clara e instrucciones paso a paso
- **Real-time**: Feedback inmediato en todas las operaciones

## 🔗 Enlaces

- **Demo en vivo**: http://localhost:8080/demo-modular.html
- **UI Legacy**: http://localhost:8080/ (comparación)
- **Documentación API**: Disponible en consola del navegador

---

*Este sistema transforma la complejidad del SDK DigitalPersona en componentes web simples y reutilizables, manteniendo toda la potencia y flexibilidad del SDK original.*