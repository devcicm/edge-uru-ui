#nullable enable
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace EdgeBridge
{
    /// <summary>
    /// Estado observable del lector biométrico que implementa INotifyPropertyChanged.
    /// Alimentado en tiempo real por eventos del Kernel de Windows (CM_Register_Notification en cfgmgr32.dll)
    /// sin necesidad de polling (0% CPU en reposo).
    /// </summary>
    public sealed class ObservableReaderState : INotifyPropertyChanged
    {
        private readonly object _syncLock = new object();
        private DPUruNet.Reader? _activeReader;
        private bool _isConnected;
        private bool _isInitialized;
        private string _serialNumber = "";
        private string _productName = "DigitalPersona U.are.U 4500";
        private string _firmwareVersion = "N/A";
        private string _hardwareRevision = "N/A";
        private string _symbolicLink = "";

        public event PropertyChangedEventHandler? PropertyChanged;

        public DPUruNet.Reader? ActiveReader => _activeReader;
        public bool IsConnected => _isConnected;
        public string SerialNumber => _serialNumber;
        public string ProductName => _productName;
        public string FirmwareVersion => _firmwareVersion;
        public string HardwareRevision => _hardwareRevision;
        public string SymbolicLink => _symbolicLink;

        private void OnPropertyChanged(string propertyName)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        /// <summary>
        /// Desconexión inmediata (< 5 ms) notificada por CM_NOTIFY_ACTION_DEVICEINTERFACEREMOVAL del Kernel
        /// </summary>
        public void HandleDeviceRemoved(string symbolicLink)
        {
            bool changed = false;
            lock (_syncLock)
            {
                _symbolicLink = symbolicLink;
                if (_isInitialized && _isConnected)
                {
                    _activeReader = null;
                    _isConnected = false;
                    _serialNumber = "";
                    changed = true;
                }
                else
                {
                    _activeReader = null;
                    _isConnected = false;
                    _isInitialized = true;
                }
            }

            if (changed)
            {
                OnPropertyChanged(nameof(ActiveReader));
                OnPropertyChanged(nameof(IsConnected));
            }
        }

        /// <summary>
        /// Sincroniza el estado observable con DPUruNet.ReaderCollection tras un evento de llegada USB o al iniciar
        /// </summary>
        public void SyncFromHardware(bool isArrivalHint = false, string? symbolicLink = null)
        {
            bool changed = false;
            lock (_syncLock)
            {
                if (!string.IsNullOrEmpty(symbolicLink))
                {
                    _symbolicLink = symbolicLink!;
                }

                DPUruNet.Reader? foundReader = null;
                int maxAttempts = isArrivalHint ? 6 : 1;

                for (int attempt = 0; attempt < maxAttempts; attempt++)
                {
                    try
                    {
                        var readers = DPUruNet.ReaderCollection.GetReaders();
                        if (readers != null && readers.Count > 0)
                        {
                            foundReader = readers[0];
                            break;
                        }
                    }
                    catch
                    {
                        foundReader = null;
                    }

                    if (attempt + 1 < maxAttempts)
                    {
                        Thread.Sleep(35);
                    }
                }

                bool nowConnected = foundReader != null;
                string newSerial = foundReader?.Description?.SerialNumber ?? "";
                string newModel = (foundReader?.Description?.Id?.ProductName ?? "DigitalPersona U.are.U 4500")
                    .Replace("\uFFFD", "®").Trim();
                string newFw = foundReader?.Description?.Version?.FirmwareVersion ?? "N/A";
                string newHw = foundReader?.Description?.Version?.HardwareVersion ?? "N/A";

                bool wasInitialized = _isInitialized;
                bool previousConnected = _isConnected;

                _activeReader = foundReader;
                _isConnected = nowConnected;
                _serialNumber = nowConnected ? newSerial : "";
                _productName = newModel;
                _firmwareVersion = nowConnected ? newFw : "N/A";
                _hardwareRevision = nowConnected ? newHw : "N/A";
                _isInitialized = true;

                if (wasInitialized && previousConnected != nowConnected)
                {
                    changed = true;
                }
            }

            if (changed)
            {
                OnPropertyChanged(nameof(ActiveReader));
                OnPropertyChanged(nameof(IsConnected));
            }
        }
    }

    /// <summary>
    /// Bridge simple y directo para comunicación con lector biométrico DP4500
    /// Envía eventos en tiempo real al frontend vía callback
    /// </summary>
    public class EdgeUruBridge
    {
        private static Dp4500Service? _reader;
        private static CancellationTokenSource? _cts;
        private static Func<object, Task<object>>? _callback;

        // ===== MONITOR PLUG & PLAY NATIVO DEL KERNEL (cfgmgr32.dll + INotifyPropertyChanged) =====
        private const int CM_NOTIFY_FILTER_TYPE_DEVICEINTERFACE = 0;
        private const int CM_NOTIFY_ACTION_DEVICEINTERFACEARRIVAL = 0;
        private const int CM_NOTIFY_ACTION_DEVICEINTERFACEREMOVAL = 1;
        private static readonly Guid GUID_DEVINTERFACE_USB_DEVICE = new Guid("A5DCBF10-6530-11D2-901F-00C04FB951ED");

        [StructLayout(LayoutKind.Explicit, Size = 416, CharSet = CharSet.Unicode)]
        private struct CM_NOTIFY_FILTER
        {
            [FieldOffset(0)] public uint cbSize;
            [FieldOffset(4)] public uint Flags;
            [FieldOffset(8)] public uint FilterType;
            [FieldOffset(12)] public uint Reserved;
            [FieldOffset(16)] public Guid ClassGuid;
        }

        private delegate uint PCM_NOTIFY_CALLBACK(
            IntPtr hNotify,
            IntPtr context,
            int action,
            IntPtr eventData,
            int eventDataSize);

        [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)]
        private static extern uint CM_Register_Notification(
            ref CM_NOTIFY_FILTER pFilter,
            IntPtr pContext,
            PCM_NOTIFY_CALLBACK pCallback,
            out IntPtr pNotifyContext);

        [DllImport("cfgmgr32.dll")]
        private static extern uint CM_Unregister_Notification(IntPtr hNotifyContext);

        private static readonly ObservableReaderState _observableReader = new ObservableReaderState();
        // Referencia estática viva para evitar que el GC recolecte el delegado nativo de cfgmgr32.dll
        private static readonly PCM_NOTIFY_CALLBACK _cmNotifyDelegate = OnKernelUsbDeviceNotification;
        private static IntPtr _cmNotificationHandle = IntPtr.Zero;
        private static readonly object _monitorInitLock = new object();

        /// <summary>
        /// Parsea un tag con formato "userId_HAND_FINGER" y retorna componentes individuales
        /// Si el tag es formato antiguo (sin HAND_FINGER), retorna info básica
        /// </summary>
        private static object? ParseTag(string tag)
        {
            if (string.IsNullOrEmpty(tag)) return null;

            var parts = tag.Split('_');

            // Formato antiguo (sin estructura de mano/dedo)
            if (parts.Length < 3)
            {
                return new
                {
                    userId = tag,
                    hand = "UNKNOWN",
                    finger = "UNKNOWN",
                    handLabel = "Desconocida",
                    fingerLabel = "Desconocido",
                    handEmoji = "❓",
                    fingerEmoji = "👆",
                    displayName = $"{tag} | 👆 Dedo desconocido ❓ (Formato antiguo)",
                    isLegacyFormat = true
                };
            }

            // Formato nuevo estructurado: userId_HAND_FINGER
            var userId = string.Join("_", parts.Take(parts.Length - 2));
            var hand = parts[parts.Length - 2];
            var finger = parts[parts.Length - 1];

            var fingerLabels = new Dictionary<string, string>
            {
                ["THUMB"] = "Pulgar",
                ["INDEX"] = "Índice",
                ["MIDDLE"] = "Medio",
                ["RING"] = "Anular",
                ["PINKY"] = "Meñique"
            };

            var fingerEmojis = new Dictionary<string, string>
            {
                ["THUMB"] = "👍",
                ["INDEX"] = "☝️",
                ["MIDDLE"] = "🖕",
                ["RING"] = "💍",
                ["PINKY"] = "🤙"
            };

            var handEmoji = hand == "LEFT" ? "🫲" : "🫱";
            var handLabel = hand == "LEFT" ? "Izquierda" : "Derecha";
            var fingerLabel = fingerLabels.ContainsKey(finger) ? fingerLabels[finger] : finger;
            var fingerEmoji = fingerEmojis.ContainsKey(finger) ? fingerEmojis[finger] : "";

            return new
            {
                userId,
                hand,
                finger,
                handLabel,
                fingerLabel,
                handEmoji,
                fingerEmoji,
                displayName = $"{userId} | {fingerEmoji} {fingerLabel} {handEmoji} {handLabel}",
                isLegacyFormat = false
            };
        }

        /// <summary>
        /// Envía evento al frontend en tiempo real
        /// </summary>
        private static void SendEvent(string eventType, string message, string severity = "INFO", object? data = null)
        {
            if (_callback == null)
            {
                Console.WriteLine($"[EVENT SKIP] Callback not registered: {eventType}");
                return;
            }

            var eventData = new Dictionary<string, object>
            {
                ["evt"] = eventType,
                ["eventType"] = eventType,
                ["message"] = message,
                ["severity"] = severity,
                ["timestamp"] = DateTime.UtcNow.ToString("O"),
                ["origin"] = "dp4500"
            };

            if (data != null)
            {
                eventData["data"] = data;
            }

            Console.WriteLine($"[EVENT] {eventType}: {message}");

            // Ejecutar callback en thread separado (Edge.js no bloquea)
            Task.Run(async () =>
            {
                try
                {
                    await _callback(eventData);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[EVENT ERROR] {eventType}: {ex.Message}");
                }
            });
        }

        /// <summary>
        /// Obtiene la versión real de archivo de una DLL nativa o administrada
        /// </summary>
        private static string GetDllFileVersion(string dllName, bool preferSystem32 = false)
        {
            try
            {
                if (dllName.Equals("DPUruNet.dll", StringComparison.OrdinalIgnoreCase))
                {
                    var asmLoc = typeof(DPUruNet.Reader).Assembly.Location;
                    if (!string.IsNullOrWhiteSpace(asmLoc) && File.Exists(asmLoc))
                    {
                        var vi = FileVersionInfo.GetVersionInfo(asmLoc);
                        if (!string.IsNullOrWhiteSpace(vi.FileVersion))
                            return vi.FileVersion.Trim();
                    }
                    var asmVer = typeof(DPUruNet.Reader).Assembly.GetName().Version;
                    if (asmVer != null)
                        return asmVer.ToString();
                }

                var asmDir = Path.GetDirectoryName(typeof(EdgeUruBridge).Assembly.Location) ?? AppDomain.CurrentDomain.BaseDirectory;
                var baseDir = AppDomain.CurrentDomain.BaseDirectory;
                var candidates = preferSystem32
                    ? new[]
                    {
                        Path.Combine(Environment.SystemDirectory, dllName),
                        Path.Combine(asmDir, dllName),
                        Path.Combine(asmDir, @"..\..\bin-deps", dllName),
                        Path.Combine(baseDir, dllName),
                        Path.Combine(baseDir, @"..\bin-deps", dllName),
                        Path.Combine(baseDir, @"..\..\bin-deps", dllName)
                    }
                    : new[]
                    {
                        Path.Combine(asmDir, dllName),
                        Path.Combine(asmDir, @"..\..\bin-deps", dllName),
                        Path.Combine(baseDir, dllName),
                        Path.Combine(baseDir, @"..\bin-deps", dllName),
                        Path.Combine(baseDir, @"..\..\bin-deps", dllName),
                        Path.Combine(Environment.SystemDirectory, dllName)
                    };

                foreach (var candidate in candidates)
                {
                    if (File.Exists(candidate))
                    {
                        var vi = FileVersionInfo.GetVersionInfo(candidate);
                        if (!string.IsNullOrWhiteSpace(vi.FileVersion))
                        {
                            return vi.FileVersion.Trim();
                        }
                    }
                }
            }
            catch { }

            return "Desconocida";
        }

        /// <summary>
        /// Consulta en el Registro de Windows la versión del controlador USB de DigitalPersona (VID_05BA)
        /// </summary>
        private static (string driverVersion, string driverDate, string provider, string service, string deviceDesc) GetWindowsUsbDriverInfo()
        {
            string driverVersion = "No detectado";
            string driverDate = "N/A";
            string provider = "DigitalPersona / HID Global";
            string service = "usbdpfp";
            string deviceDesc = "DigitalPersona USB Biometric Reader";

            try
            {
                using var usbKey = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Enum\USB");
                if (usbKey != null)
                {
                    foreach (var subKeyName in usbKey.GetSubKeyNames())
                    {
                        if (!subKeyName.StartsWith("VID_05BA", StringComparison.OrdinalIgnoreCase))
                            continue;

                        using var vidKey = usbKey.OpenSubKey(subKeyName);
                        if (vidKey == null) continue;

                        foreach (var instanceName in vidKey.GetSubKeyNames())
                        {
                            using var instKey = vidKey.OpenSubKey(instanceName);
                            if (instKey == null) continue;

                            var drvClassPath = instKey.GetValue("Driver") as string;
                            var svcVal = instKey.GetValue("Service") as string;
                            var descVal = instKey.GetValue("DeviceDesc") as string;

                            if (!string.IsNullOrWhiteSpace(svcVal)) service = svcVal!;
                            if (!string.IsNullOrWhiteSpace(descVal))
                            {
                                var semiIdx = descVal!.LastIndexOf(';');
                                deviceDesc = (semiIdx >= 0 ? descVal.Substring(semiIdx + 1) : descVal).Replace("\uFFFD", "®").Trim();
                            }

                            if (!string.IsNullOrWhiteSpace(drvClassPath))
                            {
                                using var classKey = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\Class\" + drvClassPath);
                                if (classKey != null)
                                {
                                    driverVersion = (classKey.GetValue("DriverVersion") as string) ?? driverVersion;
                                    driverDate = (classKey.GetValue("DriverDate") as string) ?? driverDate;
                                    provider = (classKey.GetValue("ProviderName") as string) ?? provider;
                                    return (driverVersion, driverDate, provider, service, deviceDesc);
                                }
                            }
                        }
                    }
                }
            }
            catch { }

            return (driverVersion, driverDate, provider, service, deviceDesc);
        }

        /// <summary>
        /// Construye el objeto completo con información real del dispositivo físico y versiones de controladores
        /// </summary>
        private static object BuildReaderAndDriverInfo()
        {
            DPUruNet.Reader? hwReader = null;
            int readerCount = 0;

            try
            {
                var collection = DPUruNet.ReaderCollection.GetReaders();
                if (collection != null && collection.Count > 0)
                {
                    readerCount = collection.Count;
                    hwReader = collection[0];
                }
            }
            catch { }

            bool isConnected = hwReader != null;
            var desc = hwReader?.Description;

            string rawProductName = desc?.Id?.ProductName ?? "DigitalPersona U.are.U 4500";
            string cleanProductName = rawProductName.Replace("\uFFFD", "®").Trim();
            string vendorName = desc?.Id?.VendorName?.Replace("\uFFFD", "®").Trim() ?? "DigitalPersona, Inc.";
            string vendorIdHex = desc?.Id != null ? $"0x{desc.Id.VendorId:X4}" : "0x05BA";
            string productIdHex = desc?.Id != null ? $"0x{desc.Id.ProductId:X4}" : "0x000A";
            string serialNumber = isConnected ? (desc?.SerialNumber ?? "DP4500-ACTIVE") : "Sin dispositivo conectado";
            string deviceName = isConnected ? (desc?.Name ?? "N/A") : "Desconectado";
            string firmwareVersion = isConnected ? (desc?.Version?.FirmwareVersion ?? "N/A") : "N/A";
            string hardwareRevision = isConnected ? (desc?.Version?.HardwareVersion ?? "N/A") : "N/A";
            string rawTechnology = isConnected && desc != null ? desc.Technology.ToString() : "DP_OPTICAL";
            string rawModality = isConnected && desc != null ? desc.Modality.ToString() : "DP_AREA";

            bool isTouchActive = _reader != null && _reader.IsContinuousModeActive();
            string captureMode = _reader != null ? _reader.GetCaptureMode().ToString() : "Idle";
            string readerStatus = !isConnected
                ? "DISCONNECTED"
                : (isTouchActive ? "LISTENING_CONTINUOUS" : (_reader != null ? "READY" : "CONNECTED_STANDBY"));

            int[] resolutions = new[] { 500, 512 };
            bool canCapture = true, canStream = false, extractFeatures = true, canMatch = true, canIdentify = true;
            bool hasPowerManagement = true, hasCalibration = true, pivCompliant = true;

            try
            {
                var openedCaps = _reader?.ActiveReader?.Capabilities;
                if (openedCaps != null)
                {
                    var validRes = openedCaps.Resolutions?.Where(r => r > 0).Distinct().ToArray();
                    if (validRes != null && validRes.Length > 0)
                        resolutions = validRes;
                    canCapture = openedCaps.CanCapture;
                    canStream = openedCaps.CanStream;
                    extractFeatures = openedCaps.ExtractFeatures;
                    canMatch = openedCaps.CanMatch;
                    canIdentify = openedCaps.CanIdentify;
                    hasPowerManagement = openedCaps.HasPowerManagement;
                    hasCalibration = openedCaps.HasCalibration;
                    pivCompliant = openedCaps.PIVCompliant;
                }
            }
            catch { }

            string dpUruNetVer = GetDllFileVersion("DPUruNet.dll");
            string dpfpddVer = GetDllFileVersion("dpfpdd.dll");
            string dpfjVer = GetDllFileVersion("dpfj.dll");
            string sysDpfjVer = GetDllFileVersion("dpfj.dll", preferSystem32: true);
            var usbDrv = GetWindowsUsbDriverInfo();

            string resolutionLabel = resolutions.Length > 0
                ? string.Join(" / ", resolutions.Select(r => $"{r} DPI"))
                : "500 / 512 DPI";

            return new
            {
                connected = isConnected,
                readerCount,
                status = isConnected ? "Connected" : "Disconnected",
                readerStatus,
                captureMode,
                isTouchActive,

                // Información real del dispositivo físico
                model = cleanProductName,
                vendor = vendorName,
                vendorId = vendorIdHex,
                productId = productIdHex,
                serial = serialNumber,
                deviceName,
                firmware = firmwareVersion,
                hardwareRevision,

                // Capacidades técnicas del lector
                resolution = resolutionLabel,
                resolutions,
                captureArea = "0.62\" x 0.5\" (15.8 x 12.7 mm)",
                bitDepth = "8-bit grayscale (256 levels)",
                technology = rawTechnology == "DP_OPTICAL" ? "Óptico (DP_OPTICAL)" : rawTechnology,
                deviceModality = rawModality == "DP_AREA" ? "Contacto / Área (DP_AREA)" : rawModality,

                // Resumen y desglose detallado de controladores (drivers) y librerías
                driver = usbDrv.driverVersion != "No detectado"
                    ? $"{usbDrv.provider} ({usbDrv.service}) v{usbDrv.driverVersion}"
                    : $"dpfpdd v{dpfpddVer}",
                sdk = $"DPUruNet v{dpUruNetVer}",
                platform = $".NET {Environment.Version} (x64)",

                drivers = new
                {
                    usbDriverVersion = usbDrv.driverVersion,
                    usbDriverDate = usbDrv.driverDate,
                    usbDriverProvider = usbDrv.provider,
                    usbService = usbDrv.service,
                    usbDeviceDescription = usbDrv.deviceDesc,
                    dpfpddVersion = dpfpddVer,
                    dpfjVersion = dpfjVer,
                    systemDpfjVersion = sysDpfjVer,
                    dpUruNetVersion = dpUruNetVer,
                    clrVersion = $".NET Framework {Environment.Version}"
                },

                capabilities = new
                {
                    canCapture,
                    canStream,
                    extractFeatures,
                    canMatch,
                    canIdentify,
                    hasPowerManagement,
                    hasCalibration,
                    pivCompliant
                },

                imageFormat = "RAW/PNG/WSQ",
                templateFormats = new[]
                {
                    "DP_REGISTRATION",
                    "DP_VERIFICATION",
                    "DP_PRE_REGISTRATION",
                    "ANSI 378",
                    "ISO 19794-2"
                },
                imageWidth = 355,
                imageHeight = 391,
                pixelFormat = "8bpp Grayscale",
                interfaceType = "USB 2.0",
                supportedOS = "Windows 7/8/10/11, Linux, macOS",
                certifications = new[] { "FBI PIV-071006", "STQC" },
                detectionMechanism = "Windows Kernel CM_Register_Notification (cfgmgr32.dll) + INotifyPropertyChanged (0% Polling)",
                checkedAt = DateTime.UtcNow.ToString("O")
            };
        }

        /// <summary>
        /// Registra la notificación directa del Kernel de Windows (cfgmgr32.dll CM_Register_Notification)
        /// y suscribe el handler PropertyChanged sobre ObservableReaderState (0% Polling en reposo).
        /// </summary>
        private static void StartConnectionMonitor()
        {
            lock (_monitorInitLock)
            {
                if (_cmNotificationHandle != IntPtr.Zero)
                    return;

                // 1. Sincronizar estado inicial del hardware
                _observableReader.SyncFromHardware(isArrivalHint: false);

                // 2. Suscribir handler al evento PropertyChanged del estado observable
                _observableReader.PropertyChanged -= OnReaderPropertyChanged;
                _observableReader.PropertyChanged += OnReaderPropertyChanged;

                // 3. Registrar callback nativo en el Configuration Manager del Kernel de Windows (cfgmgr32.dll)
                var filter = new CM_NOTIFY_FILTER
                {
                    cbSize = 416,
                    Flags = 0,
                    FilterType = CM_NOTIFY_FILTER_TYPE_DEVICEINTERFACE,
                    Reserved = 0,
                    ClassGuid = GUID_DEVINTERFACE_USB_DEVICE
                };

                uint cr = CM_Register_Notification(
                    ref filter,
                    IntPtr.Zero,
                    _cmNotifyDelegate,
                    out _cmNotificationHandle);

                if (cr == 0 && _cmNotificationHandle != IntPtr.Zero)
                {
                    Console.WriteLine("[BRIDGE] Kernel USB Plug & Play Notification registered via cfgmgr32.dll + INotifyPropertyChanged (0% Polling)");
                }
                else
                {
                    Console.WriteLine($"[BRIDGE WARN] CM_Register_Notification returned CR={cr}");
                }
            }
        }

        /// <summary>
        /// Callback nativo invocado directamente por el Kernel de Windows (cfgmgr32.dll) en < 5 ms
        /// cuando un dispositivo USB se conecta o desconecta físicamente.
        /// </summary>
        private static uint OnKernelUsbDeviceNotification(
            IntPtr hNotify,
            IntPtr context,
            int action,
            IntPtr eventData,
            int eventDataSize)
        {
            try
            {
                if (action != CM_NOTIFY_ACTION_DEVICEINTERFACEARRIVAL &&
                    action != CM_NOTIFY_ACTION_DEVICEINTERFACEREMOVAL)
                {
                    return 0;
                }

                // En CM_NOTIFY_EVENT_DATA para DEVICEINTERFACE:
                // offset 0 = FilterType (4), offset 4 = Reserved (4), offset 8 = ClassGuid (16), offset 24 = WCHAR SymbolicLink[]
                string symbolicLink = "";
                if (eventData != IntPtr.Zero && eventDataSize > 24)
                {
                    symbolicLink = Marshal.PtrToStringUni(IntPtr.Add(eventData, 24)) ?? "";
                }

                // Filtrar exclusivamente por el Vendor ID de DigitalPersona (VID_05BA)
                if (!string.IsNullOrEmpty(symbolicLink) &&
                    symbolicLink.IndexOf("VID_05BA", StringComparison.OrdinalIgnoreCase) < 0)
                {
                    return 0;
                }

                if (action == CM_NOTIFY_ACTION_DEVICEINTERFACEREMOVAL)
                {
                    // Desconexión física detectada por el Kernel: disparo inmediato (< 5 ms)
                    Task.Run(() => _observableReader.HandleDeviceRemoved(symbolicLink));
                }
                else if (action == CM_NOTIFY_ACTION_DEVICEINTERFACEARRIVAL)
                {
                    // Conexión física detectada por el Kernel: sincronizar con DPUruNet cuando usbdpfp esté listo
                    Task.Run(() => _observableReader.SyncFromHardware(isArrivalHint: true, symbolicLink: symbolicLink));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[KERNEL USB CALLBACK ERROR] {ex.Message}");
            }

            return 0; // ERROR_SUCCESS
        }

        /// <summary>
        /// Handler reactivo de INotifyPropertyChanged sobre _observableReader
        /// </summary>
        private static void OnReaderPropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName != nameof(ObservableReaderState.IsConnected))
                return;

            try
            {
                if (!_observableReader.IsConnected)
                {
                    if (_reader != null)
                    {
                        try { _reader.Dispose(); } catch { }
                        _reader = null;
                    }

                    var info = BuildReaderAndDriverInfo();
                    SendEvent("READER_DISCONNECTED", "⚠️ Lector biométrico desconectado del puerto USB", "WARNING", info);
                }
                else
                {
                    var info = BuildReaderAndDriverInfo();
                    SendEvent("READER_CONNECTED", $"✅ Lector biométrico conectado ({_observableReader.ProductName})", "SUCCESS", info);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[PROPERTY_CHANGED ERROR] {ex.Message}");
            }
        }

        public async Task<object> Invoke(dynamic input)
        {
            string op = (string?)input?.op ?? "";

            switch (op)
            {
                case "bootstrap":
                {
                    string? extra = (string?)input?.searchPath;
                    try
                    {
                        NativeLoader.Bootstrap(AppDomain.CurrentDomain.BaseDirectory, extra ?? "", @"..\bin-deps");
                        StartConnectionMonitor();

                        // Store solo en RAM - NO persistencia por seguridad
                        SendEvent("SYSTEM_STATUS", "Sistema inicializado (Store en RAM - volátil)", "SUCCESS");
                        return new { ok = true, message = "Bootstrap successful - RAM storage only" };
                    }
                    catch (Exception ex)
                    {
                        SendEvent("SYSTEM_ERROR", $"Bootstrap failed: {ex.Message}", "ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "registerCallback":
                {
                    _callback = (Func<object, Task<object>>)input.callback;
                    Console.WriteLine("[BRIDGE] Callback registered");
                    return new { ok = true, message = "Callback registered" };
                }

                case "init":
                {
                    try
                    {
                        StartConnectionMonitor();

                        // Re-crear servicio para limpiar estado anterior
                        if (_reader != null)
                        {
                            try { _reader.Dispose(); } catch { }
                        }

                        _reader = new Dp4500Service();

                        // Registrar eventos directos (solo eventos importantes)

                        // Evento: Muestra recolectada
                        _reader.OnSampleCountChanged += count =>
                        {
                            SendEvent("SAMPLE_COLLECTED", $"Muestra {count}/4 recolectada", "SUCCESS",
                                new { sampleNumber = count, totalSamples = 4, progress = (count * 100) / 4 });
                        };

                        // Evento: Solo notificar intentos FALLIDOS (no exitosos)
                        _reader.OnAttemptResult += (attemptNum, success, reason) =>
                        {
                            if (!success)
                            {
                                SendEvent("CAPTURE_FAILED", $"Intento fallido: {reason}", "WARNING",
                                    new { attemptNumber = attemptNum, reason });
                            }
                        };

                        // Evento: Imagen capturada
                        _reader.OnImageCaptured += imageBase64 =>
                        {
                            if (!string.IsNullOrEmpty(imageBase64))
                            {
                                SendEvent("IMAGE_CAPTURED", "Imagen capturada", "SUCCESS",
                                    new { imageBase64, imageSize = imageBase64.Length });
                            }
                        };

                        // Evento: Desconexión física durante captura continua (respaldo directo desde IRP de Dp4500Service)
                        _reader.OnReaderDisconnected += reason =>
                        {
                            Task.Run(() => _observableReader.SyncFromHardware(isArrivalHint: false));
                        };

                        _reader.Init();
                        _observableReader.SyncFromHardware(isArrivalHint: false);

                        var info = BuildReaderAndDriverInfo();
                        SendEvent("READER_READY", "Lector biométrico inicializado y listo", "SUCCESS", info);

                        return new { ok = true, message = "Reader initialized", info };
                    }
                    catch (Exception ex)
                    {
                        SendEvent("SYSTEM_ERROR", $"Init failed: {ex.Message}", "ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "single":
                {
                    if (_reader == null)
                    {
                        var error = "Reader not initialized. Call 'init' first.";
                        SendEvent("SYSTEM_ERROR", error, "ERROR");
                        return new { ok = false, error };
                    }

                    var timeoutMs = (int?)input?.timeoutMs ?? 20000;

                    SendEvent("CAPTURE_STARTED", "Coloque su dedo en el lector", "INFO");

                    _cts?.Cancel();
                    _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));

                    try
                    {
                        // Capturar usando SingleCapture con timeout en segundos (por defecto 20s)
                        await Task.Run(() => _reader.SingleCapture(_cts.Token, timeoutMs / 1000));

                        string? imageBase64 = null;
                        string? templateBase64 = null;

                        // Obtener la imagen capturada
                        if (_reader.LastFid != null)
                        {
                            imageBase64 = Dp4500Service.FidToBase64Png(_reader.LastFid);

                            // Generar FMD de verificación desde el Fid
                            var createResult = DPUruNet.FeatureExtraction.CreateFmdFromFid(
                                _reader.LastFid,
                                DPUruNet.Constants.Formats.Fmd.DP_VERIFICATION);

                            if (createResult.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && createResult.Data != null)
                            {
                                var fmdXml = DPUruNet.Fmd.SerializeXml(createResult.Data);
                                templateBase64 = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(fmdXml));
                            }

                            SendEvent("IMAGE_CAPTURED", "Huella capturada exitosamente", "SUCCESS",
                                new { imageBase64 });
                        }

                        SendEvent("CAPTURE_COMPLETED", "Captura simple completada", "SUCCESS",
                            new { imageBase64, templateBase64 });

                        return new
                        {
                            ok = true,
                            captured = true,
                            message = "Captura exitosa",
                            imageBase64,
                            templateBase64
                        };
                    }
                    catch (Exception ex)
                    {
                        SendEvent("CAPTURE_FAILED", ex.Message, "ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "enroll":
                {
                    if (_reader == null)
                    {
                        var error = "Reader not initialized. Call 'init' first.";
                        SendEvent("SYSTEM_ERROR", error, "ERROR");
                        return new { ok = false, error };
                    }

                    var userId = (string?)input?.tag ?? $"User_{DateTime.Now:yyyyMMdd_HHmmss}";
                    var timeoutPerSampleSeconds = (int?)input?.timeoutPerSampleSeconds ?? 20;
                    var targetFarn = (int?)input?.targetFarn ?? 21474;
                    var maxRetriesPerSample = (int?)input?.maxRetriesPerSample ?? 3;
                    var maxSamples = (int?)input?.maxSamples ?? 4;
                    var defaultTotalMs = (maxSamples * timeoutPerSampleSeconds * 1000) + 15000;
                    var timeoutMs = (int?)input?.timeoutMs ?? defaultTotalMs;
                    if (timeoutMs < defaultTotalMs) timeoutMs = defaultTotalMs;

                    SendEvent("ENROLLMENT_STARTED", $"Iniciando enrolamiento para: {userId}", "INFO",
                        new { userId });
                    SendEvent("CAPTURE_STARTED", "Coloque su dedo en el lector", "INFO");

                    _cts?.Cancel();
                    _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));

                    // ⚡ EJECUTAR EN THREAD SEPARADO para no bloquear Edge.js
                    var result = await Task.Run(() => _reader.Enroll3(_cts.Token, targetFarn, maxRetriesPerSample, maxSamples, timeoutPerSampleSeconds));

                    try
                    {

                        string? imageBase64 = null;
                        string? templateBase64 = null;

                        if (result.ok && result.fmdReg != null)
                        {
                            // Almacenar con nueva estructura (enroll simple = Hand/Finger desconocido)
                            FingerprintTempStore.AddFingerprint(userId, Hand.Unknown, Finger.Unknown, result.fmdReg, EnrollmentType.SingleFinger, false);

                            // Generar imagen
                            if (_reader.LastFid != null)
                            {
                                imageBase64 = Dp4500Service.FidToBase64Png(_reader.LastFid);
                            }

                            // Serializar template
                            var regXml = DPUruNet.Fmd.SerializeXml(result.fmdReg);
                            templateBase64 = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(regXml));

                            SendEvent("USER_ENROLLED", $"Usuario {userId} enrolado exitosamente", "SUCCESS",
                                new { userId });
                        }

                        if (result.ok)
                        {
                            SendEvent("ENROLLMENT_COMPLETED", $"Enrolamiento completado: {userId}", "SUCCESS",
                                new { userId, imageBase64, templateBase64 });
                        }
                        else
                        {
                            SendEvent("ENROLLMENT_FAILED", result.msg ?? "Enrolamiento fallido", "ERROR");
                        }

                        return new
                        {
                            ok = result.ok,
                            enrolled = result.ok,
                            userId,
                            message = result.msg,
                            imageBase64,
                            templateBase64
                        };
                    }
                    catch (Exception ex)
                    {
                        SendEvent("ENROLLMENT_FAILED", ex.Message, "ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "verify":
                {
                    if (_reader == null)
                    {
                        var error = "Reader not initialized. Call 'init' first.";
                        SendEvent("SYSTEM_ERROR", error, "ERROR");
                        return new { ok = false, error };
                    }

                    var userId = (string?)input?.tag ?? "";
                    if (string.IsNullOrEmpty(userId))
                    {
                        return new { ok = false, error = "UserId is required for verification" };
                    }

                    var timeoutPerAttemptSeconds = (int?)input?.timeoutPerAttemptSeconds ?? 20;
                    var targetFarn = (int?)input?.targetFarn ?? 21474;
                    var maxAttempts = (int?)input?.maxAttempts ?? 4;
                    var defaultTotalMs = (maxAttempts * timeoutPerAttemptSeconds * 1000) + 15000;
                    var timeoutMs = (int?)input?.timeoutMs ?? defaultTotalMs;
                    if (timeoutMs < defaultTotalMs) timeoutMs = defaultTotalMs;

                    SendEvent("VERIFICATION_STARTED", $"Iniciando verificación para: {userId}", "INFO",
                        new { userId, maxAttempts });

                    _cts?.Cancel();
                    _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));

                    try
                    {
                        var stored = FingerprintTempStore.GetFingerprintByTag(userId);
                        if (stored == null)
                        {
                            return new { ok = false, error = $"Fingerprint with tag '{userId}' not found" };
                        }

                        // LOOP DE HASTA 4 INTENTOS - Termina en cuanto haya match exitoso
                        for (int attempt = 1; attempt <= maxAttempts; attempt++)
                        {
                            SendEvent("CAPTURE_STARTED", $"Intento {attempt}/{maxAttempts} - Coloque su dedo en el lector", "INFO",
                                new { attemptNumber = attempt, totalAttempts = maxAttempts });

                            // ⚡ EJECUTAR EN THREAD SEPARADO para no bloquear Edge.js
                            var result = await Task.Run(() => _reader.VerifyLiveAgainstReg(stored.Fmd, _cts.Token, targetFarn, timeoutPerAttemptSeconds));

                            string? imageBase64 = null;
                            if (result.ok && _reader.LastFid != null)
                            {
                                imageBase64 = Dp4500Service.FidToBase64Png(_reader.LastFid);
                                SendEvent("IMAGE_CAPTURED", "Imagen capturada", "INFO", new { imageBase64 });
                            }

                            var verified = result.score < targetFarn;

                            // Emitir progreso
                            var progress = (attempt * 100) / maxAttempts;
                            SendEvent("VERIFICATION_ATTEMPT", $"Intento {attempt}/{maxAttempts} completado", "INFO",
                                new { attemptNumber = attempt, totalAttempts = maxAttempts, progress, verified, score = result.score });

                            // ✅ ÉXITO - Terminar inmediatamente
                            if (verified)
                            {
                                var parsedTag = ParseTag(userId);

                                SendEvent("VERIFICATION_SUCCESS", $"Verificación exitosa para {userId} en intento {attempt}/{maxAttempts}", "SUCCESS",
                                    new { userId, score = result.score, threshold = targetFarn, attempt, totalAttempts = maxAttempts, parsedTag });

                                return new
                                {
                                    ok = result.ok,
                                    verified = true,
                                    tag = userId,
                                    userId,
                                    score = result.score,
                                    attempt,
                                    totalAttempts = maxAttempts,
                                    message = $"Verificado en intento {attempt}",
                                    imageBase64,
                                    parsedTag
                                };
                            }

                            // Si no es el último intento y no hay match, continuar
                            if (attempt < maxAttempts)
                            {
                                SendEvent("VERIFICATION_RETRY", $"Intento {attempt}/{maxAttempts} sin coincidencia, reintentando...", "WARNING",
                                    new { attemptNumber = attempt, totalAttempts = maxAttempts, score = result.score, threshold = targetFarn });
                                await Task.Delay(500); // Pausa breve entre intentos
                            }
                        }

                        // ❌ FALLÓ - Todos los intentos sin match
                        SendEvent("VERIFICATION_FAILED", $"Verificación fallida para {userId} después de {maxAttempts} intentos", "ERROR",
                            new { userId, attempts = maxAttempts });

                        return new
                        {
                            ok = true,
                            verified = false,
                            userId,
                            score = 999999,
                            attempt = maxAttempts,
                            totalAttempts = maxAttempts,
                            message = $"No verificado después de {maxAttempts} intentos",
                            imageBase64 = (string?)null
                        };
                    }
                    catch (Exception ex)
                    {
                        SendEvent("VERIFICATION_FAILED", ex.Message, "ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "identify":
                {
                    if (_reader == null)
                    {
                        var error = "Reader not initialized. Call 'init' first.";
                        SendEvent("SYSTEM_ERROR", error, "ERROR");
                        return new { ok = false, error };
                    }

                    var timeoutPerAttemptSeconds = (int?)input?.timeoutPerAttemptSeconds ?? 20;
                    var targetFarn = (int?)input?.targetFarn ?? 21474;
                    var top = (int?)input?.top ?? 5;
                    var maxAttempts = (int?)input?.maxAttempts ?? 4;
                    var defaultTotalMs = (maxAttempts * timeoutPerAttemptSeconds * 1000) + 15000;
                    var timeoutMs = (int?)input?.timeoutMs ?? defaultTotalMs;
                    if (timeoutMs < defaultTotalMs) timeoutMs = defaultTotalMs;

                    var gallerySize = FingerprintTempStore.GetAllFingerprints().Count;

                    SendEvent("IDENTIFICATION_STARTED", $"Iniciando identificación 1:N (galería: {gallerySize} usuarios)", "INFO",
                        new { gallerySize, maxAttempts });

                    _cts?.Cancel();
                    _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));

                    try
                    {
                        // LOOP DE HASTA 4 INTENTOS - Termina en cuanto haya match exitoso
                        for (int attempt = 1; attempt <= maxAttempts; attempt++)
                        {
                            SendEvent("CAPTURE_STARTED", $"Intento {attempt}/{maxAttempts} - Coloque su dedo en el lector", "INFO",
                                new { attemptNumber = attempt, totalAttempts = maxAttempts });

                            // ⚡ EJECUTAR EN THREAD SEPARADO para no bloquear Edge.js
                            var result = await Task.Run(() => _reader.IdentifyLive1N(_cts.Token, targetFarn, top, timeoutPerAttemptSeconds));

                            string? imageBase64 = null;
                            if (_reader.LastFid != null)
                            {
                                imageBase64 = Dp4500Service.FidToBase64Png(_reader.LastFid);
                                SendEvent("IMAGE_CAPTURED", "Imagen capturada", "INFO", new { imageBase64 });
                            }

                            // Emitir progreso
                            var progress = (attempt * 100) / maxAttempts;
                            SendEvent("IDENTIFICATION_ATTEMPT", $"Intento {attempt}/{maxAttempts} completado", "INFO",
                                new { attemptNumber = attempt, totalAttempts = maxAttempts, progress, matched = result.match, bestScore = result.bestScore });

                            // ✅ ÉXITO - Match encontrado, terminar inmediatamente
                            if (result.match)
                            {
                                var parsedTag = ParseTag(result.bestTag);

                                SendEvent("IDENTIFICATION_MATCH", $"Usuario identificado: {result.bestTag} en intento {attempt}/{maxAttempts}", "SUCCESS",
                                    new { userId = result.bestTag, score = result.bestScore, gallerySize, attempt, totalAttempts = maxAttempts, parsedTag });

                                return new
                                {
                                    ok = true,
                                    match = true,
                                    bestTag = result.bestTag,
                                    bestScore = result.bestScore,
                                    topK = result.topK.Select(m => new { tag = m.tag, score = m.score }).ToArray(),
                                    attempt,
                                    totalAttempts = maxAttempts,
                                    message = $"Identificado en intento {attempt}",
                                    imageBase64,
                                    galleryFormat = result.galleryFormat,
                                    parsedTag
                                };
                            }

                            // Si no es el último intento y no hay match, continuar
                            if (attempt < maxAttempts)
                            {
                                SendEvent("IDENTIFICATION_RETRY", $"Intento {attempt}/{maxAttempts} sin coincidencia, reintentando...", "WARNING",
                                    new { attemptNumber = attempt, totalAttempts = maxAttempts, bestScore = result.bestScore, threshold = targetFarn });
                                await Task.Delay(500); // Pausa breve entre intentos
                            }
                        }

                        // ❌ FALLÓ - Todos los intentos sin match
                        SendEvent("IDENTIFICATION_NO_MATCH", $"No se encontró coincidencia después de {maxAttempts} intentos", "ERROR",
                            new { attempts = maxAttempts, threshold = targetFarn, gallerySize });

                        return new
                        {
                            ok = true,
                            match = false,
                            bestTag = (string?)null,
                            bestScore = 999999,
                            topK = new object[0],
                            attempt = maxAttempts,
                            totalAttempts = maxAttempts,
                            message = $"No identificado después de {maxAttempts} intentos",
                            imageBase64 = (string?)null,
                            galleryFormat = "DP_REGISTRATION"
                        };
                    }
                    catch (Exception ex)
                    {
                        SendEvent("IDENTIFICATION_FAILED", ex.Message, "ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "identifyLastCapture":
                {
                    if (_reader == null)
                    {
                        var error = "Reader not initialized. Call 'init' first.";
                        SendEvent("SYSTEM_ERROR", error, "ERROR");
                        return new { ok = false, error };
                    }

                    // Obtener el último FMD capturado en modo touch
                    var lastFmd = _reader.GetLastCapturedFmd();
                    if (lastFmd == null)
                    {
                        var error = "No fingerprint captured yet in touch mode";
                        SendEvent("SYSTEM_ERROR", error, "ERROR");
                        return new { ok = false, error };
                    }

                    var targetFarn = (int?)input?.targetFarn ?? 21474;
                    var allTemplates = _reader.GetAllTemplates();
                    var gallerySize = allTemplates.Count;

                    SendEvent("TOUCH_IDENTIFICATION_STARTED", $"Identificando con última huella capturada (galería: {gallerySize})", "INFO",
                        new { gallerySize });

                    // Buscar match contra todos los templates
                    string? matchedUserId = null;
                    int bestScore = int.MaxValue;

                    foreach (var kvp in allTemplates)
                    {
                        var tag = kvp.Key;
                        var storedFmd = kvp.Value;
                        var compareResult = DPUruNet.Comparison.Compare(lastFmd, 0, storedFmd, 0);

                        if (compareResult.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && compareResult.Score != int.MaxValue)
                        {
                            if (compareResult.Score < bestScore)
                            {
                                bestScore = compareResult.Score;
                                if (compareResult.Score < targetFarn)
                                {
                                    matchedUserId = tag;
                                }
                            }
                        }
                    }

                    if (matchedUserId != null)
                    {
                        var parsedTag = ParseTag(matchedUserId);
                        SendEvent("TOUCH_IDENTIFICATION_MATCH", $"Usuario identificado: {matchedUserId}", "SUCCESS",
                            new { userId = matchedUserId, score = bestScore, gallerySize, parsedTag });

                        return new
                        {
                            ok = true,
                            matched = true,
                            userId = matchedUserId,
                            score = bestScore,
                            gallerySize,
                            message = "Identificado con última huella capturada",
                            parsedTag
                        };
                    }

                    SendEvent("TOUCH_IDENTIFICATION_NO_MATCH", "No se encontró coincidencia", "WARNING",
                        new { bestScore, threshold = targetFarn, gallerySize });

                    return new
                    {
                        ok = true,
                        matched = false,
                        userId = (string?)null,
                        score = bestScore,
                        gallerySize,
                        message = "No se encontró coincidencia"
                    };
                }

                case "enrollAllFingers":
                {
                    if (_reader == null)
                    {
                        var error = "Reader not initialized. Call 'init' first.";
                        SendEvent("SYSTEM_ERROR", error, "ERROR");
                        return new { ok = false, error };
                    }

                    var userId = (string?)input?.userId ?? "";
                    if (string.IsNullOrEmpty(userId))
                    {
                        return new { ok = false, error = "UserId is required for enrollAllFingers" };
                    }

                    var timeoutPerSampleSeconds = (int?)input?.timeoutPerSampleSeconds ?? 20;
                    var maxRetriesPerSample = (int?)input?.maxRetriesPerSample ?? 3;
                    var maxSamples = (int?)input?.maxSamples ?? 4;
                    var timeoutPerFingerMs = (int?)input?.timeoutPerFingerMs ?? (maxSamples * timeoutPerSampleSeconds * 1000 + 15000);
                    var targetFarn = (int?)input?.targetFarn ?? 21474;

                    SendEvent("ALL_FINGERS_ENROLLMENT_STARTED", $"Iniciando enrolamiento de 10 dedos para: {userId}", "INFO",
                        new { userId, totalFingers = 10 });

                    var enrollmentData = new Dictionary<string, object>
                    {
                        ["userId"] = userId,
                        ["enrolledAt"] = DateTime.UtcNow.ToString("O"),
                        ["hands"] = new Dictionary<string, object>
                        {
                            ["left"] = new Dictionary<string, object>
                            {
                                ["fingers"] = new List<object>()
                            },
                            ["right"] = new Dictionary<string, object>
                            {
                                ["fingers"] = new List<object>()
                            }
                        }
                    };

                    var hands = new[] { "LEFT", "RIGHT" };
                    var fingers = new[] { "THUMB", "INDEX", "MIDDLE", "RING", "PINKY" };
                    var fingerLabels = new Dictionary<string, string>
                    {
                        ["THUMB"] = "Pulgar",
                        ["INDEX"] = "Índice",
                        ["MIDDLE"] = "Medio",
                        ["RING"] = "Anular",
                        ["PINKY"] = "Meñique"
                    };
                    var fingerEmojis = new Dictionary<string, string>
                    {
                        ["THUMB"] = "👍",
                        ["INDEX"] = "☝️",
                        ["MIDDLE"] = "🖕",
                        ["RING"] = "💍",
                        ["PINKY"] = "🤙"
                    };

                    int totalFingerCount = 0;
                    int successCount = 0;
                    var failedFingers = new List<object>();

                    foreach (var hand in hands)
                    {
                        var handEmoji = hand == "LEFT" ? "🫲" : "🫱";
                        var handLabel = hand == "LEFT" ? "IZQUIERDA" : "DERECHA";

                        SendEvent("HAND_ENROLLMENT_STARTED", $"{handEmoji} Iniciando captura mano {handLabel}", "INFO",
                            new { hand, handLabel });

                        foreach (var finger in fingers)
                        {
                            totalFingerCount++;
                            var fingerLabel = fingerLabels[finger];
                            var fingerEmoji = fingerEmojis[finger];
                            var tag = $"{userId}_{hand}_{finger}";

                            SendEvent("FINGER_ENROLLMENT_STARTED",
                                $"{handEmoji} {fingerEmoji} Dedo {totalFingerCount}/10: Coloca {fingerLabel} {handLabel} (4 veces)",
                                "INFO",
                                new { hand, finger, fingerLabel, progress = (totalFingerCount * 10) });

                            try
                            {
                                _cts?.Cancel();
                                _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutPerFingerMs));

                                var result = await Task.Run(() => _reader.Enroll3(_cts.Token, targetFarn, maxRetriesPerSample, maxSamples, timeoutPerSampleSeconds));

                                if (result.ok && result.fmdReg != null)
                                {
                                    // Parsear hand y finger de strings a enums
                                    var handEnum = hand == "LEFT" ? Hand.Left : Hand.Right;
                                    var fingerEnum = finger switch
                                    {
                                        "THUMB" => Finger.Thumb,
                                        "INDEX" => Finger.Index,
                                        "MIDDLE" => Finger.Middle,
                                        "RING" => Finger.Ring,
                                        "PINKY" => Finger.Pinky,
                                        _ => Finger.Unknown
                                    };

                                    // Guardar en store con nueva API
                                    var storedFingerprint = FingerprintTempStore.AddFingerprint(userId, handEnum, fingerEnum, result.fmdReg, EnrollmentType.AllFingers, false);

                                    // Generar imagen y template
                                    string? imageBase64 = null;
                                    string? templateBase64 = null;

                                    if (_reader.LastFid != null)
                                    {
                                        imageBase64 = Dp4500Service.FidToBase64Png(_reader.LastFid);
                                    }

                                    var regXml = DPUruNet.Fmd.SerializeXml(result.fmdReg);
                                    templateBase64 = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(regXml));

                                    // Hash ya está disponible en el objeto retornado
                                    var hash = storedFingerprint.Sha1;

                                    var fingerData = new Dictionary<string, object>
                                    {
                                        ["type"] = finger,
                                        ["label"] = fingerLabel,
                                        ["emoji"] = fingerEmoji,
                                        ["tag"] = tag,
                                        ["template"] = templateBase64 ?? "",
                                        ["hash"] = hash,
                                        ["quality"] = 0,
                                        ["status"] = "success",
                                        ["enrolledAt"] = DateTime.UtcNow.ToString("O")
                                    };

                                    var handsDict = (Dictionary<string, object>)enrollmentData["hands"];
                                    var handDict = (Dictionary<string, object>)handsDict[hand.ToLower()];
                                    var fingersList = (List<object>)handDict["fingers"];
                                    fingersList.Add(fingerData);

                                    successCount++;

                                    SendEvent("FINGER_ENROLLMENT_COMPLETED",
                                        $"✅ {handEmoji} {fingerEmoji} {fingerLabel} {handLabel} enrolado ({successCount}/10)",
                                        "SUCCESS",
                                        new { hand, finger, tag, progress = (totalFingerCount * 10), success = true });
                                }
                                else
                                {
                                    // Error pero NO abortar - registrar error y continuar
                                    var errorMsg = result.msg ?? "Error desconocido";

                                    failedFingers.Add(new
                                    {
                                        hand,
                                        finger,
                                        fingerLabel,
                                        tag,
                                        error = errorMsg,
                                        order = totalFingerCount
                                    });

                                    SendEvent("FINGER_ENROLLMENT_FAILED",
                                        $"❌ {handEmoji} {fingerEmoji} {fingerLabel} {handLabel} FALLÓ: {errorMsg}",
                                        "ERROR",
                                        new { hand, finger, tag, error = errorMsg, order = totalFingerCount, progress = (totalFingerCount * 10) });
                                }
                            }
                            catch (Exception ex)
                            {
                                // Error inesperado pero NO abortar - registrar y continuar
                                var errorMsg = ex.Message;

                                failedFingers.Add(new
                                {
                                    hand,
                                    finger,
                                    fingerLabel,
                                    tag,
                                    error = errorMsg,
                                    order = totalFingerCount
                                });

                                SendEvent("FINGER_ENROLLMENT_FAILED",
                                    $"❌ {handEmoji} {fingerEmoji} {fingerLabel} {handLabel} FALLÓ: {errorMsg}",
                                    "ERROR",
                                    new { hand, finger, tag, error = errorMsg, order = totalFingerCount, progress = (totalFingerCount * 10) });
                            }

                            // Pausa entre dedos para estabilización del lector
                            await Task.Delay(600);
                        }

                        SendEvent("HAND_ENROLLMENT_COMPLETED", $"✅ {handEmoji} Mano {handLabel} procesada", "INFO",
                            new { hand, handLabel });
                    }

                    var allSuccess = failedFingers.Count == 0;
                    var partialSuccess = successCount > 0 && failedFingers.Count > 0;

                    if (allSuccess)
                    {
                        SendEvent("ALL_FINGERS_ENROLLMENT_COMPLETED", $"🎉 ¡ENROLAMIENTO COMPLETO! 10 dedos enrolados para {userId}", "SUCCESS",
                            new { userId, totalFingers = 10, successCount });
                    }
                    else if (partialSuccess)
                    {
                        SendEvent("ALL_FINGERS_ENROLLMENT_PARTIAL", $"⚠️ Enrolamiento parcial: {successCount}/10 dedos enrolados para {userId}", "WARNING",
                            new { userId, totalFingers = 10, successCount, failedCount = failedFingers.Count });
                    }
                    else
                    {
                        SendEvent("ALL_FINGERS_ENROLLMENT_FAILED", $"❌ Enrolamiento fallido: 0/10 dedos enrolados para {userId}", "ERROR",
                            new { userId, totalFingers = 10, successCount = 0, failedCount = failedFingers.Count });
                    }

                    return new
                    {
                        ok = true,
                        allSuccess,
                        partialSuccess,
                        userId,
                        totalFingers = 10,
                        successCount,
                        failedCount = failedFingers.Count,
                        failedFingers = failedFingers.ToArray(),
                        message = allSuccess ? "Enrolamiento completo exitoso" : $"Enrolamiento completado con {successCount}/10 dedos",
                        data = enrollmentData
                    };
                }

                case "storeList":
                {
                    var items = FingerprintTempStore.GetAllFingerprints();
                    return new
                    {
                        ok = true,
                        count = items.Count,
                        items = items.Select(x => new
                        {
                            id = x.Id,
                            tag = x.Tag,
                            userId = x.UserId,
                            hand = x.Hand.ToString(),
                            finger = x.Finger.ToString(),
                            format = x.Format,
                            bytes = x.Bytes,
                            sha1 = x.Sha1,
                            enrolledAt = x.EnrolledAt,
                            enrollmentType = x.EnrollmentType.ToString()
                        }).ToArray()
                    };
                }

                case "storeClear":
                {
                    FingerprintTempStore.Clear();
                    SendEvent("STORE_CLEARED", "Almacenamiento temporal limpiado", "INFO");
                    return new { ok = true, message = "Store cleared" };
                }

                case "loadTemplate":
                {
                    try
                    {
                        var userId = (string?)input?.userId;
                        var templateBase64 = (string?)input?.templateBase64;
                        var hand = (string?)input?.hand ?? "UNKNOWN";
                        var finger = (string?)input?.finger ?? "UNKNOWN";

                        if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(templateBase64))
                        {
                            return new { ok = false, error = "userId and templateBase64 are required" };
                        }

                        // Decodificar template XML desde Base64
                        var templateXml = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(templateBase64));

                        // Deserializar FMD desde XML
                        var fmd = DPUruNet.Fmd.DeserializeXml(templateXml);
                        if (fmd == null)
                        {
                            return new { ok = false, error = "Failed to deserialize FMD from XML" };
                        }

                        // Parsear hand y finger
                        Hand handEnum = hand.ToUpper() switch
                        {
                            "LEFT" => Hand.Left,
                            "RIGHT" => Hand.Right,
                            _ => Hand.Unknown
                        };

                        Finger fingerEnum = finger.ToUpper() switch
                        {
                            "THUMB" => Finger.Thumb,
                            "INDEX" => Finger.Index,
                            "MIDDLE" => Finger.Middle,
                            "RING" => Finger.Ring,
                            "PINKY" => Finger.Pinky,
                            _ => Finger.Unknown
                        };

                        // Agregar al store
                        var storedFingerprint = FingerprintTempStore.AddFingerprint(
                            userId,
                            handEnum,
                            fingerEnum,
                            fmd,
                            EnrollmentType.SingleFinger,
                            false
                        );

                        SendEvent("TEMPLATE_LOADED", $"Template cargado: {userId} | {hand} {finger}", "SUCCESS",
                            new { userId, hand, finger, tag = storedFingerprint.Tag });

                        return new
                        {
                            ok = true,
                            message = "Template loaded successfully",
                            tag = storedFingerprint.Tag,
                            userId,
                            hand,
                            finger
                        };
                    }
                    catch (Exception ex)
                    {
                        SendEvent("SYSTEM_ERROR", $"Error loading template: {ex.Message}", "ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "dispose":
                {
                    if (_reader != null)
                    {
                        try { _reader.Dispose(); } catch { }
                        _reader = null;
                    }
                    SendEvent("READER_DISPOSED", "Lector liberado", "INFO");
                    return new { ok = true, message = "Reader disposed" };
                }

                case "getReaderInfo":
                {
                    try
                    {
                        StartConnectionMonitor();
                        var readerInfo = BuildReaderAndDriverInfo();
                        SendEvent("READER_INFO_RETRIEVED", "Información del lector y controladores obtenida", "INFO", readerInfo);
                        return new { ok = true, info = readerInfo };
                    }
                    catch (Exception ex)
                    {
                        SendEvent("SYSTEM_ERROR", $"Error obteniendo info: {ex.Message}", "ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "storeStats":
                {
                    try
                    {
                        var stats = FingerprintTempStore.GetStats();
                        SendEvent("STORE_STATS_RETRIEVED", "Estadísticas del almacenamiento RAM obtenidas", "INFO");
                        return new { ok = true, stats };
                    }
                    catch (Exception ex)
                    {
                        SendEvent("SYSTEM_ERROR", $"Error obteniendo estadísticas: {ex.Message}", "ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "startTouchMode":
                {
                    if (_reader == null)
                    {
                        var error = "Reader not initialized. Call 'init' first.";
                        SendEvent("SYSTEM_ERROR", error, "ERROR");
                        return new { ok = false, error };
                    }

                    try
                    {
                        // Verificar si ya está activo
                        if (_reader.IsContinuousModeActive())
                        {
                            return new { ok = false, error = "Touch mode is already active" };
                        }

                        // Suscribirse a eventos de modo continuo
                        _reader.OnFingerTouched += (fid) =>
                        {
                            SendEvent("FINGER_TOUCHED", "👆 Dedo detectado en el lector", "INFO",
                                new {
                                    width = fid.Views[0].Width,
                                    height = fid.Views[0].Height,
                                    timestamp = DateTime.UtcNow.ToString("O")
                                });

                            // Enviar imagen si es posible
                            try
                            {
                                var imageBase64 = Dp4500Service.FidToBase64Png(fid);
                                SendEvent("IMAGE_CAPTURED", "Imagen de huella capturada", "SUCCESS",
                                    new { imageBase64, imageSize = imageBase64.Length });
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine($"[TouchMode] Error generando imagen: {ex.Message}");
                            }
                        };

                        _reader.OnFingerprintReady += (fmd) =>
                        {
                            SendEvent("FINGERPRINT_READY", "✅ Huella lista para comparación", "SUCCESS",
                                new {
                                    fmdSize = fmd.Bytes?.Length ?? 0,
                                    format = "ANSI",
                                    timestamp = DateTime.UtcNow.ToString("O")
                                });
                        };

                        _reader.OnCaptureReady += () =>
                        {
                            SendEvent("CAPTURE_READY", "🔄 Listo para próxima captura", "INFO",
                                new { timestamp = DateTime.UtcNow.ToString("O") });
                        };

                        // Iniciar modo continuo
                        _reader.StartContinuousCapture();

                        SendEvent("TOUCH_MODE_STARTED", "🎧 Modo de eventos touch ACTIVADO - esperando dedos...", "SUCCESS",
                            new {
                                mode = "Continuous",
                                eventsAvailable = new[] { "FINGER_TOUCHED", "FINGERPRINT_READY", "CAPTURE_READY" }
                            });

                        return new {
                            ok = true,
                            message = "Touch mode started successfully",
                            mode = "Continuous",
                            events = new[] { "FINGER_TOUCHED", "FINGERPRINT_READY", "CAPTURE_READY" }
                        };
                    }
                    catch (Exception ex)
                    {
                        SendEvent("SYSTEM_ERROR", $"Error starting touch mode: {ex.Message}", "ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "stopTouchMode":
                {
                    if (_reader == null)
                    {
                        var error = "Reader not initialized.";
                        SendEvent("SYSTEM_ERROR", error, "ERROR");
                        return new { ok = false, error };
                    }

                    try
                    {
                        // Verificar si está activo
                        if (!_reader.IsContinuousModeActive())
                        {
                            return new { ok = false, error = "Touch mode is not active" };
                        }

                        // Detener modo continuo (esto limpia los eventos internamente)
                        _reader.StopContinuousCapture();

                        SendEvent("TOUCH_MODE_STOPPED", "⏹️ Modo de eventos touch DESACTIVADO", "INFO",
                            new {
                                mode = "OnDemand",
                                timestamp = DateTime.UtcNow.ToString("O")
                            });

                        return new {
                            ok = true,
                            message = "Touch mode stopped successfully",
                            mode = "OnDemand"
                        };
                    }
                    catch (Exception ex)
                    {
                        SendEvent("SYSTEM_ERROR", $"Error stopping touch mode: {ex.Message}", "ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "getTouchModeStatus":
                {
                    if (_reader == null)
                    {
                        var error = "Reader not initialized.";
                        SendEvent("SYSTEM_ERROR", error, "ERROR");
                        return new { ok = false, error };
                    }

                    try
                    {
                        var isActive = _reader.IsContinuousModeActive();
                        var mode = _reader.GetCaptureMode();

                        return new {
                            ok = true,
                            isActive,
                            mode = mode.ToString(),
                            modeDescription = mode == CaptureMode.Continuous
                                ? "Escucha continua - eventos automáticos"
                                : "Bajo demanda - requiere llamadas API"
                        };
                    }
                    catch (Exception ex)
                    {
                        SendEvent("SYSTEM_ERROR", $"Error getting touch mode status: {ex.Message}", "ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                default:
                    return new { ok = false, error = $"Unknown operation: {op}" };
            }
        }
    }
}
