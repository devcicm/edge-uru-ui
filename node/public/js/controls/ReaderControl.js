/**
 * ReaderControl - Componente para control del lector biométrico
 */
class ReaderControl extends BaseComponent {
    constructor(containerId, adapter, config = {}) {
        super(containerId, adapter, config);

        this.readerState = 'disconnected'; // disconnected, initializing, ready, error
        this.readerInfo = null;

        this._setupReaderUI();
        this._setupReaderEvents();
    }

    /**
     * Crear estructura específica para control del lector
     * Sobrescribe el método del padre BaseComponent
     */
    _createStructure() {
        this.container.innerHTML = `
            <div class="reader-control">
                <div class="reader-header">
                    <h3 class="reader-title">🔌 Control del Lector</h3>
                </div>

                <div class="reader-display">
                    <div class="reader-status component-status status-info">
                        Lector desconectado
                    </div>
                </div>

                <div class="reader-buttons component-buttons">
                    <button class="btn-primary" id="initReaderBtn">Inicializar</button>
                    <button class="btn-secondary" id="disposeReaderBtn" disabled>Apagar</button>
                    <button class="btn-warning" id="readerInfoBtn">Info Técnica</button>
                </div>

                <div class="reader-info" id="readerInfoPanel" style="display: none;">
                    <div class="info-header">
                        <h4>Información del Lector</h4>
                    </div>
                    <div class="info-content" id="readerInfoContent">
                        <div class="info-item">
                            <span class="info-label">Estado:</span>
                            <span class="info-value" id="readerStatus">-</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Modelo:</span>
                            <span class="info-value" id="readerModel">-</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Versión:</span>
                            <span class="info-value" id="readerVersion">-</span>
                        </div>
                    </div>
                </div>

                <div class="reader-instructions">
                    <div class="instruction-group">
                        <h5>Control del Lector</h5>
                        <div class="instruction-item">
                            <span class="instruction-icon">🔌</span>
                            <span class="instruction-text">Inicializar para conectar el lector</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-icon">ℹ️</span>
                            <span class="instruction-text">Ver información técnica del dispositivo</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-icon">⏹️</span>
                            <span class="instruction-text">Apagar para desconectar el lector</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Configurar UI específica para control del lector
     */
    _setupReaderUI() {
        // Referencias a elementos
        this.initButton = this.container.querySelector('#initReaderBtn');
        this.disposeButton = this.container.querySelector('#disposeReaderBtn');
        this.infoButton = this.container.querySelector('#readerInfoBtn');
        this.statusElement = this.container.querySelector('.reader-status');
        this.infoPanel = this.container.querySelector('#readerInfoPanel');

        // Elementos de información
        this.readerStatus = this.container.querySelector('#readerStatus');
        this.readerModel = this.container.querySelector('#readerModel');
        this.readerVersion = this.container.querySelector('#readerVersion');

        // Eventos
        this.initButton.onclick = () => this.initializeReader();
        this.disposeButton.onclick = () => this.disposeReader();
        this.infoButton.onclick = () => this.showReaderInfo();
    }

    /**
     * Configurar eventos específicos para el lector
     */
    _setupReaderEvents() {
        this.adapter.on('status', (data) => this._handleReaderStatus(data));
    }

    /**
     * Inicializar lector
     */
    async initializeReader() {
        try {
            this.readerState = 'initializing';
            this._updateButtonStates();

            this.showLoading('Inicializando lector...');

            const result = await this.adapter.initializeReader();

            if (result.ok) {
                this.readerState = 'ready';
                this.showSuccess('✅ Lector inicializado correctamente');
                this.emit('readerInitialized', { state: this.readerState });
            } else {
                this.readerState = 'error';
                this.showError('❌ Error inicializando lector');
            }

        } catch (error) {
            this.readerState = 'error';
            this.showError(`Error: ${escapeHtml(error.message)}`);
        } finally {
            this._updateButtonStates();
        }
    }

    /**
     * Apagar lector
     */
    async disposeReader() {
        try {
            this.showLoading('Apagando lector...');

            const result = await this.adapter.disposeReader();

            if (result.ok) {
                this.readerState = 'disconnected';
                this.updateStatus('info', 'Lector desconectado');
                this.emit('readerDisposed', { state: this.readerState });
            } else {
                this.showError('❌ Error apagando lector');
            }

        } catch (error) {
            this.showError(`Error: ${escapeHtml(error.message)}`);
        } finally {
            this._updateButtonStates();
        }
    }

    /**
     * Mostrar información del lector
     */
    async showReaderInfo() {
        try {
            this.showLoading('Obteniendo información...');

            const result = await this.adapter.getReaderInfo();

            if (result.ok && result.info) {
                this.readerInfo = result.info;
                this._updateReaderInfo();
                this.infoPanel.style.display = 'block';
                this.updateStatus('info', 'Información del lector actualizada');
            } else {
                this.showError('❌ No se pudo obtener información del lector');
            }

        } catch (error) {
            this.showError(`Error: ${escapeHtml(error.message)}`);
        }
    }

    /**
     * Actualizar información del lector en la UI
     */
    _updateReaderInfo() {
        if (this.readerInfo) {
            this.readerStatus.textContent = this.readerState;
            this.readerModel.textContent = this.readerInfo.model || 'No disponible';
            this.readerVersion.textContent = this.readerInfo.version || 'No disponible';
        }
    }

    /**
     * Limpiar control del lector
     */
    clear() {
        super.clear();
        this.infoPanel.style.display = 'none';
        this.readerInfo = null;
        this._updateButtonStates();
        this.emit('cleared');
    }

    /**
     * Manejar estado del lector desde backend
     */
    _handleReaderStatus(data) {
        if (data.msg && data.msg.includes('lector')) {
            this.updateStatus('info', `📡 ${data.msg}`);
        }
    }

    /**
     * Actualizar estado de botones
     */
    _updateButtonStates() {
        const isInitializing = this.readerState === 'initializing';
        const isReady = this.readerState === 'ready';

        this.initButton.disabled = isInitializing || isReady;
        this.disposeButton.disabled = isInitializing || this.readerState === 'disconnected';
        this.infoButton.disabled = isInitializing;
    }

    /**
     * Obtener estado actual del lector
     */
    getReaderState() {
        return {
            state: this.readerState,
            info: this.readerInfo
        };
    }
}

// Registrar globalmente
window.ReaderControl = ReaderControl;