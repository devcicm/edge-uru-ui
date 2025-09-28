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
 * Store temporal (thread-safe)
 * ===============================*/
public sealed class StoredFmd
{
    public string Tag { get; set; } = "";
    public string Format { get; set; } = "";
    public DateTime Utc { get; set; } = DateTime.UtcNow;
    public DPUruNet.Fmd Fmd { get; set; } = null!; // asignado en runtime
    public int Bytes { get; set; }
    public int XmlLength { get; set; }
    public string XmlPreview { get; set; } = "";
    public string Sha1 { get; set; } = "";
}

public static class FingerprintTempStore
{
    private static readonly object _sync = new object();
    private static readonly List<StoredFmd> _fmds = new List<StoredFmd>();

    public static StoredFmd Add(string tag, string formatName, DPUruNet.Fmd fmd, bool keepXmlPreview = false)
    {
        var xml = keepXmlPreview ? DPUruNet.Fmd.SerializeXml(fmd) : string.Empty;
        using var sha1 = SHA1.Create();
        var bytes = fmd.Bytes ?? Array.Empty<byte>();
        var sha = BitConverter.ToString(sha1.ComputeHash(bytes)).Replace("-", "");

        var rec = new StoredFmd
        {
            Tag = tag,
            Format = formatName,
            Utc = DateTime.UtcNow,
            Fmd = fmd,
            Bytes = bytes.Length,
            XmlLength = keepXmlPreview ? xml.Length : 0,
            XmlPreview = keepXmlPreview ? (xml.Length > 160 ? xml.Substring(0, 160) + "…" : xml) : "(omitido)",
            Sha1 = sha
        };
        lock (_sync) _fmds.Add(rec);
        return rec;
    }

    public static IReadOnlyList<StoredFmd> All() { lock (_sync) return _fmds.ToList(); }
    public static void Clear() { lock (_sync) _fmds.Clear(); }
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

    public DPUruNet.Fid? LastFid => _lastFid;

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
        _sampleReady.Set();
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

    // ==== Persistencia de FID ====
    public static string SaveFidAsPng(DPUruNet.Fid fid, string filePath)
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
        bmp.Save(filePath, ImageFormat.Png);
        return filePath;
    }

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

    public static string FidToXmlBase64(DPUruNet.Fid fid)
    {
        var v = fid.Views[0];
        var b64 = Convert.ToBase64String(v.RawImage ?? Array.Empty<byte>());
        return $"<FidImage width=\"{v.Width}\" height=\"{v.Height}\"><Raw8bpp>{b64}</Raw8bpp></FidImage>";
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

        var preFmt = "";
        var fmdPre = FidToPreFmd(cap.Data!, out preFmt);
        var fmdVer = FidToVerFmd(cap.Data!);
        var fmdAnsi = FidToAnsiFmd(cap.Data!);

        var t = $"{DateTime.UtcNow:yyyyMMdd-HHmmss}";
        var recPre = FingerprintTempStore.Add($"PRE-{t}", preFmt, fmdPre, keepXmlPreview: false);
        var recVer = FingerprintTempStore.Add($"VER-{t}", "DP_VERIFICATION", fmdVer, keepXmlPreview: true);
        var recAnsi = FingerprintTempStore.Add($"ANSI-{t}", "ANSI", fmdAnsi, keepXmlPreview: false);

        PrintFmdSummary(recPre, "[PRE] ");
        PrintFmdFull(recVer, "[VER] ");
        PrintFmdSummary(recAnsi, "[ANS] ");
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

    // ===== 1:N en vivo contra galería (REG→VER→ANSI) =====
    public (bool match, int bestScore, string bestTag, string galleryFormat, System.Collections.Generic.List<(string tag, int score)> topK, string msg)
        IdentifyLive1N(CancellationToken ct, int targetFarn = 21474, int top = 5)
    {
        var all = FingerprintTempStore.All();
        if (all.Count == 0) return (false, int.MaxValue, "", "", new System.Collections.Generic.List<(string tag, int score)>(), "Galería vacía.");

        string galleryFmt;
        var gallery = new System.Collections.Generic.List<StoredFmd>(all).FindAll(r => r.Format == "DP_REGISTRATION");
        if (gallery.Count > 0) galleryFmt = "DP_REGISTRATION";
        else
        {
            gallery = new System.Collections.Generic.List<StoredFmd>(all).FindAll(r => r.Format == "DP_VERIFICATION");
            if (gallery.Count > 0) galleryFmt = "DP_VERIFICATION";
            else
            {
                gallery = new System.Collections.Generic.List<StoredFmd>(all).FindAll(r => r.Format == "ANSI");
                if (gallery.Count == 0) return (false, int.MaxValue, "", "", new System.Collections.Generic.List<(string tag, int score)>(), "No hay REG/VER/ANSI en galería.");
                galleryFmt = "ANSI";
            }
        }

        OnStatus?.Invoke($"Identificación 1:N… coloca el dedo. (galería: {galleryFmt})");
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

        DPUruNet.Fmd? probe = null;
        string usedProbe = "";
        if (galleryFmt == "DP_REGISTRATION" || galleryFmt == "DP_VERIFICATION")
        {
            var fx = DPUruNet.FeatureExtraction.CreateFmdFromFid(cap.Data!, DPUruNet.Constants.Formats.Fmd.DP_VERIFICATION);
            if (fx.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS) { probe = fx.Data; usedProbe = "VER"; }
        }
        else
        {
            var fx = DPUruNet.FeatureExtraction.CreateFmdFromFid(cap.Data!, DPUruNet.Constants.Formats.Fmd.ANSI);
            if (fx.ResultCode == DPUruNet.Constants.ResultCode.DP_SUCCESS) { probe = fx.Data; usedProbe = "ANSI"; }
        }
        if (probe == null) return (false, int.MaxValue, "", galleryFmt, new System.Collections.Generic.List<(string tag, int score)>(), "No se pudo generar el probe.");

        var ranking = new System.Collections.Generic.List<(string tag, int score)>();
        int best = int.MaxValue; string bestTag = "";
        foreach (var cand in new System.Collections.Generic.List<StoredFmd>(all).FindAll(r => r.Format == galleryFmt))
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

                var preFmt = "";
                var fmdPre = FidToPreFmd(cap.Data!, out preFmt);
                var fmdVer = FidToVerFmd(cap.Data!);
                var fmdAnsi = FidToAnsiFmd(cap.Data!);

                var t = $"{DateTime.UtcNow:yyyyMMdd-HHmmss}";
                var recPre = FingerprintTempStore.Add($"PRE-{sampleIndex + 1}-{t}", preFmt, fmdPre, keepXmlPreview: false);
                var recVer = FingerprintTempStore.Add($"VER-{sampleIndex + 1}-{t}", "DP_VERIFICATION", fmdVer, keepXmlPreview: true);
                var recAnsi = FingerprintTempStore.Add($"ANSI-{sampleIndex + 1}-{t}", "ANSI", fmdAnsi, keepXmlPreview: false);

                PrintFmdSummary(recPre, "[PRE] ");
                PrintFmdFull(recVer, "[VER] ");
                PrintFmdSummary(recAnsi, "[ANS] ");

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
                    var recReg = FingerprintTempStore.Add($"REG-{DateTime.UtcNow:yyyyMMdd-HHmmss}", "DP_REGISTRATION", reg, keepXmlPreview: true);
                    PrintFmdFull(recReg, "[REG] ");
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
                    var recReg = FingerprintTempStore.Add($"REG-{DateTime.UtcNow:yyyyMMdd-HHmmss}", "DP_REGISTRATION", regFx.Data, keepXmlPreview: true);
                    PrintFmdFull(recReg, "[REG*] ");
                    return (true, regFx.Data, "Enrolamiento (REG directo desde FID).");
                }
            }
        }
        catch { }

        return (false, null, "Enrollment falló: DP_ENROLLMENT_NOT_READY.");
    }

    // ===== helpers de impresión =====
    public static void PrintFmdSummary(StoredFmd rec, string prefix = "")
    {
        Console.WriteLine($"{prefix}Tag={rec.Tag}  Format={rec.Format}  Bytes={rec.Bytes}  XmlLen={rec.XmlLength}  SHA1={rec.Sha1}  Utc={rec.Utc:O}");
    }
    public static void PrintFmdFull(StoredFmd rec, string prefix = "")
    {
        Console.WriteLine($"{prefix}Tag={rec.Tag}  Format={rec.Format}  Bytes={rec.Bytes}  XmlLen={rec.XmlLength}  SHA1={rec.Sha1}  Utc={rec.Utc:O}");
        Console.WriteLine($"{prefix}XML: {rec.XmlPreview}");
    }

    public void Dispose()
    {
        try
        {
            if (_subscribed) { Reader.On_Captured -= OnCaptured; _subscribed = false; }
            try { Reader.CancelCapture(); } catch { }
        }
        catch { }
        if (_readerLazy.IsValueCreated) { try { Reader.Dispose(); } catch { } }
        _sampleReady.Dispose();
    }
}
