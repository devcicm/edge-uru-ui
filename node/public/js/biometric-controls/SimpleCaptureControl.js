/**
 * SimpleCaptureControl - Componente para captura simple de huellas
 */
class SimpleCaptureControl extends BaseComponent {
    constructor(containerId, adapter, config = {}) {
        super(containerId, adapter, config);

        this.captureState = 'idle'; // idle, capturing, captured, error
        this.lastCaptureTime = null;

        this._setupCaptureUI();
        this._setupCaptureEvents();
    }

    /**
     * Crear estructura específica para captura simple
     */
    _createBaseStructure() {
        this.container.innerHTML = `
            <div class="capture-control">
                <div class="capture-header">
                    <h3 class="capture-title">📸 Captura Simple</h3>
                </div>

                <div class="capture-display">
                    <div class="fingerprint-area">
                        <div class="fingerprint-placeholder">🔍</div>
                    </div>
                </div>

                <div class="capture-status component-status status-info">
                    Presiona "Capturar" y coloca el dedo en el lector
                </div>

                <div class="capture-buttons component-buttons">
                    <button class="btn-primary" id="captureBtn">Capturar</button>
                    <button class="btn-secondary" id="testBtn">🧪 Prueba</button>
                    <button class="btn-warning" id="clearBtn">🗑️ Limpiar</button>
                </div>

                <div class="capture-info">
                    <div class="info-item">
                        <span class="info-label">Estado:</span>
                        <span class="info-value" id="stateValue">Listo</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Última captura:</span>
                        <span class="info-value" id="timeValue">Nunca</span>
                    </div>
                </div>

                <div class="capture-instructions">
                    <div class="instruction-item">
                        <span class="instruction-icon">1️⃣</span>
                        <span class="instruction-text">Presiona el botón "Capturar"</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">2️⃣</span>
                        <span class="instruction-text">Coloca el dedo firmemente en el lector</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">3️⃣</span>
                        <span class="instruction-text">Mantén quieto hasta completar la captura</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Configurar UI específica para captura
     */
    _setupCaptureUI() {
        // Referencias a elementos
        this.captureButton = this.container.querySelector('#captureBtn');
        this.testButton = this.container.querySelector('#testBtn');
        this.clearButton = this.container.querySelector('#clearBtn');
        this.statusElement = this.container.querySelector('.capture-status');
        this.fingerprintArea = this.container.querySelector('.fingerprint-area');
        this.stateValue = this.container.querySelector('#stateValue');
        this.timeValue = this.container.querySelector('#timeValue');

        // Eventos de botones
        this.captureButton.onclick = () => this.capture();
        this.testButton.onclick = () => this.testCapture();
        this.clearButton.onclick = () => this.clear();
    }

    /**
     * Configurar eventos específicos para captura
     */
    _setupCaptureEvents() {
        // Eventos del adapter específicos para captura
        this.adapter.on('status', (data) => this._handleCaptureStatus(data));
        this.adapter.on('image', (data) => this._handleCaptureImage(data));
    }

    /**
     * Realizar captura de huella
     */
    async capture() {
        try {
            this.captureState = 'capturing';
            this._updateState();

            this.showLoading('Coloca el dedo en el lector...');

            const result = await this.adapter.captureFingerprint();

            if (result.ok) {
                this.captureState = 'captured';
                this.lastCaptureTime = new Date();

                this.showSuccess('Captura completada exitosamente');
                this.emit('captured', { result, timestamp: this.lastCaptureTime });
            } else {
                this.captureState = 'error';
                this.showError(result.error || 'Error en la captura');
            }

        } catch (error) {
            this.captureState = 'error';
            this.showError(`Error: ${error.message}`);
        } finally {
            this._updateState();
        }
    }

    /**
     * Realizar captura de prueba (imagen generada)
     */
    testCapture() {
        this.showLoading('Generando imagen de prueba...');

        // Crear imagen de prueba
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');

        // Fondo gris
        ctx.fillStyle = '#666666';
        ctx.fillRect(0, 0, 200, 200);

        // Patrón de huella simulado
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 2;
        for (let i = 1; i <= 8; i++) {
            ctx.beginPath();
            ctx.arc(100, 100, i * 12, 0, 2 * Math.PI);
            ctx.stroke();
        }

        // Texto
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('IMAGEN DE PRUEBA', 100, 180);

        // Convertir a base64
        const testImageBase64 = canvas.toDataURL('image/png').split(',')[1];

        // Mostrar imagen
        this.displayImage(testImageBase64);

        this.captureState = 'captured';
        this.lastCaptureTime = new Date();
        this._updateState();

        this.showSuccess('Imagen de prueba generada');
        this.emit('testCaptured', { imageBase64: testImageBase64, timestamp: this.lastCaptureTime });
    }

    /**
     * Limpiar captura
     */
    clear() {
        super.clear();

        this.captureState = 'idle';
        this.lastCaptureTime = null;

        // Limpiar imagen
        this.fingerprintArea.innerHTML = '<div class="fingerprint-placeholder">🔍</div>';

        this._updateState();
        this.updateStatus('info', 'Presiona "Capturar" y coloca el dedo en el lector');
        this.emit('cleared');
    }

    /**
     * Manejar estado de captura desde backend
     */
    _handleCaptureStatus(data) {
        if (data.msg && data.msg.includes('Captura simple')) {
            this.updateStatus('info', `👆 ${data.msg}`);
        }
    }

    /**
     * Manejar imagen de captura
     */
    _handleCaptureImage(data) {
        if (data.imageBase64 && this.captureState === 'capturing') {
            this.displayImage(data.imageBase64);
            this.captureState = 'captured';
            this.lastCaptureTime = new Date();
            this._updateState();
        }
    }

    /**
     * Mostrar imagen específica para captura
     */
    displayImage(imageBase64) {
        this.fingerprintArea.innerHTML = `
            <img src="data:image/png;base64,${imageBase64}"
                 style="max-width: 100%; max-height: 100%; border-radius: 8px; object-fit: contain;"
                 alt="Huella capturada" />
        `;
    }

    /**
     * Actualizar estado visual
     */
    _updateState() {
        const stateLabels = {
            'idle': 'Listo',
            'capturing': 'Capturando...',
            'captured': 'Capturada',
            'error': 'Error'
        };

        this.stateValue.textContent = stateLabels[this.captureState] || 'Desconocido';

        // Actualizar tiempo
        if (this.lastCaptureTime) {
            this.timeValue.textContent = this.lastCaptureTime.toLocaleTimeString();
        } else {
            this.timeValue.textContent = 'Nunca';
        }

        // Habilitar/deshabilitar botones
        const isCapturing = this.captureState === 'capturing';
        this.captureButton.disabled = isCapturing;
        this.testButton.disabled = isCapturing;
    }

    /**
     * Obtener estado actual de la captura
     */
    getCaptureState() {
        return {
            state: this.captureState,
            lastCaptureTime: this.lastCaptureTime,
            hasImage: this.fingerprintArea.querySelector('img') !== null
        };
    }

    /**
     * Obtener imagen actual como base64
     */
    getCurrentImage() {
        const img = this.fingerprintArea.querySelector('img');
        if (img && img.src.startsWith('data:image')) {
            return img.src.split(',')[1];
        }
        return null;
    }

    /**
     * Configurar captura automática
     */
    setAutoCapture(enabled, interval = 5000) {
        if (this.autoCaptureInterval) {
            clearInterval(this.autoCaptureInterval);
        }

        if (enabled) {
            this.autoCaptureInterval = setInterval(() => {
                if (this.captureState === 'idle') {
                    this.capture();
                }
            }, interval);

            this.updateStatus('info', `Captura automática activada (cada ${interval/1000}s)`);
        } else {
            this.updateStatus('info', 'Captura automática desactivada');
        }
    }
}

// Registrar globalmente
window.SimpleCaptureControl = SimpleCaptureControl;