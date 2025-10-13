/**
 * VerificationControl - Componente para verificación e identificación de huellas
 */
class VerificationControl extends BaseComponent {
    constructor(containerId, adapter, config = {}) {
        super(containerId, adapter, config);

        this.verificationState = 'idle'; // idle, verifying, verified, failed
        this.identificationState = 'idle'; // idle, identifying, identified, not_found
        this.availableUsers = [];
        this.selectedUser = '';
        this.lastResult = null;

        this._setupVerificationUI();
        this._setupVerificationEvents();
        this._loadUsers();
    }

    /**
     * Crear estructura específica para verificación
     */
    _createBaseStructure() {
        this.container.innerHTML = `
            <div class="verification-control">
                <div class="verification-header">
                    <h3 class="verification-title">✅ Verificación e Identificación</h3>
                    <div class="verification-mode">
                        <label class="mode-label">
                            <input type="radio" name="verificationMode" value="verify" checked>
                            Verificación 1:1
                        </label>
                        <label class="mode-label">
                            <input type="radio" name="verificationMode" value="identify">
                            Identificación 1:N
                        </label>
                    </div>
                </div>

                <div class="verification-display">
                    <div class="fingerprint-area">
                        <div class="fingerprint-placeholder">🔒</div>
                    </div>
                </div>

                <div class="verification-inputs" id="userSelection">
                    <div class="input-group">
                        <label for="userSelect">Seleccionar Usuario:</label>
                        <select id="userSelect" class="component-input">
                            <option value="">-- Seleccionar Usuario --</option>
                        </select>
                        <button class="btn-icon" id="refreshUsers" title="Actualizar lista">🔄</button>
                    </div>
                </div>

                <div class="verification-status component-status status-info">
                    Selecciona un usuario y presiona "Verificar"
                </div>

                <!-- Área de estado SSE dedicada -->
                <div class="sse-status-display sse-status-info" style="margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 8px; font-family: monospace; font-size: 13px;">
                    <div class="sse-status-message">
                        <span class="sse-timestamp">[--:--:--]</span>
                        <span class="sse-text">Esperando eventos del backend...</span>
                    </div>
                </div>

                <div class="verification-buttons component-buttons">
                    <button class="btn-primary" id="verifyBtn">Verificar 1:1</button>
                    <button class="btn-warning" id="identifyBtn">Identificar 1:N</button>
                    <button class="btn-secondary" id="clearVerifyBtn">Limpiar</button>
                </div>

                <div class="verification-result" id="resultPanel" style="display: none;">
                    <div class="result-header">
                        <h4>Resultado de Verificación</h4>
                    </div>
                    <div class="result-content">
                        <div class="result-item">
                            <span class="result-label">Usuario:</span>
                            <span class="result-value" id="resultUser">-</span>
                        </div>
                        <div class="result-item">
                            <span class="result-label">Estado:</span>
                            <span class="result-value" id="resultStatus">-</span>
                        </div>
                        <div class="result-item">
                            <span class="result-label">Score:</span>
                            <span class="result-value" id="resultScore">-</span>
                        </div>
                        <div class="result-item">
                            <span class="result-label">Tiempo:</span>
                            <span class="result-value" id="resultTime">-</span>
                        </div>
                    </div>
                </div>

                <div class="verification-instructions">
                    <div class="instruction-group" id="verifyInstructions">
                        <h5>Verificación 1:1</h5>
                        <div class="instruction-item">
                            <span class="instruction-icon">1️⃣</span>
                            <span class="instruction-text">Selecciona un usuario de la lista</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-icon">2️⃣</span>
                            <span class="instruction-text">Presiona "Verificar 1:1"</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-icon">3️⃣</span>
                            <span class="instruction-text">Coloca el dedo en el lector</span>
                        </div>
                    </div>

                    <div class="instruction-group" id="identifyInstructions" style="display: none;">
                        <h5>Identificación 1:N</h5>
                        <div class="instruction-item">
                            <span class="instruction-icon">1️⃣</span>
                            <span class="instruction-text">Presiona "Identificar 1:N"</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-icon">2️⃣</span>
                            <span class="instruction-text">Coloca el dedo en el lector</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-icon">3️⃣</span>
                            <span class="instruction-text">El sistema buscará coincidencias automáticamente</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Configurar UI específica para verificación
     */
    _setupVerificationUI() {
        // Referencias a elementos
        this.userSelect = this.container.querySelector('#userSelect');
        this.refreshButton = this.container.querySelector('#refreshUsers');
        this.verifyButton = this.container.querySelector('#verifyBtn');
        this.identifyButton = this.container.querySelector('#identifyBtn');
        this.clearButton = this.container.querySelector('#clearVerifyBtn');
        this.statusElement = this.container.querySelector('.verification-status');
        this.fingerprintArea = this.container.querySelector('.fingerprint-area');
        this.resultPanel = this.container.querySelector('#resultPanel');
        this.userSelection = this.container.querySelector('#userSelection');

        // Elementos de resultado
        this.resultUser = this.container.querySelector('#resultUser');
        this.resultStatus = this.container.querySelector('#resultStatus');
        this.resultScore = this.container.querySelector('#resultScore');
        this.resultTime = this.container.querySelector('#resultTime');

        // Instrucciones
        this.verifyInstructions = this.container.querySelector('#verifyInstructions');
        this.identifyInstructions = this.container.querySelector('#identifyInstructions');

        // Radio buttons para modo
        this.modeRadios = this.container.querySelectorAll('input[name="verificationMode"]');

        // Eventos
        this.userSelect.onchange = () => this._onUserSelected();
        this.refreshButton.onclick = () => this._loadUsers();
        this.verifyButton.onclick = () => this.verify();
        this.identifyButton.onclick = () => this.identify();
        this.clearButton.onclick = () => this.clear();

        this.modeRadios.forEach(radio => {
            radio.onchange = () => this._onModeChanged();
        });

        // Suscribirse al EventRouter si está disponible
        if (this.eventRouter) {
            this.eventRouter.subscribe('verification', this, this.componentId);
            this.eventRouter.subscribe('identification', this, this.componentId);
            console.log(`[${this.componentId}] Suscrito al EventRouter para eventos de verification e identification`);
        }
    }

    /**
     * Configurar eventos específicos para verificación
     */
    _setupVerificationEvents() {
        this.adapter.on('status', (data) => this._handleVerificationStatus(data));
        this.adapter.on('image', (data) => this._handleVerificationImage(data));

        this.adapter.on('VERIFICATION_STARTED', (data) => {
            this.verificationState = 'verifying';
            const userId = data?.data?.userId || this.selectedUser || 'Usuario';
            this.showLoading(data.message || 'Verificando ' + userId + '...');
            this._updateButtonStates();
        });

        this.adapter.on('VERIFICATION_COMPLETED', (data) => {
            this._processVerificationEvent(data, true);
        });

        this.adapter.on('VERIFICATION_FAILED', (data) => {
            const enriched = Object.assign({ verified: false }, data || {});
            this._processVerificationEvent(enriched, true);
        });

        this.adapter.on('IDENTIFICATION_STARTED', (data) => {
            this.identificationState = 'identifying';
            this.showLoading(data.message || 'Buscando coincidencias...');
            this._updateButtonStates();
        });

        this.adapter.on('IDENTIFICATION_COMPLETED', (data) => {
            this._processIdentificationEvent(data, true);
        });

        this.adapter.on('IDENTIFICATION_FAILED', (data) => {
            const enriched = Object.assign({ matched: false }, data || {});
            this._processIdentificationEvent(enriched, true);
        });

        this.adapter.on('CAPTURE_STARTED', (data) => {
            if (this.verificationState === 'verifying' || this.identificationState === 'identifying') {
                this.showLoading(data.message || 'Coloca el dedo en el lector');
            }
        });

        this.adapter.on('CAPTURE_COMPLETED', (data) => {
            if (this.verificationState === 'verifying' || this.identificationState === 'identifying') {
                this.showInfo(data.message || 'Captura completada');
            }
        });

        this.adapter.on('IMAGE_CAPTURED', (data) => this._handleVerificationImage(data));

        this.adapter.on('SYSTEM_ERROR', (data) => {
            if (this.verificationState === 'verifying' || this.identificationState === 'identifying') {
                this.showError(data.message || 'Error en el proceso biometrico');
            }
        });
    }

    /**
     * Cargar lista de usuarios disponibles
     */
    async _loadUsers() {
        try {
            this.showLoading('Cargando usuarios...');

            const result = await this.adapter.getStoredFingerprints();

            if (result.ok && result.items) {
                this.availableUsers = result.items;
                this._updateUserList();

                this.updateStatus('info', `${result.items.length} usuarios disponibles`);
            } else {
                this.availableUsers = [];
                this._updateUserList();
                this.updateStatus('warning', 'No hay usuarios registrados');
            }

        } catch (error) {
            this.showError(`Error cargando usuarios: ${error.message}`);
        }
    }

    /**
     * Actualizar lista desplegable de usuarios
     */
    _updateUserList() {
        const currentValue = this.userSelect.value;

        this.userSelect.innerHTML = '<option value="">-- Seleccionar Usuario --</option>';

        this.availableUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.Tag;
            option.textContent = `${user.Tag} (${user.Format})`;
            this.userSelect.appendChild(option);
        });

        // Restaurar selección anterior si es válida
        if (currentValue && this.availableUsers.some(u => u.Tag === currentValue)) {
            this.userSelect.value = currentValue;
        }

        this._onUserSelected();
    }

    /**
     * Manejar selección de usuario
     */
    _onUserSelected() {
        this.selectedUser = this.userSelect.value;
        this._updateButtonStates();

        if (this.selectedUser) {
            this.updateStatus('info', `Listo para verificar: ${this.selectedUser}`);
        } else {
            this.updateStatus('info', 'Selecciona un usuario de la lista');
        }
    }

    /**
     * Manejar cambio de modo
     */
    _onModeChanged() {
        const selectedMode = this.container.querySelector('input[name="verificationMode"]:checked').value;

        if (selectedMode === 'verify') {
            this.userSelection.style.display = 'block';
            this.verifyInstructions.style.display = 'block';
            this.identifyInstructions.style.display = 'none';
        } else {
            this.userSelection.style.display = 'none';
            this.verifyInstructions.style.display = 'none';
            this.identifyInstructions.style.display = 'block';
        }

        this._updateButtonStates();
    }

    /**
     * Realizar verificación 1:1
     */
    async verify() {
        if (!this.selectedUser) {
            this.showError('Debe seleccionar un usuario');
            return;
        }

        try {
            this.verificationState = 'verifying';
            this.identificationState = 'idle';

            this._updateButtonStates();
            this.showLoading('Verificando ' + this.selectedUser + '... Coloca el dedo');

            // Notificar al EventRouter que esta operación comenzó
            if (this.eventRouter) {
                this.eventRouter.startOperation('verification', this.componentId, { userId: this.selectedUser });
            }

            const result = await this.adapter.verifyFingerprint(this.selectedUser);

            if (this.verificationState === 'verifying') {
                if (result.ok) {
                    const enriched = Object.assign({ userId: this.selectedUser }, result || {});
                    this._processVerificationEvent(enriched, false);
                } else {
                    this.verificationState = 'failed';
                    this.showError(result.error || 'Error en verificacion');
                    this._updateButtonStates();
                }
            }
        } catch (error) {
            this.verificationState = 'failed';
            this.showError('Error: ' + error.message);
            this._updateButtonStates();
        } finally {
            // Finalizar operación en el EventRouter
            if (this.eventRouter) {
                this.eventRouter.endOperation('verification');
            }
        }
    }



    /**
     * Realizar identificación 1:N
     */
    async identify() {
        try {
            this.identificationState = 'identifying';
            this.verificationState = 'idle';

            this._updateButtonStates();
            this.showLoading('Identificacion 1:N... Coloca el dedo');

            // Notificar al EventRouter que esta operación comenzó
            if (this.eventRouter) {
                this.eventRouter.startOperation('identification', this.componentId, {});
            }

            const result = await this.adapter.identifyFingerprint();

            if (this.identificationState === 'identifying') {
                if (result.ok) {
                    this._processIdentificationEvent(result || {}, false);
                } else {
                    this.identificationState = 'not_found';
                    this.showError(result.error || 'Error en identificacion');
                    this._updateButtonStates();
                }
            }
        } catch (error) {
            this.identificationState = 'not_found';
            this.showError('Error: ' + error.message);
            this._updateButtonStates();
        } finally {
            // Finalizar operación en el EventRouter
            if (this.eventRouter) {
                this.eventRouter.endOperation('identification');
            }
        }
    }



    /**
     * Mostrar resultado de verificación/identificación
     */
    /**
     * Procesar resultado de verificacion
     */
    _processVerificationEvent(payload, fromEvent = false) {
        const normalized = this._normalizeVerificationPayload(payload || {});
        const resultData = {
            user: normalized.user,
            verified: normalized.verified,
            identified: false,
            score: normalized.score,
            timestamp: new Date()
        };

        this._showResult(resultData);

        if (normalized.verified) {
            this.showSuccess(normalized.message);
        } else {
            this.showError(normalized.message);
        }

        this.verificationState = normalized.verified ? 'verified' : 'failed';
        this.emit('verified', { ...resultData, source: fromEvent ? 'event' : 'api' });
        this._updateButtonStates();
    }

    _normalizeVerificationPayload(payload) {
        const verified = typeof payload.verified === 'boolean'
            ? payload.verified
            : !!payload.success;
        const score = typeof payload.score === 'number'
            ? payload.score
            : (typeof payload.bestScore === 'number' ? payload.bestScore : 0);
        const user = payload.userId || (payload.data ? payload.data.userId : null) || this.selectedUser || 'Desconocido';
        const message = payload.message || payload.msg || (verified ? 'Verificacion completada' : 'Verificacion fallida');
        return { verified, score, user, message };
    }

    /**
     * Procesar resultado de identificacion
     */
    _processIdentificationEvent(payload, fromEvent = false) {
        const normalized = this._normalizeIdentificationPayload(payload || {});
        const resultData = {
            user: normalized.user,
            verified: false,
            identified: normalized.matched,
            score: normalized.score,
            timestamp: new Date()
        };

        this._showResult(resultData);

        if (normalized.matched) {
            this.showSuccess(normalized.message);
        } else {
            this.showError(normalized.message);
        }

        this.identificationState = normalized.matched ? 'identified' : 'not_found';
        this.emit('identified', { ...resultData, bestMatches: normalized.bestMatches, source: fromEvent ? 'event' : 'api' });
        this._updateButtonStates();
    }

    _normalizeIdentificationPayload(payload) {
        const matched = typeof payload.matched === 'boolean'
            ? payload.matched
            : (typeof payload.match === 'boolean' ? payload.match : !!payload.success);
        const topMatches = Array.isArray(payload.topMatches) ? payload.topMatches : (Array.isArray(payload.topK) ? payload.topK : []);
        const bestMatch = payload.bestMatch || (topMatches.length > 0 ? topMatches[0] : null);
        const user = matched
            ? (payload.bestTag || (bestMatch ? (bestMatch.userId || bestMatch.tag) : null) || 'Identificado')
            : 'No identificado';
        const score = matched
            ? (payload.bestScore !== undefined ? payload.bestScore : (bestMatch && bestMatch.score !== undefined ? bestMatch.score : 0))
            : 0;
        const message = payload.message || (matched ? 'Identificacion completada' : 'Sin coincidencias');
        return { matched, user, score, message, bestMatches: topMatches };
    }

    _showResult(resultData) {
        this.lastResult = resultData;

        this.resultUser.textContent = resultData.user;
        this.resultStatus.textContent = resultData.verified || resultData.identified ? 'ÉXITO' : 'FALLO';
        this.resultScore.textContent = resultData.score.toString();
        this.resultTime.textContent = resultData.timestamp.toLocaleTimeString();

        this.resultPanel.style.display = 'block';

        // Auto-ocultar después de 10 segundos
        setTimeout(() => {
            this.resultPanel.style.display = 'none';
        }, 10000);
    }

    /**
     * Limpiar verificación
     */
    clear() {
        super.clear();

        this.verificationState = 'idle';
        this.identificationState = 'idle';
        this.lastResult = null;

        // Limpiar imagen
        this.fingerprintArea.innerHTML = '<div class="fingerprint-placeholder">🔒</div>';

        // Ocultar resultado
        this.resultPanel.style.display = 'none';

        this._updateButtonStates();
        this.updateStatus('info', 'Selecciona un usuario y presiona "Verificar"');
        this.emit('cleared');
    }

    /**
     * Manejar estado de verificación desde backend
     */
    _handleVerificationStatus(data) {
        const message = data.message || data.msg;
        if (message) {
            this.updateStatus('info', message);
        }
    }

    /**
     * Manejar imagen de verificación
     */
    _handleVerificationImage(data) {
        const imageBase64 = (data && (data.imageBase64 || (data.data ? data.data.imageBase64 : null))) || null;
        if (imageBase64 && (this.verificationState === 'verifying' || this.identificationState === 'identifying')) {
            this.displayImage(imageBase64);
        }
    }

    /**
     * Mostrar imagen específica para verificación
     */
    displayImage(imageBase64) {
        this.fingerprintArea.innerHTML = `
            <img src="data:image/png;base64,${imageBase64}"
                 style="max-width: 100%; max-height: 100%; border-radius: 8px; object-fit: contain;"
                 alt="Huella para verificación" />
        `;
    }

    /**
     * Actualizar estado de botones
     */
    _updateButtonStates() {
        const selectedMode = this.container.querySelector('input[name="verificationMode"]:checked').value;
        const isVerifying = this.verificationState === 'verifying';
        const isIdentifying = this.identificationState === 'identifying';
        const isBusy = isVerifying || isIdentifying;

        this.verifyButton.disabled = isBusy || (selectedMode === 'verify' && !this.selectedUser);
        this.identifyButton.disabled = isBusy;
        this.refreshButton.disabled = isBusy;
        this.userSelect.disabled = isBusy;
    }

    /**
     * Obtener estado actual de verificación
     */
    getVerificationState() {
        return {
            verificationState: this.verificationState,
            identificationState: this.identificationState,
            selectedUser: this.selectedUser,
            availableUsers: this.availableUsers.length,
            lastResult: this.lastResult
        };
    }

    /**
     * Configurar umbral de score para verificación
     */
    setScoreThreshold(threshold) {
        this.scoreThreshold = threshold;
        this.updateStatus('info', `Umbral de score configurado: ${threshold}`);
    }
}

// Registrar globalmente
window.VerificationControl = VerificationControl;
