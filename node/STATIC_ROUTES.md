# Configuración de Rutas Estáticas - Edge URU UI

## 📁 Estructura de Archivos

```
node/
├── public/                    # ✅ CÓDIGO FUENTE ORIGINAL (editar aquí)
│   └── index.html            # Archivo HTML principal de desarrollo
├── dist/                     # 🔄 CÓDIGO COMPILADO (generado automáticamente)
│   ├── server.js            # Servidor compilado
│   └── public/              # ❌ NO EDITAR - se sobrescribe en build
│       └── index.html       # Copia compilada (obsoleta)
├── server.ts                # ✅ SERVIDOR FUENTE (editar aquí)
└── package.json
```

## 🔄 Configuración de Rutas Estáticas

El servidor ahora está configurado para servir **SIEMPRE** desde el código fuente original:

### Lógica de Rutas:
```typescript
// Detecta si está ejecutándose desde dist/ (compilado)
const isCompiledMode = fs.existsSync(path.join(__dirname, "public"));

// Sirve desde el directorio fuente original
const publicDir = isCompiledMode
  ? path.join(__dirname, "..", "public")    // dist/ → ../public/
  : path.join(__dirname, "public");         // root/ → public/

app.use("/", express.static(publicDir));
```

## 🚀 Comandos Disponibles

### Desarrollo (Recomendado):
```bash
npm run dev
```
- Ejecuta directamente desde TypeScript
- Sirve desde `node/public/`
- Cambios instantáneos sin build

### Producción:
```bash
npm run start:source
```
- Compila y ejecuta
- Sirve desde `node/public/` (no dist/public/)
- Siempre usa archivos fuente originales

### Build + Start:
```bash
npm run build
npm start
```
- Método tradicional
- Ahora también sirve desde fuente original

## ✅ Ventajas de esta Configuración

1. **Un solo archivo fuente**: Solo editar `node/public/index.html`
2. **No más duplicados**: Evita archivos obsoletos en `dist/public/`
3. **Cambios inmediatos**: Sin necesidad de rebuild constante
4. **Debugging fácil**: Código servido = código editado
5. **Consistencia**: Mismo archivo en desarrollo y producción

## 🔧 Verificación

Al iniciar el servidor, verás:
```
[STATIC ROUTES] Serving static files from: C:\...\node\public
[STATIC ROUTES] Is compiled mode: true
```

Esto confirma que se están sirviendo los archivos fuente originales.

## 📝 Notas Importantes

- **SIEMPRE editar**: `node/public/index.html`
- **NUNCA editar**: `node/dist/public/index.html` (se ignora)
- **Build automático**: `start:source` hace build automáticamente
- **Hot reload**: Usar `npm run dev` para desarrollo rápido

## 🐛 Resolución de Problemas

Si ves código obsoleto:
1. Verificar que editas `node/public/index.html`
2. Reiniciar servidor con `npm run start:source`
3. Revisar logs de `[STATIC ROUTES]` al inicio