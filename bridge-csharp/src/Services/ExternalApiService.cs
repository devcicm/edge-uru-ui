using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using DPUruNet;
using EdgeBridge.DTOs;

namespace EdgeBridge.Services
{
    /// <summary>
    /// Servicio para operaciones biométricas con integración a APIs externas
    /// </summary>
    public class ExternalApiService
    {
        private readonly Dp4500Service _reader;

        public ExternalApiService(Dp4500Service reader)
        {
            _reader = reader ?? throw new ArgumentNullException(nameof(reader));
        }

        /// <summary>
        /// Captura huella(s) y genera DTO para envío a API externa
        /// </summary>
        public async Task<BiometricRegistrationRequest> CaptureForRegistration(
            string userId,
            string? firstName = null,
            string? lastName = null,
            string? email = null,
            string? documentId = null,
            List<(string hand, string finger)>? fingersToCapture = null,
            Dictionary<string, object>? metadata = null)
        {
            if (string.IsNullOrWhiteSpace(userId))
                throw new ArgumentException("UserId es requerido", nameof(userId));

            // Si no se especifican dedos, capturar todos (10)
            var fingers = fingersToCapture ?? GenerateAllFingersList();

            var capturedFingerprints = new List<FingerprintData>();

            foreach (var (hand, finger) in fingers)
            {
                Console.WriteLine($"[ExternalApi] Capturando: {hand} {finger}");

                // Capturar huella del dedo específico
                var result = await _reader.EnrollAsync(
                    tag: $"{userId}_{hand}_{finger}",
                    timeoutMs: 60000,
                    targetFarn: 21474,
                    maxRetriesPerSample: 3,
                    maxSamples: 4);

                if (result.Success && result.Template != null)
                {
                    // Convertir template a Base64
                    var templateBase64 = Convert.ToBase64String(result.Template);
                    var templateHash = ComputeSHA256Hash(result.Template);

                    var fingerprintData = new FingerprintData
                    {
                        Hand = hand,
                        Finger = finger,
                        TemplateBase64 = templateBase64,
                        Format = "ANSI_378",  // DP4500 usa ANSI 378
                        TemplateSize = result.Template.Length,
                        Quality = 85,  // Calidad estimada (puedes ajustar según needs)
                        Resolution = 500,  // DP4500 es 500 DPI
                        TemplateHash = templateHash,
                        ImageBase64 = result.ImageBase64  // Si está disponible
                    };

                    capturedFingerprints.Add(fingerprintData);
                }
                else
                {
                    Console.WriteLine($"[ExternalApi] Error capturando {hand} {finger}: {result.ErrorMessage}");
                }
            }

            if (capturedFingerprints.Count == 0)
            {
                throw new Exception("No se pudo capturar ninguna huella");
            }

            // Construir DTO de registro
            var registrationRequest = new BiometricRegistrationRequest
            {
                UserId = userId,
                UserInfo = new UserInfo
                {
                    UserId = userId,
                    FirstName = firstName,
                    LastName = lastName,
                    Email = email,
                    DocumentId = documentId
                },
                Fingerprints = capturedFingerprints,
                CapturedAt = DateTime.UtcNow,
                DeviceId = "DP4500_" + ComputeSHA256Hash(Encoding.UTF8.GetBytes(Environment.MachineName)).Substring(0, 8),
                Metadata = metadata
            };

            return registrationRequest;
        }

        /// <summary>
        /// Verifica huella capturada localmente contra plantilla recibida de API externa
        /// </summary>
        public async Task<BiometricMatchResult> VerifyAgainstExternalFingerprint(
            FingerprintData externalFingerprint,
            int timeoutMs = 15000,
            int targetFarn = 21474,
            int maxAttempts = 4)
        {
            if (externalFingerprint == null)
                throw new ArgumentNullException(nameof(externalFingerprint));

            if (string.IsNullOrWhiteSpace(externalFingerprint.TemplateBase64))
                throw new ArgumentException("TemplateBase64 es requerido");

            // Convertir template de Base64 a bytes
            var externalTemplate = Convert.FromBase64String(externalFingerprint.TemplateBase64);

            // Tag temporal para la verificación
            var tempTag = $"TEMP_VERIFY_{Guid.NewGuid():N}";

            // Almacenar template temporalmente en el store del lector
            _reader.AddTemplate(tempTag, externalTemplate);

            try
            {
                // Capturar huella actual y verificar contra la almacenada
                var verifyResult = await _reader.VerifyAsync(
                    tag: tempTag,
                    timeoutMs: timeoutMs,
                    targetFarn: targetFarn,
                    maxAttempts: maxAttempts);

                var matchResult = new BiometricMatchResult
                {
                    UserId = externalFingerprint.Hand + "_" + externalFingerprint.Finger,  // Identificador temporal
                    IsMatch = verifyResult.Verified,
                    ConfidenceScore = CalculateConfidenceScore(verifyResult.Score),
                    FalseAcceptRate = verifyResult.Score,
                    MatchedHand = verifyResult.Verified ? externalFingerprint.Hand : null,
                    MatchedFinger = verifyResult.Verified ? externalFingerprint.Finger : null,
                    VerifiedAt = DateTime.UtcNow,
                    Message = verifyResult.Verified
                        ? $"Huella verificada correctamente (Score: {verifyResult.Score})"
                        : $"Huella NO coincide (Score: {verifyResult.Score})"
                };

                return matchResult;
            }
            finally
            {
                // Limpiar template temporal
                _reader.RemoveTemplate(tempTag);
            }
        }

        /// <summary>
        /// Verifica huella capturada contra múltiples plantillas (1:N)
        /// </summary>
        public async Task<BiometricMatchResult> VerifyAgainstMultipleFingerprints(
            List<FingerprintData> externalFingerprints,
            int timeoutMs = 15000,
            int targetFarn = 21474)
        {
            if (externalFingerprints == null || externalFingerprints.Count == 0)
                throw new ArgumentException("Se requiere al menos una huella para verificar");

            // Almacenar temporalmente todas las plantillas
            var tempTags = new List<string>();

            try
            {
                foreach (var fingerprint in externalFingerprints)
                {
                    if (!string.IsNullOrWhiteSpace(fingerprint.TemplateBase64))
                    {
                        var tempTag = $"TEMP_{fingerprint.Hand}_{fingerprint.Finger}_{Guid.NewGuid():N}";
                        var template = Convert.FromBase64String(fingerprint.TemplateBase64);
                        _reader.AddTemplate(tempTag, template);
                        tempTags.Add(tempTag);
                    }
                }

                // Realizar identificación 1:N
                var identifyResult = await _reader.IdentifyAsync(
                    timeoutMs: timeoutMs,
                    targetFarn: targetFarn,
                    top: 1,  // Solo el mejor match
                    maxAttempts: 4);

                if (identifyResult.Match && !string.IsNullOrEmpty(identifyResult.BestTag))
                {
                    // Parsear el tag temporal para obtener hand/finger
                    var parts = identifyResult.BestTag.Split('_');
                    var hand = parts.Length >= 2 ? parts[1] : "UNKNOWN";
                    var finger = parts.Length >= 3 ? parts[2] : "UNKNOWN";

                    return new BiometricMatchResult
                    {
                        UserId = $"{hand}_{finger}",
                        IsMatch = true,
                        ConfidenceScore = CalculateConfidenceScore(identifyResult.BestScore),
                        FalseAcceptRate = identifyResult.BestScore,
                        MatchedHand = hand,
                        MatchedFinger = finger,
                        VerifiedAt = DateTime.UtcNow,
                        Message = $"Match encontrado: {hand} {finger} (Score: {identifyResult.BestScore})"
                    };
                }

                return new BiometricMatchResult
                {
                    IsMatch = false,
                    ConfidenceScore = 0,
                    FalseAcceptRate = 0,
                    VerifiedAt = DateTime.UtcNow,
                    Message = "No se encontró ninguna coincidencia"
                };
            }
            finally
            {
                // Limpiar templates temporales
                foreach (var tempTag in tempTags)
                {
                    _reader.RemoveTemplate(tempTag);
                }
            }
        }

        /// <summary>
        /// Convierte template almacenada localmente a FingerprintData para envío
        /// </summary>
        public FingerprintData ConvertStoredTemplateToDTO(string tag, byte[] template)
        {
            if (template == null || template.Length == 0)
                throw new ArgumentException("Template inválida", nameof(template));

            // Parsear tag para obtener hand/finger
            var parts = tag.Split('_');
            var hand = parts.Length >= 2 ? parts[parts.Length - 2] : "UNKNOWN";
            var finger = parts.Length >= 1 ? parts[parts.Length - 1] : "UNKNOWN";

            return new FingerprintData
            {
                Hand = hand,
                Finger = finger,
                TemplateBase64 = Convert.ToBase64String(template),
                Format = "ANSI_378",
                TemplateSize = template.Length,
                Quality = 85,
                Resolution = 500,
                TemplateHash = ComputeSHA256Hash(template)
            };
        }

        // ==========================================
        // MÉTODOS AUXILIARES
        // ==========================================

        private List<(string hand, string finger)> GenerateAllFingersList()
        {
            var fingers = new List<(string hand, string finger)>();
            var hands = new[] { "LEFT", "RIGHT" };
            var fingerNames = new[] { "THUMB", "INDEX", "MIDDLE", "RING", "PINKY" };

            foreach (var hand in hands)
            {
                foreach (var finger in fingerNames)
                {
                    fingers.Add((hand, finger));
                }
            }

            return fingers;
        }

        private int CalculateConfidenceScore(int falseAcceptRate)
        {
            // Convertir FAR a score de confianza (0-100)
            // FAR más bajo = mayor confianza
            // Ejemplo: FAR 0 = 100% confianza, FAR 21474 = 0% confianza
            if (falseAcceptRate <= 0) return 100;
            if (falseAcceptRate >= 21474) return 0;

            return (int)((1.0 - (falseAcceptRate / 21474.0)) * 100);
        }

        private string ComputeSHA256Hash(byte[] data)
        {
            using (var sha256 = SHA256.Create())
            {
                var hashBytes = sha256.ComputeHash(data);
                return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
            }
        }
    }
}
