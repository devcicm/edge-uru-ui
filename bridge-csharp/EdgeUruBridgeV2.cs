#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using EdgeBridge.Dtos;
using EdgeBridge.EventBus;
using EdgeBridge.Processing;

namespace EdgeBridge
{
    /// <summary>
    /// EdgeUruBridge V2 con arquitectura CEDDFA integrada
    /// Mantiene compatibilidad con versión anterior mientras añade soporte para DTOs
    /// </summary>
    public class EdgeUruBridgeV2
    {
        private static Dp4500Service? _svc;
        private static CancellationTokenSource? _cts;
        private static Func<object, Task<object>>? _jsCb;

        // Componentes CEDDFA
        private static BiometricEventBus? _eventBus;
        private static BiometricMessageProcessor? _messageProcessor;

        /// <summary>
        /// Inicializa la arquitectura CEDDFA
        /// </summary>
        private static void InitializeCEDDFA()
        {
            if (_eventBus == null)
            {
                _eventBus = new BiometricEventBus();
                _messageProcessor = new BiometricMessageProcessor(_eventBus);

                // Suscribirse a todos los eventos para logging
                _eventBus.SubscribeAll(args =>
                {
                    Console.WriteLine($"[CEDDFA] Event: {args.EventType} from {args.Origin}");

                    // Enviar eventos importantes al frontend vía callback
                    if (_jsCb != null)
                    {
                        try
                        {
                            var eventData = CreateEventData(args);
                            _jsCb.Invoke(eventData);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[CEDDFA] Error sending to frontend: {ex.Message}");
                        }
                    }
                });

                Console.WriteLine("[CEDDFA] Architecture initialized");
            }
        }

        /// <summary>
        /// Convierte BiometricEventArgs a objeto para JavaScript
        /// </summary>
        private static object CreateEventData(BiometricEventArgs args)
        {
            var baseData = new Dictionary<string, object>
            {
                ["eventType"] = args.EventType,
                ["timestamp"] = args.OccurredAt,
                ["origin"] = args.Origin
            };

            if (args.Dto is BiometricEventDto eventDto)
            {
                baseData["evt"] = "biometric_event";
                baseData["message"] = eventDto.Message;
                baseData["severity"] = eventDto.Severity;
                if (eventDto.Data != null)
                {
                    baseData["data"] = eventDto.Data;
                }
            }
            else if (args.Dto is EnrollmentResponseDto enrollDto)
            {
                baseData["evt"] = "enrollment_result";
                baseData["success"] = enrollDto.Success;
                baseData["userId"] = enrollDto.UserId;
                baseData["message"] = enrollDto.Message;
            }
            else if (args.Dto is VerificationResponseDto verifyDto)
            {
                baseData["evt"] = "verification_result";
                baseData["success"] = verifyDto.Success;
                baseData["verified"] = verifyDto.Verified;
                baseData["userId"] = verifyDto.UserId;
                baseData["score"] = verifyDto.Score;
            }
            else if (args.Dto is IdentificationResponseDto identifyDto)
            {
                baseData["evt"] = "identification_result";
                baseData["success"] = identifyDto.Success;
                baseData["matched"] = identifyDto.Matched;
                if (identifyDto.BestMatch != null)
                {
                    baseData["bestMatch"] = new
                    {
                        userId = identifyDto.BestMatch.UserId,
                        score = identifyDto.BestMatch.Score
                    };
                }
            }

            return baseData;
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
                        InitializeCEDDFA();
                        _messageProcessor?.ProcessStatusMessage("Sistema inicializado correctamente", "SUCCESS");
                        return new { ok = true, message = "Bootstrap successful with CEDDFA architecture" };
                    }
                    catch (Exception ex)
                    {
                        _messageProcessor?.ProcessErrorMessage($"Bootstrap failed: {ex.Message}", "BOOTSTRAP_ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "registerCallback":
                    _jsCb = (Func<object, Task<object>>)input.callback;
                    InitializeCEDDFA();
                    return new { ok = true, message = "Callback registered with CEDDFA support" };

                case "init":
                {
                    try
                    {
                        InitializeCEDDFA();
                        _svc ??= new Dp4500Service();

                        // Conectar eventos del servicio con el Message Processor
                        _svc.OnStatus += msg => _messageProcessor?.ProcessStatusMessage(msg);
                        _svc.OnSampleCountChanged += count => _messageProcessor?.ProcessSampleCollected(count, 4);
                        _svc.OnAttemptResult += (i, ok, why) =>
                        {
                            var message = ok ? $"Intento {i} exitoso" : $"Intento {i} falló: {why}";
                            _messageProcessor?.ProcessStatusMessage(message, ok ? "SUCCESS" : "WARNING");
                        };
                        _svc.OnImageCaptured += imageBase64 => _messageProcessor?.ProcessImageCaptured(imageBase64);

                        _svc.Init();

                        var statusDto = new ReaderStatusDto
                        {
                            Connected = true,
                            Ready = true,
                            Status = "READY",
                            Model = "DP4500",
                            SerialNumber = "N/A"
                        };

                        _messageProcessor?.ProcessReaderStatus(statusDto);

                        return new { ok = true, message = "Reader initialized with CEDDFA" };
                    }
                    catch (Exception ex)
                    {
                        _messageProcessor?.ProcessErrorMessage($"Init failed: {ex.Message}", "INIT_ERROR");
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "enrollV2":
                {
                    if (_svc == null)
                    {
                        var error = "Reader not initialized. Call 'init' first.";
                        _messageProcessor?.ProcessErrorMessage(error, "NOT_INITIALIZED");
                        return new { ok = false, error };
                    }

                    // Parsear request DTO
                    var request = new EnrollmentRequestDto
                    {
                        UserId = (string?)input?.tag ?? $"User_{DateTime.Now:yyyyMMdd_HHmmss}",
                        TimeoutMs = (int?)input?.timeoutMs ?? 60000, // 1 minuto por defecto
                        TargetFarn = (int?)input?.targetFarn ?? 21474,
                        MaxRetriesPerSample = (int?)input?.maxRetriesPerSample ?? 3,
                        MaxSamples = (int?)input?.maxSamples ?? 4
                    };

                    _messageProcessor?.ProcessEnrollmentStarted(request.UserId);

                    _cts?.Cancel();
                    _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(request.TimeoutMs));

                    try
                    {
                        var r = _svc.Enroll3(_cts.Token, request.TargetFarn, request.MaxRetriesPerSample, request.MaxSamples);

                        string? imageBase64 = null;
                        string? templateBase64 = null;

                        if (r.ok && r.fmdReg != null)
                        {
                            FingerprintTempStore.Add(request.UserId, "DP_REGISTRATION", r.fmdReg, false);

                            // Generar imagen
                            if (_svc.LastFid != null)
                            {
                                imageBase64 = Dp4500Service.FidToBase64Png(_svc.LastFid);
                            }

                            // Serializar template
                            var regXml = DPUruNet.Fmd.SerializeXml(r.fmdReg);
                            templateBase64 = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(regXml));

                            _messageProcessor?.ProcessUserEnrolled(request.UserId);
                        }

                        var response = new EnrollmentResponseDto
                        {
                            Success = r.ok,
                            UserId = request.UserId,
                            Message = r.msg,
                            TemplateBase64 = templateBase64,
                            ImageBase64 = imageBase64,
                            SamplesCollected = r.ok ? request.MaxSamples : 0,
                            Quality = r.ok ? "GOOD" : "INSUFFICIENT"
                        };

                        _messageProcessor?.ProcessEnrollmentResult(response);

                        return new
                        {
                            ok = response.Success,
                            enrolled = response.Success,
                            userId = response.UserId,
                            message = response.Message,
                            imageBase64 = response.ImageBase64,
                            templateBase64 = response.TemplateBase64
                        };
                    }
                    catch (Exception ex)
                    {
                        var errorResponse = new EnrollmentResponseDto
                        {
                            Success = false,
                            UserId = request.UserId,
                            Message = ex.Message
                        };
                        _messageProcessor?.ProcessEnrollmentResult(errorResponse);
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "verifyV2":
                {
                    if (_svc == null)
                    {
                        var error = "Reader not initialized. Call 'init' first.";
                        _messageProcessor?.ProcessErrorMessage(error, "NOT_INITIALIZED");
                        return new { ok = false, error };
                    }

                    var request = new VerificationRequestDto
                    {
                        UserId = (string?)input?.tag ?? "",
                        TimeoutMs = (int?)input?.timeoutMs ?? 60000, // 1 minuto por defecto
                        TargetFarn = (int?)input?.targetFarn ?? 21474
                    };

                    if (string.IsNullOrEmpty(request.UserId))
                    {
                        return new { ok = false, error = "UserId is required for verification" };
                    }

                    _messageProcessor?.ProcessVerificationStarted(request.UserId);

                    _cts?.Cancel();
                    _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(request.TimeoutMs));

                    try
                    {
                        var stored = FingerprintTempStore.All().FirstOrDefault(x => x.Tag == request.UserId);
                        if (stored == null)
                        {
                            return new { ok = false, error = $"Fingerprint with tag '{request.UserId}' not found" };
                        }

                        var r = _svc.VerifyLiveAgainstReg(stored.Fmd, _cts.Token, request.TargetFarn);

                        string? imageBase64 = null;
                        if (r.ok && _svc.LastFid != null)
                        {
                            imageBase64 = Dp4500Service.FidToBase64Png(_svc.LastFid);
                        }

                        var response = new VerificationResponseDto
                        {
                            Success = r.ok,
                            Verified = r.score < request.TargetFarn,
                            UserId = request.UserId,
                            Score = r.score,
                            Threshold = request.TargetFarn,
                            Message = r.msg,
                            ImageBase64 = imageBase64,
                            MatchMethod = r.used
                        };

                        _messageProcessor?.ProcessVerificationResult(response);

                        return new
                        {
                            ok = response.Success,
                            verified = response.Verified,
                            userId = response.UserId,
                            score = response.Score,
                            message = response.Message,
                            imageBase64 = response.ImageBase64
                        };
                    }
                    catch (Exception ex)
                    {
                        var errorResponse = new VerificationResponseDto
                        {
                            Success = false,
                            UserId = request.UserId,
                            Message = ex.Message
                        };
                        _messageProcessor?.ProcessVerificationResult(errorResponse);
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "identify1NV2":
                {
                    if (_svc == null)
                    {
                        var error = "Reader not initialized. Call 'init' first.";
                        _messageProcessor?.ProcessErrorMessage(error, "NOT_INITIALIZED");
                        return new { ok = false, error };
                    }

                    var request = new IdentificationRequestDto
                    {
                        TimeoutMs = (int?)input?.timeoutMs ?? 60000, // 1 minuto por defecto
                        TargetFarn = (int?)input?.targetFarn ?? 21474,
                        TopResults = (int?)input?.top ?? 5
                    };

                    var gallerySize = FingerprintTempStore.All().Count;
                    _messageProcessor?.ProcessIdentificationStarted(gallerySize);

                    _cts?.Cancel();
                    _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(request.TimeoutMs));

                    try
                    {
                        var r = _svc.IdentifyLive1N(_cts.Token, request.TargetFarn, request.TopResults);

                        string? imageBase64 = null;
                        if (_svc.LastFid != null)
                        {
                            imageBase64 = Dp4500Service.FidToBase64Png(_svc.LastFid);
                        }

                        var response = new IdentificationResponseDto
                        {
                            Success = true,
                            Matched = r.match,
                            BestMatch = r.match ? new MatchResultDto
                            {
                                UserId = r.bestTag,
                                Score = r.bestScore,
                                Rank = 1
                            } : null,
                            TopMatches = r.topK.Select((item, index) => new MatchResultDto
                            {
                                UserId = item.tag,
                                Score = item.score,
                                Rank = index + 1
                            }).ToList(),
                            Message = r.msg,
                            ImageBase64 = imageBase64,
                            GallerySize = gallerySize,
                            GalleryFormat = r.galleryFormat
                        };

                        _messageProcessor?.ProcessIdentificationResult(response);

                        return new
                        {
                            ok = true,
                            match = response.Matched,
                            bestTag = response.BestMatch?.UserId ?? "",
                            bestScore = response.BestMatch?.Score ?? int.MaxValue,
                            topK = response.TopMatches.Select(m => new { tag = m.UserId, score = m.Score }).ToArray(),
                            message = response.Message,
                            imageBase64 = response.ImageBase64,
                            galleryFormat = response.GalleryFormat
                        };
                    }
                    catch (Exception ex)
                    {
                        var errorResponse = new IdentificationResponseDto
                        {
                            Success = false,
                            Message = ex.Message,
                            GallerySize = gallerySize
                        };
                        _messageProcessor?.ProcessIdentificationResult(errorResponse);
                        return new { ok = false, error = ex.Message };
                    }
                }

                case "getEventBusStats":
                {
                    if (_eventBus == null)
                    {
                        return new { ok = false, error = "Event Bus not initialized" };
                    }

                    var stats = _eventBus.GetStats();
                    return new
                    {
                        ok = true,
                        stats = new
                        {
                            totalEventTypes = stats.TotalEventTypes,
                            totalSubscriptions = stats.TotalSubscriptions,
                            globalSubscriptions = stats.GlobalSubscriptions,
                            eventHistorySize = stats.EventHistorySize
                        }
                    };
                }

                case "clearEventHistory":
                {
                    if (_eventBus == null)
                    {
                        return new { ok = false, error = "Event Bus not initialized" };
                    }

                    _eventBus.ClearHistory();
                    return new { ok = true, message = "Event history cleared" };
                }

                default:
                    return new { ok = false, error = $"Unknown operation: {op}" };
            }
        }
    }
}
