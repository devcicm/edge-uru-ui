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

                    SendEvent("VERIFICATION_STARTED", $"Iniciando verificación para: {userId}", "INFO",
                        new { userId });
                    SendEvent("CAPTURE_STARTED", "Coloque su dedo en el lector", "INFO");

                    _cts?.Cancel();
                    _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));

                    try
                    {
                        var stored = FingerprintTempStore.All().FirstOrDefault(x => x.Tag == userId);
                        if (stored == null)
                        {
                            return new { ok = false, error = $"Fingerprint with tag '{userId}' not found" };
                        }

                        // ⚡ EJECUTAR EN THREAD SEPARADO para no bloquear Edge.js
                        var result = await Task.Run(() => _reader.VerifyLiveAgainstReg(stored.Fmd, _cts.Token, targetFarn));

                        string? imageBase64 = null;
                        if (result.ok && _reader.LastFid != null)
                        {
                            imageBase64 = Dp4500Service.FidToBase64Png(_reader.LastFid);
                        }

                        var verified = result.score < targetFarn;

                        if (verified)
                        {
                            SendEvent("VERIFICATION_SUCCESS", $"Verificación exitosa para {userId}", "SUCCESS",
                                new { userId, score = result.score, threshold = targetFarn });
                        }
                        else
                        {
                            SendEvent("VERIFICATION_FAILED", $"Verificación fallida para {userId}", "WARNING",
                                new { userId, score = result.score, threshold = targetFarn });
                        }

                        return new
                        {
                            ok = result.ok,
                            verified,
                            userId,
                            score = result.score,
                            message = result.msg,
                            imageBase64
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

                    var gallerySize = FingerprintTempStore.All().Count;

                    SendEvent("IDENTIFICATION_STARTED", $"Iniciando identificación 1:N (galería: {gallerySize} usuarios)", "INFO",
                        new { gallerySize });
                    SendEvent("CAPTURE_STARTED", "Coloque su dedo en el lector", "INFO");

                    _cts?.Cancel();
                    _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));

                    try
                    {
                        // ⚡ EJECUTAR EN THREAD SEPARADO para no bloquear Edge.js
                        var result = await Task.Run(() => _reader.IdentifyLive1N(_cts.Token, targetFarn, top));

                        string? imageBase64 = null;
                        if (_reader.LastFid != null)
                        {
                            imageBase64 = Dp4500Service.FidToBase64Png(_reader.LastFid);
                        }

                        if (result.match)
                        {
                            SendEvent("IDENTIFICATION_MATCH", $"Usuario identificado: {result.bestTag}", "SUCCESS",
                                new { userId = result.bestTag, score = result.bestScore, gallerySize });
                        }
                        else
                        {
                            SendEvent("IDENTIFICATION_NO_MATCH", "No se encontró coincidencia en la galería", "WARNING",
                                new { bestScore = result.bestScore, threshold = targetFarn, gallerySize });
                        }

                        return new
                        {
                            ok = true,
                            match = result.match,
                            bestTag = result.bestTag,
                            bestScore = result.bestScore,
                            topK = result.topK.Select(m => new { tag = m.tag, score = m.score }).ToArray(),
                            message = result.msg,
                            imageBase64,
                            galleryFormat = result.galleryFormat
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

                default:
                    return new { ok = false, error = $"Unknown operation: {op}" };
            }
        }
    }
}
