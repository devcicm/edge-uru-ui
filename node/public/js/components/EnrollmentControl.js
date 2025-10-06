/**
 * EnrollmentControl - Componente para enrolamiento de huellas dactilares
 * Inspirado en DPCtlUruNet.EnrollmentControl del SDK DigitalPersona
 */
class EnrollmentControl extends BaseComponent {
    constructor(containerId, adapter, config = {}) {
        super(containerId, adapter, config);

        this.currentUserId = '';
        this.enrollmentState = 'idle'; // idle, enrolling, completed, error
        this.attemptCount = 0;
        this.sampleCount = 0;
        this.maxSamples = 4;

        this._setupEnrollmentUI();
        this._setupEnrollmentEvents();
    }

    /**
     * Crear estructura específica para enrolamiento
     */
    _createBaseStructure() {
        this.container.innerHTML = `
            <div class="enrollment-control">
                <div class="enrollment-header">
                    <h3 class="enrollment-title">📝 Enrolamiento de Huella</h3>
                    <div class="enrollment-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: 0%"></div>
                        </div>
                        <span class="progress-text">0/${this.maxSamples} muestras</span>
                    </div>
                </div>

                <div class="enrollment-display">
                    <div class="fingerprint-area">
                        <div class="fingerprint-placeholder">👤</div>
                    </div>
                </div>

                <div class="enrollment-inputs">
                    <div class="input-group">
                        <label for="userId">ID del Usuario:</label>
                        <input type="text" id="userId" placeholder="Ej: Usuario001" class="component-input">
                    </div>
                </div>

                <div class="enrollment-status component-status status-info">
                    Ingresa el ID del usuario y presiona "Iniciar Enrolamiento"
                </div>

                <div class="enrollment-buttons component-buttons">
                    <button class="btn-primary" id="startEnroll">Iniciar Enrolamiento</button>
                    <button class="btn-secondary" id="clearEnroll">Limpiar</button>
                    <button class="btn-danger" id="cancelEnroll" style="display: none;">Cancelar</button>
                </div>

                <div class="enrollment-instructions">
                    <div class="instruction-item">
                        <span class="instruction-icon">1️⃣</span>
                        <span class="instruction-text">Ingresa un ID único para el usuario</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">2️⃣</span>
                        <span class="instruction-text">Coloca el dedo cuando se solicite</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-icon">3️⃣</span>
                        <span class="instruction-text">Levanta y recoloca ${this.maxSamples} veces</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Configurar UI específica para enrolamiento
     */
    _setupEnrollmentUI() {
        // Referencias a elementos
        this.userIdInput = this.container.querySelector('#userId');
        this.startButton = this.container.querySelector('#startEnroll');
        this.clearButton = this.container.querySelector('#clearEnroll');
        this.cancelButton = this.container.querySelector('#cancelEnroll');
        this.statusElement = this.container.querySelector('.enrollment-status');
        this.progressBar = this.container.querySelector('.progress-fill');
        this.progressText = this.container.querySelector('.progress-text');
        this.fingerprintArea = this.container.querySelector('.fingerprint-area');

        // Eventos de botones
        this.startButton.onclick = () => this.startEnrollment();
        this.clearButton.onclick = () => this.clear();
        this.cancelButton.onclick = () => this.cancelEnrollment();

        // Validación en tiempo real del input
        this.userIdInput.oninput = () => this._validateInput();
    }

    /**
     * Configurar eventos específicos para enrolamiento
     */
    _setupEnrollmentEvents() {
        // Eventos del adapter específicos para enrolamiento
        this.adapter.on('attempt', (data) => this._handleAttempt(data));
        this.adapter.on('count', (data) => this._handleSampleCount(data));
        this.adapter.on('status', (data) => this._handleEnrollmentStatus(data));
    }

    /**
     * Iniciar proceso de enrolamiento
     */
    async startEnrollment() {
        const userId = this.userIdInput.value.trim();

        if (!userId) {
            this.showError('Debe ingresar un ID de usuario válido');
            this.userIdInput.focus();
            return;
        }

        try {
            this.enrollmentState = 'enrolling';
            this.currentUserId = userId;
            this.attemptCount = 0;
            this.sampleCount = 0;

            this._updateUI();
            this.showLoading('Iniciando enrolamiento...');

            const result = await this.adapter.enrollFingerprint(userId);

            if (result.ok && result.enrolled) {
                this.enrollmentState = 'completed';
                this.showSuccess(`Usuario ${userId} enrolado exitosamente`);
                this.emit('enrolled', { userId, result });

                // Limpiar después de 3 segundos
                setTimeout(() => this.clear(), 3000);
            } else {
                this.enrollmentState = 'error';
                this.showError(result.msg || 'Error en el enrolamiento');
            }

        } catch (error) {
            this.enrollmentState = 'error';
            this.showError(`Error: ${error.message}`);
        } finally {
            this._updateUI();
        }
    }

    /**
     * Cancelar enrolamiento
     */
    async cancelEnrollment() {
        this.enrollmentState = 'idle';
        this.currentUserId = '';
        this.attemptCount = 0;
        this.sampleCount = 0;

        this._updateUI();
        this.updateStatus('info', 'Enrolamiento cancelado');
    }

    /**
     * Limpiar componente
     */
    clear() {
        super.clear();

        this.enrollmentState = 'idle';
        this.currentUserId = '';
        this.attemptCount = 0;
        this.sampleCount = 0;

        this.userIdInput.value = '';
        this._updateProgress(0);
        this._updateUI();

        // Limpiar imagen
        this.fingerprintArea.innerHTML = '<div class="fingerprint-placeholder">👤</div>';

        this.updateStatus('info', 'Ingresa el ID del usuario y presiona "Iniciar Enrolamiento"');
    }

    /**
     * Manejar intento de captura
     */
    _handleAttempt(data) {
        this.attemptCount++;

        const success = data.ok;
        const reason = data.why || '';

        if (success) {
            this.updateStatus('success', `✅ Intento #${data.i}: Éxito`);
        } else {
            this.updateStatus('warning', `⚠️ Intento #${data.i}: ${reason}`);
        }

        this.emit('attempt', { attempt: data.i, success, reason });
    }

    /**
     * Manejar conteo de muestras
     */
    _handleSampleCount(data) {
        this.sampleCount = data.n;
        this._updateProgress(this.sampleCount);

        this.updateStatus('success', `✅ Muestras capturadas: ${this.sampleCount}/${this.maxSamples}`);
        this.emit('sampleCount', { count: this.sampleCount, total: this.maxSamples });
    }

    /**
     * Manejar estado de enrolamiento
     */
    _handleEnrollmentStatus(data) {
        if (data.msg && data.msg.includes('muestra')) {
            this.updateStatus('info', `👆 ${data.msg}`);
        }
    }

    /**
     * Actualizar barra de progreso
     */
    _updateProgress(samples) {
        const percentage = (samples / this.maxSamples) * 100;
        this.progressBar.style.width = `${percentage}%`;
        this.progressText.textContent = `${samples}/${this.maxSamples} muestras`;
    }

    /**
     * Validar entrada del usuario
     */
    _validateInput() {
        const isValid = this.userIdInput.value.trim().length > 0;
        this.startButton.disabled = !isValid || this.enrollmentState === 'enrolling';
    }

    /**
     * Actualizar UI según el estado
     */
    _updateUI() {
        const isEnrolling = this.enrollmentState === 'enrolling';

        this.startButton.style.display = isEnrolling ? 'none' : 'inline-block';
        this.cancelButton.style.display = isEnrolling ? 'inline-block' : 'none';

        this.userIdInput.disabled = isEnrolling;
        this.clearButton.disabled = isEnrolling;

        this._validateInput();
    }

    /**
     * Mostrar imagen específica para enrolamiento
     */
    displayImage(imageBase64) {
        this.fingerprintArea.innerHTML = `
            <img src="data:image/png;base64,${imageBase64}"
                 style="max-width: 100%; max-height: 100%; border-radius: 8px; object-fit: contain;"
                 alt="Huella en enrolamiento" />
        `;
    }

    /**
     * Obtener estado actual del enrolamiento
     */
    getEnrollmentState() {
        return {
            state: this.enrollmentState,
            userId: this.currentUserId,
            attemptCount: this.attemptCount,
            sampleCount: this.sampleCount,
            progress: (this.sampleCount / this.maxSamples) * 100
        };
    }

    /**
     * Configurar máximo de muestras
     */
    setMaxSamples(maxSamples) {
        this.maxSamples = maxSamples;
        this._updateProgress(this.sampleCount);

        // Actualizar instrucciones
        const instruction = this.container.querySelector('.instruction-item:nth-child(3) .instruction-text');
        if (instruction) {
            instruction.textContent = `Levanta y recoloca ${this.maxSamples} veces`;
        }
    }
}

// Registrar globalmente
window.EnrollmentControl = EnrollmentControl;