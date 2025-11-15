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

        // Configurar eventos SSE para progreso
        this._setupProgressEvents();

        // Cargar usuarios
        this._loadUsers();
    }

    /**
     * Crear estructura HTML - Diseño claro con dos secciones independientes
     */
    _createStructure() {
        this.container.innerHTML = `
            <div class="verification-control">
                <!-- Header -->
                <div class="component-header">
                    <h3>🔐 Verificación e Identificación</h3>
                    <p class="component-subtitle">Dos modos de autenticación biométrica</p>
                </div>

                <!-- Tabs para seleccionar modo -->
                <div class="verification-tabs">
                    <button class="tab-button active" data-tab="verify" id="tabVerify-${this.containerId}">
                        <span class="tab-icon">✅</span>
                        <span class="tab-label">Verificación 1:1</span>
                        <span class="tab-description">Verificar identidad de un usuario específico</span>
                    </button>
                    <button class="tab-button" data-tab="identify" id="tabIdentify-${this.containerId}">
                        <span class="tab-icon">🔍</span>
                        <span class="tab-label">Identificación 1:N</span>
                        <span class="tab-description">Buscar en todos los usuarios registrados</span>
                    </button>
                </div>

                <!-- Contenido: Verificación 1:1 -->
                <div class="tab-content active" id="contentVerify-${this.containerId}">
                    <div class="mode-section">
                        <h4>✅ Verificación 1:1 (Uno a Uno)</h4>
                        <p class="mode-description">
                            Verifica si la huella capturada coincide con un usuario específico que selecciones.
                        </p>

                        <!-- Selector de usuario -->
                        <div class="component-input-group">
                            <label for="userSelect-${this.containerId}">
                                <strong>1. Selecciona el usuario a verificar:</strong>
                            </label>
                            <div style="display: flex; gap: 8px;">
                                <select id="userSelect-${this.containerId}" class="component-input" style="flex: 1;">
                                    <option value="">-- Seleccionar Usuario --</option>
                                </select>
                                <button class="btn-icon" id="btnRefresh-${this.containerId}" title="Actualizar lista">
                                    🔄
                                </button>
                            </div>
                            <small id="userCount-${this.containerId}" style="color: #6b7280; margin-top: 4px; display: block;">
                                Cargando usuarios...
                            </small>
                        </div>

                        <!-- Imagen de huella -->
                        <div class="fingerprint-image">
                            <div class="image-placeholder">🔒</div>
                        </div>

                        <!-- Progreso de Verificación -->
                        <div class="verification-progress" id="verifyProgress-${this.containerId}" style="display: none;">
                            <div class="progress-header">
                                <span class="progress-label">Intentos de Verificación</span>
                                <span class="progress-counter" id="verifyCounter-${this.containerId}">0/4</span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar" id="verifyProgressBar-${this.containerId}" style="width: 0%;">
                                    <span class="progress-percentage" id="verifyPercentage-${this.containerId}">0%</span>
                                </div>
                            </div>
                            <div class="progress-samples" id="verifySamples-${this.containerId}">
                                <span class="sample-indicator" data-attempt="1">1</span>
                                <span class="sample-indicator" data-attempt="2">2</span>
                                <span class="sample-indicator" data-attempt="3">3</span>
                                <span class="sample-indicator" data-attempt="4">4</span>
                            </div>
                        </div>

                        <!-- Estado -->
                        <div class="component-status status-info" id="statusVerify-${this.containerId}">
                            <span class="status-timestamp">[--:--:--]</span>
                            <span class="status-icon">ℹ️</span>
                            <span class="status-message">Selecciona un usuario y presiona Verificar</span>
                        </div>

                        <!-- Botón de acción -->
                        <button class="btn-primary btn-large" id="btnVerify-${this.containerId}" disabled>
                            <span class="btn-icon">✅</span>
                            <span class="btn-text">Verificar Usuario Seleccionado</span>
                        </button>

                        <!-- Instrucciones -->
                        <div class="component-instructions">
                            <div class="instruction-item">
                                <span class="instruction-number">1</span>
                                <span class="instruction-text">Selecciona el usuario de la lista</span>
                            </div>
                            <div class="instruction-item">
                                <span class="instruction-number">2</span>
                                <span class="instruction-text">Presiona "Verificar Usuario Seleccionado"</span>
                            </div>
                            <div class="instruction-item">
                                <span class="instruction-number">3</span>
                                <span class="instruction-text">Coloca el dedo en el lector DP4500</span>
                            </div>
                            <div class="instruction-item">
                                <span class="instruction-number">4</span>
                                <span class="instruction-text">Verás si la huella coincide o no</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Contenido: Identificación 1:N -->
                <div class="tab-content" id="contentIdentify-${this.containerId}">
                    <div class="mode-section">
                        <h4>🔍 Identificación 1:N (Uno a Muchos)</h4>
                        <p class="mode-description">
                            Busca automáticamente en todos los usuarios registrados para encontrar a quién pertenece la huella.
                        </p>

                        <!-- Info de usuarios registrados -->
                        <div class="info-box">
                            <div class="info-icon">📊</div>
                            <div class="info-content">
                                <strong>Usuarios en la base de datos:</strong>
                                <span id="gallerySize-${this.containerId}">Cargando...</span>
                            </div>
                        </div>

                        <!-- Imagen de huella -->
                        <div class="fingerprint-image">
                            <div class="image-placeholder">🔍</div>
                        </div>

                        <!-- Progreso de Identificación -->
                        <div class="verification-progress" id="identifyProgress-${this.containerId}" style="display: none;">
                            <div class="progress-header">
                                <span class="progress-label">Intentos de Identificación</span>
                                <span class="progress-counter" id="identifyCounter-${this.containerId}">0/4</span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar" id="identifyProgressBar-${this.containerId}" style="width: 0%;">
                                    <span class="progress-percentage" id="identifyPercentage-${this.containerId}">0%</span>
                                </div>
                            </div>
                            <div class="progress-samples" id="identifySamples-${this.containerId}">
                                <span class="sample-indicator" data-attempt="1">1</span>
                                <span class="sample-indicator" data-attempt="2">2</span>
                                <span class="sample-indicator" data-attempt="3">3</span>
                                <span class="sample-indicator" data-attempt="4">4</span>
                            </div>
                        </div>

                        <!-- Estado -->
                        <div class="component-status status-info" id="statusIdentify-${this.containerId}">
                            <span class="status-timestamp">[--:--:--]</span>
                            <span class="status-icon">ℹ️</span>
                            <span class="status-message">Presiona Identificar y coloca tu dedo</span>
                        </div>

                        <!-- Botón de acción -->
                        <button class="btn-warning btn-large" id="btnIdentify-${this.containerId}">
                            <span class="btn-icon">🔍</span>
                            <span class="btn-text">Buscar en Todos los Usuarios</span>
                        </button>

                        <!-- Instrucciones -->
                        <div class="component-instructions">
                            <div class="instruction-item">
                                <span class="instruction-number">1</span>
                                <span class="instruction-text">Presiona "Buscar en Todos los Usuarios"</span>
                            </div>
                            <div class="instruction-item">
                                <span class="instruction-number">2</span>
                                <span class="instruction-text">Coloca el dedo en el lector DP4500</span>
                            </div>
                            <div class="instruction-item">
                                <span class="instruction-number">3</span>
                                <span class="instruction-text">El sistema buscará automáticamente</span>
                            </div>
                            <div class="instruction-item">
                                <span class="instruction-number">4</span>
                                <span class="instruction-text">Verás el usuario identificado o "no match"</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Botón de limpiar (común para ambos modos) -->
                <button class="btn-secondary" id="btnClear-${this.containerId}" style="margin-top: 10px;">
                    🗑️ Limpiar Resultados
                </button>

                <style>
                    .verification-tabs {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 10px;
                        margin-bottom: 20px;
                    }

                    .tab-button {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        padding: 15px;
                        border: 2px solid #e5e7eb;
                        border-radius: 10px;
                        background: white;
                        cursor: pointer;
                        transition: all 0.3s;
                        text-align: center;
                    }

                    .tab-button:hover {
                        border-color: #667eea;
                        background: #f3f4f6;
                        transform: translateY(-2px);
                    }

                    .tab-button.active {
                        border-color: #667eea;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                    }

                    .tab-icon {
                        font-size: 2rem;
                        margin-bottom: 8px;
                    }

                    .tab-label {
                        font-size: 1.1rem;
                        font-weight: 700;
                        margin-bottom: 4px;
                    }

                    .tab-description {
                        font-size: 0.85rem;
                        opacity: 0.9;
                    }

                    .tab-button.active .tab-description {
                        opacity: 1;
                    }

                    .tab-content {
                        display: none;
                    }

                    .tab-content.active {
                        display: block;
                        animation: fadeIn 0.3s ease-in;
                    }

                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }

                    .mode-section h4 {
                        color: #667eea;
                        margin-bottom: 10px;
                        font-size: 1.2rem;
                    }

                    .mode-description {
                        color: #6b7280;
                        margin-bottom: 20px;
                        line-height: 1.5;
                    }

                    .btn-large {
                        width: 100%;
                        padding: 16px;
                        font-size: 1.1rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                        margin-top: 15px;
                    }

                    .btn-icon {
                        font-size: 1.3rem;
                    }

                    .info-box {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                        padding: 15px;
                        background: #f0f9ff;
                        border: 2px solid #bae6fd;
                        border-radius: 10px;
                        margin-bottom: 20px;
                    }

                    .info-icon {
                        font-size: 2rem;
                    }

                    .info-content {
                        flex: 1;
                        font-size: 0.95rem;
                    }

                    .info-content strong {
                        display: block;
                        color: #0369a1;
                        margin-bottom: 4px;
                    }

                    /* Estilos de Progreso Multi-Intentos */
                    .verification-progress {
                        background: #f8f9fa;
                        border: 2px solid #e9ecef;
                        border-radius: 10px;
                        padding: 15px;
                        margin-bottom: 15px;
                    }

                    .progress-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 10px;
                    }

                    .progress-label {
                        font-weight: 600;
                        color: #495057;
                        font-size: 0.9rem;
                    }

                    .progress-counter {
                        font-weight: 700;
                        color: #667eea;
                        font-size: 1.1rem;
                    }

                    .progress-bar-container {
                        width: 100%;
                        height: 30px;
                        background: #e9ecef;
                        border-radius: 15px;
                        overflow: hidden;
                        position: relative;
                        margin-bottom: 12px;
                        box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
                    }

                    .progress-bar {
                        height: 100%;
                        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                        border-radius: 15px;
                        transition: width 0.5s ease;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        position: relative;
                    }

                    .progress-percentage {
                        color: white;
                        font-weight: 700;
                        font-size: 0.85rem;
                        text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                    }

                    .progress-samples {
                        display: flex;
                        gap: 10px;
                        justify-content: center;
                    }

                    .sample-indicator {
                        width: 40px;
                        height: 40px;
                        border-radius: 50%;
                        background: #e9ecef;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: 700;
                        font-size: 1rem;
                        color: #adb5bd;
                        border: 2px solid #dee2e6;
                        transition: all 0.3s ease;
                    }

                    .sample-indicator.captured {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border-color: #667eea;
                        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                        transform: scale(1.1);
                    }

                    .sample-indicator.active {
                        background: #fff3cd;
                        color: #856404;
                        border-color: #ffc107;
                        animation: pulse 1.5s infinite;
                    }

                    @keyframes pulse {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.05); }
                    }
                </style>
            </div>
        `;

        // Referencias a elementos
        this.tabVerify = this.container.querySelector(`#tabVerify-${this.containerId}`);
        this.tabIdentify = this.container.querySelector(`#tabIdentify-${this.containerId}`);
        this.contentVerify = this.container.querySelector(`#contentVerify-${this.containerId}`);
        this.contentIdentify = this.container.querySelector(`#contentIdentify-${this.containerId}`);
        this.userSelect = this.container.querySelector(`#userSelect-${this.containerId}`);
        this.userCount = this.container.querySelector(`#userCount-${this.containerId}`);
        this.gallerySize = this.container.querySelector(`#gallerySize-${this.containerId}`);
        this.btnRefresh = this.container.querySelector(`#btnRefresh-${this.containerId}`);
        this.btnVerify = this.container.querySelector(`#btnVerify-${this.containerId}`);
        this.btnIdentify = this.container.querySelector(`#btnIdentify-${this.containerId}`);
        this.btnClear = this.container.querySelector(`#btnClear-${this.containerId}`);
        this.statusVerify = this.container.querySelector(`#statusVerify-${this.containerId}`);
        this.statusIdentify = this.container.querySelector(`#statusIdentify-${this.containerId}`);

        // Referencias a elementos de progreso - Verificación
        this.verifyProgress = this.container.querySelector(`#verifyProgress-${this.containerId}`);
        this.verifyCounter = this.container.querySelector(`#verifyCounter-${this.containerId}`);
        this.verifyProgressBar = this.container.querySelector(`#verifyProgressBar-${this.containerId}`);
        this.verifyPercentage = this.container.querySelector(`#verifyPercentage-${this.containerId}`);
        this.verifySamples = this.container.querySelector(`#verifySamples-${this.containerId}`);

        // Referencias a elementos de progreso - Identificación
        this.identifyProgress = this.container.querySelector(`#identifyProgress-${this.containerId}`);
        this.identifyCounter = this.container.querySelector(`#identifyCounter-${this.containerId}`);
        this.identifyProgressBar = this.container.querySelector(`#identifyProgressBar-${this.containerId}`);
        this.identifyPercentage = this.container.querySelector(`#identifyPercentage-${this.containerId}`);
        this.identifySamples = this.container.querySelector(`#identifySamples-${this.containerId}`);

        // Eventos de tabs
        this.tabVerify.onclick = () => this._switchTab('verify');
        this.tabIdentify.onclick = () => this._switchTab('identify');

        // Eventos de acciones
        this.userSelect.onchange = () => this._onUserSelect();
        this.btnRefresh.onclick = () => this._loadUsers();
        this.btnVerify.onclick = () => this.verify();
        this.btnIdentify.onclick = () => this.identify();
        this.btnClear.onclick = () => this.clear();
    }

    /**
     * Configurar eventos SSE para progreso de multi-intentos
     */
    _setupProgressEvents() {
        // Eventos de progreso de verificación
        this.adapter.on('VERIFICATION_ATTEMPT', (data) => {
            if (this.mode === 'verify' && this.isProcessing) {
                const attemptNum = data.data?.attemptNumber || 1;
                const totalAttempts = data.data?.totalAttempts || 4;
                this._updateVerifyProgress(attemptNum, totalAttempts);
                console.log(`[${this.componentId}] 📊 Intento de verificación ${attemptNum}/${totalAttempts}`);
            }
        });

        this.adapter.on('VERIFICATION_RETRY', (data) => {
            if (this.mode === 'verify' && this.isProcessing) {
                const attemptNum = data.data?.attemptNumber || 1;
                this._updateStatus('verify', `⚠️ Intento ${attemptNum}/4 sin coincidencia, reintentando...`, 'warning');
            }
        });

        // Eventos de progreso de identificación
        this.adapter.on('IDENTIFICATION_ATTEMPT', (data) => {
            if (this.mode === 'identify' && this.isProcessing) {
                const attemptNum = data.data?.attemptNumber || 1;
                const totalAttempts = data.data?.totalAttempts || 4;
                this._updateIdentifyProgress(attemptNum, totalAttempts);
                console.log(`[${this.componentId}] 📊 Intento de identificación ${attemptNum}/${totalAttempts}`);
            }
        });

        this.adapter.on('IDENTIFICATION_RETRY', (data) => {
            if (this.mode === 'identify' && this.isProcessing) {
                const attemptNum = data.data?.attemptNumber || 1;
                this._updateStatus('identify', `⚠️ Intento ${attemptNum}/4 sin coincidencia, reintentando...`, 'warning');
            }
        });

        // Evento CAPTURE_STARTED para mostrar número de intento
        this.adapter.on('CAPTURE_STARTED', (data) => {
            if (this.isProcessing) {
                const attemptNum = data.data?.attemptNumber || 1;
                const totalAttempts = data.data?.totalAttempts || 4;
                const currentMode = this.mode === 'verify' ? 'verify' : 'identify';
                this._updateStatus(currentMode, `Intento ${attemptNum}/${totalAttempts} - Coloque su dedo en el lector`, 'info');
            }
        });
    }

    /**
     * Cambiar entre tabs (Verify/Identify)
     */
    _switchTab(mode) {
        console.log(`[${this.componentId}] Cambiando a tab: ${mode}`);

        // Actualizar estado
        this.mode = mode;

        // Actualizar clases de tabs
        this.tabVerify.classList.toggle('active', mode === 'verify');
        this.tabIdentify.classList.toggle('active', mode === 'identify');

        // Mostrar/ocultar contenido
        this.contentVerify.classList.toggle('active', mode === 'verify');
        this.contentIdentify.classList.toggle('active', mode === 'identify');

        // Actualizar UI
        this._updateUI();

        // Actualizar mensaje de status según el tab activo
        if (mode === 'verify') {
            if (this.selectedUserId) {
                this._updateStatus('verify', `Listo para verificar: ${this.selectedUserId}`, 'info');
            } else {
                this._updateStatus('verify', 'Selecciona un usuario y presiona Verificar', 'info');
            }
        } else {
            this._updateStatus('identify', 'Presiona Identificar y coloca tu dedo', 'info');
        }
    }

    /**
     * Cargar usuarios disponibles
     */
    async _loadUsers() {
        try {
            this._updateStatus('verify', 'Cargando usuarios...', 'loading');

            const result = await this.adapter.getStoredFingerprints();

            if (result.ok && result.items) {
                // IMPORTANTE: Filtrar solo plantillas DP_REGISTRATION (las únicas válidas para verificación)
                this.availableUsers = result.items.filter(item => item.format === 'DP_REGISTRATION');

                const totalTemplates = result.items.length;
                const userCount = this.availableUsers.length;

                console.log(`[${this.componentId}] 📊 Total plantillas: ${totalTemplates}, Plantillas DP_REGISTRATION: ${userCount}`);

                // Actualizar lista desplegable
                this._updateUserList();

                // Actualizar contador en tab de Verificación
                this.userCount.textContent = userCount > 0
                    ? `${userCount} usuario${userCount !== 1 ? 's' : ''} disponible${userCount !== 1 ? 's' : ''}`
                    : 'No hay usuarios registrados';

                // Actualizar contador en tab de Identificación
                this.gallerySize.textContent = userCount > 0
                    ? `${userCount} usuario${userCount !== 1 ? 's' : ''} registrado${userCount !== 1 ? 's' : ''}`
                    : 'No hay usuarios registrados aún';

                if (userCount > 0) {
                    this._updateStatus('verify', `${userCount} usuarios disponibles (${totalTemplates} plantillas totales)`, 'success');
                } else {
                    this._updateStatus('verify', `No hay usuarios registrados (hay ${totalTemplates} plantillas de otros formatos)`, 'warning');
                }
            } else {
                this.availableUsers = [];
                this._updateUserList();

                // Actualizar ambos contadores con estado vacío
                this.userCount.textContent = 'No hay usuarios registrados';
                this.gallerySize.textContent = 'No hay usuarios registrados aún';

                this._updateStatus('verify', 'No hay usuarios registrados', 'warning');
            }

        } catch (error) {
            this._updateStatus('verify', `Error cargando usuarios: ${error.message}`, 'error');

            // En caso de error, mostrar mensaje en ambos contadores
            this.userCount.textContent = 'Error al cargar usuarios';
            this.gallerySize.textContent = 'Error al cargar usuarios';
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
            // IMPORTANTE: El backend retorna 'tag' en minúscula
            option.value = user.tag || user.Tag;
            option.textContent = user.tag || user.Tag || 'Usuario sin nombre';
            this.userSelect.appendChild(option);
        });

        // Restaurar selección anterior si es válida
        if (currentValue && this.availableUsers.some(u => (u.tag || u.Tag) === currentValue)) {
            this.userSelect.value = currentValue;
        }
    }

    /**
     * Manejar selección de usuario
     */
    _onUserSelect() {
        this.selectedUserId = this.userSelect.value;
        this._updateUI();

        if (this.selectedUserId) {
            this._updateStatus('verify', `Listo para verificar: ${this.selectedUserId}`, 'info');
        } else {
            this._updateStatus('verify', 'Selecciona un usuario y presiona Verificar', 'info');
        }
    }

    /**
     * Actualizar progreso de verificación
     */
    _updateVerifyProgress(current, total) {
        const percentage = Math.round((current / total) * 100);
        this.verifyCounter.textContent = `${current}/${total}`;
        this.verifyProgressBar.style.width = `${percentage}%`;
        this.verifyPercentage.textContent = `${percentage}%`;

        const indicators = this.verifySamples.querySelectorAll('.sample-indicator');
        indicators.forEach((indicator, index) => {
            indicator.classList.remove('captured', 'active');
            const attemptNum = index + 1;
            if (attemptNum <= current) {
                indicator.classList.add('captured');
            } else if (attemptNum === current + 1 && current < total) {
                indicator.classList.add('active');
            }
        });
    }

    /**
     * Actualizar progreso de identificación
     */
    _updateIdentifyProgress(current, total) {
        const percentage = Math.round((current / total) * 100);
        this.identifyCounter.textContent = `${current}/${total}`;
        this.identifyProgressBar.style.width = `${percentage}%`;
        this.identifyPercentage.textContent = `${percentage}%`;

        const indicators = this.identifySamples.querySelectorAll('.sample-indicator');
        indicators.forEach((indicator, index) => {
            indicator.classList.remove('captured', 'active');
            const attemptNum = index + 1;
            if (attemptNum <= current) {
                indicator.classList.add('captured');
            } else if (attemptNum === current + 1 && current < total) {
                indicator.classList.add('active');
            }
        });
    }

    /**
     * Verificación 1:1
     */
    async verify() {
        // Verificar que el lector esté encendido
        if (window.checkReaderOrWarn && !window.checkReaderOrWarn('verificar')) {
            this._updateStatus('verify', '⚠️ Enciende el lector primero desde ReaderControl', 'error');
            return;
        }

        if (!this.selectedUserId) {
            this._updateStatus('verify', 'Selecciona un usuario primero', 'error');
            return;
        }

        try {
            this.isProcessing = true;
            this._updateUI();

            // Mostrar progreso
            this.verifyProgress.style.display = 'block';
            this._updateVerifyProgress(0, 4);

            console.log(`[${this.componentId}] 🔍 Iniciando verificación para: ${this.selectedUserId}`);
            this._updateStatus('verify', `Verificando ${this.selectedUserId}...`, 'loading');

            // Llamar al backend con maxAttempts=4
            const result = await this.adapter.verifyFingerprint(this.selectedUserId, 4);

            console.log(`[${this.componentId}] 📥 Resultado de verificación:`, result);

            // Procesar resultado
            if (result.ok) {
                const attemptInfo = result.attempt ? ` en intento ${result.attempt}/${result.totalAttempts || 4}` : '';

                if (result.verified) {
                    this._updateStatus('verify', `✅ VERIFICADO: ${this.selectedUserId} (Score: ${result.score || 'N/A'})${attemptInfo}`, 'success');
                } else {
                    this._updateStatus('verify', `❌ NO COINCIDE: ${this.selectedUserId} (Score: ${result.score || 'N/A'}) después de ${result.totalAttempts || 4} intentos`, 'error');
                }

                // Emitir evento 'verified' para listeners externos
                this.emit('verified', {
                    userId: this.selectedUserId,
                    verified: result.verified,
                    score: result.score,
                    attempt: result.attempt,
                    result: result
                });
            } else {
                console.error(`[${this.componentId}] ❌ Verificación falló:`, result.error || result.msg);
                this._updateStatus('verify', result.error || result.msg || 'Error en verificación', 'error');
            }

            // Ocultar progreso después de 3 segundos
            setTimeout(() => {
                if (this.verifyProgress) {
                    this.verifyProgress.style.display = 'none';
                }
            }, 3000);

        } catch (error) {
            console.error(`[${this.componentId}] ❌ Excepción en verificación:`, error);
            this._updateStatus('verify', `❌ ${error.message}`, 'error');

            // Ocultar progreso en caso de error
            setTimeout(() => {
                if (this.verifyProgress) {
                    this.verifyProgress.style.display = 'none';
                }
            }, 3000);
        } finally {
            this.isProcessing = false;
            this._updateUI();
        }
    }

    /**
     * Identificación 1:N
     */
    async identify() {
        // Verificar que el lector esté encendido
        if (window.checkReaderOrWarn && !window.checkReaderOrWarn('identificar')) {
            this._updateStatus('identify', '⚠️ Enciende el lector primero desde ReaderControl', 'error');
            return;
        }

        try {
            this.isProcessing = true;
            this._updateUI();

            // Mostrar progreso
            this.identifyProgress.style.display = 'block';
            this._updateIdentifyProgress(0, 4);

            this._updateStatus('identify', `Buscando coincidencias en ${this.availableUsers.length} usuarios...`, 'loading');

            // Llamar al backend con maxAttempts=4
            const result = await this.adapter.identifyFingerprint(4);

            // Procesar resultado
            if (result.ok) {
                const attemptInfo = result.attempt ? ` en intento ${result.attempt}/${result.totalAttempts || 4}` : '';

                // IMPORTANTE: El backend retorna 'match' (no 'matched')
                if (result.match) {
                    const userId = result.bestTag || 'Usuario identificado';
                    const score = result.bestScore || 'N/A';
                    this._updateStatus('identify', `✅ IDENTIFICADO: ${userId} (Score: ${score})${attemptInfo}`, 'success');
                } else {
                    this._updateStatus('identify', `⚠️ No se encontraron coincidencias después de ${result.totalAttempts || 4} intentos`, 'warning');
                }

                // Emitir evento 'identified' para listeners externos
                this.emit('identified', {
                    matched: result.match,
                    userId: result.bestTag,
                    score: result.bestScore,
                    attempt: result.attempt,
                    result: result
                });
            } else {
                this._updateStatus('identify', result.msg || 'Error en identificación', 'error');
            }

            // Ocultar progreso después de 3 segundos
            setTimeout(() => {
                if (this.identifyProgress) {
                    this.identifyProgress.style.display = 'none';
                }
            }, 3000);

        } catch (error) {
            this._updateStatus('identify', `Error: ${error.message}`, 'error');

            // Ocultar progreso en caso de error
            setTimeout(() => {
                if (this.identifyProgress) {
                    this.identifyProgress.style.display = 'none';
                }
            }, 3000);
        } finally {
            this.isProcessing = false;
            this._updateUI();
        }
    }

    /**
     * Limpiar componente
     */
    clear() {
        // Limpiar estado
        this.selectedUserId = '';
        this.isProcessing = false;
        this.userSelect.value = '';

        // Limpiar imágenes de ambos tabs
        const imageContainerVerify = this.contentVerify.querySelector('.fingerprint-image');
        const imageContainerIdentify = this.contentIdentify.querySelector('.fingerprint-image');

        if (imageContainerVerify) {
            imageContainerVerify.innerHTML = '<div class="image-placeholder">🔒</div>';
        }

        if (imageContainerIdentify) {
            imageContainerIdentify.innerHTML = '<div class="image-placeholder">🔍</div>';
        }

        // Ocultar y resetear progreso
        if (this.verifyProgress) {
            this.verifyProgress.style.display = 'none';
            this._updateVerifyProgress(0, 4);
        }

        if (this.identifyProgress) {
            this.identifyProgress.style.display = 'none';
            this._updateIdentifyProgress(0, 4);
        }

        this._updateUI();

        // Actualizar status de ambos tabs
        this._updateStatus('verify', 'Selecciona un usuario y presiona Verificar', 'info');
        this._updateStatus('identify', 'Presiona Identificar y coloca tu dedo', 'info');
    }

    /**
     * Sobrescribir displayImage para mostrar en el tab activo
     * @param {string} imageBase64 - Imagen en base64
     */
    displayImage(imageBase64) {
        // Determinar qué tab está activo
        const activeTab = this.mode;

        // Obtener el contenedor de imagen correcto
        const imageContainer = activeTab === 'verify'
            ? this.contentVerify.querySelector('.fingerprint-image')
            : this.contentIdentify.querySelector('.fingerprint-image');

        if (!imageContainer) {
            console.warn(`[${this.componentId}] Image container not found for tab: ${activeTab}`);
            return;
        }

        imageContainer.innerHTML = `
            <img src="data:image/png;base64,${imageBase64}"
                 style="max-width: 100%; height: auto; border-radius: 8px;"
                 alt="Huella dactilar" />
        `;

        console.log(`[${this.componentId}] 🖼️ IMAGE DISPLAYED in ${activeTab} tab`);
    }

    /**
     * Actualizar status de un tab específico (verify o identify)
     * @param {string} tab - 'verify' o 'identify'
     * @param {string} message - Mensaje a mostrar
     * @param {string} type - Tipo: info, success, error, warning, loading
     */
    _updateStatus(tab, message, type = 'info') {
        // Determinar qué elemento de status actualizar
        const statusEl = tab === 'verify' ? this.statusVerify : this.statusIdentify;

        if (!statusEl) {
            console.warn(`[${this.componentId}] Status element not found for tab: ${tab}`);
            return;
        }

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

        console.log(`[${this.componentId}] [${tab.toUpperCase()}] 📊 STATUS: [${type.toUpperCase()}] ${message}`);

        // También enviar al log global
        this.addGlobalLog(`[${tab === 'verify' ? 'Verificación' : 'Identificación'}] ${message}`, type);
    }

    /**
     * Actualizar UI según estado y modo
     */
    _updateUI() {
        const isVerifyMode = this.mode === 'verify';

        // === BOTÓN VERIFICAR 1:1 ===
        if (isVerifyMode) {
            // Solo habilitar si hay usuario seleccionado y no está procesando
            this.btnVerify.disabled = this.isProcessing || !this.selectedUserId;

            // Actualizar contenido del botón
            if (this.isProcessing) {
                this.btnVerify.innerHTML = `
                    <span class="btn-icon">⏳</span>
                    <span class="btn-text">Verificando...</span>
                `;
            } else {
                this.btnVerify.innerHTML = `
                    <span class="btn-icon">✅</span>
                    <span class="btn-text">Verificar Usuario Seleccionado</span>
                `;
            }
        }

        // === BOTÓN IDENTIFICAR 1:N ===
        if (!isVerifyMode) {
            // Solo deshabilitar si está procesando
            this.btnIdentify.disabled = this.isProcessing;

            // Actualizar contenido del botón
            if (this.isProcessing) {
                this.btnIdentify.innerHTML = `
                    <span class="btn-icon">⏳</span>
                    <span class="btn-text">Buscando...</span>
                `;
            } else {
                this.btnIdentify.innerHTML = `
                    <span class="btn-icon">🔍</span>
                    <span class="btn-text">Buscar en Todos los Usuarios</span>
                `;
            }
        }

        // === CONTROLES COMUNES ===
        // Deshabilitar controles durante procesamiento
        this.btnRefresh.disabled = this.isProcessing;
        this.btnClear.disabled = this.isProcessing;
        this.userSelect.disabled = this.isProcessing;

        // Deshabilitar cambio de tabs durante procesamiento
        this.tabVerify.disabled = this.isProcessing;
        this.tabIdentify.disabled = this.isProcessing;

        // Aplicar estilo visual de disabled a tabs si están deshabilitados
        if (this.isProcessing) {
            this.tabVerify.style.opacity = '0.5';
            this.tabVerify.style.pointerEvents = 'none';
            this.tabIdentify.style.opacity = '0.5';
            this.tabIdentify.style.pointerEvents = 'none';
        } else {
            this.tabVerify.style.opacity = '';
            this.tabVerify.style.pointerEvents = '';
            this.tabIdentify.style.opacity = '';
            this.tabIdentify.style.pointerEvents = '';
        }
    }
}

// Registrar globalmente
window.VerificationControl = VerificationControl;
