# edge-uru-ui

UI mínima para operar el lector DP4500 desde Node + edge-js + .NET (DPUruNet).

## Requisitos
- Windows
- Node **x86**
- .NET Framework 4.7.2 targeting pack
- DLLs del SDK DigitalPersona: `DPUruNet.dll`, `dpfpdd.dll`, `dpfj.dll` en `bin-deps/`

## Build
```bash
dotnet build bridge-csharp/EdgeBridge.csproj -c Release
cd node
npm i
npm run build
npm start
# abre http://localhost:8080
```

Flujo sugerido en la UI: **Bootstrap → Registrar callback → Init**.
