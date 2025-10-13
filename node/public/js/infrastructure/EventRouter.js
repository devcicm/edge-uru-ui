/**
 * EventRouter - Middleware ultra simple para enrutar eventos SSE
 *
 * Responsabilidades:
 * - Capturar eventos del BiometricAdapter
 * - Enrutar eventos SOLO al componente con operación activa
 * - Mantener aislamiento entre componentes
 *
 * Principio: UN componente activo por operación a la vez
 */
class EventRouter {
    constructor(adapter) {
        this.adapter = adapter;

        // Componentes suscritos por categoría
        this.subscribers = {
            enrollment: [],
            verification: [],
            identification: [],
            reader: [],
            all: []
        };

        // Operación activa actual (SOLO UNA a la vez por tipo)
        this.activeOperations = {
            enrollment: null,      // { componentId, startTime }
            verification: null,    // { componentId, startTime }
            identification: null   // { componentId, startTime }
        };

        this._setupListeners();
        console.log('[EventRouter] ✅ Inicializado');
    }

    /**
     * Capturar todos los eventos del adapter
     */
    _setupListeners() {
        // Capturar todos los eventos con wildcard
        this.adapter.on('*', (data) => this._routeEvent(data));
    }

    /**
     * Suscribir componente a una categoría
     */
    subscribe(category, component, componentId) {
        if (!this.subscribers[category]) {
            console.warn(`[EventRouter] Categoría desconocida: ${category}`);
            return;
        }

        this.subscribers[category].push({ component, componentId });
        console.log(`[EventRouter] 📋 ${componentId} suscrito a: ${category}`);
    }

    /**
     * Iniciar operación (marca componente como activo)
     */
    startOperation(operationType, componentId) {
        this.activeOperations[operationType] = {
            componentId,
            startTime: new Date()
        };

        console.log(`[EventRouter] ▶️ Operación iniciada: ${operationType} por ${componentId}`);
    }

    /**
     * Finalizar operación (libera componente activo)
     */
    endOperation(operationType) {
        if (this.activeOperations[operationType]) {
            const duration = Date.now() - this.activeOperations[operationType].startTime.getTime();
            console.log(`[EventRouter] ⏹️ Operación finalizada: ${operationType} (${duration}ms)`);
            this.activeOperations[operationType] = null;
        }
    }

    /**
     * Enrutar evento al componente correcto
     */
    _routeEvent(eventData) {
        const eventType = eventData.eventType || eventData.evt || 'UNKNOWN';

        console.log(`[EventRouter] 📨 Evento recibido: ${eventType}`);

        // Categorizar evento
        const category = this._categorize(eventType);
        if (!category) {
            console.log(`[EventRouter] ⚠️ Evento no categorizado: ${eventType}`);
            return;
        }

        // Despachar
        this._dispatch(category, eventType, eventData);
    }

    /**
     * Categorizar evento por su tipo
     */
    _categorize(eventType) {
        if (eventType.startsWith('ENROLLMENT_')) return 'enrollment';
        if (eventType.startsWith('VERIFICATION_')) return 'verification';
        if (eventType.startsWith('IDENTIFICATION_')) return 'identification';
        if (eventType.startsWith('READER_') || eventType === 'DEVICE_STATUS') return 'reader';

        // Eventos de captura: van al contexto activo
        if (eventType.startsWith('CAPTURE_') || eventType === 'IMAGE_CAPTURED') {
            if (this.activeOperations.enrollment) return 'enrollment';
            if (this.activeOperations.verification) return 'verification';
            if (this.activeOperations.identification) return 'identification';
            return 'reader';
        }

        return null;
    }

    /**
     * Despachar evento al componente activo
     */
    _dispatch(category, eventType, eventData) {
        // Siempre enviar a suscriptores 'all' (para logging)
        this._dispatchToAll(eventType, eventData);

        // Para operaciones específicas, enviar SOLO al componente activo
        if (category === 'enrollment' || category === 'verification' || category === 'identification') {
            const activeOp = this.activeOperations[category];

            if (!activeOp) {
                console.log(`[EventRouter] ⚠️ No hay operación activa para: ${category}`);
                return;
            }

            // Buscar componente activo
            const subscriber = this.subscribers[category].find(sub => sub.componentId === activeOp.componentId);

            if (subscriber) {
                console.log(`[EventRouter] 🎯 Despachando ${eventType} → ${subscriber.componentId}`);
                subscriber.component.handleRouterEvent(eventType, eventData);
            } else {
                console.warn(`[EventRouter] ⚠️ Componente activo no encontrado: ${activeOp.componentId}`);
            }
        } else {
            // Para eventos reader, enviar a todos los suscritos
            this.subscribers[category].forEach(sub => {
                console.log(`[EventRouter] 📤 ${eventType} → ${sub.componentId}`);
                sub.component.handleRouterEvent(eventType, eventData);
            });
        }
    }

    /**
     * Despachar a suscriptores de 'all'
     */
    _dispatchToAll(eventType, eventData) {
        this.subscribers.all.forEach(sub => {
            sub.component.handleRouterEvent(eventType, eventData);
        });
    }

    /**
     * Debug: mostrar estado
     */
    debugStatus() {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 EventRouter Estado');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');

        console.log('\n📝 Suscriptores:');
        Object.keys(this.subscribers).forEach(cat => {
            console.log(`  ${cat}: ${this.subscribers[cat].length}`);
            this.subscribers[cat].forEach(sub => {
                console.log(`    - ${sub.componentId}`);
            });
        });

        console.log('\n🔄 Operaciones Activas:');
        Object.keys(this.activeOperations).forEach(op => {
            const active = this.activeOperations[op];
            if (active) {
                console.log(`  ${op}: ${active.componentId}`);
            } else {
                console.log(`  ${op}: ninguna`);
            }
        });

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
}

// Registrar globalmente
window.EventRouter = EventRouter;
