#nullable enable
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading;
using System.Drawing;
using System.Drawing.Imaging;
using DPUruNet;

[assembly: DefaultDllImportSearchPaths(
    DllImportSearchPath.AssemblyDirectory |
    DllImportSearchPath.ApplicationDirectory |
    DllImportSearchPath.System32 |
    DllImportSearchPath.SafeDirectories)]

internal static class NativeLoader
{
    private const uint LOAD_LIBRARY_SEARCH_DEFAULT_DIRS = 0x00001000;
    private const uint LOAD_LIBRARY_SEARCH_USER_DIRS = 0x00000400;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetDefaultDllDirectories(uint flags);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr AddDllDirectory(string path);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr LoadLibraryW(string fileName);

    public static void Bootstrap(params string[] extraDirs)
    {
        if (!SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_DEFAULT_DIRS | LOAD_LIBRARY_SEARCH_USER_DIRS))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "SetDefaultDllDirectories()");
        foreach (var dir in extraDirs)
            if (!string.IsNullOrWhiteSpace(dir) && Directory.Exists(dir))
                AddDllDirectory(dir);
        foreach (var dll in new[] { "dpfpdd.dll", "dpfj.dll" }) LoadLibraryW(dll);
    }
}

/* ===============================
 * Enums para Datos Estructurados
 * ===============================*/
public enum Hand
{
    Left,
    Right,
    Unknown
}

public enum Finger
{
    Thumb,      // Pulgar
    Index,      // Índice
    Middle,     // Medio
    Ring,       // Anular
    Pinky,      // Meñique
    Unknown
}

public enum EnrollmentType
{
    SimpleCapture,    // Captura simple (sin enrolar)
    SingleFinger,     // Enroll normal (4 muestras de 1 dedo)
    AllFingers        // Enroll de 10 dedos
}

/// <summary>
/// Modos de captura del lector
/// </summary>
public enum CaptureMode
{
    OnDemand,    // Modo tradicional con timeouts (compatible con código existente)
    Continuous   // Modo de escucha continua con eventos touch (sin timers)
}

/* ===============================
 * DTOs (Data Transfer Objects)
 * ===============================*/

/// <summary>
/// DTO de una huella individual con toda su metadata
/// </summary>
public sealed class FingerprintDto
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = "";
    public Hand Hand { get; set; } = Hand.Unknown;
    public Finger Finger { get; set; } = Finger.Unknown;
    public DPUruNet.Fmd Fmd { get; set; } = null!;
    public string Format { get; set; } = "DP_REGISTRATION";
    public DateTime EnrolledAt { get; set; } = DateTime.UtcNow;
    public string Sha1 { get; set; } = "";
    public int Bytes { get; set; }
    public EnrollmentType EnrollmentType { get; set; } = EnrollmentType.SimpleCapture;

    // Metadata adicional (de StoredFmd original)
    public string Tag { get; set; } = ""; // Tag para compatibilidad
    public int XmlLength { get; set; }
    public string XmlPreview { get; set; } = "";
}

/// <summary>
/// DTO de un usuario completo con todas sus huellas organizadas por mano y dedo
/// </summary>
public sealed class UserFingerprintsDto
{
    public string UserId { get; set; } = "";
    public DateTime RegisteredAt { get; set; } = DateTime.UtcNow;

    // Estructura jerárquica: Mano → Dedo → Huella
    public Dictionary<Hand, Dictionary<Finger, FingerprintDto>> Fingerprints { get; set; }
        = new Dictionary<Hand, Dictionary<Finger, FingerprintDto>>();

    public int TotalFingerprints { get; set; }
    public EnrollmentType EnrollmentType { get; set; } = EnrollmentType.SingleFinger;
}

/// <summary>
/// DTO para resultados de búsqueda/identificación
/// </summary>
public sealed class FingerprintSearchResult
{
    public bool Found { get; set; }
    public string UserId { get; set; } = "";
    public Hand Hand { get; set; } = Hand.Unknown;
    public Finger Finger { get; set; } = Finger.Unknown;
    public string FingerprintId { get; set; } = "";
    public int Score { get; set; }
    public string Format { get; set; } = "";
    public string Tag { get; set; } = "";
}

/// <summary>
/// Almacenamiento TEMPORAL en memoria RAM con estructura organizada
/// NO persiste en disco por razones de seguridad - datos biométricos sensibles
/// Solo almacena plantillas FINALES (DP_REGISTRATION), no intermedias (PRE/VER/ANSI)
/// </summary>
public static class FingerprintTempStore
{
    private static readonly object _sync = new object();

    // Almacenamiento principal: userId → UserFingerprintsDto
    private static readonly Dictionary<string, UserFingerprintsDto> _users
        = new Dictionary<string, UserFingerprintsDto>();

    // Índice rápido: fingerprintId → FingerprintDto
    private static readonly Dictionary<string, FingerprintDto> _fingerprintIndex
        = new Dictionary<string, FingerprintDto>();

    // Índice para compatibilidad con tags (userId_HAND_FINGER o legacy)
    private static readonly Dictionary<string, FingerprintDto> _tagIndex
        = new Dictionary<string, FingerprintDto>();

    /// <summary>
    /// Agregar huella con estructura completa (usuario/mano/dedo)
    /// </summary>
    public static FingerprintDto AddFingerprint(
        string userId,
        Hand hand,
        Finger finger,
        DPUruNet.Fmd fmd,
        EnrollmentType enrollmentType,
        bool keepXmlPreview = false)
    {
        lock (_sync)
        {
            // Crear DTO de la huella
            using var sha1 = SHA1.Create();
            var bytes = fmd.Bytes ?? Array.Empty<byte>();
            var sha = BitConverter.ToString(sha1.ComputeHash(bytes)).Replace("-", "");

            var xml = keepXmlPreview ? DPUruNet.Fmd.SerializeXml(fmd) : string.Empty;

            var fingerprint = new FingerprintDto
            {
                Id = Guid.NewGuid().ToString(),
                UserId = userId,
                Hand = hand,
                Finger = finger,
                Fmd = fmd,
                Format = "DP_REGISTRATION",
                EnrolledAt = DateTime.UtcNow,
                Sha1 = sha,
                Bytes = bytes.Length,
                EnrollmentType = enrollmentType,
                Tag = GenerateTag(userId, hand, finger),
                XmlLength = keepXmlPreview ? xml.Length : 0,
                XmlPreview = keepXmlPreview ? (xml.Length > 160 ? xml.Substring(0, 160) + "…" : xml) : "(omitido)"
            };

            // Crear usuario si no existe
            if (!_users.ContainsKey(userId))
            {
                _users[userId] = new UserFingerprintsDto
                {
                    UserId = userId,
                    RegisteredAt = DateTime.UtcNow,
                    EnrollmentType = enrollmentType,
                    Fingerprints = new Dictionary<Hand, Dictionary<Finger, FingerprintDto>>()
                };
            }

            var user = _users[userId];

            // Crear mano si no existe
            if (!user.Fingerprints.ContainsKey(hand))
            {
                user.Fingerprints[hand] = new Dictionary<Finger, FingerprintDto>();
            }

            // Agregar/actualizar huella
            user.Fingerprints[hand][finger] = fingerprint;
            user.TotalFingerprints = CountUserFingerprints(user);

            // Agregar a índices
            _fingerprintIndex[fingerprint.Id] = fingerprint;
            _tagIndex[fingerprint.Tag] = fingerprint;

            Console.WriteLine($"[Store RAM] ➕ {userId} | {GetHandEmoji(hand)} {GetFingerEmoji(finger)} | {bytes.Length} bytes");
            Console.WriteLine($"[Store RAM] 📊 Total: {_fingerprintIndex.Count} huellas | {_users.Count} usuarios");

            return fingerprint;
        }
    }

    /// <summary>
    /// Obtener huella específica por usuario/mano/dedo
    /// </summary>
    public static FingerprintDto? GetFingerprint(string userId, Hand hand, Finger finger)
    {
        lock (_sync)
        {
            if (_users.TryGetValue(userId, out var user))
            {
                if (user.Fingerprints.TryGetValue(hand, out var handFingerprints))
                {
                    if (handFingerprints.TryGetValue(finger, out var fingerprint))
                    {
                        return fingerprint;
                    }
                }
            }
            return null;
        }
    }

    /// <summary>
    /// Obtener huella por Tag (compatibilidad: userId_HAND_FINGER)
    /// </summary>
    public static FingerprintDto? GetFingerprintByTag(string tag)
    {
        lock (_sync)
        {
            return _tagIndex.TryGetValue(tag, out var fingerprint) ? fingerprint : null;
        }
    }

    /// <summary>
    /// Obtener usuario completo con todas sus huellas
    /// </summary>
    public static UserFingerprintsDto? GetUser(string userId)
    {
        lock (_sync)
        {
            return _users.TryGetValue(userId, out var user) ? user : null;
        }
    }

    /// <summary>
    /// Obtener todas las huellas de un usuario en formato plano (lista)
    /// </summary>
    public static List<FingerprintDto> GetUserFingerprints(string userId)
    {
        lock (_sync)
        {
            if (!_users.TryGetValue(userId, out var user))
                return new List<FingerprintDto>();

            var fingerprints = new List<FingerprintDto>();
            foreach (var handEntry in user.Fingerprints)
            {
                foreach (var fingerEntry in handEntry.Value)
                {
                    fingerprints.Add(fingerEntry.Value);
                }
            }
            return fingerprints;
        }
    }

    /// <summary>
    /// Obtener todas las huellas (para identificación 1:N)
    /// </summary>
    public static List<FingerprintDto> GetAllFingerprints()
    {
        lock (_sync)
        {
            return new List<FingerprintDto>(_fingerprintIndex.Values);
        }
    }

    /// <summary>
    /// Obtener todos los usuarios
    /// </summary>
    public static List<UserFingerprintsDto> GetAllUsers()
    {
        lock (_sync)
        {
            return new List<UserFingerprintsDto>(_users.Values);
        }
    }

    /// <summary>
    /// Buscar a qué usuario/mano/dedo pertenece una huella por tag
    /// </summary>
    public static FingerprintSearchResult FindFingerprintOwnerByTag(string tag)
    {
        lock (_sync)
        {
            if (_tagIndex.TryGetValue(tag, out var fp))
            {
                return new FingerprintSearchResult
                {
                    Found = true,
                    UserId = fp.UserId,
                    Hand = fp.Hand,
                    Finger = fp.Finger,
                    FingerprintId = fp.Id,
                    Format = fp.Format,
                    Tag = fp.Tag
                };
            }

            return new FingerprintSearchResult { Found = false };
        }
    }

    /// <summary>
    /// Limpiar memoria RAM (eliminar todas las huellas y usuarios)
    /// </summary>
    public static void Clear()
    {
        lock (_sync)
        {
            var fpCount = _fingerprintIndex.Count;
            var userCount = _users.Count;

            _users.Clear();
            _fingerprintIndex.Clear();
            _tagIndex.Clear();

            Console.WriteLine($"[Store RAM] 🗑️ Limpiado - {fpCount} huellas y {userCount} usuarios eliminados de memoria");
        }
    }

    /// <summary>
    /// Eliminar usuario completo con todas sus huellas
    /// </summary>
    public static bool DeleteUser(string userId)
    {
        lock (_sync)
        {
            if (!_users.TryGetValue(userId, out var user))
                return false;

            // Eliminar todas las huellas del usuario de los índices
            foreach (var handEntry in user.Fingerprints)
            {
                foreach (var fingerEntry in handEntry.Value)
                {
                    var fp = fingerEntry.Value;
                    _fingerprintIndex.Remove(fp.Id);
                    _tagIndex.Remove(fp.Tag);
                }
            }

            _users.Remove(userId);
            Console.WriteLine($"[Store RAM] 🗑️ Usuario eliminado: {userId} ({user.TotalFingerprints} huellas)");
            return true;
        }
    }

    /// <summary>
    /// Eliminar huella específica
    /// </summary>
    public static bool DeleteFingerprint(string userId, Hand hand, Finger finger)
    {
        lock (_sync)
        {
            if (!_users.TryGetValue(userId, out var user))
                return false;

            if (!user.Fingerprints.TryGetValue(hand, out var handFingerprints))
                return false;

            if (!handFingerprints.TryGetValue(finger, out var fingerprint))
                return false;

            // Eliminar de índices
            _fingerprintIndex.Remove(fingerprint.Id);
            _tagIndex.Remove(fingerprint.Tag);

            // Eliminar de usuario
            handFingerprints.Remove(finger);

            // Si la mano quedó vacía, eliminarla
            if (handFingerprints.Count == 0)
            {
                user.Fingerprints.Remove(hand);
            }

            // Actualizar contador
            user.TotalFingerprints = CountUserFingerprints(user);

            // Si el usuario quedó sin huellas, eliminarlo
            if (user.TotalFingerprints == 0)
            {
                _users.Remove(userId);
            }

            Console.WriteLine($"[Store RAM] 🗑️ Huella eliminada: {userId} | {GetHandEmoji(hand)} {GetFingerEmoji(finger)}");
            return true;
        }
    }

    /// <summary>
    /// Obtener estadísticas del almacenamiento
    /// </summary>
    public static object GetStats()
    {
        lock (_sync)
        {
            var singleFingerUsers = _users.Values.Count(u => u.EnrollmentType == EnrollmentType.SingleFinger);
            var allFingersUsers = _users.Values.Count(u => u.EnrollmentType == EnrollmentType.AllFingers);

            var fingerprintsByHand = new Dictionary<string, int>();
            foreach (var user in _users.Values)
            {
                foreach (var hand in user.Fingerprints.Keys)
                {
                    var handKey = hand.ToString();
                    if (!fingerprintsByHand.ContainsKey(handKey))
                        fingerprintsByHand[handKey] = 0;
                    fingerprintsByHand[handKey] += user.Fingerprints[hand].Count;
                }
            }

            return new
            {
                storage = "RAM (volátil)",
                totalFingerprints = _fingerprintIndex.Count,
                totalUsers = _users.Count,
                singleFingerEnrollments = singleFingerUsers,
                allFingersEnrollments = allFingersUsers,
                fingerprintsByHand,
                persistentFile = "NINGUNO - Solo RAM por seguridad",
                warningMessage = "Los datos se pierden al reiniciar el servidor (por diseño de seguridad)"
            };
        }
    }

    // ===== Helpers privados =====

    private static int CountUserFingerprints(UserFingerprintsDto user)
    {
        int count = 0;
        foreach (var handEntry in user.Fingerprints)
        {
            count += handEntry.Value.Count;
        }
        return count;
    }

    private static string GenerateTag(string userId, Hand hand, Finger finger)
    {
        if (hand == Hand.Unknown || finger == Finger.Unknown)
        {
            return userId; // Tag simple para casos legacy
        }

        var handStr = hand switch
        {
            Hand.Left => "LEFT",
            Hand.Right => "RIGHT",
            _ => "UNKNOWN"
        };

        var fingerStr = finger switch
        {
            Finger.Thumb => "THUMB",
            Finger.Index => "INDEX",
            Finger.Middle => "MIDDLE",
            Finger.Ring => "RING",
            Finger.Pinky => "PINKY",
            _ => "UNKNOWN"
        };

        return $"{userId}_{handStr}_{fingerStr}";
    }

    private static string GetHandEmoji(Hand hand)
    {
        return hand switch
        {
            Hand.Left => "🫲",
            Hand.Right => "🫱",
            _ => "❓"
        };
    }

    private static string GetFingerEmoji(Finger finger)
    {
        return finger switch
        {
            Finger.Thumb => "👍",
            Finger.Index => "☝️",
            Finger.Middle => "🖕",
            Finger.Ring => "💍",
            Finger.Pinky => "🤙",
            _ => "👆"
        };
    }
}

/* ===============================
 * Servicio DP4500 (EXCLUSIVE)
 * ===============================*/
public sealed class Dp4500Service : IDisposable
{
    private readonly ManualResetEventSlim _sampleReady = new ManualResetEventSlim(false);
    private volatile DPUruNet.CaptureResult? _lastCapture;
    private volatile DPUruNet.Fid? _lastFid;
    private bool _subscribed;
    private int _dpi = 500;

    // ===== Propiedades para Modo Touch (Continuous Capture) =====
    private CaptureMode _captureMode = CaptureMode.OnDemand;
    private bool _isContinuousMode = false;
    private readonly object _continuousModeLock = new object();

    public DPUruNet.Fid? LastFid => _lastFid;

    // ===== Eventos para Modo Touch (Continuous Capture) =====
    /// <summary>
    /// Se dispara cuando se detecta un dedo en el lector (captura válida)
    /// </summary>
    public event Action<DPUruNet.Fid>? OnFingerTouched;

    /// <summary>
    /// Se dispara cuando la huella está lista para comparación (FMD generado)
    /// </summary>
    public event Action<DPUruNet.Fmd>? OnFingerprintReady;

    /// <summary>
    /// Se dispara cuando el lector está listo para la siguiente captura
    /// </summary>
    public event Action? OnCaptureReady;

    private readonly Lazy<DPUruNet.Reader> _readerLazy = new Lazy<DPUruNet.Reader>(() =>
    {
        var readers = DPUruNet.ReaderCollection.GetReaders();
        var reader = readers?.FirstOrDefault() ?? throw new InvalidOperationException("No hay lectores U.are.U conectados.");
        var rc = reader.Open(DPUruNet.Constants.CapturePriority.DP_PRIORITY_EXCLUSIVE);
        if (rc != DPUruNet.Constants.ResultCode.DP_SUCCESS)
            throw new InvalidOperationException($"Reader.Open(EXCLUSIVE) falló: {rc}");
        return reader;
    }, isThreadSafe: true);

    private DPUruNet.Reader Reader => _readerLazy.Value;

    public event Action<string>? OnStatus;
    public event Action<int>? OnSampleCountChanged;
    public event Action<int, bool, string?>? OnAttemptResult;
    public event Action<string>? OnImageCaptured;

    private const int TARGET_FARN_ENROLL_CHECK = 100_000; // filtro intra-enrolamiento

    public void Init()
    {
        if (!_subscribed) { Reader.On_Captured += OnCaptured; _subscribed = true; }
        try
        {
            var caps = Reader.Capabilities;
            if (caps?.Resolutions != null && caps.Resolutions.Length > 0) _dpi = caps.Resolutions[0];
        }
        catch { _dpi = 500; }
    }

    private void OnCaptured(DPUruNet.CaptureResult result)
    {
        _lastCapture = result;
        _sampleReady.Set(); // Mantener para modo OnDemand

        // ===== NUEVO: Lógica para Modo Touch (Continuous) =====
        lock (_continuousModeLock)
        {
            if (_isContinuousMode && _captureMode == CaptureMode.Continuous)
            {
                try
                {
                    // Validar que la captura sea buena
                    if (!IsGoodCapture(result, out var why))
                    {
                        OnStatus?.Invoke($"[TouchMode] ⚠️ Captura rechazada: {why}");
                        // Rearmar captura automáticamente incluso si falla (con manejo robusto)
                        Thread.Sleep(200);
                        TryRearmContinuousCapture();
                        return;
                    }

                    OnStatus?.Invoke("[TouchMode] 👆 Dedo detectado - captura válida");

                    // Disparar evento de dedo tocado
                    OnFingerTouched?.Invoke(result.Data!);

                    _lastFid = result.Data;

                    // Generar FMD para comparación
                    var fmdResult = DPUruNet.FeatureExtraction.CreateFmdFromFid(
                        result.Data!,
                        DPUruNet.Constants.Formats.Fmd.ANSI);

                    if (fmdResult.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && fmdResult.Data != null)
                    {
                        OnStatus?.Invoke("[TouchMode] ✅ Huella lista para comparación");
                        // Disparar evento de huella lista
                        OnFingerprintReady?.Invoke(fmdResult.Data);
                    }
                    else
                    {
                        OnStatus?.Invoke($"[TouchMode] ⚠️ Error generando FMD: {fmdResult.ResultCode}");
                    }

                    // Pequeña pausa para estabilización del lector
                    Thread.Sleep(300);

                    // Rearmar captura automáticamente para continuar escuchando
                    if (_isContinuousMode) // Verificar de nuevo por si se detuvo
                    {
                        TryRearmContinuousCapture();
                    }
                }
                catch (Exception ex)
                {
                    OnStatus?.Invoke($"[TouchMode] ❌ Error procesando captura: {ex.Message}");
                    // Intentar rearmar de todos modos si aún está en modo continuo
                    if (_isContinuousMode)
                    {
                        Thread.Sleep(500);
                        TryRearmContinuousCapture();
                    }
                }
            }
        }
    }

    /// <summary>
    /// Intenta rearmar la captura en modo continuo de forma robusta (sin lanzar excepciones fatales)
    /// </summary>
    private void TryRearmContinuousCapture()
    {
        if (!_isContinuousMode)
        {
            OnStatus?.Invoke("[TouchMode] 🛑 Rearm cancelado - modo ya no está activo");
            return;
        }

        try
        {
            // En modo continuo, intentar rearmar sin timeout estricto
            _sampleReady.Reset();
            _lastCapture = null;

            // Intentar hasta 5 veces con esperas incrementales
            for (int attempt = 1; attempt <= 5; attempt++)
            {
                // Verificar estado del lector
                var statusResult = Reader.GetStatus();
                if (statusResult != DPUruNet.Constants.ResultCode.DP_SUCCESS)
                {
                    OnStatus?.Invoke($"[TouchMode] ⚠️ GetStatus falló (intento {attempt}/5): {statusResult}");
                    Thread.Sleep(attempt * 100); // Espera incremental: 100ms, 200ms, 300ms...
                    continue;
                }

                var status = Reader.Status?.Status ?? DPUruNet.Constants.ReaderStatuses.DP_STATUS_FAILURE;

                if (status == DPUruNet.Constants.ReaderStatuses.DP_STATUS_BUSY)
                {
                    OnStatus?.Invoke($"[TouchMode] ⏳ Lector ocupado (intento {attempt}/5), esperando...");
                    Thread.Sleep(attempt * 150);
                    continue;
                }

                if (status == DPUruNet.Constants.ReaderStatuses.DP_STATUS_NEED_CALIBRATION)
                {
                    OnStatus?.Invoke("[TouchMode] 🔧 Calibrando lector...");
                    Reader.Calibrate();
                    Thread.Sleep(500);
                    continue;
                }

                if (status != DPUruNet.Constants.ReaderStatuses.DP_STATUS_READY)
                {
                    OnStatus?.Invoke($"[TouchMode] ⚠️ Status no READY (intento {attempt}/5): {status}");
                    Thread.Sleep(attempt * 100);
                    continue;
                }

                // Lector está READY, intentar CaptureAsync
                var rc = Reader.CaptureAsync(
                    DPUruNet.Constants.Formats.Fid.ANSI,
                    DPUruNet.Constants.CaptureProcessing.DP_IMG_PROC_DEFAULT,
                    _dpi);

                if (rc == DPUruNet.Constants.ResultCode.DP_SUCCESS)
                {
                    OnStatus?.Invoke("[TouchMode] 🔄 Listo para próxima captura");
                    OnCaptureReady?.Invoke();
                    return; // ✅ Éxito
                }

                OnStatus?.Invoke($"[TouchMode] ⚠️ CaptureAsync falló (intento {attempt}/5): {rc}");
                Thread.Sleep(attempt * 200);
            }

            // Si llegamos aquí, todos los intentos fallaron
            OnStatus?.Invoke("[TouchMode] ❌ No se pudo rearmar captura después de 5 intentos - deteniendo modo continuo");
            _isContinuousMode = false;
            _captureMode = CaptureMode.OnDemand;
        }
        catch (Exception ex)
        {
            OnStatus?.Invoke($"[TouchMode] ❌ Error fatal rearmando captura: {ex.Message}");
            _isContinuousMode = false;
            _captureMode = CaptureMode.OnDemand;
        }
    }

    private static readonly TimeSpan BusyPollDelay = TimeSpan.FromMilliseconds(35);

    private void WaitReadyWithOptionalCancel(CancellationToken ct, int overallTimeoutMs = 4000)
    {
        int deadline = Environment.TickCount + overallTimeoutMs;
        int busyStart = -1;
        bool flushedOnce = false;

        while (Environment.TickCount < deadline)
        {
            ct.ThrowIfCancellationRequested();

            var rc = Reader.GetStatus();
            if (rc != DPUruNet.Constants.ResultCode.DP_SUCCESS)
                throw new InvalidOperationException($"GetStatus: {rc}");

            var st = Reader.Status?.Status ?? DPUruNet.Constants.ReaderStatuses.DP_STATUS_NEED_CALIBRATION;

            if (st == DPUruNet.Constants.ReaderStatuses.DP_STATUS_READY) return;

            if (st == DPUruNet.Constants.ReaderStatuses.DP_STATUS_NEED_CALIBRATION)
            {
                try { Reader.Calibrate(); } catch { }
                Thread.Sleep(BusyPollDelay);
                continue;
            }

            if (st == DPUruNet.Constants.ReaderStatuses.DP_STATUS_BUSY)
            {
                if (busyStart < 0) busyStart = Environment.TickCount;
                if (!flushedOnce && Environment.TickCount - busyStart > 900)
                {
                    try { Reader.CancelCapture(); } catch { }
                    flushedOnce = true;
                    busyStart = Environment.TickCount;
                }
            }

            Thread.Sleep(BusyPollDelay);
        }
        throw new TimeoutException("El lector no volvió a READY a tiempo.");
    }

    private void RequestCaptureGentle(CancellationToken ct)
    {
        _sampleReady.Reset();
        _lastCapture = null;

        WaitReadyWithOptionalCancel(ct, 3000);

        for (int i = 0; i < 3; i++)
        {
            var rc = Reader.CaptureAsync(
                DPUruNet.Constants.Formats.Fid.ANSI,
                DPUruNet.Constants.CaptureProcessing.DP_IMG_PROC_DEFAULT,
                _dpi);

            if (rc == DPUruNet.Constants.ResultCode.DP_SUCCESS) return;

            if (rc == DPUruNet.Constants.ResultCode.DP_DEVICE_BUSY || rc == DPUruNet.Constants.ResultCode.DP_FAILURE)
            {
                Thread.Sleep(120);
                WaitReadyWithOptionalCancel(ct, 1500);
                continue;
            }

            throw new InvalidOperationException($"CaptureAsync: {rc}");
        }

        throw new InvalidOperationException("CaptureAsync: DP_DEVICE_BUSY persistente");
    }

    private static bool IsGoodCapture(DPUruNet.CaptureResult? cap, out string why)
    {
        if (cap == null) { why = "cap==null"; return false; }
        if (cap.ResultCode != DPUruNet.Constants.ResultCode.DP_SUCCESS) { why = $"rc={cap.ResultCode}"; return false; }
        if (cap.Data == null) { why = "Data==null"; return false; }
        if (cap.Quality != DPUruNet.Constants.CaptureQuality.DP_QUALITY_GOOD) { why = $"quality={cap.Quality}"; return false; }
        why = null!; return true;
    }

    // ---- FID -> FMDs ----
    private static DPUruNet.Fmd FidToPreFmd(DPUruNet.Fid fid, out string formatName)
    {
        var fx = DPUruNet.FeatureExtraction.CreateFmdFromFid(fid, DPUruNet.Constants.Formats.Fmd.DP_PRE_REGISTRATION);
        if (fx.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && fx.Data != null)
        { formatName = "DP_PRE_REGISTRATION"; return fx.Data; }

        fx = DPUruNet.FeatureExtraction.CreateFmdFromFid(fid, DPUruNet.Constants.Formats.Fmd.ANSI);
        if (fx.ResultCode != DPUruNet.Constants.ResultCode.DP_SUCCESS || fx.Data == null)
            throw new InvalidOperationException($"CreateFmdFromFid PRE falló: {fx.ResultCode}");
        formatName = "ANSI"; return fx.Data;
    }

    private static DPUruNet.Fmd FidToVerFmd(DPUruNet.Fid fid)
    {
        var fx = DPUruNet.FeatureExtraction.CreateFmdFromFid(fid, DPUruNet.Constants.Formats.Fmd.DP_VERIFICATION);
        if (fx.ResultCode != DPUruNet.Constants.ResultCode.DP_SUCCESS || fx.Data == null)
            throw new InvalidOperationException($"CreateFmdFromFid VER falló: {fx.ResultCode}");
        return fx.Data;
    }

    private static DPUruNet.Fmd FidToAnsiFmd(DPUruNet.Fid fid)
    {
        var fx = DPUruNet.FeatureExtraction.CreateFmdFromFid(fid, DPUruNet.Constants.Formats.Fmd.ANSI);
        if (fx.ResultCode != DPUruNet.Constants.ResultCode.DP_SUCCESS || fx.Data == null)
            throw new InvalidOperationException($"CreateFmdFromFid ANSI falló: {fx.ResultCode}");
        return fx.Data;
    }

    private static void PrintFidMeta(DPUruNet.Fid fid, DPUruNet.CaptureResult cap)
    {
        var v = fid.Views[0];
        Console.WriteLine($"[FID] {v.Width}x{v.Height} px  raw={v.RawImage?.Length ?? 0} bytes  quality={cap.Quality}");
    }

    // === FIX: comparación robusta con fallback y descarte de score=Int32.MaxValue ===
    private static (bool rcOk, int score, string from) CompareSafe(DPUruNet.Fmd aVer, DPUruNet.Fmd bVer, DPUruNet.Fmd aAnsi, DPUruNet.Fmd bAnsi, int targetFarn)
    {
        var c1 = DPUruNet.Comparison.Compare(aVer, 0, bVer, 0);
        if (c1.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && c1.Score != int.MaxValue)
            return (true, c1.Score, "VER");

        var c2 = DPUruNet.Comparison.Compare(aAnsi, 0, bAnsi, 0);
        if (c2.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && c2.Score != int.MaxValue)
            return (true, c2.Score, "ANSI");

        return (false, int.MaxValue, $"rc1={c1.ResultCode},score1={(c1.Score == int.MaxValue ? "MAX" : c1.Score.ToString())}; rc2={c2.ResultCode},score2={(c2.Score == int.MaxValue ? "MAX" : c2.Score.ToString())}");
    }

    // ==== Conversión de FID a imagen Base64 ====
    public static string FidToBase64Png(DPUruNet.Fid fid)
    {
        var v = fid.Views[0];
        using var bmp = new Bitmap(v.Width, v.Height, PixelFormat.Format8bppIndexed);
        var pal = bmp.Palette; for (int i = 0; i < 256; i++) pal.Entries[i] = Color.FromArgb(i, i, i);
        bmp.Palette = pal;

        var data = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.WriteOnly, bmp.PixelFormat);
        try
        {
            int stride = data.Stride, srcW = v.Width;
            for (int y = 0; y < v.Height; y++)
            {
                var dstRow = IntPtr.Add(data.Scan0, y * stride);
                Marshal.Copy(v.RawImage!, y * srcW, dstRow, srcW);
            }
        }
        finally { bmp.UnlockBits(data); }

        using var ms = new MemoryStream();
        bmp.Save(ms, ImageFormat.Png);
        var imageBytes = ms.ToArray();
        return Convert.ToBase64String(imageBytes);
    }

    // ==== Captura simple (S) ====
    public void SingleCapture(CancellationToken ct)
    {
        Init();
        OnStatus?.Invoke("Captura simple… coloca el dedo.");
        RequestCaptureGentle(ct);

        if (!_sampleReady.Wait(TimeSpan.FromSeconds(10), ct))
            throw new TimeoutException("Timeout en captura simple.");

        var cap = _lastCapture;
        if (!IsGoodCapture(cap, out var why))
            throw new InvalidOperationException($"Mala captura: {why}");

        PrintFidMeta(cap!.Data!, cap);
        _lastFid = cap.Data;

        // Send captured image immediately via callback
        try
        {
            var imageBase64 = FidToBase64Png(cap.Data!);
            OnImageCaptured?.Invoke(imageBase64);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WARNING] Could not generate base64 image: {ex.Message}");
        }

        // Generar plantillas PRE/VER/ANSI solo para logging (NO se almacenan)
        var preFmt = "";
        var fmdPre = FidToPreFmd(cap.Data!, out preFmt);
        var fmdVer = FidToVerFmd(cap.Data!);
        var fmdAnsi = FidToAnsiFmd(cap.Data!);

        Console.WriteLine($"[Captura Simple] PRE: {preFmt}, VER y ANSI generados (no almacenados)");
    }

    // ==== Selección de la mejor tríada (VER→ANSI) ====
    private (bool ok, int i, int j, int k) FindBestTriad(System.Collections.Generic.List<DPUruNet.Fmd> verList, System.Collections.Generic.List<DPUruNet.Fmd> ansiList, int targetFarn)
    {
        int n = verList.Count;
        if (n < 3) return (false, -1, -1, -1);

        var scores = new int[n, n];
        var okPair = new bool[n, n];

        for (int a = 0; a < n; a++)
            for (int b = a + 1; b < n; b++)
            {
                var c1 = DPUruNet.Comparison.Compare(verList[a], 0, verList[b], 0);
                if (c1.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && c1.Score != int.MaxValue)
                {
                    scores[a, b] = scores[b, a] = c1.Score;
                    okPair[a, b] = okPair[b, a] = true;
                    continue;
                }
                var c2 = DPUruNet.Comparison.Compare(ansiList[a], 0, ansiList[b], 0);
                if (c2.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && c2.Score != int.MaxValue)
                {
                    scores[a, b] = scores[b, a] = c2.Score;
                    okPair[a, b] = okPair[b, a] = true;
                }
            }

        long bestSum = long.MaxValue;
        (int i, int j, int k) best = (-1, -1, -1);

        for (int i = 0; i < n; i++)
            for (int j = i + 1; j < n; j++)
                for (int k = j + 1; k < n; k++)
                {
                    if (!okPair[i, j] || !okPair[i, k] || !okPair[j, k]) continue;
                    if (scores[i, j] >= targetFarn || scores[i, k] >= targetFarn || scores[j, k] >= targetFarn) continue;

                    long sum = (long)scores[i, j] + scores[i, k] + scores[j, k];
                    if (sum < bestSum) { bestSum = sum; best = (i, j, k); }
                }

        return (best.i >= 0, best.i, best.j, best.k);
    }

    private (bool ok, DPUruNet.Fmd? fmdReg, string msg) TryEnrollmentWithStrategies(System.Collections.Generic.List<DPUruNet.Fmd> preList, System.Collections.Generic.List<DPUruNet.Fmd> ansiList, System.Collections.Generic.List<DPUruNet.Fmd> verList)
    {
        var enr = DPUruNet.Enrollment.CreateEnrollmentFmd(DPUruNet.Constants.Formats.Fmd.DP_REGISTRATION, preList.ToArray());
        if (enr.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && enr.Data != null)
            return (true, enr.Data, "REG desde PRE[]");

        var tri = FindBestTriad(verList, ansiList, TARGET_FARN_ENROLL_CHECK);
        if (tri.ok)
        {
            var sel = new[] { preList[tri.i], preList[tri.j], preList[tri.k] };
            var enrSel = DPUruNet.Enrollment.CreateEnrollmentFmd(DPUruNet.Constants.Formats.Fmd.DP_REGISTRATION, sel);
            if (enrSel.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && enrSel.Data != null)
                return (true, enrSel.Data, "REG desde mejor tríada PRE");
        }

        var enrA = DPUruNet.Enrollment.CreateEnrollmentFmd(DPUruNet.Constants.Formats.Fmd.DP_REGISTRATION, ansiList.ToArray());
        if (enrA.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && enrA.Data != null)
            return (true, enrA.Data, "REG desde ANSI[]");

        if (tri.ok)
        {
            var selA = new[] { ansiList[tri.i], ansiList[tri.j], ansiList[tri.k] };
            var enrSelA = DPUruNet.Enrollment.CreateEnrollmentFmd(DPUruNet.Constants.Formats.Fmd.DP_REGISTRATION, selA);
            if (enrSelA.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && enrSelA.Data != null)
                return (true, enrSelA.Data, "REG desde mejor tríada ANSI");
        }

        return (false, null, "NOT_READY");
    }

    // ===== Verificación en vivo contra un REG dado =====
    public (bool ok, int score, string used, string msg) VerifyLiveAgainstReg(
        DPUruNet.Fmd reg, CancellationToken ct, int targetFarn = 21474)
    {
        OnStatus?.Invoke("Verificación en vivo… coloca el dedo.");
        RequestCaptureGentle(ct);
        if (!_sampleReady.Wait(TimeSpan.FromSeconds(10), ct))
            return (false, int.MaxValue, "TIMEOUT", "Timeout en captura de verificación.");

        var cap = _lastCapture;
        if (!IsGoodCapture(cap, out var why))
            return (false, int.MaxValue, "BAD", $"Mala captura: {why}");

        _lastFid = cap!.Data;

        // Send captured image immediately via callback for verification
        try
        {
            var imageBase64 = FidToBase64Png(cap.Data!);
            OnImageCaptured?.Invoke(imageBase64);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WARNING] Could not generate base64 image during verification: {ex.Message}");
        }

        var fxVer = DPUruNet.FeatureExtraction.CreateFmdFromFid(cap.Data!, DPUruNet.Constants.Formats.Fmd.DP_VERIFICATION);
        if (fxVer.ResultCode != DPUruNet.Constants.ResultCode.DP_SUCCESS || fxVer.Data == null)
            return (false, int.MaxValue, "VER", $"CreateFmdFromFid VER falló: {fxVer.ResultCode}");
        var probeVer = fxVer.Data;

        var fxAnsi = DPUruNet.FeatureExtraction.CreateFmdFromFid(cap.Data!, DPUruNet.Constants.Formats.Fmd.ANSI);
        var probeAnsi = (fxAnsi.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS) ? fxAnsi.Data : null;

        var cmp = DPUruNet.Comparison.Compare(probeVer, 0, reg, 0);
        if (cmp.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && cmp.Score != int.MaxValue)
            return (cmp.Score < targetFarn, cmp.Score, "VER", (cmp.Score < targetFarn) ? "MATCH" : "NO MATCH");

        if (probeAnsi != null)
        {
            var cmp2 = DPUruNet.Comparison.Compare(probeAnsi, 0, reg, 0);
            if (cmp2.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && cmp2.Score != int.MaxValue)
                return (cmp2.Score < targetFarn, cmp2.Score, "ANSI", (cmp2.Score < targetFarn) ? "MATCH" : "NO MATCH");
        }

        return (false, int.MaxValue, "FAIL", $"Compare falló (rc={cmp.ResultCode}, score={(cmp.Score == int.MaxValue ? "MAX" : cmp.Score.ToString())})");
    }

    // ===== 1:N en vivo contra galería (solo DP_REGISTRATION) =====
    public (bool match, int bestScore, string bestTag, string galleryFormat, System.Collections.Generic.List<(string tag, int score)> topK, string msg)
        IdentifyLive1N(CancellationToken ct, int targetFarn = 21474, int top = 5)
    {
        var gallery = FingerprintTempStore.GetAllFingerprints();
        if (gallery.Count == 0) return (false, int.MaxValue, "", "", new System.Collections.Generic.List<(string tag, int score)>(), "Galería vacía.");

        string galleryFmt = "DP_REGISTRATION"; // Ahora solo almacenamos REG finales

        OnStatus?.Invoke($"Identificación 1:N… coloca el dedo. (galería: {gallery.Count} huellas)");
        RequestCaptureGentle(ct);
        if (!_sampleReady.Wait(TimeSpan.FromSeconds(12), ct))
            return (false, int.MaxValue, "", galleryFmt, new System.Collections.Generic.List<(string tag, int score)>(), "Timeout en captura de identificación.");

        var cap = _lastCapture;
        if (!IsGoodCapture(cap, out var why))
            return (false, int.MaxValue, "", galleryFmt, new System.Collections.Generic.List<(string tag, int score)>(), $"Mala captura: {why}");

        _lastFid = cap!.Data;

        // Send captured image immediately via callback for identification
        try
        {
            var imageBase64 = FidToBase64Png(cap.Data!);
            OnImageCaptured?.Invoke(imageBase64);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WARNING] Could not generate base64 image during identification: {ex.Message}");
        }

        // Generar probe en formato VER para comparar contra REG
        var fx = DPUruNet.FeatureExtraction.CreateFmdFromFid(cap.Data!, DPUruNet.Constants.Formats.Fmd.DP_VERIFICATION);
        if (fx.ResultCode != DPUruNet.Constants.ResultCode.DP_SUCCESS || fx.Data == null)
            return (false, int.MaxValue, "", galleryFmt, new System.Collections.Generic.List<(string tag, int score)>(), "No se pudo generar el probe.");

        var probe = fx.Data;
        string usedProbe = "VER";

        var ranking = new System.Collections.Generic.List<(string tag, int score)>();
        int best = int.MaxValue; string bestTag = "";

        foreach (var cand in gallery)
        {
            var c = DPUruNet.Comparison.Compare(probe, 0, cand.Fmd, 0);
            if (c.ResultCode != DPUruNet.Constants.ResultCode.DP_SUCCESS || c.Score == int.MaxValue) continue; // IGNORA inválidos
            ranking.Add((cand.Tag, c.Score));
            if (c.Score < best) { best = c.Score; bestTag = cand.Tag; }
        }

        if (ranking.Count == 0) return (false, int.MaxValue, "", galleryFmt, new System.Collections.Generic.List<(string tag, int score)>(), "Compare inválido para toda la galería.");

        ranking.Sort((a, b) => a.score.CompareTo(b.score));
        var topK = ranking.GetRange(0, Math.Max(1, Math.Min(ranking.Count, top)));

        bool match = best < targetFarn;
        var msg = match
            ? $"MATCH (score={best}, probe={usedProbe}, galería={galleryFmt}) → {bestTag}"
            : $"NO MATCH (mejor score={best} ≥ {targetFarn}, probe={usedProbe}, galería={galleryFmt})";

        return (match, best, bestTag, galleryFmt, topK, msg);
    }

    // ===== Enrolamiento progresivo (4 tomas) con gate robusto =====
    public (bool ok, DPUruNet.Fmd? fmdReg, string msg) Enroll3(
        CancellationToken ct,
        int targetFarn = 21474,
        int maxRetriesPerSample = 3,
        int maxSamples = 4)
    {
        Init();

        var preList = new System.Collections.Generic.List<DPUruNet.Fmd>(maxSamples);
        var ansiList = new System.Collections.Generic.List<DPUruNet.Fmd>(maxSamples);
        var verList = new System.Collections.Generic.List<DPUruNet.Fmd>(maxSamples);

        DPUruNet.Fmd? verFirst = null, ansiFirst = null;

        for (int sampleIndex = 0; sampleIndex < maxSamples; sampleIndex++)
        {
            int attempt = 0;
            while (true)
            {
                ct.ThrowIfCancellationRequested();

                OnStatus?.Invoke($"Coloca el dedo (muestra {sampleIndex + 1}/{maxSamples})… levanta y recoloca cada vez.");
                RequestCaptureGentle(ct);

                if (!_sampleReady.Wait(TimeSpan.FromSeconds(10), ct))
                { OnAttemptResult?.Invoke(sampleIndex + 1, false, "timeout"); return (false, null, $"Timeout en muestra {sampleIndex + 1}"); }

                var cap = _lastCapture;
                if (!IsGoodCapture(cap, out var why))
                {
                    attempt++; OnAttemptResult?.Invoke(sampleIndex + 1, false, $"mala captura: {why}");
                    if (attempt >= maxRetriesPerSample) return (false, null, $"Muestra {sampleIndex + 1}: calidad insuficiente ({why}).");
                    Thread.Sleep(140); continue;
                }

                PrintFidMeta(cap!.Data!, cap);
                _lastFid = cap.Data;

                // Send captured image immediately via callback for each enrollment sample
                try
                {
                    var imageBase64 = FidToBase64Png(cap.Data!);
                    OnImageCaptured?.Invoke(imageBase64);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[WARNING] Could not generate base64 image during enrollment sample {sampleIndex + 1}: {ex.Message}");
                }

                // Generar plantillas intermedias (PRE/VER/ANSI) solo para validación interna
                // NO se almacenan en FingerprintTempStore - solo variables locales
                var preFmt = "";
                var fmdPre = FidToPreFmd(cap.Data!, out preFmt);
                var fmdVer = FidToVerFmd(cap.Data!);
                var fmdAnsi = FidToAnsiFmd(cap.Data!);

                Console.WriteLine($"[Enroll3] Muestra {sampleIndex + 1}: PRE={preFmt}, VER, ANSI generados (no almacenados)");

                if (verFirst == null) { verFirst = fmdVer; ansiFirst = fmdAnsi; }
                else
                {
                    var (rcOk, score, used) = CompareSafe(fmdVer, verFirst!, fmdAnsi, ansiFirst!, TARGET_FARN_ENROLL_CHECK);
                    if (!rcOk)
                    {
                        attempt++; OnAttemptResult?.Invoke(sampleIndex + 1, false, $"compare inválido ({used})");
                        if (attempt >= maxRetriesPerSample) return (false, null, $"Muestra {sampleIndex + 1}: compare inválido ({used}).");
                        Thread.Sleep(160); continue;
                    }
                    if (score >= TARGET_FARN_ENROLL_CHECK)
                    {
                        attempt++; OnAttemptResult?.Invoke(sampleIndex + 1, false, $"no coincide (score={(score == int.MaxValue ? "MAX" : score.ToString())})");
                        if (attempt >= maxRetriesPerSample) return (false, null, $"Muestra {sampleIndex + 1} no coincide. Score={(score == int.MaxValue ? "MAX" : score.ToString())}");
                        Thread.Sleep(160); continue;
                    }
                }

                preList.Add(fmdPre);
                verList.Add(fmdVer);
                ansiList.Add(fmdAnsi);

                OnSampleCountChanged?.Invoke(preList.Count);
                OnAttemptResult?.Invoke(sampleIndex + 1, true, "ok");

                Thread.Sleep(220);
                break;
            }

            if (preList.Count >= 3)
            {
                var (ok, reg, regMsg) = TryEnrollmentWithStrategies(preList, ansiList, verList);
                if (ok && reg != null)
                {
                    Console.WriteLine($"[Enroll3] ✅ REG generado exitosamente ({regMsg}) - NO almacenado (se hará desde EdgeUruBridge)");
                    return (true, reg, $"Enrolamiento exitoso ({regMsg}).");
                }
            }
        }

        try
        {
            if (_lastFid != null)
            {
                var regFx = DPUruNet.FeatureExtraction.CreateFmdFromFid(_lastFid, DPUruNet.Constants.Formats.Fmd.DP_REGISTRATION);
                if (regFx.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS && regFx.Data != null)
                {
                    Console.WriteLine($"[Enroll3] ✅ REG generado desde FID (fallback) - NO almacenado (se hará desde EdgeUruBridge)");
                    return (true, regFx.Data, "Enrolamiento (REG directo desde FID).");
                }
            }
        }
        catch { }

        return (false, null, "Enrollment falló: DP_ENROLLMENT_NOT_READY.");
    }

    // ===== Métodos Públicos para Modo Touch (Continuous Capture) =====

    /// <summary>
    /// Inicia el modo de escucha continua (Modo Touch) sin timeouts.
    /// El lector quedará esperando dedos indefinidamente hasta que se llame StopContinuousCapture().
    /// Los eventos OnFingerTouched y OnFingerprintReady se dispararán automáticamente.
    /// </summary>
    public void StartContinuousCapture()
    {
        lock (_continuousModeLock)
        {
            if (_isContinuousMode)
            {
                OnStatus?.Invoke("[TouchMode] ⚠️ Modo continuo ya está activo");
                return;
            }

            try
            {
                Init(); // Asegurar que el lector está inicializado

                _isContinuousMode = true;
                _captureMode = CaptureMode.Continuous;

                OnStatus?.Invoke("[TouchMode] 🎧 Iniciando modo de escucha continua...");

                // Iniciar primera captura asíncrona - el SDK esperará internamente
                RequestCaptureGentle(CancellationToken.None);

                OnStatus?.Invoke("[TouchMode] ✅ Modo escucha continua ACTIVO - esperando toque del dedo...");
                OnStatus?.Invoke("[TouchMode] 💡 Eventos disponibles: OnFingerTouched, OnFingerprintReady, OnCaptureReady");
            }
            catch (Exception ex)
            {
                _isContinuousMode = false;
                _captureMode = CaptureMode.OnDemand;
                OnStatus?.Invoke($"[TouchMode] ❌ Error iniciando modo continuo: {ex.Message}");
                throw;
            }
        }
    }

    /// <summary>
    /// Detiene el modo de escucha continua (Modo Touch).
    /// El lector vuelve al modo OnDemand tradicional.
    /// </summary>
    public void StopContinuousCapture()
    {
        lock (_continuousModeLock)
        {
            if (!_isContinuousMode)
            {
                OnStatus?.Invoke("[TouchMode] ⚠️ Modo continuo no está activo");
                return;
            }

            try
            {
                OnStatus?.Invoke("[TouchMode] ⏹️ Deteniendo modo de escucha continua...");

                _isContinuousMode = false;
                _captureMode = CaptureMode.OnDemand;

                // Cancelar captura pendiente
                try
                {
                    Reader.CancelCapture();
                }
                catch (Exception ex)
                {
                    OnStatus?.Invoke($"[TouchMode] ⚠️ Error cancelando captura: {ex.Message}");
                }

                // Limpiar eventos
                OnFingerTouched = null;
                OnFingerprintReady = null;
                OnCaptureReady = null;

                OnStatus?.Invoke("[TouchMode] ✅ Modo continuo DETENIDO - vuelto a modo OnDemand");
            }
            catch (Exception ex)
            {
                OnStatus?.Invoke($"[TouchMode] ❌ Error deteniendo modo continuo: {ex.Message}");
                // Forzar detención de todos modos
                _isContinuousMode = false;
                _captureMode = CaptureMode.OnDemand;
            }
        }
    }

    /// <summary>
    /// Obtiene el modo de captura actual
    /// </summary>
    public CaptureMode GetCaptureMode()
    {
        lock (_continuousModeLock)
        {
            return _captureMode;
        }
    }

    /// <summary>
    /// Indica si el modo continuo está activo
    /// </summary>
    public bool IsContinuousModeActive()
    {
        lock (_continuousModeLock)
        {
            return _isContinuousMode;
        }
    }

    public void Dispose()
    {
        try
        {
            // Detener modo continuo si está activo
            if (_isContinuousMode)
            {
                StopContinuousCapture();
            }

            if (_subscribed) { Reader.On_Captured -= OnCaptured; _subscribed = false; }
            try { Reader.CancelCapture(); } catch { }
        }
        catch { }
        if (_readerLazy.IsValueCreated) { try { Reader.Dispose(); } catch { } }
        _sampleReady.Dispose();
    }
}
