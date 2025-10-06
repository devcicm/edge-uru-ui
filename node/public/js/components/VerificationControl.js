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
    }

    /**
     * Configurar eventos específicos para verificación
     */
    _setupVerificationEvents() {
        this.adapter.on('status', (data) => this._handleVerificationStatus(data));
        this.adapter.on('image', (data) => this._handleVerificationImage(data));
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
            this._updateButtonStates();

            this.showLoading(`Verificando ${this.selectedUser}... Coloca el dedo`);

            const result = await this.adapter.verifyFingerprint(this.selectedUser);

            if (result.ok) {
                this.verificationState = result.verified ? 'verified' : 'failed';

                const resultData = {
                    user: this.selectedUser,
                    verified: result.verified,
                    score: result.score,
                    timestamp: new Date()
                };

                this._showResult(resultData);
                this.emit('verified', resultData);

                if (result.verified) {
                    this.showSuccess(`✅ VERIFICADO - Score: ${result.score}`);
                } else {
                    this.showError(`❌ NO VERIFICADO - Score: ${result.score}`);
                }
            } else {
                this.verificationState = 'failed';
                this.showError('Error en verificación');
            }

        } catch (error) {
            this.verificationState = 'failed';
            this.showError(`Error: ${error.message}`);
        } finally {
            this._updateButtonStates();
        }
    }

    /**
     * Realizar identificación 1:N
     */
    async identify() {
        try {
            this.identificationState = 'identifying';
            this._updateButtonStates();

            this.showLoading('Identificación 1:N... Coloca el dedo');

            const result = await this.adapter.identifyFingerprint();

            if (result.ok) {
                this.identificationState = result.match ? 'identified' : 'not_found';

                const resultData = {
                    user: result.match ? result.bestTag : 'No identificado',
                    identified: result.match,
                    score: result.match ? result.bestScore : 0,
                    timestamp: new Date()
                };

                this._showResult(resultData);
                this.emit('identified', resultData);

                if (result.match) {
                    this.showSuccess(`✅ IDENTIFICADO: ${result.bestTag} (Score: ${result.bestScore})`);
                } else {
                    this.showError('⚠️ NO IDENTIFICADO - No hay coincidencias');
                }
            } else {
                this.identificationState = 'not_found';
                this.showError('Error en identificación');
            }

        } catch (error) {
            this.identificationState = 'not_found';
            this.showError(`Error: ${error.message}`);
        } finally {
            this._updateButtonStates();
        }
    }

    /**
     * Mostrar resultado de verificación/identificación
     */
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
        if (data.msg && (data.msg.includes('Verificación') || data.msg.includes('Identificación'))) {
            this.updateStatus('info', `👆 ${data.msg}`);
        }
    }

    /**
     * Manejar imagen de verificación
     */
    _handleVerificationImage(data) {
        if (data.imageBase64 && (this.verificationState === 'verifying' || this.identificationState === 'identifying')) {
            this.displayImage(data.imageBase64);
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