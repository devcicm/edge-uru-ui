/**
 * BaseComponent - Clase base para todos los componentes biométricos
 * Proporciona funcionalidad común y patrón estándar
 */
class BaseComponent {
    constructor(containerId, adapter, config = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.adapter = adapter || window.BiometricAdapter;
        this.config = config;
        this.isInitialized = false;
        this.eventListeners = new Map();

        // Configuración de modal
        this.isModal = config.isModal || false;
        this.modalContainer = config.modalContainer || null;

        // EventRouter para manejo centralizado de eventos SSE
        this.eventRouter = config.eventRouter || window.EventRouter || null;
        this.componentId = `${this.constructor.name}_${containerId}_${Date.now()}`;

        // Elemento de estado dedicado para mensajes SSE
        this.statusElement = null;

        if (!this.container) {
            throw new Error(`Container con ID '${containerId}' no encontrado`);
        }

        this._initialize();
    }

    /**
     * Inicialización base del componente
     */
    _initialize() {
        this.container.classList.add('biometric-component');
        this.container.setAttribute('data-component-type', this.constructor.name);

        // Aplicar estilos específicos de modal si es necesario
        if (this.isModal) {
            this.container.classList.add('modal-component');
            this.container.style.margin = '0';
            this.container.style.borderRadius = '0 0 12px 12px';
            this.container.style.border = 'none';
            this.container.style.boxShadow = 'none';
        }

        // Crear estructura base del componente
        this._createBaseStructure();

        // Configurar eventos del adapter
        this._setupAdapterEvents();

        this.isInitialized = true;
        console.log(`[${this.constructor.name}] Componente inicializado en #${this.containerId} (Modal: ${this.isModal})`);
    }

    /**
     * Crear estructura HTML base (override en subclases)
     */
    _createBaseStructure() {
        this.container.innerHTML = `
            <div class="component-content">
                <div class="component-status">Inicializando...</div>
            </div>
        `;
    }

    /**
     * Configurar eventos del adapter (override en subclases)
     */
    _setupAdapterEvents() {
        if (!this.adapter) {
            return;
        }

        const bindStatus = (eventName) => {
            this.adapter.on(eventName, (payload) => {
                const enriched = payload || {};
                if (!enriched.eventType) {
                    enriched.eventType = eventName;
                }
                this._handleStatusEvent(enriched);
            });
        };

        ['status', 'SYSTEM_STATUS', 'SYSTEM_ERROR', 'CAPTURE_STARTED', 'CAPTURE_COMPLETED', 'CAPTURE_FAILED'].forEach(bindStatus);

        const bindImage = (eventName) => {
            this.adapter.on(eventName, (payload) => {
                const enriched = payload || {};
                if (!enriched.eventType) {
                    enriched.eventType = eventName;
                }
                this._handleImageEvent(enriched);
            });
        };

        ['image', 'IMAGE_CAPTURED'].forEach(bindImage);

        this.adapter.on('hello', (data) => this._handleConnectedEvent(data));
    }

    /**
     * Manejar evento de estado
     */
    _handleStatusEvent(data) {
        if (!data) {
            return;
        }

        const severity = (data.severity || data.level || '').toString().toUpperCase();
        const message = data.msg || data.message || data.text || 'Estado actualizado';

        let statusType = 'info';
        switch (severity) {
            case 'SUCCESS':
                statusType = 'success';
                break;
            case 'ERROR':
                statusType = 'error';
                break;
            case 'WARNING':
            case 'WARN':
                statusType = 'warning';
                break;
            case 'LOADING':
            case 'PENDING':
                statusType = 'loading';
                break;
            default:
                statusType = 'info';
        }

        if (data.eventType === 'CAPTURE_STARTED') {
            statusType = 'loading';
        } else if (data.eventType === 'CAPTURE_COMPLETED') {
            statusType = 'success';
        } else if (data.eventType === 'CAPTURE_FAILED' || data.eventType === 'SYSTEM_ERROR') {
            statusType = 'error';
        }

        this.updateStatus(statusType, message);
    }

    /**
     * Manejar evento de imagen
     */
    _handleImageEvent(data) {
        if (!data) {
            return;
        }

        const imageBase64 = data.imageBase64 || (data.data ? data.data.imageBase64 : null);
        if (imageBase64) {
            this.displayImage(imageBase64);
        }
    }

    /**
     * Manejar evento de conexión
     */
    _handleConnectedEvent(data) {
        this.updateStatus('success', `Conectado (ID: ${data.id})`);
    }

    /**
     * Actualizar estado del componente
     */
    updateStatus(type, message) {
        const statusElement = this.container.querySelector('.component-status');
        if (statusElement) {
            statusElement.className = `component-status status-${type}`;
            statusElement.textContent = message;
        }

        // También actualizar área de estado SSE si existe
        this._updateSSEStatus(type, message);
    }

    /**
     * Actualizar área de estado dedicada para eventos SSE
     */
    _updateSSEStatus(type, message) {
        if (!this.statusElement) {
            // Crear área de estado SSE si no existe
            this.statusElement = this.container.querySelector('.sse-status-display');
            if (!this.statusElement) {
                // No hay área dedicada, usar solo el status general
                return;
            }
        }

        // Actualizar con timestamp
        const timestamp = new Date().toLocaleTimeString();
        this.statusElement.className = `sse-status-display sse-status-${type}`;
        this.statusElement.innerHTML = `
            <div class="sse-status-message">
                <span class="sse-timestamp">[${timestamp}]</span>
                <span class="sse-text">${message}</span>
            </div>
        `;
    }

    /**
     * Manejar evento enrutado desde EventRouter
     * Este método es llamado por el EventRouter cuando hay eventos SSE relevantes
     */
    handleRouterEvent(eventType, eventData) {
        console.log(`[${this.componentId}] 📨 Evento recibido del router: ${eventType}`, eventData);

        // Extraer mensaje y severidad
        const message = eventData.message || eventData.msg || eventType;
        const severity = (eventData.severity || 'INFO').toUpperCase();

        // Mapear severidad a tipo de estado
        let statusType = 'info';
        switch (severity) {
            case 'SUCCESS':
                statusType = 'success';
                break;
            case 'ERROR':
                statusType = 'error';
                break;
            case 'WARNING':
            case 'WARN':
                statusType = 'warning';
                break;
            case 'LOADING':
            case 'PENDING':
                statusType = 'loading';
                break;
        }

        // Actualizar estado
        this.updateStatus(statusType, message);

        // Manejar imágenes si están presentes
        if (eventData.data?.imageBase64 || eventData.imageBase64) {
            const imageBase64 = eventData.data?.imageBase64 || eventData.imageBase64;
            this.displayImage(imageBase64);
        }

        // Emitir evento interno para que subclases puedan manejar específicamente
        this.emit('routerEvent', { eventType, eventData });
    }

    /**
     * Mostrar imagen de huella
     */
    displayImage(imageBase64) {
        let imageContainer = this.container.querySelector('.fingerprint-display');
        if (!imageContainer) {
            imageContainer = document.createElement('div');
            imageContainer.className = 'fingerprint-display';
            this.container.querySelector('.component-content').appendChild(imageContainer);
        }

        imageContainer.innerHTML = `
            <img src="data:image/png;base64,${imageBase64}"
                 style="max-width: 100%; max-height: 300px; border-radius: 8px;"
                 alt="Huella dactilar" />
        `;
    }

    /**
     * Mostrar estado de carga
     */
    showLoading(message = 'Procesando...') {
        this.updateStatus('loading', message);
    }

    /**
     * Mostrar error
     */
    showError(message) {
        this.updateStatus('error', message);
    }

    /**
     * Mostrar éxito
     */
    showSuccess(message) {
        this.updateStatus('success', message);
    }

    /**
     * Mostrar informacion
     */
    showInfo(message) {
        this.updateStatus('info', message);
    }

    /**
     * Mostrar advertencia
     */
    showWarning(message) {
        this.updateStatus('warning', message);
    }

    /**
     * Agregar botón al componente
     */
    addButton(text, onClick, className = '') {
        const buttonContainer = this._getOrCreateButtonContainer();

        const button = document.createElement('button');
        button.textContent = text;
        button.className = `component-button ${className}`;
        button.onclick = onClick;

        buttonContainer.appendChild(button);
        return button;
    }

    /**
     * Obtener o crear contenedor de botones
     */
    _getOrCreateButtonContainer() {
        let buttonContainer = this.container.querySelector('.component-buttons');
        if (!buttonContainer) {
            buttonContainer = document.createElement('div');
            buttonContainer.className = 'component-buttons';
            this.container.querySelector('.component-content').appendChild(buttonContainer);
        }
        return buttonContainer;
    }

    /**
     * Agregar input al componente
     */
    addInput(placeholder, type = 'text', id = null) {
        const inputContainer = this._getOrCreateInputContainer();

        const input = document.createElement('input');
        input.type = type;
        input.placeholder = placeholder;
        input.className = 'component-input';
        if (id) input.id = id;

        inputContainer.appendChild(input);
        return input;
    }

    /**
     * Obtener o crear contenedor de inputs
     */
    _getOrCreateInputContainer() {
        let inputContainer = this.container.querySelector('.component-inputs');
        if (!inputContainer) {
            inputContainer = document.createElement('div');
            inputContainer.className = 'component-inputs';
            this.container.querySelector('.component-content').appendChild(inputContainer);
        }
        return inputContainer;
    }

    /**
     * Agregar evento personalizado
     */
    on(eventName, callback) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        this.eventListeners.get(eventName).push(callback);
    }

    /**
     * Emitir evento personalizado
     */
    emit(eventName, data) {
        if (this.eventListeners.has(eventName)) {
            this.eventListeners.get(eventName).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error en evento ${eventName}:`, error);
                }
            });
        }
    }

    /**
     * Habilitar/deshabilitar componente
     */
    setEnabled(enabled) {
        const buttons = this.container.querySelectorAll('.component-button');
        const inputs = this.container.querySelectorAll('.component-input');

        buttons.forEach(button => button.disabled = !enabled);
        inputs.forEach(input => input.disabled = !enabled);

        this.container.classList.toggle('component-disabled', !enabled);
    }

    /**
     * Limpiar componente
     */
    clear() {
        const imageContainer = this.container.querySelector('.fingerprint-display');
        if (imageContainer) {
            imageContainer.innerHTML = '';
        }

        const inputs = this.container.querySelectorAll('.component-input');
        inputs.forEach(input => input.value = '');

        this.updateStatus('info', 'Componente limpio');
    }

    /**
     * Destruir componente
     */
    destroy() {
        // Limpiar eventos del adapter
        this.eventListeners.clear();

        // Limpiar HTML
        this.container.innerHTML = '';
        this.container.classList.remove('biometric-component');
        this.container.removeAttribute('data-component-type');

        console.log(`[${this.constructor.name}] Componente destruido`);
    }

    /**
     * Obtener configuración del componente
     */
    getConfig() {
        return {
            containerId: this.containerId,
            type: this.constructor.name,
            isInitialized: this.isInitialized
        };
    }
}

// Registrar globalmente
window.BaseComponent = BaseComponent;
