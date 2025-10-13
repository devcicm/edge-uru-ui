#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using EdgeBridge.Dtos;

namespace EdgeBridge.EventBus
{
    // ============================================================
    // EVENT ARGS - Argumentos de eventos
    // ============================================================

    /// <summary>
    /// Argumentos para eventos de componentes biométricos
    /// </summary>
    public class BiometricEventArgs : EventArgs
    {
        public BaseDto Dto { get; }
        public string EventType { get; }
        public string Origin { get; }
        public DateTime OccurredAt { get; }

        public BiometricEventArgs(BaseDto dto, string eventType, string origin = "system")
        {
            Dto = dto ?? throw new ArgumentNullException(nameof(dto));
            EventType = eventType ?? throw new ArgumentNullException(nameof(eventType));
            Origin = origin;
            OccurredAt = DateTime.UtcNow;
        }
    }

    // ============================================================
    // INTERFACES - Contratos del Event Bus
    // ============================================================

    /// <summary>
    /// Interface para publicadores de eventos
    /// </summary>
    public interface IEventPublisher
    {
        void Publish(BiometricEventArgs eventArgs);
        event EventHandler<BiometricEventArgs>? OnEventPublished;
    }

    /// <summary>
    /// Interface para suscriptores de eventos
    /// </summary>
    public interface IEventSubscriber
    {
        void Subscribe(string eventType, Action<BiometricEventArgs> handler);
        void Unsubscribe(string eventType, Action<BiometricEventArgs> handler);
        void SubscribeAll(Action<BiometricEventArgs> handler);
        void UnsubscribeAll(Action<BiometricEventArgs> handler);
    }

    // ============================================================
    // EVENT BUS - Implementación principal
    // ============================================================

    /// <summary>
    /// Event Bus centralizado para comunicación entre componentes
    /// Thread-safe implementation
    /// </summary>
    public class BiometricEventBus : IEventPublisher, IEventSubscriber
    {
        private readonly object _lock = new();
        private readonly Dictionary<string, List<Action<BiometricEventArgs>>> _subscriptions = new();
        private readonly List<Action<BiometricEventArgs>> _globalSubscriptions = new();
        private readonly Queue<BiometricEventArgs> _eventHistory = new();
        private const int MaxHistorySize = 100;

        public event EventHandler<BiometricEventArgs>? OnEventPublished;

        /// <summary>
        /// Publica un evento a todos los suscriptores
        /// </summary>
        public void Publish(BiometricEventArgs eventArgs)
        {
            if (eventArgs == null) throw new ArgumentNullException(nameof(eventArgs));

            lock (_lock)
            {
                // Agregar a historial
                _eventHistory.Enqueue(eventArgs);
                if (_eventHistory.Count > MaxHistorySize)
                {
                    _eventHistory.Dequeue();
                }

                // Log del evento
                Console.WriteLine($"[EVENT BUS] Publishing: {eventArgs.EventType} from {eventArgs.Origin} at {eventArgs.OccurredAt:HH:mm:ss.fff}");
            }

            // Notificar a listeners del evento general
            OnEventPublished?.Invoke(this, eventArgs);

            // Notificar a suscriptores globales
            lock (_lock)
            {
                foreach (var handler in _globalSubscriptions.ToList())
                {
                    SafeInvoke(handler, eventArgs);
                }
            }

            // Notificar a suscriptores específicos del tipo de evento
            lock (_lock)
            {
                if (_subscriptions.TryGetValue(eventArgs.EventType, out var handlers))
                {
                    foreach (var handler in handlers.ToList())
                    {
                        SafeInvoke(handler, eventArgs);
                    }
                }
            }
        }

        /// <summary>
        /// Suscribirse a un tipo específico de evento
        /// </summary>
        public void Subscribe(string eventType, Action<BiometricEventArgs> handler)
        {
            if (string.IsNullOrWhiteSpace(eventType)) throw new ArgumentNullException(nameof(eventType));
            if (handler == null) throw new ArgumentNullException(nameof(handler));

            lock (_lock)
            {
                if (!_subscriptions.ContainsKey(eventType))
                {
                    _subscriptions[eventType] = new List<Action<BiometricEventArgs>>();
                }

                if (!_subscriptions[eventType].Contains(handler))
                {
                    _subscriptions[eventType].Add(handler);
                    Console.WriteLine($"[EVENT BUS] Subscribed to: {eventType} (Total subscribers: {_subscriptions[eventType].Count})");
                }
            }
        }

        /// <summary>
        /// Desuscribirse de un tipo específico de evento
        /// </summary>
        public void Unsubscribe(string eventType, Action<BiometricEventArgs> handler)
        {
            if (string.IsNullOrWhiteSpace(eventType)) throw new ArgumentNullException(nameof(eventType));
            if (handler == null) throw new ArgumentNullException(nameof(handler));

            lock (_lock)
            {
                if (_subscriptions.TryGetValue(eventType, out var handlers))
                {
                    handlers.Remove(handler);
                    Console.WriteLine($"[EVENT BUS] Unsubscribed from: {eventType} (Remaining: {handlers.Count})");
                }
            }
        }

        /// <summary>
        /// Suscribirse a todos los eventos
        /// </summary>
        public void SubscribeAll(Action<BiometricEventArgs> handler)
        {
            if (handler == null) throw new ArgumentNullException(nameof(handler));

            lock (_lock)
            {
                if (!_globalSubscriptions.Contains(handler))
                {
                    _globalSubscriptions.Add(handler);
                    Console.WriteLine($"[EVENT BUS] Global subscription added (Total: {_globalSubscriptions.Count})");
                }
            }
        }

        /// <summary>
        /// Desuscribirse de todos los eventos
        /// </summary>
        public void UnsubscribeAll(Action<BiometricEventArgs> handler)
        {
            if (handler == null) throw new ArgumentNullException(nameof(handler));

            lock (_lock)
            {
                _globalSubscriptions.Remove(handler);
                Console.WriteLine($"[EVENT BUS] Global subscription removed (Remaining: {_globalSubscriptions.Count})");
            }
        }

        /// <summary>
        /// Obtener historial de eventos
        /// </summary>
        public BiometricEventArgs[] GetEventHistory()
        {
            lock (_lock)
            {
                return _eventHistory.ToArray();
            }
        }

        /// <summary>
        /// Limpiar historial de eventos
        /// </summary>
        public void ClearHistory()
        {
            lock (_lock)
            {
                _eventHistory.Clear();
                Console.WriteLine("[EVENT BUS] Event history cleared");
            }
        }

        /// <summary>
        /// Obtener estadísticas del bus de eventos
        /// </summary>
        public EventBusStats GetStats()
        {
            lock (_lock)
            {
                return new EventBusStats
                {
                    TotalEventTypes = _subscriptions.Count,
                    TotalSubscriptions = _subscriptions.Values.Sum(list => list.Count),
                    GlobalSubscriptions = _globalSubscriptions.Count,
                    EventHistorySize = _eventHistory.Count
                };
            }
        }

        /// <summary>
        /// Invocación segura de handlers con manejo de excepciones
        /// </summary>
        private void SafeInvoke(Action<BiometricEventArgs> handler, BiometricEventArgs args)
        {
            try
            {
                handler(args);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EVENT BUS] Error in handler: {ex.Message}");
            }
        }
    }

    // ============================================================
    // STATS - Estadísticas del Event Bus
    // ============================================================

    public class EventBusStats
    {
        public int TotalEventTypes { get; set; }
        public int TotalSubscriptions { get; set; }
        public int GlobalSubscriptions { get; set; }
        public int EventHistorySize { get; set; }

        public override string ToString()
        {
            return $"EventBus Stats: {TotalEventTypes} event types, {TotalSubscriptions} subscriptions, {GlobalSubscriptions} global, {EventHistorySize} in history";
        }
    }

    // ============================================================
    // EVENT TYPES - Constantes de tipos de eventos
    // ============================================================

    public static class BiometricEventTypes
    {
        // Reader events
        public const string READER_INITIALIZED = "READER_INITIALIZED";
        public const string READER_STATUS_CHANGED = "READER_STATUS_CHANGED";
        public const string READER_ERROR = "READER_ERROR";

        // Capture events
        public const string CAPTURE_STARTED = "CAPTURE_STARTED";
        public const string CAPTURE_PROGRESS = "CAPTURE_PROGRESS";
        public const string CAPTURE_COMPLETED = "CAPTURE_COMPLETED";
        public const string CAPTURE_FAILED = "CAPTURE_FAILED";
        public const string CAPTURE_QUALITY_LOW = "CAPTURE_QUALITY_LOW";
        public const string IMAGE_CAPTURED = "IMAGE_CAPTURED";

        // Enrollment events
        public const string ENROLLMENT_STARTED = "ENROLLMENT_STARTED";
        public const string ENROLLMENT_SAMPLE_COLLECTED = "ENROLLMENT_SAMPLE_COLLECTED";
        public const string ENROLLMENT_COMPLETED = "ENROLLMENT_COMPLETED";
        public const string ENROLLMENT_FAILED = "ENROLLMENT_FAILED";

        // Verification events
        public const string VERIFICATION_STARTED = "VERIFICATION_STARTED";
        public const string VERIFICATION_COMPLETED = "VERIFICATION_COMPLETED";
        public const string VERIFICATION_FAILED = "VERIFICATION_FAILED";

        // Identification events
        public const string IDENTIFICATION_STARTED = "IDENTIFICATION_STARTED";
        public const string IDENTIFICATION_COMPLETED = "IDENTIFICATION_COMPLETED";
        public const string IDENTIFICATION_FAILED = "IDENTIFICATION_FAILED";

        // Gallery events
        public const string GALLERY_UPDATED = "GALLERY_UPDATED";
        public const string GALLERY_CLEARED = "GALLERY_CLEARED";
        public const string USER_ENROLLED = "USER_ENROLLED";
        public const string USER_REMOVED = "USER_REMOVED";

        // System events
        public const string SYSTEM_STATUS = "SYSTEM_STATUS";
        public const string SYSTEM_ERROR = "SYSTEM_ERROR";
    }
}
