#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace EdgeBridge
{
    /// <summary>
    /// Bridge simple y directo para comunicación con lector biométrico DP4500
    /// Envía eventos en tiempo real al frontend vía callback
    /// </summary>
    public class EdgeUruBridge
    {
        private static Dp4500Service? _reader;
        private static CancellationTokenSource? _cts;
        private static Func<object, Task<object>>? _callback;

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
                        SendEvent("SYSTEM_STATUS", "Sistema inicializado correctamente", "SUCCESS");
                        return new { ok = true, message = "Bootstrap successful" };
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

                        _reader.Init();

                        SendEvent("READER_READY", "Lector biométrico inicializado y listo", "SUCCESS",
                            new { model = "DP4500", status = "READY" });

                        return new { ok = true, message = "Reader initialized" };
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

                    var timeoutMs = (int?)input?.timeoutMs ?? 10000;

                    SendEvent("CAPTURE_STARTED", "Coloque su dedo en el lector", "INFO");

                    _cts?.Cancel();
                    _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));

                    try
                    {
                        // Capturar usando SingleCapture (void method)
                        await Task.Run(() => _reader.SingleCapture(_cts.Token));

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
                    var timeoutMs = (int?)input?.timeoutMs ?? 60000;
                    var targetFarn = (int?)input?.targetFarn ?? 21474;
                    var maxRetriesPerSample = (int?)input?.maxRetriesPerSample ?? 3;
                    var maxSamples = (int?)input?.maxSamples ?? 4;

                    SendEvent("ENROLLMENT_STARTED", $"Iniciando enrolamiento para: {userId}", "INFO",
                        new { userId });
                    SendEvent("CAPTURE_STARTED", "Coloque su dedo en el lector", "INFO");

                    _cts?.Cancel();
                    _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));

                    // ⚡ EJECUTAR EN THREAD SEPARADO para no bloquear Edge.js
                    var result = await Task.Run(() => _reader.Enroll3(_cts.Token, targetFarn, maxRetriesPerSample, maxSamples));

                    try
                    {

                        string? imageBase64 = null;
                        string? templateBase64 = null;

                        if (result.ok && result.fmdReg != null)
                        {
                            FingerprintTempStore.Add(userId, "DP_REGISTRATION", result.fmdReg, false);

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

                    var timeoutMs = (int?)input?.timeoutMs ?? 60000;
                    var targetFarn = (int?)input?.targetFarn ?? 21474;
                    var maxAttempts = (int?)input?.maxAttempts ?? 4;

                    SendEvent("VERIFICATION_STARTED", $"Iniciando verificación para: {userId}", "INFO",
                        new { userId, maxAttempts });

                    _cts?.Cancel();
                    _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));

                    try
                    {
                        var stored = FingerprintTempStore.All().FirstOrDefault(x => x.Tag == userId);
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
                            var result = await Task.Run(() => _reader.VerifyLiveAgainstReg(stored.Fmd, _cts.Token, targetFarn));

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
                                SendEvent("VERIFICATION_SUCCESS", $"Verificación exitosa para {userId} en intento {attempt}/{maxAttempts}", "SUCCESS",
                                    new { userId, score = result.score, threshold = targetFarn, attempt, totalAttempts = maxAttempts });

                                return new
                                {
                                    ok = result.ok,
                                    verified = true,
                                    userId,
                                    score = result.score,
                                    attempt,
                                    totalAttempts = maxAttempts,
                                    message = $"Verificado en intento {attempt}",
                                    imageBase64
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

                    var timeoutMs = (int?)input?.timeoutMs ?? 60000;
                    var targetFarn = (int?)input?.targetFarn ?? 21474;
                    var top = (int?)input?.top ?? 5;
                    var maxAttempts = (int?)input?.maxAttempts ?? 4;

                    var gallerySize = FingerprintTempStore.All().Count;

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
                            var result = await Task.Run(() => _reader.IdentifyLive1N(_cts.Token, targetFarn, top));

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
                                SendEvent("IDENTIFICATION_MATCH", $"Usuario identificado: {result.bestTag} en intento {attempt}/{maxAttempts}", "SUCCESS",
                                    new { userId = result.bestTag, score = result.bestScore, gallerySize, attempt, totalAttempts = maxAttempts });

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
                                    galleryFormat = result.galleryFormat
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

                case "storeList":
                {
                    var items = FingerprintTempStore.All();
                    return new
                    {
                        ok = true,
                        count = items.Count,
                        items = items.Select(x => new
                        {
                            tag = x.Tag,
                            format = x.Format,
                            bytes = x.Bytes,
                            sha1 = x.Sha1,
                            utc = x.Utc
                        }).ToArray()
                    };
                }

                case "storeClear":
                {
                    FingerprintTempStore.Clear();
                    SendEvent("STORE_CLEARED", "Almacenamiento temporal limpiado", "INFO");
                    return new { ok = true, message = "Store cleared" };
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
                    if (_reader == null)
                    {
                        var error = "Reader not initialized. Call 'init' first.";
                        SendEvent("SYSTEM_ERROR", error, "ERROR");
                        return new { ok = false, error };
                    }

                    try
                    {
                        // Obtener versión del SDK
                        var sdkVersion = typeof(DPUruNet.Reader).Assembly.GetName().Version;
                        var sdkVersionStr = $"{sdkVersion?.Major}.{sdkVersion?.Minor}.{sdkVersion?.Build}";

                        // Obtener información del lector DP4500
                        var readerInfo = new
                        {
                            // Información del dispositivo DP4500
                            model = "DigitalPersona U.are.U 4500",
                            serial = "DP4500-READER",
                            firmware = "Latest",
                            status = "Connected",

                            // Capacidades técnicas del DP4500 (especificaciones oficiales)
                            resolution = "512 DPI",
                            captureArea = "0.62\" x 0.5\" (15.8 x 12.7 mm)",
                            bitDepth = "8-bit grayscale (256 levels)",
                            technology = "Optical",

                            // Información del sistema
                            driver = "DPUruNet SDK",
                            sdk = $"DPUruNet v{sdkVersionStr}",
                            platform = $".NET {Environment.Version}",

                            // Información adicional
                            deviceModality = "Contact/Touch",
                            imageFormat = "RAW/PNG/WSQ",
                            templateFormats = new[] {
                                "DP_REGISTRATION",
                                "DP_VERIFICATION",
                                "DP_PRE_REGISTRATION",
                                "ANSI 378",
                                "ISO 19794-2"
                            },

                            // Características adicionales
                            imageWidth = 355,
                            imageHeight = 391,
                            pixelFormat = "8bpp Grayscale",
                            interfaceType = "USB 2.0",
                            supportedOS = "Windows 7/8/10/11, Linux, macOS",
                            certifications = new[] { "FBI PIV-071006", "STQC" }
                        };

                        SendEvent("READER_INFO_RETRIEVED", "Información del lector obtenida", "INFO");
                        return new { ok = true, info = readerInfo };
                    }
                    catch (Exception ex)
                    {
                        SendEvent("SYSTEM_ERROR", $"Error obteniendo info: {ex.Message}", "ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                default:
                    return new { ok = false, error = $"Unknown operation: {op}" };
            }
        }
    }
}
