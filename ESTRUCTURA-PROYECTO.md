# Estructura del Proyecto - Sistema Biométrico DP4500

## 📁 Organización de Archivos por Versiones

Este proyecto mantiene dos versiones del sistema biométrico que conviven simultáneamente:

- **V1 (Legacy)**: API original, compatible con código existente
- **V2 (CEDDFA)**: Nueva arquitectura con DTOs, Event Bus y Message Processor

---

## 🏗️ Estructura de Directorios

```
edge-uru-ui/
│
├── bridge-csharp/              # C# Bridge (.NET 4.7.2)
│   ├── shared/                 # Código compartido entre V1 y V2
│   │   └── Dp4500Wrapper.cs   # Wrapper del SDK DigitalPersona (usado por ambas versiones)
│   │
│   ├── v1-legacy/             # Versión 1 - API Legacy
│   │   └── EdgeUruBridgeCSharp.cs
│   │
│   ├── v2-ceddfa/             # Versión 2 - Arquitectura CEDDFA
│   │   ├── EdgeUruBridgeV2.cs      # Bridge V2 con CEDDFA
│   │   ├── BiometricDtos.cs        # Data Transfer Objects
│   │   ├── EventBusSystem.cs       # Event Bus thread-safe
│   │   └── MessageProcessor.cs     # Procesador de mensajes
│   │
│   └── EdgeBridge.csproj      # Proyecto con referencias explícitas
│
├── node/                      # Backend Node.js + Express
│   ├── server.ts             # Servidor con API V1 y V2
│   └── public/               # Frontend
│       ├── v1-legacy/        # Frontend V1
│       │   └── FingerprintAPI.js
│       │
│       ├── v2-ceddfa/        # Frontend V2 - CEDDFA
│       │   ├── template-workflow-ceddfa.html
│       │   └── biometric-dtos.js
│       │
│       └── js/               # Componentes compartidos
│           ├── core/
│           │   ├── BiometricAdapter.js    # Adaptador backend-frontend
│           │   └── BaseComponent.js       # Componente base modular
│           └── components/
│               ├── EnrollmentControl.js   # Control de enrolamiento
│               └── VerificationControl.js # Control de verificación
│
├── out/net472/               # DLLs compiladas
│   └── bridge-csharp.dll    # Contiene V1 y V2
│
└── bin-deps/                # Dependencias nativas
    ├── DPUruNet.dll
    ├── dpfpdd.dll
    └── dpfj.dll
```

---

## 🔄 Flujo de Compilación

### Compilar C# Bridge

```bash
cd bridge-csharp
dotnet build EdgeBridge.csproj -c Release
```

**Salida**: `out/net472/bridge-csharp.dll`

El DLL compilado contiene **ambas versiones** (V1 y V2) del bridge.

### Compilar TypeScript

```bash
cd node
npm run build
```

---

## 📡 APIs Disponibles

### API V1 (Legacy)

**Endpoints:**
```
POST /api/bootstrap
POST /api/init
POST /api/enroll
POST /api/verify
POST /api/identify1n
GET  /api/store
DELETE /api/store
```

**Bridge C#:** `EdgeBridge.EdgeUruBridge`

### API V2 (CEDDFA)

**Endpoints:**
```
POST /api/v2/init
POST /api/v2/enroll
POST /api/v2/verify
POST /api/v2/identify1n
GET  /api/v2/eventbus/stats
DELETE /api/v2/eventbus/history
```

**Bridge C#:** `EdgeBridge.EdgeUruBridgeV2`

---

## 🎯 Uso de las Versiones

### Frontend V1 (Legacy)

**Archivo**: `node/public/v1-legacy/FingerprintAPI.js`

**Uso:**
```javascript
// API legacy directa
fetch('/api/enroll', {
  method: 'POST',
  body: JSON.stringify({ tag: 'USER001' })
});
```

### Frontend V2 (CEDDFA)

**Archivo**: `node/public/v2-ceddfa/template-workflow-ceddfa.html`

**Uso:**
```javascript
// Cliente modular con DTOs
const bioApi = new BiometricApiClient();

// Conectar a eventos SSE
bioApi.connectEvents('/events');

// Suscribirse a eventos
bioApi.on(BiometricEventTypes.ENROLLMENT_COMPLETED, (data) => {
  console.log('Usuario enrolado:', data);
});

// Llamar API V2
const response = await bioApi.enrollV2({
  userId: 'USER001',
  timeoutMs: 60000
});
```

---

## 🔧 Configuración del Proyecto

### EdgeBridge.csproj

El archivo `.csproj` está configurado con:

```xml
<EnableDefaultCompileItems>false</EnableDefaultCompileItems>
```

Esto permite especificar manualmente qué archivos compilar, organizados por versión:

```xml
<!-- Archivos compartidos -->
<ItemGroup Label="Shared">
  <Compile Include="shared\Dp4500Wrapper.cs" />
</ItemGroup>

<!-- V1 Legacy -->
<ItemGroup Label="V1 Legacy">
  <Compile Include="v1-legacy\EdgeUruBridgeCSharp.cs" />
</ItemGroup>

<!-- V2 CEDDFA -->
<ItemGroup Label="V2 CEDDFA">
  <Compile Include="v2-ceddfa\BiometricDtos.cs" />
  <Compile Include="v2-ceddfa\EventBusSystem.cs" />
  <Compile Include="v2-ceddfa\MessageProcessor.cs" />
  <Compile Include="v2-ceddfa\EdgeUruBridgeV2.cs" />
</ItemGroup>
```

---

## 📊 Ventajas de esta Estructura

### ✅ Organización Clara
- Separación visual entre versiones
- Fácil identificar archivos legacy vs nuevos
- Mejor navegación del código

### ✅ Control de Versiones
- Git muestra claramente qué versión se modificó
- Historial limpio de cambios por versión
- Fácil hacer rollback a V1 si es necesario

### ✅ Compilación Unificada
- Un solo DLL contiene ambas versiones
- No hay duplicación de dependencias
- Código compartido se compila una sola vez

### ✅ Compatibilidad
- V1 sigue funcionando sin cambios
- V2 no afecta a usuarios de V1
- Migración gradual posible

### ✅ Mantenibilidad
- Agregar features a V2 sin tocar V1
- Bug fixes aislados por versión
- Testing independiente

---

## 🚀 Inicio Rápido

### 1. Compilar Proyecto

```bash
# Compilar C#
dotnet build bridge-csharp/EdgeBridge.csproj -c Release

# Compilar TypeScript
cd node && npm run build
```

### 2. Iniciar Servidor

```bash
cd node
npm start
```

### 3. Acceder a las UIs

- **V1 Legacy**: No tiene UI standalone (uso programático)
- **V2 CEDDFA**: `http://localhost:8080/v2-ceddfa/template-workflow-ceddfa.html`

---

## 📝 Notas de Desarrollo

### Agregar Nuevo Archivo a V1

1. Crear archivo en `bridge-csharp/v1-legacy/`
2. Agregar referencia en `EdgeBridge.csproj`:
   ```xml
   <ItemGroup Label="V1 Legacy">
     <Compile Include="v1-legacy\NuevoArchivo.cs" />
   </ItemGroup>
   ```
3. Recompilar

### Agregar Nuevo Archivo a V2

1. Crear archivo en `bridge-csharp/v2-ceddfa/`
2. Agregar referencia en `EdgeBridge.csproj`:
   ```xml
   <ItemGroup Label="V2 CEDDFA">
     <Compile Include="v2-ceddfa\NuevoArchivo.cs" />
   </ItemGroup>
   ```
3. Recompilar

### Namespaces

Ambas versiones usan el mismo namespace base:

```csharp
namespace EdgeBridge { }           // V1 y clases compartidas
namespace EdgeBridge.Dtos { }      // V2 DTOs
namespace EdgeBridge.EventBus { }  // V2 Event Bus
namespace EdgeBridge.Processing { } // V2 Message Processor
```

---

## 🔍 Troubleshooting

### Error: "Se incluyeron Compile elementos duplicados"

**Solución**: Verificar que `EnableDefaultCompileItems` esté en `false` en el `.csproj`.

### Error: DLL no se regenera

**Solución**: Borrar carpeta `out/` y recompilar:
```bash
rm -rf out/net472/*
dotnet build -c Release
```

### Error: Module not found en Node.js

**Solución**: Verificar rutas en imports después de mover archivos:
```javascript
// Actualizar a nueva ubicación
<script src="/v2-ceddfa/biometric-dtos.js"></script>
```

---

## 📚 Documentación Adicional

- **Arquitectura CEDDFA**: Ver `arquitectura CEDDFA.md`
- **Implementación V2**: Ver `CEDDFA-IMPLEMENTATION.md`
- **API Reference**: Ver comentarios inline en código

---

**Última actualización**: 2025-10-12
**Versión del documento**: 1.0
