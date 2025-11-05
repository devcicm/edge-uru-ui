# Integración con API Externa - Sistema Biométrico

## 📋 Tabla de Contenidos

- [Resumen](#resumen)
- [Arquitectura](#arquitectura)
- [DTOs (Data Transfer Objects)](#dtos-data-transfer-objects)
- [Flujos de Operación](#flujos-de-operación)
- [API Endpoints](#api-endpoints)
- [Métodos del Adapter](#métodos-del-adapter)
- [Ejemplos de Uso](#ejemplos-de-uso)
- [Integración con Tu API](#integración-con-tu-api)

---

## Resumen

Este documento describe cómo integrar el sistema biométrico local con APIs externas para almacenamiento y consulta remota de huellas digitales.

**Funcionalidades:**
- ✅ **Registro**: Capturar huellas localmente y enviar DTOs a API externa
- ✅ **Verificación**: Obtener huellas de API externa y verificar localmente
- ✅ **Formato estándar**: DTOs estructurados para interoperabilidad

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│                     FLUJO DE REGISTRO                            │
└──────────────────────────────────────────────────────────────────┘

Usuario → DP4500 Reader → Captura Local → DTO → Tu API Externa
                                                   ↓
                                        Almacenamiento Persistente


┌──────────────────────────────────────────────────────────────────┐
│                  FLUJO DE VERIFICACIÓN                           │
└──────────────────────────────────────────────────────────────────┘

Usuario → Tu API Externa → Obtener DTO → Captura Local → Verificar
                                                           ↓
                                                  Match ✅ / No Match ❌
```

**Componentes:**
1. **DP4500 Reader** - Captura física de huellas
2. **ExternalApiService.cs** - Lógica de negocio C#
3. **Server.ts Endpoints** - Exposición HTTP
4. **BiometricAdapter.js** - Cliente JavaScript
5. **Tu API Externa** - Almacenamiento/consulta remota

---

## DTOs (Data Transfer Objects)

### 1. BiometricRegistrationRequest

**Propósito**: Enviar datos de registro a API externa

```json
{
  "userId": "JUAN_PEREZ_123",
  "userInfo": {
    "userId": "JUAN_PEREZ_123",
    "firstName": "Juan",
    "lastName": "Pérez",
    "email": "juan.perez@example.com",
    "documentId": "12345678",
    "customFields": {
      "departamento": "TI",
      "sucursal": "001"
    }
  },
  "fingerprints": [
    {
      "hand": "LEFT",
      "finger": "THUMB",
      "templateBase64": "AQIDBAUGBwgJ...==",
      "format": "ANSI_378",
      "templateSize": 1024,
      "quality": 85,
      "imageBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
      "resolution": 500,
      "templateHash": "a1b2c3d4..."
    },
    {
      "hand": "LEFT",
      "finger": "INDEX",
      "templateBase64": "AQIDBAUGBwgJ...==",
      "format": "ANSI_378",
      "templateSize": 1024,
      "quality": 88,
      "resolution": 500,
      "templateHash": "e5f6g7h8..."
    }
    // ... más dedos
  ],
  "capturedAt": "2025-11-05T10:30:00Z",
  "deviceId": "DP4500_LAPTOP-001",
  "metadata": {
    "location": "Oficina Central",
    "operator": "admin",
    "version": "1.0.0"
  }
}
```

### 2. BiometricVerificationResponse

**Propósito**: Recibir datos de huella desde API externa

```json
{
  "found": true,
  "userInfo": {
    "userId": "JUAN_PEREZ_123",
    "firstName": "Juan",
    "lastName": "Pérez",
    "email": "juan.perez@example.com"
  },
  "fingerprints": [
    {
      "hand": "LEFT",
      "finger": "THUMB",
      "templateBase64": "AQIDBAUGBwgJ...==",
      "format": "ANSI_378",
      "templateSize": 1024,
      "quality": 85,
      "resolution": 500,
      "templateHash": "a1b2c3d4..."
    }
    // ... más dedos si están registrados
  ],
  "message": "Usuario encontrado con 2 huellas registradas",
  "errorCode": null
}
```

### 3. BiometricMatchResult

**Propósito**: Resultado de verificación local

```json
{
  "userId": "JUAN_PEREZ_123",
  "isMatch": true,
  "confidenceScore": 98,
  "falseAcceptRate": 450,
  "matchedHand": "LEFT",
  "matchedFinger": "THUMB",
  "verifiedAt": "2025-11-05T10:32:00Z",
  "message": "Huella verificada correctamente (Score: 450)"
}
```

---

## Flujos de Operación

### Flujo 1: Registro de Usuario

```javascript
// 1. Capturar huellas localmente y generar DTO
const registrationDTO = await adapter.captureForExternalRegistration({
    userId: 'JUAN_PEREZ_123',
    firstName: 'Juan',
    lastName: 'Pérez',
    email: 'juan@example.com',
    documentId: '12345678',
    // Opcional: especificar dedos (si no, captura todos los 10)
    fingers: [
        { hand: 'LEFT', finger: 'THUMB' },
        { hand: 'LEFT', finger: 'INDEX' }
    ],
    metadata: {
        sucursal: '001',
        operator: 'admin'
    }
});

// 2. Enviar DTO a tu API externa
const response = await fetch('https://tu-api.com/biometric/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registrationDTO)
});

const result = await response.json();
console.log('Usuario registrado:', result.registrationId);
```

### Flujo 2: Verificación de Usuario

```javascript
// 1. Obtener huellas desde tu API externa
const response = await fetch(`https://tu-api.com/biometric/user/JUAN_PEREZ_123`);
const externalData = await response.json();

// 2. Verificar contra huella capturada localmente
const matchResult = await adapter.verifyAgainstExternalFingerprint(
    externalData.fingerprints[0],  // Primera huella del usuario
    {
        timeoutMs: 15000,
        targetFarn: 21474,
        maxAttempts: 4
    }
);

if (matchResult.isMatch) {
    console.log('✅ Usuario verificado:', matchResult.userId);
    console.log('Confianza:', matchResult.confidenceScore + '%');
} else {
    console.log('❌ Huella no coincide');
}
```

### Flujo 3: Verificación Múltiple (1:N)

```javascript
// 1. Obtener todas las huellas desde tu API
const response = await fetch('https://tu-api.com/biometric/all-users');
const allUsers = await response.json();

// 2. Identificar contra todas las huellas
const matchResult = await adapter.verifyAgainstMultipleFingerprints(
    allUsers.fingerprints,  // Array de todas las huellas
    {
        timeoutMs: 15000,
        targetFarn: 21474
    }
);

if (matchResult.isMatch) {
    console.log('✅ Usuario identificado:', matchResult.userId);
    console.log('Dedo:', matchResult.matchedHand, matchResult.matchedFinger);
} else {
    console.log('❌ Ninguna huella coincide');
}
```

---

## API Endpoints

### POST /api/external/register

**Descripción**: Captura huella(s) y genera DTO para envío a API externa

**Request Body**:
```json
{
  "userId": "string (requerido)",
  "firstName": "string (opcional)",
  "lastName": "string (opcional)",
  "email": "string (opcional)",
  "documentId": "string (opcional)",
  "fingers": "Array<{hand, finger}> (opcional)",
  "metadata": "object (opcional)"
}
```

**Response**: `BiometricRegistrationRequest` DTO completo

**Ejemplo**:
```bash
curl -X POST http://localhost:8080/api/external/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "JUAN_123",
    "firstName": "Juan",
    "lastName": "Pérez"
  }'
```

---

### POST /api/external/verify

**Descripción**: Verifica huella capturada contra plantilla de API externa

**Request Body**:
```json
{
  "fingerprintData": {
    "hand": "LEFT",
    "finger": "THUMB",
    "templateBase64": "AQIDBAUGBwgJ...==",
    "format": "ANSI_378"
  },
  "timeoutMs": 15000,
  "targetFarn": 21474,
  "maxAttempts": 4
}
```

**Response**: `BiometricMatchResult`

---

### POST /api/external/verify-multiple

**Descripción**: Verifica huella capturada contra múltiples plantillas (1:N)

**Request Body**:
```json
{
  "fingerprints": [
    {
      "hand": "LEFT",
      "finger": "THUMB",
      "templateBase64": "AQIDBAUGBwgJ...=="
    },
    {
      "hand": "RIGHT",
      "finger": "INDEX",
      "templateBase64": "KLMNOPQRSTUVWXYz...=="
    }
  ],
  "timeoutMs": 15000,
  "targetFarn": 21474
}
```

**Response**: `BiometricMatchResult` con dedo que coincidió

---

### POST /api/external/convert-template

**Descripción**: Convierte template local a DTO para envío a API externa

**Request Body**:
```json
{
  "tag": "JUAN_LEFT_THUMB"
}
```

**Response**: `FingerprintData` DTO

---

## Métodos del Adapter

### captureForExternalRegistration(params)

```javascript
const dto = await adapter.captureForExternalRegistration({
    userId: 'USER_001',
    firstName: 'Juan',
    lastName: 'Pérez',
    fingers: [
        { hand: 'LEFT', finger: 'THUMB' },
        { hand: 'RIGHT', finger: 'INDEX' }
    ]
});
```

### verifyAgainstExternalFingerprint(fingerprintData, options)

```javascript
const result = await adapter.verifyAgainstExternalFingerprint(
    {
        hand: 'LEFT',
        finger: 'THUMB',
        templateBase64: 'AQIDBAUGBwgJ...=='
    },
    {
        timeoutMs: 15000,
        targetFarn: 21474
    }
);
```

### verifyAgainstMultipleFingerprints(fingerprints, options)

```javascript
const result = await adapter.verifyAgainstMultipleFingerprints(
    [ /* array de fingerprints */ ],
    { timeoutMs: 15000 }
);
```

### convertTemplateToDTO(tag)

```javascript
const dto = await adapter.convertTemplateToDTO('JUAN_LEFT_THUMB');
// Enviar dto a tu API externa
```

---

## Ejemplos de Uso

### Ejemplo Completo: Sistema de Control de Acceso

```html
<!DOCTYPE html>
<html>
<head>
    <title>Control de Acceso</title>
    <script src="/js/adapter/BiometricAdapter.js"></script>
</head>
<body>
    <h1>Sistema de Control de Acceso</h1>

    <!-- Registro -->
    <div id="registro">
        <h2>Registrar Nuevo Usuario</h2>
        <input id="userId" placeholder="ID de Usuario">
        <input id="firstName" placeholder="Nombre">
        <input id="lastName" placeholder="Apellido">
        <button onclick="registrarUsuario()">Registrar</button>
    </div>

    <!-- Verificación -->
    <div id="verificacion">
        <h2>Verificar Acceso</h2>
        <input id="userIdVerify" placeholder="ID de Usuario">
        <button onclick="verificarAcceso()">Verificar</button>
        <div id="resultado"></div>
    </div>

    <script>
        const adapter = window.BiometricAdapter;
        const API_BASE = 'https://tu-api.com/biometric';

        // Registrar usuario
        async function registrarUsuario() {
            const userId = document.getElementById('userId').value;
            const firstName = document.getElementById('firstName').value;
            const lastName = document.getElementById('lastName').value;

            try {
                // 1. Capturar huellas localmente
                const dto = await adapter.captureForExternalRegistration({
                    userId,
                    firstName,
                    lastName,
                    // Capturar solo 2 dedos para rapidez
                    fingers: [
                        { hand: 'LEFT', finger: 'THUMB' },
                        { hand: 'RIGHT', finger: 'INDEX' }
                    ]
                });

                // 2. Enviar a tu API
                const response = await fetch(`${API_BASE}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dto)
                });

                const result = await response.json();
                alert('✅ Usuario registrado: ' + result.registrationId);

            } catch (error) {
                alert('❌ Error: ' + error.message);
            }
        }

        // Verificar acceso
        async function verificarAcceso() {
            const userId = document.getElementById('userIdVerify').value;

            try {
                // 1. Obtener huellas de tu API
                const response = await fetch(`${API_BASE}/user/${userId}`);
                const userData = await response.json();

                if (!userData.found) {
                    alert('❌ Usuario no encontrado');
                    return;
                }

                // 2. Verificar contra todas las huellas del usuario
                const matchResult = await adapter.verifyAgainstMultipleFingerprints(
                    userData.fingerprints
                );

                // 3. Mostrar resultado
                const resultDiv = document.getElementById('resultado');
                if (matchResult.isMatch) {
                    resultDiv.innerHTML = `
                        <div style="color: green;">
                            ✅ ACCESO CONCEDIDO<br>
                            Usuario: ${userId}<br>
                            Confianza: ${matchResult.confidenceScore}%<br>
                            Dedo: ${matchResult.matchedHand} ${matchResult.matchedFinger}
                        </div>
                    `;

                    // Registrar acceso en tu API
                    await fetch(`${API_BASE}/access-log`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId,
                            timestamp: new Date().toISOString(),
                            granted: true
                        })
                    });
                } else {
                    resultDiv.innerHTML = `
                        <div style="color: red;">
                            ❌ ACCESO DENEGADO<br>
                            Huella no coincide
                        </div>
                    `;
                }

            } catch (error) {
                alert('❌ Error: ' + error.message);
            }
        }
    </script>
</body>
</html>
```

---

## Integración con Tu API

### Requisitos de Tu API Externa

Tu API externa debe implementar los siguientes endpoints:

#### 1. POST /biometric/register

**Request**: Recibe `BiometricRegistrationRequest` DTO

```json
{
  "userId": "string",
  "userInfo": {...},
  "fingerprints": [...],
  "capturedAt": "ISO 8601",
  "deviceId": "string",
  "metadata": {...}
}
```

**Response**: Confirmación de registro

```json
{
  "success": true,
  "registrationId": "REG_12345",
  "message": "Usuario registrado exitosamente"
}
```

#### 2. GET /biometric/user/:userId

**Response**: Retorna `BiometricVerificationResponse` DTO

```json
{
  "found": true,
  "userInfo": {...},
  "fingerprints": [...]
}
```

#### 3. GET /biometric/all-users (Opcional - para 1:N)

**Response**: Array de usuarios con huellas

```json
{
  "users": [
    {
      "userId": "USER_001",
      "fingerprints": [...]
    },
    {
      "userId": "USER_002",
      "fingerprints": [...]
    }
  ]
}
```

---

## Seguridad

### Recomendaciones

1. **HTTPS Obligatorio**: Todas las comunicaciones con API externa deben usar HTTPS
2. **Autenticación**: Implementar API Keys o JWT tokens
3. **Cifrado**: Templates en Base64 son compactas pero considerar cifrado adicional
4. **Audit Log**: Registrar todas las operaciones biométricas
5. **Rate Limiting**: Limitar intentos de verificación
6. **GDPR/Privacidad**: Cumplir regulaciones de datos biométricos

### Ejemplo con Autenticación

```javascript
const API_KEY = 'tu-api-key-secreta';

const response = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'X-Device-ID': 'DP4500_001'
    },
    body: JSON.stringify(dto)
});
```

---

## Troubleshooting

### Error: "templateBase64 es requerido"

**Causa**: El DTO no contiene la plantilla biométrica

**Solución**: Verificar que la captura fue exitosa y que `fingerprintData.templateBase64` no esté vacío

### Error: "No se pudo capturar ninguna huella"

**Causa**: Todas las capturas fallaron

**Solución**:
- Verificar que el lector esté inicializado
- Aumentar `maxRetriesPerSample`
- Verificar que el dedo esté limpio y bien colocado

### Score de confianza muy bajo

**Causa**: La calidad de captura es baja o las huellas no coinciden

**Solución**:
- Ajustar `targetFarn` (valor más alto = más permisivo)
- Verificar calidad de huellas registradas
- Re-enrolar al usuario

---

## Versiones y Compatibilidad

- **SDK**: DPUruNet 2.5+
- **Formato**: ANSI 378 (estándar)
- **Resolución**: 500 DPI
- **FAR Recomendado**: 21474 (1:21474)

---

**Última actualización**: 2025-11-05
**Versión**: 1.0.0
