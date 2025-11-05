using System;
using System.Collections.Generic;

namespace EdgeBridge.DTOs
{
    /// <summary>
    /// DTOs para integración con APIs externas de biometría
    /// </summary>

    // ==========================================
    // REGISTRO (Envío a API Externa)
    // ==========================================

    /// <summary>
    /// DTO para enviar datos de registro de huella a API externa
    /// </summary>
    public class BiometricRegistrationRequest
    {
        /// <summary>
        /// Identificador único del usuario
        /// </summary>
        public string UserId { get; set; }

        /// <summary>
        /// Información del usuario (opcional)
        /// </summary>
        public UserInfo UserInfo { get; set; }

        /// <summary>
        /// Lista de huellas capturadas (puede ser 1 o múltiples dedos)
        /// </summary>
        public List<FingerprintData> Fingerprints { get; set; }

        /// <summary>
        /// Timestamp de la captura
        /// </summary>
        public DateTime CapturedAt { get; set; }

        /// <summary>
        /// Identificador del dispositivo/lector
        /// </summary>
        public string DeviceId { get; set; }

        /// <summary>
        /// Metadatos adicionales (opcional)
        /// </summary>
        public Dictionary<string, object> Metadata { get; set; }
    }

    /// <summary>
    /// DTO para respuesta de registro desde API externa
    /// </summary>
    public class BiometricRegistrationResponse
    {
        /// <summary>
        /// Indica si el registro fue exitoso
        /// </summary>
        public bool Success { get; set; }

        /// <summary>
        /// Mensaje descriptivo
        /// </summary>
        public string Message { get; set; }

        /// <summary>
        /// ID del registro en el sistema externo
        /// </summary>
        public string RegistrationId { get; set; }

        /// <summary>
        /// Timestamp del registro
        /// </summary>
        public DateTime RegisteredAt { get; set; }

        /// <summary>
        /// Detalles de cada huella procesada
        /// </summary>
        public List<FingerprintProcessResult> ProcessedFingerprints { get; set; }

        /// <summary>
        /// Código de error (si aplica)
        /// </summary>
        public string ErrorCode { get; set; }
    }

    // ==========================================
    // VERIFICACIÓN (Solicitud y respuesta)
    // ==========================================

    /// <summary>
    /// DTO para solicitar datos de usuario desde API externa
    /// </summary>
    public class BiometricVerificationRequest
    {
        /// <summary>
        /// Identificador del usuario a verificar
        /// </summary>
        public string UserId { get; set; }

        /// <summary>
        /// Mano y dedo específico (opcional - si se requiere dedo específico)
        /// </summary>
        public string Hand { get; set; }  // "LEFT" o "RIGHT"
        public string Finger { get; set; }  // "THUMB", "INDEX", etc.

        /// <summary>
        /// Timestamp de la solicitud
        /// </summary>
        public DateTime RequestedAt { get; set; }
    }

    /// <summary>
    /// DTO para recibir datos de huella desde API externa
    /// </summary>
    public class BiometricVerificationResponse
    {
        /// <summary>
        /// Indica si se encontró el usuario
        /// </summary>
        public bool Found { get; set; }

        /// <summary>
        /// Información del usuario
        /// </summary>
        public UserInfo UserInfo { get; set; }

        /// <summary>
        /// Huellas registradas del usuario
        /// </summary>
        public List<FingerprintData> Fingerprints { get; set; }

        /// <summary>
        /// Mensaje descriptivo
        /// </summary>
        public string Message { get; set; }

        /// <summary>
        /// Código de error (si aplica)
        /// </summary>
        public string ErrorCode { get; set; }
    }

    /// <summary>
    /// DTO para resultado de verificación local contra huella de API
    /// </summary>
    public class BiometricMatchResult
    {
        /// <summary>
        /// Usuario verificado
        /// </summary>
        public string UserId { get; set; }

        /// <summary>
        /// Indica si la huella coincide
        /// </summary>
        public bool IsMatch { get; set; }

        /// <summary>
        /// Score de confianza (0-100)
        /// </summary>
        public int ConfidenceScore { get; set; }

        /// <summary>
        /// FAR (False Acceptance Rate) del match
        /// </summary>
        public int FalseAcceptRate { get; set; }

        /// <summary>
        /// Dedo que coincidió
        /// </summary>
        public string MatchedHand { get; set; }
        public string MatchedFinger { get; set; }

        /// <summary>
        /// Timestamp de la verificación
        /// </summary>
        public DateTime VerifiedAt { get; set; }

        /// <summary>
        /// Mensaje descriptivo
        /// </summary>
        public string Message { get; set; }
    }

    // ==========================================
    // MODELOS AUXILIARES
    // ==========================================

    /// <summary>
    /// Datos de una huella digital individual
    /// </summary>
    public class FingerprintData
    {
        /// <summary>
        /// Mano: "LEFT" o "RIGHT"
        /// </summary>
        public string Hand { get; set; }

        /// <summary>
        /// Dedo: "THUMB", "INDEX", "MIDDLE", "RING", "PINKY"
        /// </summary>
        public string Finger { get; set; }

        /// <summary>
        /// Plantilla biométrica en Base64
        /// </summary>
        public string TemplateBase64 { get; set; }

        /// <summary>
        /// Formato de la plantilla: "ANSI_378", "ISO_19794_2", etc.
        /// </summary>
        public string Format { get; set; }

        /// <summary>
        /// Tamaño de la plantilla en bytes
        /// </summary>
        public int TemplateSize { get; set; }

        /// <summary>
        /// Calidad de la captura (0-100)
        /// </summary>
        public int Quality { get; set; }

        /// <summary>
        /// Imagen de la huella en Base64 (opcional)
        /// </summary>
        public string ImageBase64 { get; set; }

        /// <summary>
        /// Resolución de captura en DPI
        /// </summary>
        public int Resolution { get; set; }

        /// <summary>
        /// Hash SHA-256 de la plantilla (para integridad)
        /// </summary>
        public string TemplateHash { get; set; }
    }

    /// <summary>
    /// Información del usuario
    /// </summary>
    public class UserInfo
    {
        public string UserId { get; set; }
        public string FirstName { get; set; }
        public string LastName { get; set; }
        public string Email { get; set; }
        public string DocumentId { get; set; }
        public Dictionary<string, string> CustomFields { get; set; }
    }

    /// <summary>
    /// Resultado del procesamiento de una huella
    /// </summary>
    public class FingerprintProcessResult
    {
        public string Hand { get; set; }
        public string Finger { get; set; }
        public bool Accepted { get; set; }
        public string Message { get; set; }
        public int Quality { get; set; }
    }
}
