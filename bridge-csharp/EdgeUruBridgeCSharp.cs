#nullable enable
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

// Usa los tipos del wrapper: NativeLoader, Dp4500Service, FingerprintTempStore, etc.

namespace EdgeBridge
{
    public class EdgeUruBridge
    {
        private static Dp4500Service? _svc;
        private static CancellationTokenSource? _cts;
        private static Func<object, Task<object>>? _jsCb;

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
                        return new { ok = true };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "registerCallback":
                    _jsCb = (Func<object, Task<object>>)input.callback;
                    return new { ok = true };

                case "init":
                {
                    _svc ??= new Dp4500Service();
                    _svc.OnStatus += s => {
                        try { _jsCb?.Invoke(new { evt = "status", msg = s }); } catch { }
                    };
                    _svc.OnSampleCountChanged += n => {
                        try { _jsCb?.Invoke(new { evt = "count", n }); } catch { }
                    };
                    _svc.OnAttemptResult += (i, ok, why) => {
                        try { _jsCb?.Invoke(new { evt = "attempt", i, ok, why }); } catch { }
                    };
                    try { _svc.Init(); return new { ok = true }; }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "single":
                {
                    if (_svc == null) return new { ok = false, error = "Reader not initialized. Call 'init' first." };

                    int timeoutMs = (int?)input?.timeoutMs ?? 60000;
                    _cts?.Cancel(); _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));
                    try
                    {
                        _svc.SingleCapture(_cts.Token);

                        // Generate fingerprint image if capture was successful
                        string? imagePath = null;
                        if (_svc.LastFid != null)
                        {
                            var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                            imagePath = $"capture_{timestamp}.png";
                            var projectRoot = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..");
                            var fullPath = System.IO.Path.Combine(projectRoot, "images", imagePath);
                            System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(fullPath)!);
                            Dp4500Service.SaveFidAsPng(_svc.LastFid, fullPath);
                        }

                        return new { ok = true, msg = "SingleCapture OK", imagePath };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "identify1N":
                {
                    if (_svc == null) return new { ok = false, error = "Reader not initialized. Call 'init' first." };

                    int timeoutMs = (int?)input?.timeoutMs ?? 60000;
                    int farn = (int?)input?.targetFarn ?? 21474;
                    int top = (int?)input?.top ?? 5;
                    _cts?.Cancel(); _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));
                    try
                    {
                        var r = _svc.IdentifyLive1N(_cts.Token, farn, top);
                        return new { ok = true, r.match, r.bestScore, r.bestTag, r.galleryFormat, r.topK, r.msg };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "enroll":
                {
                    if (_svc == null) return new { ok = false, error = "Reader not initialized. Call 'init' first." };

                    string? tag = (string?)input?.tag ?? $"User_{DateTime.Now:yyyyMMdd_HHmmss}";
                    int timeoutMs = (int?)input?.timeoutMs ?? 60000;
                    int farn = (int?)input?.targetFarn ?? 21474;
                    int maxRetries = (int?)input?.maxRetriesPerSample ?? 3;
                    int maxSamples = (int?)input?.maxSamples ?? 4;
                    _cts?.Cancel(); _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));
                    try
                    {
                        var r = _svc.Enroll3(_cts.Token, farn, maxRetries, maxSamples);
                        if (r.ok && r.fmdReg != null)
                        {
                            FingerprintTempStore.Add(tag, "DP_REGISTRATION", r.fmdReg, false);
                        }
                        return new { ok = r.ok, msg = r.msg, enrolled = r.ok };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "verify1to1":
                {
                    if (_svc == null) return new { ok = false, error = "Reader not initialized. Call 'init' first." };

                    string? tag = (string?)input?.tag;
                    if (string.IsNullOrEmpty(tag)) return new { ok = false, error = "Tag is required for verification" };

                    int timeoutMs = (int?)input?.timeoutMs ?? 60000;
                    int farn = (int?)input?.targetFarn ?? 21474;
                    _cts?.Cancel(); _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));
                    try
                    {
                        var stored = FingerprintTempStore.All().FirstOrDefault(x => x.Tag == tag);
                        if (stored == null) return new { ok = false, error = $"Fingerprint with tag '{tag}' not found" };

                        var r = _svc.VerifyLiveAgainstReg(stored.Fmd, _cts.Token, farn);
                        return new { ok = r.ok, match = r.score < farn, score = r.score, used = r.used, msg = r.msg, tag, verified = r.score < farn };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "storeList":
                {
                    var items = FingerprintTempStore.All()
                        .Select(x => new { x.Tag, x.Format, x.Bytes, x.XmlLength, x.Sha1, Utc = x.Utc })
                        .OrderByDescending(x => x.Utc)
                        .ToArray();
                    return new { ok = true, items };
                }

                case "storeClear":
                    FingerprintTempStore.Clear();
                    return new { ok = true };

                case "dispose":
                {
                    try { _cts?.Cancel(); _cts = null; _svc?.Dispose(); _svc = null; return new { ok = true }; }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "getReaderInfo":
                {
                    try
                    {
                        if (_svc == null) return new { ok = false, error = "Reader not initialized" };

                        var readers = DPUruNet.ReaderCollection.GetReaders();
                        var reader = readers?.FirstOrDefault();

                        if (reader == null) return new { ok = false, error = "No reader found" };

                        var caps = reader.Capabilities;
                        var desc = reader.Description;
                        var readerInfo = new
                        {
                            Guid = desc.SerialNumber ?? "N/A",
                            Name = desc.Name ?? "Unknown",
                            Technology = desc.Technology.ToString(),
                            Modality = desc.Modality.ToString(),
                            Resolutions = caps?.Resolutions?.ToArray() ?? new int[0],
                            CanStream = caps?.CanStream ?? false,
                            CanMatch = caps?.CanMatch ?? false,
                            CanIdentify = caps?.CanIdentify ?? false,
                            IndicatorType = caps?.IndicatorType.ToString() ?? "Unknown",
                            HasPowerManagement = caps?.HasPowerManagement ?? false,
                            HasCalibration = caps?.HasCalibration ?? false
                        };

                        // Información de archivos DLL
                        var baseDir = AppDomain.CurrentDomain.BaseDirectory;
                        var binDepsDir = System.IO.Path.Combine(baseDir, "..", "..", "bin-deps");
                        var dllFiles = new string[] { "DPUruNet.dll", "dpfpdd.dll", "dpfj.dll", "DPCtlUruNet.dll" };

                        var driverInfo = dllFiles.Where(dll => System.IO.File.Exists(System.IO.Path.Combine(binDepsDir, dll)))
                            .Select(dll => {
                                var fullPath = System.IO.Path.Combine(binDepsDir, dll);
                                var fileInfo = new System.IO.FileInfo(fullPath);
                                var versionInfo = System.Diagnostics.FileVersionInfo.GetVersionInfo(fullPath);
                                return new {
                                    FileName = dll,
                                    Version = versionInfo.FileVersion ?? "Unknown",
                                    ProductVersion = versionInfo.ProductVersion ?? "Unknown",
                                    Size = fileInfo.Length,
                                    LastModified = fileInfo.LastWriteTime
                                };
                            }).ToArray();

                        return new { ok = true, reader = readerInfo, drivers = driverInfo };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                default:
                    return new { ok = false, error = "UNKNOWN_OP" };
            }
        }
    }
}
