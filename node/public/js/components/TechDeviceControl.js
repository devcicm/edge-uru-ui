/**
 * TechDeviceControl - Componente para información técnica del dispositivo
 */
class TechDeviceControl extends BaseComponent {
    constructor(containerId, adapter, config = {}) {
        super(containerId, adapter, config);

        this.deviceInfo = null;
        this.autoRefresh = config.autoRefresh || false;
        this.refreshInterval = null;

        this._setupTechUI();
        this._setupTechEvents();

        if (this.autoRefresh) {
            this.startAutoRefresh();
        }
    }

    /**
     * Crear estructura específica para información técnica
     */
    _createBaseStructure() {
        this.container.innerHTML = `
            <div class="tech-control">
                <div class="tech-header">
                    <h3 class="tech-title">🔧 Información Técnica</h3>
                    <div class="tech-controls">
                        <button class="btn-icon" id="refreshTechBtn" title="Actualizar información">🔄</button>
                        <button class="btn-icon" id="toggleAutoRefreshBtn" title="Auto-refresh">⚡</button>
                    </div>
                </div>

                <div class="tech-display">
                    <div class="tech-status component-status status-info">
                        Presiona "Actualizar" para obtener información del dispositivo
                    </div>

                    <div class="tech-info" id="techInfoPanel" style="display: none;">
                        <div class="info-section">
                            <h4>Dispositivo</h4>
                            <div class="info-grid">
                                <div class="info-item">
                                    <span class="info-label">Modelo:</span>
                                    <span class="info-value" id="deviceModel">-</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Serie:</span>
                                    <span class="info-value" id="deviceSerial">-</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Firmware:</span>
                                    <span class="info-value" id="deviceFirmware">-</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Estado:</span>
                                    <span class="info-value" id="deviceStatus">-</span>
                                </div>
                            </div>
                        </div>

                        <div class="info-section">
                            <h4>Capacidades</h4>
                            <div class="info-grid">
                                <div class="info-item">
                                    <span class="info-label">Resolución:</span>
                                    <span class="info-value" id="deviceResolution">-</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Área de captura:</span>
                                    <span class="info-value" id="deviceArea">-</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Profundidad:</span>
                                    <span class="info-value" id="deviceDepth">-</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Tecnología:</span>
                                    <span class="info-value" id="deviceTech">-</span>
                                </div>
                            </div>
                        </div>

                        <div class="info-section">
                            <h4>Sistema</h4>
                            <div class="info-grid">
                                <div class="info-item">
                                    <span class="info-label">Driver:</span>
                                    <span class="info-value" id="systemDriver">-</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">SDK:</span>
                                    <span class="info-value" id="systemSDK">-</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Plataforma:</span>
                                    <span class="info-value" id="systemPlatform">-</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Última actualización:</span>
                                    <span class="info-value" id="lastUpdate">-</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="tech-buttons component-buttons">
                    <button class="btn-primary" id="loadTechBtn">Actualizar</button>
                    <button class="btn-secondary" id="exportTechBtn" disabled>Exportar</button>
                    <button class="btn-warning" id="diagnosticBtn">Diagnóstico</button>
                </div>

                <div class="tech-instructions">
                    <div class="instruction-group">
                        <h5>Información Técnica</h5>
                        <div class="instruction-item">
                            <span class="instruction-icon">🔄</span>
                            <span class="instruction-text">Actualizar para obtener información del dispositivo</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-icon">⚡</span>
                            <span class="instruction-text">Auto-refresh actualiza cada 30 segundos</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-icon">🩺</span>
                            <span class="instruction-text">Diagnóstico para verificar el estado del sistema</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Configurar UI específica para información técnica
     */
    _setupTechUI() {
        // Referencias a elementos
        this.refreshButton = this.container.querySelector('#refreshTechBtn');
        this.autoRefreshButton = this.container.querySelector('#toggleAutoRefreshBtn');
        this.loadButton = this.container.querySelector('#loadTechBtn');
        this.exportButton = this.container.querySelector('#exportTechBtn');
        this.diagnosticButton = this.container.querySelector('#diagnosticBtn');
        this.techPanel = this.container.querySelector('#techInfoPanel');

        // Elementos de información del dispositivo
        this.deviceModel = this.container.querySelector('#deviceModel');
        this.deviceSerial = this.container.querySelector('#deviceSerial');
        this.deviceFirmware = this.container.querySelector('#deviceFirmware');
        this.deviceStatus = this.container.querySelector('#deviceStatus');
        this.deviceResolution = this.container.querySelector('#deviceResolution');
        this.deviceArea = this.container.querySelector('#deviceArea');
        this.deviceDepth = this.container.querySelector('#deviceDepth');
        this.deviceTech = this.container.querySelector('#deviceTech');
        this.systemDriver = this.container.querySelector('#systemDriver');
        this.systemSDK = this.container.querySelector('#systemSDK');
        this.systemPlatform = this.container.querySelector('#systemPlatform');
        this.lastUpdate = this.container.querySelector('#lastUpdate');

        // Eventos
        this.refreshButton.onclick = () => this.refreshInfo();
        this.autoRefreshButton.onclick = () => this.toggleAutoRefresh();
        this.loadButton.onclick = () => this.loadTechInfo();
        this.exportButton.onclick = () => this.exportInfo();
        this.diagnosticButton.onclick = () => this.runDiagnostic();

        this._updateAutoRefreshStatus();
    }

    /**
     * Configurar eventos específicos para información técnica
     */
    _setupTechEvents() {
        // Escuchar eventos del sistema
        this.adapter.on('status', (data) => this._handleTechStatus(data));
    }

    /**
     * Cargar información técnica
     */
    async loadTechInfo() {
        try {
            this.showLoading('Obteniendo información técnica...');

            const result = await this.adapter.getReaderInfo();

            if (result.ok && result.info) {
                this.deviceInfo = result.info;
                this._updateTechDisplay();
                this.techPanel.style.display = 'block';
                this.exportButton.disabled = false;
                this.showSuccess('✅ Información técnica actualizada');
                this.emit('techInfoLoaded', this.deviceInfo);
            } else {
                this.showError('❌ No se pudo obtener información técnica');
            }

        } catch (error) {
            this.showError(`Error: ${error.message}`);
        }
    }

    /**
     * Actualizar visualización de información técnica
     */
    _updateTechDisplay() {
        if (!this.deviceInfo) return;

        // Información del dispositivo
        this.deviceModel.textContent = this.deviceInfo.model || 'No disponible';
        this.deviceSerial.textContent = this.deviceInfo.serial || 'No disponible';
        this.deviceFirmware.textContent = this.deviceInfo.firmware || 'No disponible';
        this.deviceStatus.textContent = this.deviceInfo.status || 'No disponible';

        // Capacidades
        this.deviceResolution.textContent = this.deviceInfo.resolution || 'No disponible';
        this.deviceArea.textContent = this.deviceInfo.captureArea || 'No disponible';
        this.deviceDepth.textContent = this.deviceInfo.bitDepth || 'No disponible';
        this.deviceTech.textContent = this.deviceInfo.technology || 'No disponible';

        // Sistema
        this.systemDriver.textContent = this.deviceInfo.driver || 'No disponible';
        this.systemSDK.textContent = this.deviceInfo.sdk || 'No disponible';
        this.systemPlatform.textContent = this.deviceInfo.platform || 'No disponible';
        this.lastUpdate.textContent = new Date().toLocaleString();
    }

    /**
     * Actualizar información (alias para loadTechInfo)
     */
    async refreshInfo() {
        await this.loadTechInfo();
    }

    /**
     * Alternar auto-refresh
     */
    toggleAutoRefresh() {
        this.autoRefresh = !this.autoRefresh;

        if (this.autoRefresh) {
            this.startAutoRefresh();
        } else {
            this.stopAutoRefresh();
        }

        this._updateAutoRefreshStatus();
        this.emit('autoRefreshToggled', { autoRefresh: this.autoRefresh });
    }

    /**
     * Iniciar auto-refresh
     */
    startAutoRefresh() {
        this.stopAutoRefresh(); // Limpiar interval anterior

        this.refreshInterval = setInterval(() => {
            this.loadTechInfo();
        }, 30000); // 30 segundos
    }

    /**
     * Detener auto-refresh
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    /**
     * Actualizar estado del auto-refresh
     */
    _updateAutoRefreshStatus() {
        this.autoRefreshButton.style.opacity = this.autoRefresh ? '1' : '0.6';
        this.autoRefreshButton.title = this.autoRefresh ? 'Detener auto-refresh' : 'Iniciar auto-refresh';
    }

    /**
     * Exportar información técnica
     */
    exportInfo() {
        if (!this.deviceInfo) {
            this.showError('No hay información para exportar');
            return;
        }

        const exportData = {
            timestamp: new Date().toISOString(),
            deviceInfo: this.deviceInfo,
            systemInfo: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language
            }
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `device-info-${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        URL.revokeObjectURL(url);
        this.showSuccess('✅ Información exportada');
        this.emit('infoExported', exportData);
    }

    /**
     * Ejecutar diagnóstico del sistema
     */
    async runDiagnostic() {
        try {
            this.showLoading('Ejecutando diagnóstico...');

            // Verificar conexión del adapter
            const adapterOk = this.adapter.isConnected;

            // Intentar obtener información del dispositivo
            let deviceOk = false;
            try {
                const result = await this.adapter.getReaderInfo();
                deviceOk = result.ok;
            } catch (e) {
                deviceOk = false;
            }

            // Verificar store de huellas
            let storeOk = false;
            try {
                const storeResult = await this.adapter.getStoredFingerprints();
                storeOk = storeResult.ok;
            } catch (e) {
                storeOk = false;
            }

            const diagnosticResult = {
                timestamp: new Date(),
                adapter: adapterOk ? '✅ Conectado' : '❌ Desconectado',
                device: deviceOk ? '✅ Disponible' : '❌ Error',
                store: storeOk ? '✅ Accesible' : '❌ Error',
                overall: adapterOk && deviceOk && storeOk ? '✅ SISTEMA OK' : '⚠️ PROBLEMAS DETECTADOS'
            };

            this.showSuccess(`Diagnóstico: ${diagnosticResult.overall}`);
            this.emit('diagnosticCompleted', diagnosticResult);

        } catch (error) {
            this.showError(`Error en diagnóstico: ${error.message}`);
        }
    }

    /**
     * Manejar estado técnico desde backend
     */
    _handleTechStatus(data) {
        if (data.msg && data.msg.includes('info')) {
            this.updateStatus('info', `🔧 ${data.msg}`);
        }
    }

    /**
     * Limpiar información técnica
     */
    clear() {
        super.clear();
        this.techPanel.style.display = 'none';
        this.deviceInfo = null;
        this.exportButton.disabled = true;
        this.stopAutoRefresh();
        this.emit('cleared');
    }

    /**
     * Destruir componente
     */
    destroy() {
        this.stopAutoRefresh();
        super.destroy();
    }

    /**
     * Obtener estado actual
     */
    getTechState() {
        return {
            hasInfo: !!this.deviceInfo,
            autoRefresh: this.autoRefresh,
            lastUpdate: this.deviceInfo ? new Date().toISOString() : null,
            deviceInfo: this.deviceInfo
        };
    }
}

// Registrar globalmente
window.TechDeviceControl = TechDeviceControl;