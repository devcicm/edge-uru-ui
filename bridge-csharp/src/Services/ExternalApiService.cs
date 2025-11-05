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
                using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromMilliseconds(60000));
                int targetFarn = 21474; // FAR estándar

                var result = await Task.Run(() => _reader.Enroll3(cts.Token, targetFarn, 3, 4));

                if (result.ok && result.fmdReg != null)
                {
                    // Serializar template a XML y convertir a Base64
                    var templateXml = DPUruNet.Fmd.SerializeXml(result.fmdReg);
                    var templateBytes = System.Text.Encoding.UTF8.GetBytes(templateXml);
                    var templateBase64 = Convert.ToBase64String(templateBytes);
                    var templateHash = ComputeSHA256Hash(templateBytes);

                    // Obtener imagen si está disponible
                    string? imageBase64 = null;
                    if (_reader.LastFid != null)
                    {
                        imageBase64 = Dp4500Service.FidToBase64Png(_reader.LastFid);
                    }

                    var fingerprintData = new FingerprintData
                    {
                        Hand = hand,
                        Finger = finger,
                        TemplateBase64 = templateBase64,
                        Format = "ANSI_378",  // DP4500 usa ANSI 378
                        TemplateSize = templateBytes.Length,
                        Quality = 85,  // Calidad estimada
                        Resolution = 500,  // DP4500 es 500 DPI
                        TemplateHash = templateHash,
                        ImageBase64 = imageBase64
                    };

                    capturedFingerprints.Add(fingerprintData);
                }
                else
                {
                    Console.WriteLine($"[ExternalApi] Error capturando {hand} {finger}: {result.msg}");
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
                DeviceId = "DP4500_" + Environment.MachineName,
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

            // Convertir template de Base64 a bytes XML y deserializar a Fmd
            var externalTemplateBytes = Convert.FromBase64String(externalFingerprint.TemplateBase64);
            var externalTemplateXml = System.Text.Encoding.UTF8.GetString(externalTemplateBytes);
            var externalFmd = DPUruNet.Fmd.DeserializeXml(externalTemplateXml);

            if (externalFmd == null)
            {
                throw new Exception("No se pudo deserializar la plantilla externa");
            }

            // Tag temporal para la verificación
            var tempTag = $"TEMP_VERIFY_{Guid.NewGuid():N}";

            // Almacenar template temporalmente en el store
            FingerprintTempStore.AddFingerprint(tempTag, Hand.Unknown, Finger.Unknown, externalFmd, EnrollmentType.SingleFinger, false);

            try
            {
                // Verificar con reintentos
                using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));

                int bestScore = 999999;
                bool matched = false;

                for (int attempt = 1; attempt <= maxAttempts; attempt++)
                {
                    var verifyResult = await Task.Run(() => _reader.VerifyLiveAgainstReg(externalFmd, cts.Token, targetFarn));

                    if (verifyResult.ok)
                    {
                        bestScore = Math.Min(bestScore, verifyResult.score);

                        if (verifyResult.score < targetFarn)
                        {
                            matched = true;
                            break;
                        }
                    }

                    if (attempt < maxAttempts)
                    {
                        await Task.Delay(500);
                    }
                }

                var matchResult = new BiometricMatchResult
                {
                    UserId = externalFingerprint.Hand + "_" + externalFingerprint.Finger,
                    IsMatch = matched,
                    ConfidenceScore = CalculateConfidenceScore(bestScore),
                    FalseAcceptRate = bestScore,
                    MatchedHand = matched ? externalFingerprint.Hand : null,
                    MatchedFinger = matched ? externalFingerprint.Finger : null,
                    VerifiedAt = DateTime.UtcNow,
                    Message = matched
                        ? $"Huella verificada correctamente (Score: {bestScore})"
                        : $"Huella NO coincide (Score: {bestScore})"
                };

                return matchResult;
            }
            finally
            {
                // Limpiar template temporal
                FingerprintTempStore.DeleteUser(tempTag);
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
                        var templateBytes = Convert.FromBase64String(fingerprint.TemplateBase64);
                        var templateXml = System.Text.Encoding.UTF8.GetString(templateBytes);
                        var fmd = DPUruNet.Fmd.DeserializeXml(templateXml);

                        if (fmd != null)
                        {
                            FingerprintTempStore.AddFingerprint(tempTag, Hand.Unknown, Finger.Unknown, fmd, EnrollmentType.SingleFinger, false);
                            tempTags.Add(tempTag);
                        }
                    }
                }

                // Realizar identificación 1:N
                using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));
                var identifyResult = await Task.Run(() => _reader.IdentifyLive1N(cts.Token, targetFarn, 1));

                if (identifyResult.match && !string.IsNullOrEmpty(identifyResult.bestTag))
                {
                    // Parsear el tag temporal para obtener hand/finger
                    var parts = identifyResult.bestTag.Split('_');
                    var hand = parts.Length >= 2 ? parts[1] : "UNKNOWN";
                    var finger = parts.Length >= 3 ? parts[2] : "UNKNOWN";

                    return new BiometricMatchResult
                    {
                        UserId = $"{hand}_{finger}",
                        IsMatch = true,
                        ConfidenceScore = CalculateConfidenceScore(identifyResult.bestScore),
                        FalseAcceptRate = identifyResult.bestScore,
                        MatchedHand = hand,
                        MatchedFinger = finger,
                        VerifiedAt = DateTime.UtcNow,
                        Message = $"Match encontrado: {hand} {finger} (Score: {identifyResult.bestScore})"
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
                    FingerprintTempStore.DeleteUser(tempTag);
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
