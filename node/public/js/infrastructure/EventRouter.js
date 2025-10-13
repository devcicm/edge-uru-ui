/**
 * EventRouter - Middleware dedicado para enrutamiento de eventos SSE CEDDFA
 *
 * Propósito:
 * - Capturar eventos SSE del backend (vía BiometricAdapter)
 * - Enrutar eventos específicamente a componentes suscritos según su contexto
 * - Mantener estado de operaciones activas para dirigir eventos apropiadamente
 * - Proporcionar trazabilidad de eventos para debugging
 *
 * Arquitectura:
 * Backend SSE → BiometricAdapter → EventRouter → Componentes Específicos
 */
class EventRouter {
    constructor(adapter) {
        this.adapter = adapter;

        // Registro de componentes suscritos por tipo de operación
        this.subscribers = {
            enrollment: new Set(),      // Componentes suscritos a enrolamiento
            verification: new Set(),    // Componentes suscritos a verificación
            identification: new Set(),  // Componentes suscritos a identificación
            reader: new Set(),          // Componentes suscritos a eventos del lector
            system: new Set(),          // Componentes suscritos a eventos del sistema
            all: new Set()              // Componentes suscritos a todos los eventos
        };

        // Estado de operaciones activas
        this.activeOperations = {
            enrollment: null,       // { componentId, userId, startTime }
            verification: null,     // { componentId, userId, startTime }
            identification: null    // { componentId, startTime }
        };

        // Historial de eventos para trazabilidad
        this.eventHistory = [];
        this.maxHistorySize = 100;

        // Estadísticas de enrutamiento
        this.stats = {
            totalEvents: 0,
            routedEvents: 0,
            droppedEvents: 0,
            eventsByType: {}
        };

        this._setupEventListeners();
    }

    /**
     * Configurar listeners del adapter para capturar todos los eventos SSE
     */
    _setupEventListeners() {
        // Capturar TODOS los eventos del backend usando wildcard
        this.adapter.on('*', (data) => this._routeEvent(data));

        console.log('[EventRouter] Middleware inicializado y escuchando eventos SSE');
    }

    /**
     * Suscribir un componente a eventos de un tipo específico
     * @param {string} operationType - 'enrollment', 'verification', 'identification', 'reader', 'system', 'all'
     * @param {Object} component - Componente que se suscribe (debe tener método handleEvent)
     * @param {string} componentId - ID único del componente
     */
    subscribe(operationType, component, componentId) {
        if (!this.subscribers[operationType]) {
            console.warn(`[EventRouter] Tipo de operación desconocido: ${operationType}`);
            return;
        }

        const subscription = {
            component,
            componentId,
            subscribedAt: new Date()
        };

        this.subscribers[operationType].add(subscription);

        console.log(`[EventRouter] Componente ${componentId} suscrito a eventos de tipo: ${operationType}`);
        console.log(`[EventRouter] Total suscriptores para ${operationType}:`, this.subscribers[operationType].size);
    }

    /**
     * Desuscribir un componente
     */
    unsubscribe(operationType, componentId) {
        if (!this.subscribers[operationType]) return;

        const subscription = Array.from(this.subscribers[operationType])
            .find(sub => sub.componentId === componentId);

        if (subscription) {
            this.subscribers[operationType].delete(subscription);
            console.log(`[EventRouter] Componente ${componentId} desuscrito de: ${operationType}`);
        }
    }

    /**
     * Registrar inicio de operación
     */
    startOperation(operationType, componentId, metadata = {}) {
        this.activeOperations[operationType] = {
            componentId,
            startTime: new Date(),
            ...metadata
        };

        console.log(`[EventRouter] ▶️ Operación iniciada: ${operationType} por ${componentId}`, metadata);
    }

    /**
     * Finalizar operación activa
     */
    endOperation(operationType) {
        if (this.activeOperations[operationType]) {
            const duration = Date.now() - this.activeOperations[operationType].startTime.getTime();
            console.log(`[EventRouter] ⏹️ Operación finalizada: ${operationType} (duración: ${duration}ms)`);
            this.activeOperations[operationType] = null;
        }
    }

    /**
     * Enrutar evento a los componentes apropiados
     */
    _routeEvent(eventData) {
        this.stats.totalEvents++;

        const eventType = eventData.eventType || eventData.evt || 'UNKNOWN';

        // Actualizar estadísticas por tipo
        this.stats.eventsByType[eventType] = (this.stats.eventsByType[eventType] || 0) + 1;

        // Agregar a historial
        this._addToHistory({
            eventType,
            timestamp: new Date(),
            data: eventData
        });

        console.log(`[EventRouter] 📨 Enrutando evento: ${eventType}`);

        // Determinar categoría del evento y enrutar
        const category = this._categorizeEvent(eventType);

        if (category) {
            this._dispatchToSubscribers(category, eventType, eventData);
        }

        // También enviar a suscriptores de 'all'
        this._dispatchToSubscribers('all', eventType, eventData);
    }

    /**
     * Categorizar evento según su tipo
     */
    _categorizeEvent(eventType) {
        // Eventos de enrolamiento
        if (eventType.startsWith('ENROLLMENT_')) {
            return 'enrollment';
        }

        // Eventos de verificación
        if (eventType.startsWith('VERIFICATION_')) {
            return 'verification';
        }

        // Eventos de identificación
        if (eventType.startsWith('IDENTIFICATION_')) {
            return 'identification';
        }

        // Eventos del lector
        if (eventType.startsWith('READER_') || eventType === 'DEVICE_STATUS') {
            return 'reader';
        }

        // Eventos de captura (pueden ser de cualquier operación activa)
        if (eventType.startsWith('CAPTURE_') || eventType === 'IMAGE_CAPTURED') {
            return this._determineCaptureContext();
        }

        // Eventos del sistema
        if (eventType.startsWith('SYSTEM_')) {
            return 'system';
        }

        return null;
    }

    /**
     * Determinar contexto de eventos de captura según operación activa
     */
    _determineCaptureContext() {
        // Prioridad: enrollment > verification > identification
        if (this.activeOperations.enrollment) {
            console.log('[EventRouter] Evento de captura → contexto: enrollment');
            return 'enrollment';
        }

        if (this.activeOperations.verification) {
            console.log('[EventRouter] Evento de captura → contexto: verification');
            return 'verification';
        }

        if (this.activeOperations.identification) {
            console.log('[EventRouter] Evento de captura → contexto: identification');
            return 'identification';
        }

        // Sin contexto, enviar a todos los componentes reader
        console.log('[EventRouter] Evento de captura → contexto: reader (sin operación activa)');
        return 'reader';
    }

    /**
     * Despachar evento a suscriptores de una categoría
     * IMPORTANTE: Solo despacha al componente que tiene la operación activa
     */
    _dispatchToSubscribers(category, eventType, eventData) {
        const subscribers = this.subscribers[category];

        if (!subscribers || subscribers.size === 0) {
            console.log(`[EventRouter] ⚠️ No hay suscriptores para categoría: ${category}`);
            this.stats.droppedEvents++;
            return;
        }

        let dispatched = 0;

        // Si la categoría es 'all', enviar a todos (para componentes de logging)
        if (category === 'all') {
            subscribers.forEach(subscription => {
                this._dispatchToComponent(subscription, eventType, eventData);
                dispatched++;
            });
        } else {
            // Para categorías específicas (enrollment, verification, identification),
            // solo despachar al componente que tiene la operación activa
            const activeOperation = this.activeOperations[category];

            if (activeOperation) {
                // Buscar el componente activo
                const activeSubscription = Array.from(subscribers)
                    .find(sub => sub.componentId === activeOperation.componentId);

                if (activeSubscription) {
                    console.log(`[EventRouter] 🎯 Despachando a componente activo: ${activeSubscription.componentId}`);
                    this._dispatchToComponent(activeSubscription, eventType, eventData);
                    dispatched++;
                } else {
                    console.warn(`[EventRouter] ⚠️ Componente activo ${activeOperation.componentId} no encontrado en suscriptores`);
                }
            } else {
                // Sin operación activa, despachar a todos los suscriptores (para eventos reader/system)
                console.log(`[EventRouter] 📢 Sin operación activa para ${category}, despachando a todos los suscriptores`);
                subscribers.forEach(subscription => {
                    this._dispatchToComponent(subscription, eventType, eventData);
                    dispatched++;
                });
            }
        }

        if (dispatched > 0) {
            this.stats.routedEvents++;
            console.log(`[EventRouter] ✅ Evento ${eventType} despachado a ${dispatched} componente(s) en categoría ${category}`);
        } else {
            console.log(`[EventRouter] ⚠️ Evento ${eventType} no fue despachado a ningún componente`);
            this.stats.droppedEvents++;
        }
    }

    /**
     * Despachar evento a un componente específico
     */
    _dispatchToComponent(subscription, eventType, eventData) {
        try {
            const { component, componentId } = subscription;

            // Verificar si el componente tiene método handleRouterEvent
            if (typeof component.handleRouterEvent === 'function') {
                console.log(`[EventRouter] 📤 Despachando ${eventType} → ${componentId}`);
                component.handleRouterEvent(eventType, eventData);
            } else if (typeof component.updateStatus === 'function') {
                // Fallback: usar updateStatus si existe
                const message = eventData.message || eventData.msg || eventType;
                component.updateStatus('info', message);
            } else {
                console.warn(`[EventRouter] Componente ${componentId} no tiene handleRouterEvent ni updateStatus`);
            }

        } catch (error) {
            console.error(`[EventRouter] Error despachando a ${subscription.componentId}:`, error);
        }
    }

    /**
     * Agregar evento al historial
     */
    _addToHistory(entry) {
        this.eventHistory.push(entry);

        // Mantener límite de historial
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }
    }

    /**
     * Obtener historial de eventos
     */
    getHistory(category = null, limit = 20) {
        let history = this.eventHistory;

        // Filtrar por categoría si se especifica
        if (category) {
            history = history.filter(entry => {
                const eventCategory = this._categorizeEvent(entry.eventType);
                return eventCategory === category;
            });
        }

        // Retornar últimos N eventos
        return history.slice(-limit);
    }

    /**
     * Obtener estadísticas de enrutamiento
     */
    getStats() {
        return {
            ...this.stats,
            activeOperations: Object.keys(this.activeOperations).reduce((acc, key) => {
                acc[key] = this.activeOperations[key] !== null;
                return acc;
            }, {}),
            subscriberCounts: Object.keys(this.subscribers).reduce((acc, key) => {
                acc[key] = this.subscribers[key].size;
                return acc;
            }, {})
        };
    }

    /**
     * Limpiar historial
     */
    clearHistory() {
        this.eventHistory = [];
        console.log('[EventRouter] Historial limpiado');
    }

    /**
     * Resetear estadísticas
     */
    resetStats() {
        this.stats = {
            totalEvents: 0,
            routedEvents: 0,
            droppedEvents: 0,
            eventsByType: {}
        };
        console.log('[EventRouter] Estadísticas reseteadas');
    }

    /**
     * Debug: Mostrar estado actual del router
     */
    debugStatus() {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 EventRouter - Estado Actual');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        console.log('\n📝 Suscriptores:');
        Object.keys(this.subscribers).forEach(category => {
            console.log(`  ${category}: ${this.subscribers[category].size} componente(s)`);
            this.subscribers[category].forEach(sub => {
                console.log(`    - ${sub.componentId}`);
            });
        });

        console.log('\n🔄 Operaciones Activas:');
        Object.keys(this.activeOperations).forEach(op => {
            const active = this.activeOperations[op];
            if (active) {
                console.log(`  ${op}: ${active.componentId} (iniciado: ${active.startTime.toLocaleTimeString()})`);
            } else {
                console.log(`  ${op}: ninguna`);
            }
        });

        console.log('\n📈 Estadísticas:');
        console.log(`  Total eventos: ${this.stats.totalEvents}`);
        console.log(`  Enrutados: ${this.stats.routedEvents}`);
        console.log(`  Descartados: ${this.stats.droppedEvents}`);
        console.log(`  Historial: ${this.eventHistory.length} eventos`);

        console.log('\n🎯 Eventos por tipo:');
        Object.keys(this.stats.eventsByType).forEach(type => {
            console.log(`  ${type}: ${this.stats.eventsByType[type]}`);
        });

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
}

// Registrar globalmente
window.EventRouter = EventRouter;
