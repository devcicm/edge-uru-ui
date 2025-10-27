# DP4500 Fingerprint Manager

A complete fingerprint enrollment, verification, and identification system using DP4500 reader with Node.js + Edge.js + .NET integration.

## Features

- **🔒 Fingerprint Enrollment**: Register new users with automatic quality checking
- **✅ 1:1 Verification**: Verify identity against enrolled fingerprints
- **🔍 1:N Identification**: Identify unknown fingerprints against the entire gallery
- **📊 Live Logging**: Real-time system events and operation status
- **👥 Gallery Management**: View, manage, and clear enrolled fingerprints
- **🎨 Modern UI**: Responsive web interface with dark theme

## Prerequisites

- **Windows OS** (Required for DP4500 drivers)
- **Node.js x86** (32-bit version required for edge-js compatibility)
- **.NET Framework 4.7.2** targeting pack
- **DP4500 Hardware** connected and working
- **DLL Dependencies**: Place the following files in `bin-deps/`:
  - `DPUruNet.dll`
  - `dpfpdd.dll`
  - `dpfj.dll`

## Installation & Setup

1. **Clone/Download** this repository
2. **Install Dependencies**:
   ```bash
   cd node
   npm install
   ```
3. **Build C# Bridge**:
   ```bash
   dotnet build bridge-csharp/EdgeBridge.csproj -c Release
   ```
4. **Build TypeScript Server**:
   ```bash
   cd node
   npm run build
   ```

## Running the Application

1. **Start the Server**:
   ```bash
   cd node
   npm start
   ```
2. **Open Web Interface**: Navigate to http://localhost:8080

## Usage Guide

### Initial Setup (Required)
1. **Bootstrap**: Initialize native DLL loading
2. **Register Callback**: Set up event handling
3. **Initialize Reader**: Connect to DP4500 device

### Fingerprint Operations

#### Enrollment Process
1. Enter a unique **User Tag/ID** (e.g., "John_Doe", "Employee_001")
2. Set **Timeout** (default: 30 seconds)
3. Click **"Start Enrollment Process"**
4. Follow prompts to scan finger **4 times** with quality checking
5. System automatically saves to gallery upon success

#### Verification Process
1. Select an enrolled user from the **dropdown list**
2. Set **Timeout** (default: 15 seconds)
3. Click **"Verify Fingerprint"**
4. Scan finger to verify identity
5. Results show **VERIFIED/NOT VERIFIED** with score details

#### Identification (1:N)
1. Set **Timeout** (default: 12 seconds)
2. Click **"Identify 1:N"**
3. Scan unknown finger
4. System searches entire gallery for matches
5. Returns best match or "NO MATCH" result

### Gallery Management
- **Refresh**: Update fingerprint list
- **Clear All**: Remove all enrolled fingerprints
- **Individual Delete**: Remove specific users (via table actions)

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Browser)                        │
│  index.html → BiometricAdapter → EventSource (/events)      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Server-Sent Events (SSE)
                         │ Real-time biometric events
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   NODE.JS (server.ts)                        │
│  Express + SseBridge + Edge.js Callback Handler             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Edge.js Bridge (V8 ↔ CLR)
                         │
┌────────────────────────▼────────────────────────────────────┐
│              C# BACKEND (EdgeUruBridge.cs)                   │
│  EdgeUruBridge → Dp4500Service → DPUruNet SDK               │
│  • Async operations with Task.Run()                          │
│  • Real-time event callbacks during capture                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │  DP4500      │
                  │  Hardware    │
                  └──────────────┘
```

### Real-time Events Architecture

This system implements **Server-Sent Events (SSE)** for real-time communication during biometric operations:

- **Frontend** subscribes to `/events` endpoint via EventSource
- **C# Backend** fires events during capture (images, progress, attempts)
- **SseBridge** routes events to all connected clients instantly
- **BiometricAdapter** handles events and updates UI in real-time

**Technical Details:** See [SOLUCION-EVENTOS-TIEMPO-REAL.md](./SOLUCION-EVENTOS-TIEMPO-REAL.md) for the complete technical explanation of how we solved the real-time event delivery challenge.

## Configuration

### Timeout Settings
- **Enrollment**: 30 seconds (allows multiple finger scans)
- **Verification**: 15 seconds (single scan)
- **Identification**: 12 seconds (single scan)
- **Single Capture**: 10 seconds

### Quality Parameters
- **Target FARN**: 21474 (≈1% false accept rate)
- **Max Samples**: 4 per enrollment
- **Max Retries**: 3 per sample

## API Endpoints

### System Control
- `POST /api/bootstrap` - Initialize native libraries
- `POST /api/register` - Register event callbacks
- `POST /api/init` - Initialize fingerprint reader
- `POST /api/dispose` - Clean up resources

### Fingerprint Operations
- `POST /api/enroll` - Enroll new fingerprint (4 samples with real-time events)
- `POST /api/verify` - Verify 1:1 against specific user
- `POST /api/identify` - Identify 1:N against gallery
- `POST /api/single` - Single capture without enrollment

### Gallery Management
- `GET /api/store` - List all enrolled fingerprints
- `DELETE /api/store` - Clear entire gallery

### Real-time Events
- `GET /events` - Server-Sent Events stream for live updates

## Troubleshooting

### Common Issues

1. **"No hay lectores U.are.U conectados"**
   - Check DP4500 USB connection
   - Verify device drivers are installed
   - Try different USB port

2. **"Bootstrap/register failed"**
   - Ensure DLL files are in `bin-deps/`
   - Verify .NET Framework 4.7.2 is installed
   - Check Windows compatibility

3. **"Network error" in browser**
   - Verify server is running on port 8080
   - Check firewall settings
   - Try localhost instead of IP address

4. **Enrollment fails with quality errors**
   - Clean finger and sensor surface
   - Press firmly but don't slide finger
   - Ensure good lighting conditions
   - Try different finger if persistent issues

### Performance Tips

- Keep sensor surface clean and dry
- Use consistent finger placement
- Allow brief pause between scans during enrollment
- Close browser tabs to free memory during operations

## Development

### Project Structure
```
edge-uru-ui/
├── bridge-csharp/              # C# .NET bridge code
│   ├── src/
│   │   ├── Bridge/
│   │   │   └── EdgeUruBridge.cs      # Edge.js interface & event handling
│   │   └── Core/
│   │       └── Dp4500Service.cs      # Core fingerprint operations
│   └── EdgeBridge.csproj             # Project file
├── node/                           # Node.js server
│   ├── public/
│   │   ├── index.html              # Web UI (simplified panel)
│   │   └── js/                     # Frontend JavaScript modules
│   │       ├── infrastructure/     # Core framework
│   │       └── biometric-controls/ # UI components
│   ├── server.ts                   # Express server + API endpoints
│   ├── sseBridge.ts                # Server-Sent Events bridge
│   └── package.json                # Dependencies
├── bin-deps/                       # Native DLL files
└── out/net472/                     # Compiled C# output
```

### Adding Features

1. **New C# Operations**: Add to `src/Bridge/EdgeUruBridge.cs`
2. **Core Biometric Logic**: Modify `src/Core/Dp4500Service.cs`
3. **API Endpoints**: Add to `server.ts`
4. **Real-time Events**: Configure in `sseBridge.ts`
5. **UI Components**: Modify `index.html` or add to `public/js/biometric-controls/`

## License

This project is for demonstration and educational purposes. DigitalPersona SDK and DPUruNet are proprietary to HID Global/DigitalPersona.

## Support

For issues related to:
- **Hardware**: Contact DigitalPersona/HID Global support
- **SDK**: Refer to DPUruNet documentation
- **This Application**: Check troubleshooting section above

---

**Note**: This application requires a physical DP4500 fingerprint reader and proper SDK installation to function correctly.