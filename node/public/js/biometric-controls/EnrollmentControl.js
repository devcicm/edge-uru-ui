/**
 * EnrollmentControl - Componente ultra simple para enrolamiento
 *
 * Responsabilidades:
 * - UI de enrolamiento con input de usuario
 * - Capturar 4 muestras de huella
 * - Mostrar progreso y estado
 * - Mostrar imagen de huella
 */
class EnrollmentControl extends BaseComponent {
    constructor(containerId, adapter, config = {}) {
        super(containerId, adapter, config);

        // Estado
        this.userId = '';
        this.isEnrolling = false;

        // Suscribirse al EventRouter
        if (this.eventRouter) {
            this.eventRouter.subscribe('enrollment', this, this.componentId);
            console.log(`[${this.componentId}] Suscrito a eventos de enrollment`);
        }

        // Escuchar DIRECTAMENTE al adapter para eventos en tiempo real
        this._setupDirectListener();

        // Escuchar evento de finalización
        this._setupCompletionListener();
    }

    /**
     * Configurar listener directo al adapter para eventos en tiempo real
     * Esto asegura que recibimos TODOS los eventos SSE instantáneamente,
     * sin pasar por el filtro del EventRouter
     */
    _setupDirectListener() {
        // Escuchar TODOS los eventos del adapter con wildcard
        this.adapter.on('*', (data) => {
            // Solo procesar si estamos en proceso de enrolamiento
            if (!this.isEnrolling) return;

            const eventType = data.eventType || data.evt || '';

            // Eventos de progreso de captura que queremos mostrar en tiempo real
            const realtimeEvents = [
                'SYSTEM_STATUS',
                'SYSTEM_MESSAGE',
                'CAPTURE_PROGRESS',
                'CAPTURE_STARTED',
                'CAPTURE_QUALITY_LOW',
                'IMAGE_CAPTURED',
                'ENROLLMENT_SAMPLE_COLLECTED',
                'ENROLLMENT_SAMPLE_SUCCESS',
                'ENROLLMENT_SAMPLE_STATUS'
            ];

            // Si es un evento de tiempo real, mostrarlo inmediatamente
            if (realtimeEvents.some(evt => eventType.includes(evt))) {
                const message = data.message || data.msg || eventType;
                const severity = (data.severity || 'INFO').toUpperCase();

                console.log(`[${this.componentId}] 📨 Evento directo: ${eventType} - ${message}`);

                // Actualizar status en tiempo real
                let statusType = 'info';
                if (severity === 'SUCCESS') statusType = 'success';
                else if (severity === 'ERROR' || severity === 'WARNING') statusType = 'error';

                this.updateStatus(message, statusType);

                // Si hay imagen, mostrarla
                const imageBase64 = data.data?.imageBase64 || data.imageBase64;
                if (imageBase64) {
                    this.displayImage(imageBase64);
                }
            }
        });

        console.log(`[${this.componentId}] ✅ Listener directo al adapter configurado`);
    }

    /**
     * Configurar listener para ENROLLMENT_COMPLETED
     */
    _setupCompletionListener() {
        // Sobrescribir handleRouterEvent para detectar ENROLLMENT_COMPLETED
        const originalHandler = this.handleRouterEvent.bind(this);

        this.handleRouterEvent = (eventType, eventData) => {
            // Llamar al handler original primero
            originalHandler(eventType, eventData);

            // Detectar eventos de finalización
            if (eventType === 'ENROLLMENT_COMPLETED') {
                this._onEnrollmentCompleted(eventData);
            } else if (eventType === 'ENROLLMENT_FAILED') {
                this._onEnrollmentFailed(eventData);
            }
        };
    }

    /**
     * Manejar finalización exitosa
     */
    _onEnrollmentCompleted(eventData) {
        console.log(`[${this.componentId}] ✅ Enrolamiento completado, finalizando operación`);

        this.isEnrolling = false;
        this._updateUI();

        // Finalizar operación en EventRouter
        if (this.eventRouter) {
            this.eventRouter.endOperation('enrollment');
        }

        // Auto-limpiar después de 3 segundos
        setTimeout(() => this.clear(), 3000);
    }

    /**
     * Manejar fallos
     */
    _onEnrollmentFailed(eventData) {
        console.log(`[${this.componentId}] ❌ Enrolamiento fallido, finalizando operación`);

        this.isEnrolling = false;
        this._updateUI();

        // Finalizar operación en EventRouter
        if (this.eventRouter) {
            this.eventRouter.endOperation('enrollment');
        }
    }

    /**
     * Crear estructura HTML
     */
    _createStructure() {
        this.container.innerHTML = `
            <div class="enrollment-control">
                <!-- Header -->
                <div class="component-header">
                    <h3>📝 Enrolamiento</h3>
                    <p class="component-subtitle">Captura 4 muestras de huella dactilar</p>
                </div>

                <!-- Input Usuario -->
                <div class="component-input-group">
                    <label for="userId-${this.containerId}">ID del Usuario:</label>
                    <input type="text"
                           id="userId-${this.containerId}"
                           class="component-input"
                           placeholder="Ej: Usuario001">
                </div>

                <!-- Imagen de huella -->
                <div class="fingerprint-image">
                    <div class="image-placeholder">👤</div>
                </div>

                <!-- Estado con timestamp -->
                <div class="component-status status-info">
                    <span class="status-timestamp">[--:--:--]</span>
                    <span class="status-icon">ℹ️</span>
                    <span class="status-message">Ingresa el ID del usuario</span>
                </div>

                <!-- Botones -->
                <div class="component-buttons">
                    <button class="btn-primary" id="btnEnroll-${this.containerId}">
                        Iniciar Enrolamiento
                    </button>
                    <button class="btn-secondary" id="btnClear-${this.containerId}">
                        Limpiar
                    </button>
                </div>

                <!-- Instrucciones -->
                <div class="component-instructions">
                    <div class="instruction-item">
                        <span class="instruction-number">1</span>
                        <span class="instruction-text">Ingresa un ID único</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-number">2</span>
                        <span class="instruction-text">Presiona "Iniciar Enrolamiento"</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-number">3</span>
                        <span class="instruction-text">Coloca el dedo 4 veces cuando se solicite</span>
                    </div>
                </div>
            </div>
        `;

        // Referencias a elementos
        this.userIdInput = this.container.querySelector(`#userId-${this.containerId}`);
        this.btnEnroll = this.container.querySelector(`#btnEnroll-${this.containerId}`);
        this.btnClear = this.container.querySelector(`#btnClear-${this.containerId}`);

        // Eventos
        this.btnEnroll.onclick = () => this.startEnrollment();
        this.btnClear.onclick = () => this.clear();
        this.userIdInput.oninput = () => this._validateInput();

        this._validateInput();
    }

    /**
     * Validar input del usuario
     */
    _validateInput() {
        const isValid = this.userIdInput.value.trim().length > 0;
        this.btnEnroll.disabled = !isValid || this.isEnrolling;
    }

    /**
     * Iniciar enrolamiento
     */
    async startEnrollment() {
        this.userId = this.userIdInput.value.trim();

        if (!this.userId) {
            this.showError('Ingresa un ID de usuario válido');
            return;
        }

        try {
            this.isEnrolling = true;
            this._updateUI();

            this.showLoading('Iniciando enrolamiento...');

            // Notificar al EventRouter que esta operación comenzó
            if (this.eventRouter) {
                this.eventRouter.startOperation('enrollment', this.componentId);
            }

            // Llamar al backend - NO esperamos resultado aquí
            // Los eventos SSE nos notificarán del progreso y finalización en tiempo real
            await this.adapter.enrollFingerprint(this.userId);

            // NOTA: NO finalizamos aquí - esperamos evento ENROLLMENT_COMPLETED

        } catch (error) {
            this.showError(`Error: ${error.message}`);

            // Solo en caso de error de conexión finalizamos
            this.isEnrolling = false;
            this._updateUI();

            if (this.eventRouter) {
                this.eventRouter.endOperation('enrollment');
            }
        }
    }

    /**
     * Limpiar componente
     */
    clear() {
        super.clear();

        this.userId = '';
        this.isEnrolling = false;
        this.userIdInput.value = '';

        this._updateUI();
        this.showInfo('Ingresa el ID del usuario');
    }

    /**
     * Actualizar UI según estado
     */
    _updateUI() {
        this.userIdInput.disabled = this.isEnrolling;
        this.btnEnroll.disabled = this.isEnrolling || !this.userIdInput.value.trim();
        this.btnClear.disabled = this.isEnrolling;

        if (this.isEnrolling) {
            this.btnEnroll.textContent = 'Enrolando...';
        } else {
            this.btnEnroll.textContent = 'Iniciar Enrolamiento';
        }
    }
}

// Registrar globalmente
window.EnrollmentControl = EnrollmentControl;
