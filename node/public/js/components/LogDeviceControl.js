/**
 * LogDeviceControl - Componente para visualización de logs en tiempo real
 */
class LogDeviceControl extends BaseComponent {
    constructor(containerId, adapter, config = {}) {
        super(containerId, adapter, config);

        this.logs = [];
        this.maxEntries = config.maxEntries || 50;
        this.autoScroll = config.autoScroll !== false;

        this._setupLogUI();
        this._setupLogEvents();
    }

    /**
     * Crear estructura específica para logs
     */
    _createBaseStructure() {
        this.container.innerHTML = `
            <div class="log-control">
                <div class="log-header">
                    <h3 class="log-title">📋 Logs del Sistema</h3>
                    <div class="log-controls">
                        <button class="btn-icon" id="clearLogsBtn" title="Limpiar logs">🗑️</button>
                        <button class="btn-icon" id="toggleAutoScrollBtn" title="Auto-scroll">📜</button>
                    </div>
                </div>

                <div class="log-display">
                    <div class="log-area" id="logArea">
                        <div class="log-placeholder">📋 Esperando logs del sistema...</div>
                    </div>
                </div>

                <div class="log-status component-status status-info">
                    <span id="logCount">0</span> entradas | Auto-scroll: <span id="autoScrollStatus">ON</span>
                </div>

                <div class="log-instructions">
                    <div class="instruction-group">
                        <h5>Monitor de Logs</h5>
                        <div class="instruction-item">
                            <span class="instruction-icon">📋</span>
                            <span class="instruction-text">Los logs aparecen automáticamente</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-icon">📜</span>
                            <span class="instruction-text">Auto-scroll mantiene los logs más recientes visibles</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-icon">🗑️</span>
                            <span class="instruction-text">Limpiar para vaciar el historial</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Configurar UI específica para logs
     */
    _setupLogUI() {
        // Referencias a elementos
        this.clearButton = this.container.querySelector('#clearLogsBtn');
        this.scrollButton = this.container.querySelector('#toggleAutoScrollBtn');
        this.logArea = this.container.querySelector('#logArea');
        this.logCount = this.container.querySelector('#logCount');
        this.autoScrollStatus = this.container.querySelector('#autoScrollStatus');

        // Eventos
        this.clearButton.onclick = () => this.clearLogs();
        this.scrollButton.onclick = () => this.toggleAutoScroll();

        this._updateScrollStatus();
    }

    /**
     * Configurar eventos específicos para logs
     */
    _setupLogEvents() {
        // Escuchar todos los eventos para loggear
        this.adapter.on('*', (data) => this._handleLogEvent(data));
        this.adapter.on('status', (data) => this._handleLogEvent(data));
        this.adapter.on('error', (data) => this._handleLogEvent(data));
    }

    /**
     * Manejar eventos para logging
     */
    _handleLogEvent(data) {
        const timestamp = new Date();
        const logEntry = {
            timestamp: timestamp,
            type: data.evt || 'system',
            message: data.msg || JSON.stringify(data),
            data: data
        };

        this._addLogEntry(logEntry);
    }

    /**
     * Agregar entrada de log
     */
    _addLogEntry(logEntry) {
        this.logs.push(logEntry);

        // Mantener límite de entradas
        if (this.logs.length > this.maxEntries) {
            this.logs.shift();
        }

        this._updateLogDisplay();
        this._updateLogCount();

        // Auto-scroll si está habilitado
        if (this.autoScroll) {
            this._scrollToBottom();
        }

        this.emit('logAdded', logEntry);
    }

    /**
     * Actualizar visualización de logs
     */
    _updateLogDisplay() {
        if (this.logs.length === 0) {
            this.logArea.innerHTML = '<div class="log-placeholder">📋 Esperando logs del sistema...</div>';
            return;
        }

        const logsHtml = this.logs.map(log => {
            const timeStr = log.timestamp.toLocaleTimeString();
            const typeClass = this._getLogTypeClass(log.type);

            return `
                <div class="log-entry ${typeClass}">
                    <span class="log-time">${timeStr}</span>
                    <span class="log-type">[${log.type.toUpperCase()}]</span>
                    <span class="log-message">${log.message}</span>
                </div>
            `;
        }).join('');

        this.logArea.innerHTML = logsHtml;
    }

    /**
     * Obtener clase CSS según tipo de log
     */
    _getLogTypeClass(type) {
        const typeMap = {
            'error': 'log-error',
            'warning': 'log-warning',
            'success': 'log-success',
            'status': 'log-info',
            'system': 'log-system'
        };

        return typeMap[type] || 'log-default';
    }

    /**
     * Actualizar contador de logs
     */
    _updateLogCount() {
        this.logCount.textContent = this.logs.length;
    }

    /**
     * Limpiar logs
     */
    clearLogs() {
        this.logs = [];
        this._updateLogDisplay();
        this._updateLogCount();
        this.updateStatus('info', 'Logs limpiados');
        this.emit('logsCleared');
    }

    /**
     * Alternar auto-scroll
     */
    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        this._updateScrollStatus();

        if (this.autoScroll) {
            this._scrollToBottom();
        }

        this.emit('autoScrollToggled', { autoScroll: this.autoScroll });
    }

    /**
     * Actualizar estado del auto-scroll
     */
    _updateScrollStatus() {
        this.autoScrollStatus.textContent = this.autoScroll ? 'ON' : 'OFF';
        this.scrollButton.style.opacity = this.autoScroll ? '1' : '0.6';
    }

    /**
     * Hacer scroll al final
     */
    _scrollToBottom() {
        setTimeout(() => {
            this.logArea.scrollTop = this.logArea.scrollHeight;
        }, 10);
    }

    /**
     * Agregar log manual
     */
    addLog(type, message, data = null) {
        const logEntry = {
            timestamp: new Date(),
            type: type,
            message: message,
            data: data
        };

        this._addLogEntry(logEntry);
    }

    /**
     * Obtener logs filtrados
     */
    getFilteredLogs(type = null) {
        if (!type) return this.logs;
        return this.logs.filter(log => log.type === type);
    }

    /**
     * Exportar logs como texto
     */
    exportLogs() {
        const logsText = this.logs.map(log => {
            const timeStr = log.timestamp.toLocaleString();
            return `[${timeStr}] [${log.type.toUpperCase()}] ${log.message}`;
        }).join('\n');

        return logsText;
    }

    /**
     * Limpiar componente
     */
    clear() {
        super.clear();
        this.clearLogs();
        this.emit('cleared');
    }

    /**
     * Obtener estado actual
     */
    getLogState() {
        return {
            totalLogs: this.logs.length,
            maxEntries: this.maxEntries,
            autoScroll: this.autoScroll,
            recentLogs: this.logs.slice(-5)
        };
    }
}

// Registrar globalmente
window.LogDeviceControl = LogDeviceControl;