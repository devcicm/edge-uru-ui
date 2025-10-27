/**
 * BaseComponent - Clase base ultra simple para componentes biométricos
 *
 * Responsabilidades:
 * - Crear estructura HTML base
 * - Actualizar mensajes de estado con timestamp
 * - Mostrar imágenes de huella
 * - Comunicarse con BiometricAdapter para eventos en tiempo real
 */
class BaseComponent {
    constructor(containerId, adapter, config = {}) {
        // Configuración básica
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.adapter = adapter;
        this.config = config;

        // Identificador único del componente
        this.componentId = `${this.constructor.name}_${containerId}_${Date.now()}`;

        // Callback para agregar logs al sistema global
        this.globalLogCallback = config.onLog || null;

        // Validación
        if (!this.container) {
            throw new Error(`Container #${containerId} no encontrado`);
        }

        // Inicializar
        this._createStructure();
        console.log(`[${this.componentId}] ✅ Inicializado`);
    }

    /**
     * Crear estructura HTML (override en subclases)
     */
    _createStructure() {
        this.container.innerHTML = `
            <div class="component-wrapper">
                <div class="component-status">Listo</div>
            </div>
        `;
    }

    /**
     * Actualizar estado del componente
     * @param {string} message - Mensaje a mostrar
     * @param {string} type - Tipo: info, success, error, warning, loading
     */
    updateStatus(message, type = 'info') {
        const statusEl = this.container.querySelector('.component-status');
        if (!statusEl) return;

        // Actualizar clase CSS
        statusEl.className = `component-status status-${type}`;

        // Timestamp
        const timestamp = new Date().toLocaleTimeString();

        // Íconos por tipo
        const icons = {
            info: 'ℹ️',
            success: '✅',
            error: '❌',
            warning: '⚠️',
            loading: '⏳'
        };

        const icon = icons[type] || 'ℹ️';
        statusEl.innerHTML = `
            <span class="status-timestamp">[${timestamp}]</span>
            <span class="status-icon">${icon}</span>
            <span class="status-message">${message}</span>
        `;

        // LOG PARA DEBUG: Mostrar mensaje en consola
        console.log(`[${this.componentId}] 📊 STATUS UPDATE: [${type.toUpperCase()}] ${message}`);
    }

    /**
     * Mostrar imagen de huella
     */
    displayImage(imageBase64) {
        const imageContainer = this.container.querySelector('.fingerprint-image');
        if (!imageContainer) return;

        imageContainer.innerHTML = `
            <img src="data:image/png;base64,${imageBase64}"
                 style="max-width: 100%; height: auto; border-radius: 8px;"
                 alt="Huella dactilar" />
        `;

        // LOG PARA DEBUG: Notificar cuando se muestra imagen
        console.log(`[${this.componentId}] 🖼️ IMAGE DISPLAYED: ${imageBase64.substring(0, 50)}...`);
    }

    /**
     * Manejar evento desde BiometricAdapter
     * Este método procesa eventos SSE en tiempo real del backend
     * Nota: Nombre legacy "handleRouterEvent" mantenido por compatibilidad
     */
    handleRouterEvent(eventType, eventData) {
        // Extraer mensaje base
        let message = eventData.message || eventData.msg || eventType;

        // Extraer severidad
        const severity = (eventData.severity || 'INFO').toUpperCase();

        // Enriquecer mensaje con datos adicionales si están disponibles
        if (eventData.data) {
            // Para eventos de muestras recolectadas
            if (eventType === 'ENROLLMENT_SAMPLE_COLLECTED' && eventData.data.sampleNumber) {
                const { sampleNumber, totalSamples, progress } = eventData.data;
                message = `✓ Muestra ${sampleNumber}/${totalSamples} recolectada (${progress}%)`;
            }

            // Para eventos de captura en progreso
            else if (eventType === 'CAPTURE_PROGRESS' && eventData.data.quality !== undefined) {
                const quality = eventData.data.quality;
                message = `Capturando... Calidad: ${quality}%`;
            }

            // Para eventos de verificación
            else if (eventType === 'VERIFICATION_COMPLETED' && eventData.data.verified !== undefined) {
                const { verified, score } = eventData.data;
                message = verified
                    ? `✅ VERIFICADO - Score: ${score}`
                    : `❌ NO VERIFICADO - Score: ${score}`;
            }

            // Para eventos de identificación
            else if (eventType === 'IDENTIFICATION_COMPLETED' && eventData.data.matched !== undefined) {
                const { matched, bestMatch } = eventData.data;
                message = matched
                    ? `✅ Identificado: ${bestMatch?.userId || 'Desconocido'}`
                    : `❌ No se encontró coincidencia`;
            }
        }

        // Mapear a tipo de estado
        let type = 'info';
        if (severity === 'SUCCESS') type = 'success';
        else if (severity === 'ERROR') type = 'error';
        else if (severity === 'WARNING') type = 'warning';
        else if (severity === 'LOADING' || eventType.includes('STARTED')) type = 'loading';
        else if (eventType.includes('COMPLETED')) type = 'success';
        else if (eventType.includes('FAILED')) type = 'error';
        else if (eventType.includes('SAMPLE_COLLECTED')) type = 'success';

        // LOG DETALLADO PARA DEBUG
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[${this.componentId}] 📨 SSE EVENT RECEIVED:`);
        console.log(`   Event Type: ${eventType}`);
        console.log(`   Severity: ${severity} → UI Type: ${type}`);
        console.log(`   Message: "${message}"`);
        console.log(`   Has Image: ${!!(eventData.data?.imageBase64 || eventData.imageBase64)}`);
        console.log(`   Raw Data:`, eventData);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        // Actualizar estado en el componente
        this.updateStatus(message, type);

        // Enviar log al sistema global
        this.addGlobalLog(message, type);

        // Mostrar imagen si existe
        const imageBase64 = eventData.data?.imageBase64 || eventData.imageBase64;
        if (imageBase64) {
            this.displayImage(imageBase64);
        }
    }

    /**
     * Agregar log al sistema global (si callback está disponible)
     */
    addGlobalLog(message, type = 'info') {
        if (this.globalLogCallback && typeof this.globalLogCallback === 'function') {
            this.globalLogCallback(message, type);
        }
    }

    /**
     * Limpiar componente
     */
    clear() {
        this.updateStatus('Listo', 'info');

        const imageContainer = this.container.querySelector('.fingerprint-image');
        if (imageContainer) {
            imageContainer.innerHTML = '<div class="image-placeholder">👤</div>';
        }
    }

    /**
     * Helpers rápidos
     */
    showLoading(message) { this.updateStatus(message, 'loading'); }
    showSuccess(message) { this.updateStatus(message, 'success'); }
    showError(message) { this.updateStatus(message, 'error'); }
    showWarning(message) { this.updateStatus(message, 'warning'); }
    showInfo(message) { this.updateStatus(message, 'info'); }
}

// Registrar globalmente
window.BaseComponent = BaseComponent;
