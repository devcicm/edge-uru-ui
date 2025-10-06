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
        // Eventos base que todos los componentes pueden usar
        this.adapter.on('status', (data) => this._handleStatusEvent(data));
        this.adapter.on('image', (data) => this._handleImageEvent(data));
        this.adapter.on('hello', (data) => this._handleConnectedEvent(data));
    }

    /**
     * Manejar evento de estado
     */
    _handleStatusEvent(data) {
        this.updateStatus('info', data.msg || 'Estado actualizado');
    }

    /**
     * Manejar evento de imagen
     */
    _handleImageEvent(data) {
        if (data.imageBase64) {
            this.displayImage(data.imageBase64);
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