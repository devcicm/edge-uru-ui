/**
 * VerificationControl - Componente ultra simple para verificación e identificación
 *
 * Responsabilidades:
 * - UI de verificación 1:1 (con selector de usuario)
 * - UI de identificación 1:N (sin selector)
 * - Mostrar resultado (match/no-match)
 * - Mostrar imagen de huella
 */
class VerificationControl extends BaseComponent {
    constructor(containerId, adapter, config = {}) {
        super(containerId, adapter, config);

        // Estado
        this.mode = 'verify'; // 'verify' o 'identify'
        this.selectedUserId = '';
        this.availableUsers = [];
        this.isProcessing = false;

        // Cargar usuarios
        this._loadUsers();
    }

    /**
     * Crear estructura HTML
     */
    _createStructure() {
        this.container.innerHTML = `
            <div class="verification-control">
                <!-- Header -->
                <div class="component-header">
                    <h3>✅ Verificación e Identificación</h3>
                    <p class="component-subtitle">Verificación 1:1 e Identificación 1:N</p>
                </div>

                <!-- Modo: Verificación vs Identificación -->
                <div class="component-mode-selector">
                    <label class="mode-option">
                        <input type="radio" name="mode-${this.containerId}" value="verify" checked>
                        <span>Verificación 1:1</span>
                    </label>
                    <label class="mode-option">
                        <input type="radio" name="mode-${this.containerId}" value="identify">
                        <span>Identificación 1:N</span>
                    </label>
                </div>

                <!-- Selector de usuario (solo para verificación) -->
                <div class="component-input-group" id="userSelector-${this.containerId}">
                    <label for="userSelect-${this.containerId}">Seleccionar Usuario:</label>
                    <div style="display: flex; gap: 8px;">
                        <select id="userSelect-${this.containerId}" class="component-input" style="flex: 1;">
                            <option value="">-- Seleccionar Usuario --</option>
                        </select>
                        <button class="btn-icon" id="btnRefresh-${this.containerId}" title="Actualizar lista">
                            🔄
                        </button>
                    </div>
                </div>

                <!-- Imagen de huella -->
                <div class="fingerprint-image">
                    <div class="image-placeholder">🔒</div>
                </div>

                <!-- Estado con timestamp -->
                <div class="component-status status-info">
                    <span class="status-timestamp">[--:--:--]</span>
                    <span class="status-icon">ℹ️</span>
                    <span class="status-message">Selecciona un usuario</span>
                </div>

                <!-- Botones -->
                <div class="component-buttons">
                    <button class="btn-primary" id="btnVerify-${this.containerId}">
                        Verificar 1:1
                    </button>
                    <button class="btn-warning" id="btnIdentify-${this.containerId}" style="display: none;">
                        Identificar 1:N
                    </button>
                    <button class="btn-secondary" id="btnClear-${this.containerId}">
                        Limpiar
                    </button>
                </div>

                <!-- Instrucciones -->
                <div class="component-instructions">
                    <div class="instruction-verify">
                        <div class="instruction-item">
                            <span class="instruction-number">1</span>
                            <span class="instruction-text">Selecciona un usuario</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-number">2</span>
                            <span class="instruction-text">Presiona "Verificar 1:1"</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-number">3</span>
                            <span class="instruction-text">Coloca el dedo en el lector</span>
                        </div>
                    </div>
                    <div class="instruction-identify" style="display: none;">
                        <div class="instruction-item">
                            <span class="instruction-number">1</span>
                            <span class="instruction-text">Presiona "Identificar 1:N"</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-number">2</span>
                            <span class="instruction-text">Coloca el dedo en el lector</span>
                        </div>
                        <div class="instruction-item">
                            <span class="instruction-number">3</span>
                            <span class="instruction-text">El sistema buscará coincidencias</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Referencias a elementos
        this.modeRadios = this.container.querySelectorAll(`input[name="mode-${this.containerId}"]`);
        this.userSelector = this.container.querySelector(`#userSelector-${this.containerId}`);
        this.userSelect = this.container.querySelector(`#userSelect-${this.containerId}`);
        this.btnRefresh = this.container.querySelector(`#btnRefresh-${this.containerId}`);
        this.btnVerify = this.container.querySelector(`#btnVerify-${this.containerId}`);
        this.btnIdentify = this.container.querySelector(`#btnIdentify-${this.containerId}`);
        this.btnClear = this.container.querySelector(`#btnClear-${this.containerId}`);
        this.instructionVerify = this.container.querySelector('.instruction-verify');
        this.instructionIdentify = this.container.querySelector('.instruction-identify');

        // Eventos
        this.modeRadios.forEach(radio => {
            radio.onchange = () => this._onModeChange();
        });
        this.userSelect.onchange = () => this._onUserSelect();
        this.btnRefresh.onclick = () => this._loadUsers();
        this.btnVerify.onclick = () => this.verify();
        this.btnIdentify.onclick = () => this.identify();
        this.btnClear.onclick = () => this.clear();

        this._updateUI();
    }

    /**
     * Cargar usuarios disponibles
     */
    async _loadUsers() {
        try {
            this.showLoading('Cargando usuarios...');

            const result = await this.adapter.getStoredFingerprints();

            if (result.ok && result.items) {
                this.availableUsers = result.items;
                this._updateUserList();
                this.showInfo(`${result.items.length} usuarios disponibles`);
            } else {
                this.availableUsers = [];
                this._updateUserList();
                this.showWarning('No hay usuarios registrados');
            }

        } catch (error) {
            this.showError(`Error cargando usuarios: ${error.message}`);
        }
    }

    /**
     * Actualizar lista de usuarios en el selector
     */
    _updateUserList() {
        const currentValue = this.userSelect.value;

        this.userSelect.innerHTML = '<option value="">-- Seleccionar Usuario --</option>';

        this.availableUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.Tag;
            option.textContent = `${user.Tag}`;
            this.userSelect.appendChild(option);
        });

        // Restaurar selección anterior si es válida
        if (currentValue && this.availableUsers.some(u => u.Tag === currentValue)) {
            this.userSelect.value = currentValue;
        }
    }

    /**
     * Manejar cambio de modo
     */
    _onModeChange() {
        const selectedRadio = this.container.querySelector(`input[name="mode-${this.containerId}"]:checked`);
        this.mode = selectedRadio.value;

        this._updateUI();
    }

    /**
     * Manejar selección de usuario
     */
    _onUserSelect() {
        this.selectedUserId = this.userSelect.value;
        this._updateUI();

        if (this.selectedUserId) {
            this.showInfo(`Listo para verificar: ${this.selectedUserId}`);
        } else {
            this.showInfo('Selecciona un usuario');
        }
    }

    /**
     * Verificación 1:1
     */
    async verify() {
        if (!this.selectedUserId) {
            this.showError('Selecciona un usuario primero');
            return;
        }

        try {
            this.isProcessing = true;
            this._updateUI();

            this.showLoading(`Verificando ${this.selectedUserId}...`);

            // Llamar al backend
            const result = await this.adapter.verifyFingerprint(this.selectedUserId);

            // Procesar resultado
            if (result.ok) {
                if (result.verified) {
                    this.showSuccess(`✅ Verificado: ${this.selectedUserId}`);
                } else {
                    this.showError(`❌ No coincide: ${this.selectedUserId}`);
                }
            } else {
                this.showError(result.msg || 'Error en verificación');
            }

        } catch (error) {
            this.showError(`Error: ${error.message}`);
        } finally {
            this.isProcessing = false;
            this._updateUI();
        }
    }

    /**
     * Identificación 1:N
     */
    async identify() {
        try {
            this.isProcessing = true;
            this._updateUI();

            this.showLoading('Buscando coincidencias...');


            // Llamar al backend
            const result = await this.adapter.identifyFingerprint();

            // Procesar resultado
            if (result.ok) {
                if (result.matched) {
                    const userId = result.bestTag || 'Usuario identificado';
                    this.showSuccess(`✅ Identificado: ${userId}`);
                } else {
                    this.showWarning('⚠️ No se encontraron coincidencias');
                }
            } else {
                this.showError(result.msg || 'Error en identificación');
            }

        } catch (error) {
            this.showError(`Error: ${error.message}`);
        } finally {
            this.isProcessing = false;
            this._updateUI();
        }
    }

    /**
     * Limpiar componente
     */
    clear() {
        super.clear();

        this.selectedUserId = '';
        this.isProcessing = false;
        this.userSelect.value = '';

        this._updateUI();

        if (this.mode === 'verify') {
            this.showInfo('Selecciona un usuario');
        } else {
            this.showInfo('Presiona "Identificar 1:N"');
        }
    }

    /**
     * Actualizar UI según estado y modo
     */
    _updateUI() {
        const isVerifyMode = this.mode === 'verify';

        // Mostrar/ocultar selector de usuario
        this.userSelector.style.display = isVerifyMode ? 'block' : 'none';

        // Mostrar/ocultar botones
        this.btnVerify.style.display = isVerifyMode ? 'inline-block' : 'none';
        this.btnIdentify.style.display = isVerifyMode ? 'none' : 'inline-block';

        // Mostrar/ocultar instrucciones
        this.instructionVerify.style.display = isVerifyMode ? 'block' : 'none';
        this.instructionIdentify.style.display = isVerifyMode ? 'none' : 'block';

        // Habilitar/deshabilitar botones
        if (isVerifyMode) {
            this.btnVerify.disabled = this.isProcessing || !this.selectedUserId;
            this.btnVerify.textContent = this.isProcessing ? 'Verificando...' : 'Verificar 1:1';
        } else {
            this.btnIdentify.disabled = this.isProcessing;
            this.btnIdentify.textContent = this.isProcessing ? 'Identificando...' : 'Identificar 1:N';
        }

        this.btnRefresh.disabled = this.isProcessing;
        this.btnClear.disabled = this.isProcessing;
        this.userSelect.disabled = this.isProcessing;
    }
}

// Registrar globalmente
window.VerificationControl = VerificationControl;
