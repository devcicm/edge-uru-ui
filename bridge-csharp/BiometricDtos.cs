#nullable enable
using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace EdgeBridge.Dtos
{
    // ============================================================
    // BASE DTOs - Fundación de la arquitectura
    // ============================================================

    /// <summary>
    /// DTO base para todos los mensajes del sistema biométrico
    /// </summary>
    public abstract class BaseDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;

        [JsonPropertyName("timestamp")]
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("version")]
        public string Version { get; set; } = "1.0";
    }

    // ============================================================
    // EVENT DTOs - Eventos del sistema
    // ============================================================

    /// <summary>
    /// DTO para eventos biométricos en tiempo real
    /// </summary>
    public class BiometricEventDto : BaseDto
    {
        [JsonPropertyName("eventType")]
        public string EventType { get; set; } = string.Empty; // STATUS, COUNT, ATTEMPT, IMAGE, CAPTURE

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("data")]
        public Dictionary<string, object>? Data { get; set; }

        [JsonPropertyName("severity")]
        public string Severity { get; set; } = "INFO"; // INFO, WARNING, ERROR, SUCCESS
    }

    // ============================================================
    // ENROLLMENT DTOs
    // ============================================================

    /// <summary>
    /// DTO para solicitud de enrolamiento
    /// </summary>
    public class EnrollmentRequestDto : BaseDto
    {
        [JsonPropertyName("userId")]
        public string UserId { get; set; } = string.Empty;

        [JsonPropertyName("timeoutMs")]
        public int TimeoutMs { get; set; } = 60000; // 1 minuto por defecto

        [JsonPropertyName("targetFarn")]
        public int TargetFarn { get; set; } = 21474;

        [JsonPropertyName("maxRetriesPerSample")]
        public int MaxRetriesPerSample { get; set; } = 3;

        [JsonPropertyName("maxSamples")]
        public int MaxSamples { get; set; } = 4;
    }

    /// <summary>
    /// DTO para respuesta de enrolamiento
    /// </summary>
    public class EnrollmentResponseDto : BaseDto
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("userId")]
        public string UserId { get; set; } = string.Empty;

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("templateBase64")]
        public string? TemplateBase64 { get; set; }

        [JsonPropertyName("imageBase64")]
        public string? ImageBase64 { get; set; }

        [JsonPropertyName("enrolledAt")]
        public DateTime EnrolledAt { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("samplesCollected")]
        public int SamplesCollected { get; set; }

        [JsonPropertyName("quality")]
        public string Quality { get; set; } = string.Empty;
    }

    // ============================================================
    // VERIFICATION DTOs
    // ============================================================

    /// <summary>
    /// DTO para solicitud de verificación 1:1
    /// </summary>
    public class VerificationRequestDto : BaseDto
    {
        [JsonPropertyName("userId")]
        public string UserId { get; set; } = string.Empty;

        [JsonPropertyName("timeoutMs")]
        public int TimeoutMs { get; set; } = 60000; // 1 minuto por defecto

        [JsonPropertyName("targetFarn")]
        public int TargetFarn { get; set; } = 21474;
    }

    /// <summary>
    /// DTO para respuesta de verificación
    /// </summary>
    public class VerificationResponseDto : BaseDto
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("verified")]
        public bool Verified { get; set; }

        [JsonPropertyName("userId")]
        public string UserId { get; set; } = string.Empty;

        [JsonPropertyName("score")]
        public int Score { get; set; }

        [JsonPropertyName("threshold")]
        public int Threshold { get; set; }

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("imageBase64")]
        public string? ImageBase64 { get; set; }

        [JsonPropertyName("matchMethod")]
        public string MatchMethod { get; set; } = string.Empty; // VER, ANSI
    }

    // ============================================================
    // IDENTIFICATION DTOs
    // ============================================================

    /// <summary>
    /// DTO para solicitud de identificación 1:N
    /// </summary>
    public class IdentificationRequestDto : BaseDto
    {
        [JsonPropertyName("timeoutMs")]
        public int TimeoutMs { get; set; } = 60000; // 1 minuto por defecto

        [JsonPropertyName("targetFarn")]
        public int TargetFarn { get; set; } = 21474;

        [JsonPropertyName("topResults")]
        public int TopResults { get; set; } = 5;
    }

    /// <summary>
    /// DTO para un resultado de match
    /// </summary>
    public class MatchResultDto
    {
        [JsonPropertyName("userId")]
        public string UserId { get; set; } = string.Empty;

        [JsonPropertyName("score")]
        public int Score { get; set; }

        [JsonPropertyName("rank")]
        public int Rank { get; set; }
    }

    /// <summary>
    /// DTO para respuesta de identificación
    /// </summary>
    public class IdentificationResponseDto : BaseDto
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("matched")]
        public bool Matched { get; set; }

        [JsonPropertyName("bestMatch")]
        public MatchResultDto? BestMatch { get; set; }

        [JsonPropertyName("topMatches")]
        public List<MatchResultDto> TopMatches { get; set; } = new();

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("imageBase64")]
        public string? ImageBase64 { get; set; }

        [JsonPropertyName("gallerySize")]
        public int GallerySize { get; set; }

        [JsonPropertyName("galleryFormat")]
        public string GalleryFormat { get; set; } = string.Empty;
    }

    // ============================================================
    // READER DTOs
    // ============================================================

    /// <summary>
    /// DTO para estado del lector
    /// </summary>
    public class ReaderStatusDto : BaseDto
    {
        [JsonPropertyName("connected")]
        public bool Connected { get; set; }

        [JsonPropertyName("ready")]
        public bool Ready { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("model")]
        public string Model { get; set; } = string.Empty;

        [JsonPropertyName("serialNumber")]
        public string SerialNumber { get; set; } = string.Empty;

        [JsonPropertyName("capabilities")]
        public ReaderCapabilitiesDto? Capabilities { get; set; }
    }

    /// <summary>
    /// DTO para capacidades del lector
    /// </summary>
    public class ReaderCapabilitiesDto
    {
        [JsonPropertyName("canCapture")]
        public bool CanCapture { get; set; }

        [JsonPropertyName("canStream")]
        public bool CanStream { get; set; }

        [JsonPropertyName("canMatch")]
        public bool CanMatch { get; set; }

        [JsonPropertyName("resolutions")]
        public int[] Resolutions { get; set; } = Array.Empty<int>();
    }

    // ============================================================
    // GALLERY DTOs
    // ============================================================

    /// <summary>
    /// DTO para información de usuario en galería
    /// </summary>
    public class GalleryUserDto : BaseDto
    {
        [JsonPropertyName("userId")]
        public string UserId { get; set; } = string.Empty;

        [JsonPropertyName("enrolledAt")]
        public DateTime EnrolledAt { get; set; }

        [JsonPropertyName("format")]
        public string Format { get; set; } = string.Empty;

        [JsonPropertyName("templateSize")]
        public int TemplateSize { get; set; }

        [JsonPropertyName("sha256")]
        public string? Sha256 { get; set; }
    }

    /// <summary>
    /// DTO para lista de galería
    /// </summary>
    public class GalleryListDto : BaseDto
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("users")]
        public List<GalleryUserDto> Users { get; set; } = new();

        [JsonPropertyName("totalCount")]
        public int TotalCount { get; set; }
    }

    // ============================================================
    // OPERATION RESULT DTOs
    // ============================================================

    /// <summary>
    /// DTO genérico para respuestas de operaciones
    /// </summary>
    public class OperationResultDto : BaseDto
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("errorCode")]
        public string? ErrorCode { get; set; }

        [JsonPropertyName("data")]
        public Dictionary<string, object>? Data { get; set; }
    }
}
