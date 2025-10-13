#nullable enable
using System;
using System.Threading;
using System.Threading.Tasks;
using EdgeBridge.Dtos;
using EdgeBridge.EventBus;

namespace EdgeBridge.Processing
{
    // ============================================================
    // MESSAGE PROCESSOR - Procesador de mensajes biométricos
    // ============================================================

    /// <summary>
    /// Procesa mensajes biométricos y los convierte en eventos
    /// Actúa como intermediario entre el servidor y los componentes
    /// </summary>
    public class BiometricMessageProcessor : IDisposable
    {
        private readonly IEventPublisher _eventPublisher;
        private readonly CancellationTokenSource _cts = new();
        private bool _disposed = false;

        public BiometricMessageProcessor(IEventPublisher eventPublisher)
        {
            _eventPublisher = eventPublisher ?? throw new ArgumentNullException(nameof(eventPublisher));
            Console.WriteLine("[MESSAGE PROCESSOR] Initialized");
        }

        // ============================================================
        // STATUS MESSAGES
        // ============================================================

        /// <summary>
        /// Procesa un mensaje de estado del sistema
        /// </summary>
        public void ProcessStatusMessage(string message, string severity = "INFO")
        {
            var dto = new BiometricEventDto
            {
                Type = BiometricEventTypes.SYSTEM_STATUS,
                EventType = BiometricEventTypes.SYSTEM_STATUS,
                Message = message,
                Severity = severity,
                Timestamp = DateTime.UtcNow
            };

            PublishEvent(dto, BiometricEventTypes.SYSTEM_STATUS);
        }

        /// <summary>
        /// Procesa un mensaje de error
        /// </summary>
        public void ProcessErrorMessage(string message, string? errorCode = null)
        {
            var dto = new BiometricEventDto
            {
                Type = BiometricEventTypes.SYSTEM_ERROR,
                EventType = BiometricEventTypes.SYSTEM_ERROR,
                Message = message,
                Severity = "ERROR",
                Data = errorCode != null
                    ? new System.Collections.Generic.Dictionary<string, object> { ["errorCode"] = errorCode }
                    : null,
                Timestamp = DateTime.UtcNow
            };

            PublishEvent(dto, BiometricEventTypes.SYSTEM_ERROR);
        }

        // ============================================================
        // ENROLLMENT MESSAGES
        // ============================================================

        /// <summary>
        /// Procesa inicio de enrolamiento
        /// </summary>
        public void ProcessEnrollmentStarted(string userId)
        {
            var dto = new BiometricEventDto
            {
                Type = BiometricEventTypes.ENROLLMENT_STARTED,
                EventType = BiometricEventTypes.ENROLLMENT_STARTED,
                Message = $"Iniciando enrolamiento para: {userId}",
                Severity = "INFO",
                Data = new System.Collections.Generic.Dictionary<string, object>
                {
                    ["userId"] = userId
                },
                Timestamp = DateTime.UtcNow
            };

            PublishEvent(dto, BiometricEventTypes.ENROLLMENT_STARTED);
        }

        /// <summary>
        /// Procesa muestra recolectada durante enrolamiento
        /// </summary>
        public void ProcessSampleCollected(int sampleNumber, int totalSamples)
        {
            var dto = new BiometricEventDto
            {
                Type = BiometricEventTypes.ENROLLMENT_SAMPLE_COLLECTED,
                EventType = BiometricEventTypes.ENROLLMENT_SAMPLE_COLLECTED,
                Message = $"Muestra {sampleNumber}/{totalSamples} recolectada",
                Severity = "SUCCESS",
                Data = new System.Collections.Generic.Dictionary<string, object>
                {
                    ["sampleNumber"] = sampleNumber,
                    ["totalSamples"] = totalSamples,
                    ["progress"] = (double)sampleNumber / totalSamples * 100
                },
                Timestamp = DateTime.UtcNow
            };

            PublishEvent(dto, BiometricEventTypes.ENROLLMENT_SAMPLE_COLLECTED);
        }

        /// <summary>
        /// Procesa resultado de enrolamiento
        /// </summary>
        public void ProcessEnrollmentResult(EnrollmentResponseDto response)
        {
            if (response == null) throw new ArgumentNullException(nameof(response));

            var eventType = response.Success
                ? BiometricEventTypes.ENROLLMENT_COMPLETED
                : BiometricEventTypes.ENROLLMENT_FAILED;

            response.Type = eventType;
            PublishEvent(response, eventType);
        }

        // ============================================================
        // VERIFICATION MESSAGES
        // ============================================================

        /// <summary>
        /// Procesa inicio de verificación
        /// </summary>
        public void ProcessVerificationStarted(string userId)
        {
            var dto = new BiometricEventDto
            {
                Type = BiometricEventTypes.VERIFICATION_STARTED,
                EventType = BiometricEventTypes.VERIFICATION_STARTED,
                Message = $"Verificando identidad: {userId}",
                Severity = "INFO",
                Data = new System.Collections.Generic.Dictionary<string, object>
                {
                    ["userId"] = userId
                },
                Timestamp = DateTime.UtcNow
            };

            PublishEvent(dto, BiometricEventTypes.VERIFICATION_STARTED);
        }

        /// <summary>
        /// Procesa resultado de verificación
        /// </summary>
        public void ProcessVerificationResult(VerificationResponseDto response)
        {
            if (response == null) throw new ArgumentNullException(nameof(response));

            var eventType = response.Success
                ? BiometricEventTypes.VERIFICATION_COMPLETED
                : BiometricEventTypes.VERIFICATION_FAILED;

            response.Type = eventType;
            PublishEvent(response, eventType);
        }

        // ============================================================
        // IDENTIFICATION MESSAGES
        // ============================================================

        /// <summary>
        /// Procesa inicio de identificación
        /// </summary>
        public void ProcessIdentificationStarted(int gallerySize)
        {
            var dto = new BiometricEventDto
            {
                Type = BiometricEventTypes.IDENTIFICATION_STARTED,
                EventType = BiometricEventTypes.IDENTIFICATION_STARTED,
                Message = $"Buscando en galería de {gallerySize} usuarios",
                Severity = "INFO",
                Data = new System.Collections.Generic.Dictionary<string, object>
                {
                    ["gallerySize"] = gallerySize
                },
                Timestamp = DateTime.UtcNow
            };

            PublishEvent(dto, BiometricEventTypes.IDENTIFICATION_STARTED);
        }

        /// <summary>
        /// Procesa resultado de identificación
        /// </summary>
        public void ProcessIdentificationResult(IdentificationResponseDto response)
        {
            if (response == null) throw new ArgumentNullException(nameof(response));

            var eventType = response.Success
                ? BiometricEventTypes.IDENTIFICATION_COMPLETED
                : BiometricEventTypes.IDENTIFICATION_FAILED;

            response.Type = eventType;
            PublishEvent(response, eventType);
        }

        // ============================================================
        // IMAGE CAPTURE MESSAGES
        // ============================================================

        /// <summary>
        /// Procesa imagen capturada
        /// </summary>
        public void ProcessImageCaptured(string imageBase64)
        {
            var dto = new BiometricEventDto
            {
                Type = BiometricEventTypes.IMAGE_CAPTURED,
                EventType = BiometricEventTypes.IMAGE_CAPTURED,
                Message = "Imagen de huella capturada",
                Severity = "SUCCESS",
                Data = new System.Collections.Generic.Dictionary<string, object>
                {
                    ["imageBase64"] = imageBase64,
                    ["imageSize"] = imageBase64?.Length ?? 0
                },
                Timestamp = DateTime.UtcNow
            };

            PublishEvent(dto, BiometricEventTypes.IMAGE_CAPTURED);
        }

        /// <summary>
        /// Procesa inicio de captura
        /// </summary>
        public void ProcessCaptureStarted(string message = "Esperando dedo en el lector")
        {
            var dto = new BiometricEventDto
            {
                Type = BiometricEventTypes.CAPTURE_STARTED,
                EventType = BiometricEventTypes.CAPTURE_STARTED,
                Message = message,
                Severity = "INFO",
                Timestamp = DateTime.UtcNow
            };

            PublishEvent(dto, BiometricEventTypes.CAPTURE_STARTED);
        }

        /// <summary>
        /// Procesa captura completada
        /// </summary>
        public void ProcessCaptureCompleted()
        {
            var dto = new BiometricEventDto
            {
                Type = BiometricEventTypes.CAPTURE_COMPLETED,
                EventType = BiometricEventTypes.CAPTURE_COMPLETED,
                Message = "Captura completada exitosamente",
                Severity = "SUCCESS",
                Timestamp = DateTime.UtcNow
            };

            PublishEvent(dto, BiometricEventTypes.CAPTURE_COMPLETED);
        }

        /// <summary>
        /// Procesa calidad baja en captura
        /// </summary>
        public void ProcessCaptureQualityLow(int attemptNumber, int maxAttempts, string reason = "Calidad insuficiente")
        {
            var dto = new BiometricEventDto
            {
                Type = BiometricEventTypes.CAPTURE_QUALITY_LOW,
                EventType = BiometricEventTypes.CAPTURE_QUALITY_LOW,
                Message = $"Calidad baja - Intento {attemptNumber}/{maxAttempts}: {reason}",
                Severity = "WARNING",
                Data = new System.Collections.Generic.Dictionary<string, object>
                {
                    ["attemptNumber"] = attemptNumber,
                    ["maxAttempts"] = maxAttempts,
                    ["reason"] = reason
                },
                Timestamp = DateTime.UtcNow
            };

            PublishEvent(dto, BiometricEventTypes.CAPTURE_QUALITY_LOW);
        }

        /// <summary>
        /// Procesa intento de captura
        /// </summary>
        public void ProcessCaptureAttempt(int attemptNumber, int maxAttempts, bool success, string message)
        {
            var dto = new BiometricEventDto
            {
                Type = BiometricEventTypes.SYSTEM_STATUS,
                EventType = BiometricEventTypes.SYSTEM_STATUS,
                Message = message,
                Severity = success ? "SUCCESS" : "WARNING",
                Data = new System.Collections.Generic.Dictionary<string, object>
                {
                    ["attemptNumber"] = attemptNumber,
                    ["maxAttempts"] = maxAttempts,
                    ["success"] = success
                },
                Timestamp = DateTime.UtcNow
            };

            PublishEvent(dto, BiometricEventTypes.SYSTEM_STATUS);
        }

        // ============================================================
        // READER MESSAGES
        // ============================================================

        /// <summary>
        /// Procesa estado del lector
        /// </summary>
        public void ProcessReaderStatus(ReaderStatusDto status)
        {
            if (status == null) throw new ArgumentNullException(nameof(status));

            status.Type = BiometricEventTypes.READER_STATUS_CHANGED;
            PublishEvent(status, BiometricEventTypes.READER_STATUS_CHANGED);
        }

        // ============================================================
        // GALLERY MESSAGES
        // ============================================================

        /// <summary>
        /// Procesa actualización de galería
        /// </summary>
        public void ProcessGalleryUpdated(int totalUsers)
        {
            var dto = new BiometricEventDto
            {
                Type = BiometricEventTypes.GALLERY_UPDATED,
                EventType = BiometricEventTypes.GALLERY_UPDATED,
                Message = $"Galería actualizada: {totalUsers} usuarios",
                Severity = "INFO",
                Data = new System.Collections.Generic.Dictionary<string, object>
                {
                    ["totalUsers"] = totalUsers
                },
                Timestamp = DateTime.UtcNow
            };

            PublishEvent(dto, BiometricEventTypes.GALLERY_UPDATED);
        }

        /// <summary>
        /// Procesa usuario enrolado
        /// </summary>
        public void ProcessUserEnrolled(string userId)
        {
            var dto = new BiometricEventDto
            {
                Type = BiometricEventTypes.USER_ENROLLED,
                EventType = BiometricEventTypes.USER_ENROLLED,
                Message = $"Usuario enrolado: {userId}",
                Severity = "SUCCESS",
                Data = new System.Collections.Generic.Dictionary<string, object>
                {
                    ["userId"] = userId
                },
                Timestamp = DateTime.UtcNow
            };

            PublishEvent(dto, BiometricEventTypes.USER_ENROLLED);
        }

        // ============================================================
        // HELPER METHODS
        // ============================================================

        /// <summary>
        /// Publica un evento en el Event Bus
        /// </summary>
        private void PublishEvent(BaseDto dto, string eventType, string origin = "biometric-processor")
        {
            try
            {
                var args = new BiometricEventArgs(dto, eventType, origin);
                _eventPublisher.Publish(args);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MESSAGE PROCESSOR] Error publishing event: {ex.Message}");
            }
        }

        // ============================================================
        // DISPOSE
        // ============================================================

        protected virtual void Dispose(bool disposing)
        {
            if (!_disposed)
            {
                if (disposing)
                {
                    _cts.Cancel();
                    _cts.Dispose();
                }
                _disposed = true;
            }
        }

        public void Dispose()
        {
            Dispose(true);
            GC.SuppressFinalize(this);
        }
    }
}
