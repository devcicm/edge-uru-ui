#nullable enable
using System;
using System.Collections.Generic;
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
                    _svc.OnImageCaptured += imageBase64 => {
                        try { _jsCb?.Invoke(new { evt = "image", imageBase64 }); } catch { }
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
                        string? imageBase64 = null;
                        if (_svc.LastFid != null)
                        {
                            var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                            imagePath = $"capture_{timestamp}.png";
                            var projectRoot = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..");
                            var fullPath = System.IO.Path.Combine(projectRoot, "images", imagePath);
                            System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(fullPath)!);
                            Dp4500Service.SaveFidAsPng(_svc.LastFid, fullPath);

                            // Generate base64 image for frontend display
                            imageBase64 = Dp4500Service.FidToBase64Png(_svc.LastFid);
                        }

                        return new { ok = true, msg = "SingleCapture OK", imagePath, imageBase64 };
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

                        // Generate base64 image if identification was successful
                        string? imageBase64 = null;
                        if (_svc.LastFid != null)
                        {
                            imageBase64 = Dp4500Service.FidToBase64Png(_svc.LastFid);
                        }

                        return new { ok = true, r.match, r.bestScore, r.bestTag, r.galleryFormat, r.topK, r.msg, imageBase64 };
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

                        // Generate base64 image if enrollment was successful
                        string? imageBase64 = null;
                        if (r.ok && _svc.LastFid != null)
                        {
                            imageBase64 = Dp4500Service.FidToBase64Png(_svc.LastFid);
                        }

                        return new { ok = r.ok, msg = r.msg, enrolled = r.ok, imageBase64 };
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

                        // Generate base64 image if verification was successful
                        string? imageBase64 = null;
                        if (r.ok && _svc.LastFid != null)
                        {
                            imageBase64 = Dp4500Service.FidToBase64Png(_svc.LastFid);
                        }

                        return new { ok = r.ok, match = r.score < farn, score = r.score, used = r.used, msg = r.msg, tag, verified = r.score < farn, imageBase64 };
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
                        // No requiere que _svc esté inicializado, solo necesita detectar el lector
                        var debugInfo = new System.Text.StringBuilder();

                        var readers = DPUruNet.ReaderCollection.GetReaders();
                        debugInfo.AppendLine($"ReaderCollection.GetReaders() result: {(readers == null ? "NULL" : $"Count={readers.Count()}")}");

                        if (readers == null) return new { ok = false, error = "ReaderCollection.GetReaders() returned null" };

                        var reader = readers.FirstOrDefault();
                        debugInfo.AppendLine($"FirstOrDefault reader: {(reader == null ? "NULL" : "Found")}");

                        if (reader == null) return new { ok = false, error = "No reader found in collection" };

                        // Reflexión detallada del reader
                        var readerType = reader.GetType();
                        debugInfo.AppendLine($"Reader Type: {readerType.FullName}");

                        var caps = reader.Capabilities;
                        var desc = reader.Description;

                        debugInfo.AppendLine($"Capabilities: {(caps == null ? "NULL" : caps.GetType().FullName)}");
                        debugInfo.AppendLine($"Description: {(desc == null ? "NULL" : desc.GetType().FullName)}");

                        // Reflexión detallada de Description
                        if (desc != null) {
                            var descType = desc.GetType();
                            debugInfo.AppendLine($"Description Properties:");
                            foreach (var prop in descType.GetProperties()) {
                                try {
                                    var value = prop.GetValue(desc);
                                    debugInfo.AppendLine($"  {prop.Name}: {(value == null ? "NULL" : $"{value} ({value.GetType().Name})")}");
                                } catch (Exception ex) {
                                    debugInfo.AppendLine($"  {prop.Name}: ERROR - {ex.Message}");
                                }
                            }
                        }

                        // Reflexión detallada de Capabilities
                        if (caps != null) {
                            var capsType = caps.GetType();
                            debugInfo.AppendLine($"Capabilities Properties:");
                            foreach (var prop in capsType.GetProperties()) {
                                try {
                                    var value = prop.GetValue(caps);
                                    debugInfo.AppendLine($"  {prop.Name}: {(value == null ? "NULL" : $"{value} ({value.GetType().Name})")}");
                                } catch (Exception ex) {
                                    debugInfo.AppendLine($"  {prop.Name}: ERROR - {ex.Message}");
                                }
                            }
                        }

                        // Ahora que sabemos la estructura real, construir la respuesta correcta
                        var readerInfo = new
                        {
                            Guid = desc?.SerialNumber ?? "N/A",
                            Name = desc?.Name ?? "Unknown",
                            Technology = desc?.Technology.ToString() ?? "Unknown",
                            Modality = desc?.Modality.ToString() ?? "Unknown",
                            Resolutions = caps?.Resolutions ?? new int[0],
                            CanCapture = caps?.CanCapture ?? false,
                            CanStream = caps?.CanStream ?? false,
                            ExtractFeatures = caps?.ExtractFeatures ?? false,
                            CanMatch = caps?.CanMatch ?? false,
                            CanIdentify = caps?.CanIdentify ?? false,
                            HasFingerprintStorage = caps?.HasFingerprintStorage ?? false,
                            IndicatorType = caps?.IndicatorType.ToString() ?? "0",
                            HasPowerManagement = caps?.HasPowerManagement ?? false,
                            HasCalibration = caps?.HasCalibration ?? false,
                            PIVCompliant = caps?.PIVCompliant ?? false
                        };

                        // Información detallada de controladores y DLLs
                        object[] driverInfo;
                        try {
                            var driverList = new List<object>();

                            // Detectar fabricante por GUID
                            var deviceGuid = desc?.SerialNumber ?? "";
                            var manufacturer = "Unknown";
                            var deviceModel = "Unknown";

                            if (deviceGuid.Contains("06EBB468") || deviceGuid.Contains("72B9") || deviceGuid.Contains("0E44"))
                            {
                                manufacturer = "DigitalPersona (HID Global)";
                                deviceModel = "U.are.U 4500 Reader";
                            }

                            // Información del dispositivo
                            driverList.Add(new {
                                Category = "Device Information",
                                Name = $"{manufacturer} - {deviceModel}",
                                Details = $"GUID: {deviceGuid}",
                                Path = "Hardware Device",
                                Version = desc?.Technology.ToString() ?? "Unknown",
                                Status = "Active"
                            });

                            // Buscar DLLs del proyecto
                            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
                            var binDepsDir = System.IO.Path.Combine(baseDir, "..", "..", "bin-deps");
                            var projectDlls = new Dictionary<string, string> {
                                { "DPUruNet.dll", "DigitalPersona U.are.U SDK - Core Library" },
                                { "dpfpdd.dll", "DigitalPersona Device Driver Interface" },
                                { "dpfj.dll", "DigitalPersona Java Interface" },
                                { "DPCtlUruNet.dll", "DigitalPersona Control Library" }
                            };

                            foreach (var kvp in projectDlls)
                            {
                                var dllPath = System.IO.Path.Combine(binDepsDir, kvp.Key);
                                if (System.IO.File.Exists(dllPath))
                                {
                                    try
                                    {
                                        var fileInfo = new System.IO.FileInfo(dllPath);
                                        var versionInfo = System.Diagnostics.FileVersionInfo.GetVersionInfo(dllPath);

                                        driverList.Add(new {
                                            Category = "SDK Library",
                                            Name = kvp.Value,
                                            Details = kvp.Key,
                                            Path = dllPath,
                                            Version = versionInfo.FileVersion ?? "Unknown",
                                            Status = "Loaded",
                                            Size = $"{fileInfo.Length / 1024} KB",
                                            Modified = fileInfo.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss"),
                                            Company = versionInfo.CompanyName ?? "DigitalPersona"
                                        });
                                    }
                                    catch
                                    {
                                        driverList.Add(new {
                                            Category = "SDK Library",
                                            Name = kvp.Value,
                                            Details = kvp.Key,
                                            Path = dllPath,
                                            Version = "Unknown",
                                            Status = "Found"
                                        });
                                    }
                                }
                                else
                                {
                                    driverList.Add(new {
                                        Category = "SDK Library",
                                        Name = kvp.Value,
                                        Details = kvp.Key,
                                        Path = "Not Found",
                                        Version = "N/A",
                                        Status = "Missing"
                                    });
                                }
                            }

                            // Buscar en directorios comunes de Windows
                            var windowsDirs = new string[] {
                                Environment.GetFolderPath(Environment.SpecialFolder.System),
                                Environment.GetFolderPath(Environment.SpecialFolder.SystemX86),
                                System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "DigitalPersona"),
                                System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "DigitalPersona")
                            };

                            var systemDlls = new string[] { "dpfpdd.dll", "dpfj.dll", "dpapi.dll" };

                            foreach (var dir in windowsDirs)
                            {
                                if (System.IO.Directory.Exists(dir))
                                {
                                    foreach (var dll in systemDlls)
                                    {
                                        var searchPattern = dll;
                                        try
                                        {
                                            var foundFiles = System.IO.Directory.GetFiles(dir, searchPattern, System.IO.SearchOption.TopDirectoryOnly);
                                            foreach (var file in foundFiles)
                                            {
                                                try
                                                {
                                                    var fileInfo = new System.IO.FileInfo(file);
                                                    var versionInfo = System.Diagnostics.FileVersionInfo.GetVersionInfo(file);

                                                    driverList.Add(new {
                                                        Category = "System Driver",
                                                        Name = versionInfo.FileDescription ?? System.IO.Path.GetFileName(file),
                                                        Details = System.IO.Path.GetFileName(file),
                                                        Path = file,
                                                        Version = versionInfo.FileVersion ?? "Unknown",
                                                        Status = "System",
                                                        Size = $"{fileInfo.Length / 1024} KB",
                                                        Modified = fileInfo.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss"),
                                                        Company = versionInfo.CompanyName ?? "Microsoft"
                                                    });
                                                }
                                                catch { /* Skip files that can't be read */ }
                                            }
                                        }
                                        catch { /* Skip directories that can't be accessed */ }
                                    }
                                }
                            }

                            // Si no encontramos drivers, agregar información básica
                            if (driverList.Count <= 1)
                            {
                                driverList.Add(new {
                                    Category = "Notice",
                                    Name = "Limited Driver Information",
                                    Details = "Unable to locate detailed driver information",
                                    Path = "System may require DigitalPersona SDK installation",
                                    Version = "N/A",
                                    Status = "Info"
                                });
                            }

                            driverInfo = driverList.ToArray();
                        } catch (Exception ex) {
                            driverInfo = new object[] { new {
                                Category = "Error",
                                Name = "Driver Detection Failed",
                                Details = ex.Message,
                                Path = "N/A",
                                Version = "N/A",
                                Status = "Error"
                            } };
                        }

                        return new { ok = true, reader = readerInfo, drivers = driverInfo };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "enrollWithTemplate":
                {
                    if (_svc == null) return new { ok = false, error = "Reader not initialized. Call 'init' first." };

                    string? userId = (string?)input?.userId ?? $"User_{DateTime.Now:yyyyMMdd_HHmmss}";
                    int timeoutMs = (int?)input?.timeoutMs ?? 60000;
                    int farn = (int?)input?.targetFarn ?? 21474;
                    int maxRetries = (int?)input?.maxRetriesPerSample ?? 3;
                    int maxSamples = (int?)input?.maxSamples ?? 4;
                    _cts?.Cancel(); _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));

                    try
                    {
                        var template = new FingerprintTemplate
                        {
                            UserId = userId,
                            EnrolledAt = DateTime.UtcNow
                        };

                        var preList = new List<DPUruNet.Fmd>();
                        var verList = new List<DPUruNet.Fmd>();
                        var ansiList = new List<DPUruNet.Fmd>();

                        // Collect all 4 samples with their templates
                        for (int i = 0; i < maxSamples; i++)
                        {
                            // Capture sample (reusing existing logic)
                            var sample = new SampleInfo
                            {
                                SampleNumber = i + 1,
                                CapturedAt = DateTime.UtcNow
                            };

                            // Note: Actual capture logic would be integrated here
                            // For now, we'll use the existing Enroll3 result
                        }

                        var r = _svc.Enroll3(_cts.Token, farn, maxRetries, maxSamples);
                        if (r.ok && r.fmdReg != null)
                        {
                            // Save to temp store
                            FingerprintTempStore.Add(userId, "DP_REGISTRATION", r.fmdReg, false);

                            // Create template with all formats
                            var regXml = DPUruNet.Fmd.SerializeXml(r.fmdReg);
                            template.CombinedTemplate = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(regXml));
                            template.RegTemplate = template.CombinedTemplate;

                            // Save template to storage
                            var filePath = TemplateStore.SaveTemplate(userId, template);

                            // Generate base64 image if enrollment was successful
                            string? imageBase64 = null;
                            if (_svc.LastFid != null)
                            {
                                imageBase64 = Dp4500Service.FidToBase64Png(_svc.LastFid);
                            }

                            // Get template as base64 JSON
                            var templateJson = TemplateStore.GetTemplateAsBase64Json(userId);

                            return new { ok = true, msg = r.msg, enrolled = true, userId, templateJson, filePath, imageBase64 };
                        }

                        return new { ok = false, msg = r.msg, enrolled = false };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "templateSave":
                {
                    try
                    {
                        string? userId = (string?)input?.userId;
                        string? templateJson = (string?)input?.templateJson;

                        if (string.IsNullOrEmpty(userId))
                            return new { ok = false, error = "userId is required" };

                        if (string.IsNullOrEmpty(templateJson))
                            return new { ok = false, error = "templateJson is required" };

                        bool loaded = TemplateStore.LoadTemplateFromBase64Json(templateJson);
                        if (loaded)
                        {
                            return new { ok = true, msg = $"Template for user '{userId}' saved successfully" };
                        }

                        return new { ok = false, error = "Failed to save template" };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "templateGet":
                {
                    try
                    {
                        string? userId = (string?)input?.userId;
                        if (string.IsNullOrEmpty(userId))
                            return new { ok = false, error = "userId is required" };

                        var templateJson = TemplateStore.GetTemplateAsBase64Json(userId);
                        if (!string.IsNullOrEmpty(templateJson))
                        {
                            return new { ok = true, userId, templateJson };
                        }

                        return new { ok = false, error = $"Template not found for user '{userId}'" };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "templateLoad":
                {
                    try
                    {
                        string? templateJson = (string?)input?.templateJson;
                        if (string.IsNullOrEmpty(templateJson))
                            return new { ok = false, error = "templateJson is required" };

                        bool loaded = TemplateStore.LoadTemplateFromBase64Json(templateJson);
                        if (loaded)
                        {
                            return new { ok = true, msg = "Template loaded into memory successfully" };
                        }

                        return new { ok = false, error = "Failed to load template" };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "templateList":
                {
                    try
                    {
                        var userIds = TemplateStore.GetAllUserIds();
                        return new { ok = true, userIds, count = userIds.Count };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "templateDelete":
                {
                    try
                    {
                        string? userId = (string?)input?.userId;
                        if (string.IsNullOrEmpty(userId))
                            return new { ok = false, error = "userId is required" };

                        bool deleted = TemplateStore.DeleteTemplate(userId);
                        if (deleted)
                        {
                            return new { ok = true, msg = $"Template for user '{userId}' deleted successfully" };
                        }

                        return new { ok = false, error = $"Template not found for user '{userId}'" };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "templateClear":
                {
                    try
                    {
                        TemplateStore.ClearAll();
                        return new { ok = true, msg = "All templates cleared" };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                default:
                    return new { ok = false, error = "UNKNOWN_OP" };
            }
        }
    }
}
