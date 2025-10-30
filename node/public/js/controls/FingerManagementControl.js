/**
 * FingerManagementControl - Control para gestión de huellas por dedo y mano
 *
 * Permite enrolar, verificar e identificar huellas específicas de cada dedo de cada mano
 * Tags con formato: userId_HAND_FINGER (ej: "juan_LEFT_THUMB")
 */
class FingerManagementControl extends BaseComponent {
    constructor(containerId, adapter, config = {}) {
        super(containerId, adapter, config);

        // Constantes
        this.HANDS = {
            LEFT: 'LEFT',
            RIGHT: 'RIGHT'
        };

        this.FINGERS = {
            THUMB: { name: 'THUMB', label: 'Pulgar', emoji: '👍' },
            INDEX: { name: 'INDEX', label: 'Índice', emoji: '☝️' },
            MIDDLE: { name: 'MIDDLE', label: 'Medio', emoji: '🖕' },
            RING: { name: 'RING', label: 'Anular', emoji: '💍' },
            PINKY: { name: 'PINKY', label: 'Meñique', emoji: '🤙' }
        };

        // Estado
        this.selectedUserId = '';
        this.selectedHand = 'LEFT';
        this.selectedFinger = 'INDEX';
        this.enrolledFingers = {}; // { userId: { LEFT: {THUMB: true, ...}, RIGHT: {...} } }
        this.isProcessing = false;

        // Cargar dedos enrolados
        this._loadEnrolledFingers();
    }

    /**
     * Crear estructura HTML
     */
    _createStructure() {
        this.container.innerHTML = `
            <div class="finger-management-control">
                <!-- Header -->
                <div class="component-header">
                    <h3>🖐️ Gestión de Dedos por Mano</h3>
                    <p class="component-subtitle">Haz clic en cualquier dedo para enrolar</p>
                </div>

                <!-- Selector de Usuario -->
                <div class="component-input-group">
                    <label><strong>Usuario:</strong></label>
                    <input type="text"
                           class="component-input"
                           id="fingerUserId-${this.containerId}"
                           placeholder="Ingrese ID de usuario para enrolar"
                           maxlength="50">
                </div>

                <!-- Visualización Interactiva de Manos (Estilo SDK DigitalPersona) -->
                <div id="handsVisualization-${this.containerId}" class="hands-visualization">
                    <!-- Se llenará dinámicamente con manos clickeables -->
                </div>

                <!-- Selectores de Mano y Dedo (Sincronizados con clic) -->
                <div class="selector-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                    <div class="component-input-group">
                        <label><strong>Mano Seleccionada:</strong></label>
                        <select class="component-input" id="fingerHand-${this.containerId}" disabled>
                            <option value="LEFT">👈 Izquierda</option>
                            <option value="RIGHT">👉 Derecha</option>
                        </select>
                    </div>

                    <div class="component-input-group">
                        <label><strong>Dedo Seleccionado:</strong></label>
                        <select class="component-input" id="fingerType-${this.containerId}" disabled>
                            <option value="THUMB">👍 Pulgar</option>
                            <option value="INDEX">☝️ Índice</option>
                            <option value="MIDDLE">🖕 Medio</option>
                            <option value="RING">💍 Anular</option>
                            <option value="PINKY">🤙 Meñique</option>
                        </select>
                    </div>
                </div>

                <!-- Imagen de huella -->
                <div class="fingerprint-image">
                    <div class="image-placeholder" id="fingerPlaceholder-${this.containerId}">🖐️</div>
                    <img id="fingerImage-${this.containerId}" alt="Huella" style="display: none;">
                </div>

                <!-- Progreso de enrolamiento -->
                <div class="enrollment-progress" id="fingerProgress-${this.containerId}" style="display: none;">
                    <div class="progress-header">
                        <span class="progress-label">Muestras del dedo</span>
                        <span class="progress-counter" id="fingerCounter-${this.containerId}">0/4</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" id="fingerProgressBar-${this.containerId}" style="width: 0%;">
                            <span class="progress-percentage" id="fingerPercentage-${this.containerId}">0%</span>
                        </div>
                    </div>
                    <div class="progress-samples" id="fingerSamples-${this.containerId}">
                        <span class="sample-indicator" data-sample="1">1</span>
                        <span class="sample-indicator" data-sample="2">2</span>
                        <span class="sample-indicator" data-sample="3">3</span>
                        <span class="sample-indicator" data-sample="4">4</span>
                    </div>
                </div>

                <!-- Estado -->
                <div class="component-status status-info" id="fingerStatus-${this.containerId}">
                    <span class="status-timestamp">[--:--:--]</span>
                    <span class="status-icon">ℹ️</span>
                    <span class="status-message">Selecciona usuario, mano y dedo para enrolar</span>
                </div>

                <!-- Botones de acción -->
                <div class="component-buttons">
                    <button class="btn-primary" id="btnEnrollAllFingers-${this.containerId}" style="font-size: 16px; font-weight: bold;">
                        🖐️ Enrolar TODOS los Dedos (10 Completos)
                    </button>
                    <button class="btn-success" id="btnVerifyFinger-${this.containerId}">
                        ✅ Verificar Dedo Seleccionado
                    </button>
                    <button class="btn-warning" id="btnIdentifyFinger-${this.containerId}">
                        🔍 Identificar Dedo (Buscar)
                    </button>
                    <button class="btn-secondary" id="btnRefreshFingers-${this.containerId}">
                        🔄 Refrescar Lista
                    </button>
                </div>

                <!-- Lista de dedos enrolados -->
                <div class="enrolled-fingers-list" id="enrolledList-${this.containerId}">
                    <h4>Dedos Enrolados</h4>
                    <div id="fingersListContent-${this.containerId}" style="max-height: 300px; overflow-y: auto;">
                        <p style="text-align: center; color: #6b7280;">No hay dedos enrolados</p>
                    </div>
                </div>

                <!-- Instrucciones (Estilo SDK DigitalPersona) -->
                <div class="component-instructions">
                    <div class="instruction-item">
                        <span class="instruction-number">1</span>
                        <span class="instruction-text">Ingresa ID de usuario arriba</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-number">2</span>
                        <span class="instruction-text"><strong>HAZ CLIC</strong> en cualquier dedo de las manos para enrolar</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-number">3</span>
                        <span class="instruction-text">Coloca el dedo 4 veces cuando se active la captura</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-number">4</span>
                        <span class="instruction-text">Dedos enrolados se marcarán en verde ✅</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Setup de eventos y referencias DOM
     */
    _setupDOM() {
        super._setupDOM();

        // Referencias
        this.userIdInput = this.container.querySelector(`#fingerUserId-${this.containerId}`);
        this.handSelect = this.container.querySelector(`#fingerHand-${this.containerId}`);
        this.fingerSelect = this.container.querySelector(`#fingerType-${this.containerId}`);
        this.handsVisualization = this.container.querySelector(`#handsVisualization-${this.containerId}`);
        this.fingerPlaceholder = this.container.querySelector(`#fingerPlaceholder-${this.containerId}`);
        this.fingerImage = this.container.querySelector(`#fingerImage-${this.containerId}`);
        this.fingerProgress = this.container.querySelector(`#fingerProgress-${this.containerId}`);
        this.fingerCounter = this.container.querySelector(`#fingerCounter-${this.containerId}`);
        this.fingerProgressBar = this.container.querySelector(`#fingerProgressBar-${this.containerId}`);
        this.fingerPercentage = this.container.querySelector(`#fingerPercentage-${this.containerId}`);
        this.fingerSamples = this.container.querySelector(`#fingerSamples-${this.containerId}`);
        this.statusElement = this.container.querySelector(`#fingerStatus-${this.containerId}`);
        this.enrolledListContent = this.container.querySelector(`#fingersListContent-${this.containerId}`);

        // Botones
        this.btnEnrollAll = this.container.querySelector(`#btnEnrollAllFingers-${this.containerId}`);
        this.btnVerify = this.container.querySelector(`#btnVerifyFinger-${this.containerId}`);
        this.btnIdentify = this.container.querySelector(`#btnIdentifyFinger-${this.containerId}`);
        this.btnRefresh = this.container.querySelector(`#btnRefreshFingers-${this.containerId}`);

        // Event listeners
        this.userIdInput.addEventListener('input', () => this._updateVisualization());

        // Los selectores ahora se actualizan automáticamente al hacer clic en dedos
        // (disabled, solo para visualización)

        this.btnEnrollAll.addEventListener('click', () => this.enrollAllFingers());
        this.btnVerify.addEventListener('click', () => this.verifyFinger());
        this.btnIdentify.addEventListener('click', () => this.identifyFinger());
        this.btnRefresh.addEventListener('click', () => this._loadEnrolledFingers());

        // Renderizar visualización inicial
        this._updateVisualization();
    }

    /**
     * Setup de eventos SSE
     */
    _setupEvents() {
        // Eventos de enrolamiento
        this.adapter.on('SAMPLE_COLLECTED', (data) => {
            if (this.isProcessing) {
                const sampleNum = data.data?.sampleNumber || data.sampleNumber || 1;
                this._updateProgress(sampleNum, 4);
                this._updateStatus('info', `✅ Muestra ${sampleNum}/4 capturada`);
            }
        });

        this.adapter.on('IMAGE_CAPTURED', (data) => {
            if (this.isProcessing) {
                const imageBase64 = data.data?.imageBase64 || data.imageBase64;
                if (imageBase64) {
                    this._showImage(imageBase64);
                }
            }
        });

        this.adapter.on('ENROLLMENT_COMPLETED', (data) => {
            if (this.isProcessing) {
                this._updateProgress(4, 4);
                this._updateStatus('success', '🎉 Dedo enrolado exitosamente');
                setTimeout(() => {
                    this.fingerProgress.style.display = 'none';
                    this._loadEnrolledFingers();
                }, 2000);
            }
        });

        this.adapter.on('ENROLLMENT_FAILED', (data) => {
            if (this.isProcessing) {
                this._updateStatus('error', `❌ ${data.message || 'Error en enrolamiento'}`);
                this.fingerProgress.style.display = 'none';
            }
        });
    }

    /**
     * Generar tag estructurado
     */
    _generateTag(userId, hand, finger) {
        return `${userId}_${hand}_${finger}`;
    }

    /**
     * Parsear tag estructurado
     */
    _parseTag(tag) {
        const parts = tag.split('_');
        if (parts.length >= 3) {
            return {
                userId: parts.slice(0, -2).join('_'),
                hand: parts[parts.length - 2],
                finger: parts[parts.length - 1]
            };
        }
        return null;
    }

    /**
     * Enrolar dedo específico
     */
    async enrollFinger() {
        const userId = this.userIdInput.value.trim();
        if (!userId) {
            this._updateStatus('error', '⚠️ Ingresa un ID de usuario');
            return;
        }

        const hand = this.handSelect.value;
        const finger = this.fingerSelect.value;
        const tag = this._generateTag(userId, hand, finger);

        try {
            this.isProcessing = true;
            this._updateStatus('info', `📝 Enrolando ${this.FINGERS[finger].label} de mano ${hand === 'LEFT' ? 'izquierda' : 'derecha'}...`);

            // Mostrar progreso
            this.fingerProgress.style.display = 'block';
            this._updateProgress(0, 4);

            console.log(`[FingerManagement] Enrolando: ${tag}`);
            const result = await this.adapter.enrollFingerprint(tag);
            console.log(`[FingerManagement] Resultado:`, result);

            if (result.ok) {
                this._updateStatus('success', `✅ ${this.FINGERS[finger].label} enrolado correctamente`);
                this.emit('fingerEnrolled', { userId, hand, finger, tag });
            } else {
                this._updateStatus('error', `❌ ${result.error || 'Error en enrolamiento'}`);
            }

        } catch (error) {
            console.error('[FingerManagement] Error:', error);
            this._updateStatus('error', `❌ ${error.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Verificar dedo específico
     */
    async verifyFinger() {
        const userId = this.userIdInput.value.trim();
        if (!userId) {
            this._updateStatus('error', '⚠️ Ingresa un ID de usuario');
            return;
        }

        const hand = this.handSelect.value;
        const finger = this.fingerSelect.value;
        const tag = this._generateTag(userId, hand, finger);

        try {
            this._updateStatus('info', `🔍 Verificando ${this.FINGERS[finger].label}...`);

            const result = await this.adapter.verifyFingerprint(tag, 4);
            console.log(`[FingerManagement] Verificación:`, result);

            if (result.ok) {
                if (result.verified) {
                    this._updateStatus('success', `✅ VERIFICADO: ${this.FINGERS[finger].label} de ${userId} (Score: ${result.score})`);
                } else {
                    this._updateStatus('error', `❌ NO COINCIDE: ${this.FINGERS[finger].label} (Score: ${result.score})`);
                }
                this.emit('fingerVerified', { userId, hand, finger, verified: result.verified, score: result.score });
            } else {
                this._updateStatus('error', `❌ ${result.error || 'Error en verificación'}`);
            }

        } catch (error) {
            console.error('[FingerManagement] Error:', error);
            this._updateStatus('error', `❌ ${error.message}`);
        }
    }

    /**
     * Identificar dedo (buscar en todos los dedos enrolados)
     */
    async identifyFinger() {
        try {
            this._updateStatus('info', '🔎 Identificando usuario y dedo... Coloca el dedo en el lector');

            const result = await this.adapter.identifyFingerprint(4);
            console.log(`[FingerManagement] Identificación resultado:`, result);

            if (result.ok && result.match) {
                const parsed = this._parseTag(result.bestTag);
                console.log(`[FingerManagement] Tag parseado:`, parsed);

                if (parsed) {
                    const handEmoji = parsed.hand === 'LEFT' ? '🫲' : '🫱';
                    const handLabel = parsed.hand === 'LEFT' ? 'Izquierda' : 'Derecha';
                    const fingerInfo = this.FINGERS[parsed.finger];
                    const fingerEmoji = fingerInfo?.emoji || '👆';
                    const fingerLabel = fingerInfo?.label || parsed.finger;

                    this._updateStatus('success',
                        `✅ IDENTIFICADO: ${parsed.userId} | ${fingerEmoji} ${fingerLabel} ${handEmoji} Mano ${handLabel} (Score: ${result.bestScore})`);

                    // Actualizar selectores para mostrar qué se identificó
                    this.handSelect.value = parsed.hand;
                    this.fingerSelect.value = parsed.finger;
                    this.userIdInput.value = parsed.userId;

                    // Actualizar visualización
                    this._updateVisualization();

                    this.emit('fingerIdentified', {
                        userId: parsed.userId,
                        hand: parsed.hand,
                        finger: parsed.finger,
                        score: result.bestScore
                    });
                } else {
                    console.warn('[FingerManagement] No se pudo parsear tag:', result.bestTag);
                    this._updateStatus('success', `✅ IDENTIFICADO: ${result.bestTag} (Score: ${result.bestScore})`);
                }
            } else {
                this._updateStatus('warning', '⚠️ No se encontró coincidencia - Ningún dedo enrolado coincide');
            }

        } catch (error) {
            console.error('[FingerManagement] Error en identificación:', error);
            this._updateStatus('error', `❌ Error: ${error.message}`);
        }
    }

    /**
     * Enrolar TODOS los dedos de un usuario (10 dedos completos)
     * Formato estructurado JSON para envío al backend
     */
    async enrollAllFingers() {
        const userId = this.userIdInput.value.trim();

        if (!userId) {
            this._updateStatus('error', '⚠️ Debes ingresar un ID de usuario primero');
            this.userIdInput.focus();
            return;
        }

        if (this.isProcessing) {
            this._updateStatus('warning', '⚠️ Operación en progreso, espera a que termine');
            return;
        }

        try {
            this.isProcessing = true;
            this._updateStatus('info', `📝 Iniciando enrolamiento completo de 10 dedos para: ${userId}`);

            // Estructura para almacenar todos los dedos
            const enrollmentData = {
                userId: userId,
                enrolledAt: new Date().toISOString(),
                hands: {
                    left: {
                        fingers: []
                    },
                    right: {
                        fingers: []
                    }
                }
            };

            // Orden de captura: Mano IZQUIERDA primero (5 dedos)
            const leftHand = ['THUMB', 'INDEX', 'MIDDLE', 'RING', 'PINKY'];
            const rightHand = ['THUMB', 'INDEX', 'MIDDLE', 'RING', 'PINKY'];

            // Capturar mano IZQUIERDA
            this._updateStatus('info', '🫲 Capturando Mano IZQUIERDA (5 dedos)...');

            for (const fingerType of leftHand) {
                const fingerInfo = this.FINGERS[fingerType];
                this._updateStatus('info', `🫲 ${fingerInfo.emoji} Coloca ${fingerInfo.label} IZQUIERDO en el lector (4 veces)`);

                const tag = this._generateTag(userId, 'LEFT', fingerType);
                this.fingerProgress.style.display = 'block';
                this._updateProgress(0, 4);

                const result = await this.adapter.enrollFingerprint(tag);

                if (result.ok) {
                    enrollmentData.hands.left.fingers.push({
                        type: fingerType,
                        label: fingerInfo.label,
                        emoji: fingerInfo.emoji,
                        tag: tag,
                        template: result.template || null,
                        hash: result.hash || null,
                        quality: result.quality || 0,
                        enrolledAt: new Date().toISOString()
                    });

                    this._updateStatus('success', `✅ ${fingerInfo.emoji} ${fingerInfo.label} IZQUIERDO enrolado`);
                } else {
                    throw new Error(`Error enrolando ${fingerInfo.label} izquierdo: ${result.error}`);
                }

                // Pequeña pausa entre dedos
                await this._sleep(1000);
            }

            // Capturar mano DERECHA
            this._updateStatus('info', '🫱 Capturando Mano DERECHA (5 dedos)...');

            for (const fingerType of rightHand) {
                const fingerInfo = this.FINGERS[fingerType];
                this._updateStatus('info', `🫱 ${fingerInfo.emoji} Coloca ${fingerInfo.label} DERECHO en el lector (4 veces)`);

                const tag = this._generateTag(userId, 'RIGHT', fingerType);
                this._updateProgress(0, 4);

                const result = await this.adapter.enrollFingerprint(tag);

                if (result.ok) {
                    enrollmentData.hands.right.fingers.push({
                        type: fingerType,
                        label: fingerInfo.label,
                        emoji: fingerInfo.emoji,
                        tag: tag,
                        template: result.template || null,
                        hash: result.hash || null,
                        quality: result.quality || 0,
                        enrolledAt: new Date().toISOString()
                    });

                    this._updateStatus('success', `✅ ${fingerInfo.emoji} ${fingerInfo.label} DERECHO enrolado`);
                } else {
                    throw new Error(`Error enrolando ${fingerInfo.label} derecho: ${result.error}`);
                }

                // Pequeña pausa entre dedos
                await this._sleep(1000);
            }

            // Enrolamiento completo exitoso
            this.fingerProgress.style.display = 'none';
            this._updateStatus('success', `🎉 ¡ENROLAMIENTO COMPLETO! 10 dedos enrolados para ${userId}`);

            // Emitir evento con estructura completa
            this.emit('allFingersEnrolled', enrollmentData);

            // Log de la estructura completa
            console.log('[FingerManagement] Estructura JSON completa:', JSON.stringify(enrollmentData, null, 2));

            // Recargar lista y visualización
            await this._loadEnrolledFingers();

            return enrollmentData;

        } catch (error) {
            console.error('[FingerManagement] Error en enrolamiento completo:', error);
            this._updateStatus('error', `❌ Error: ${error.message}`);
            this.fingerProgress.style.display = 'none';
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Helper: Sleep para pausas entre dedos
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cargar dedos enrolados del store
     */
    async _loadEnrolledFingers() {
        try {
            const result = await this.adapter.getStoredFingerprints();

            if (result.ok && result.data) {
                this.enrolledFingers = {};

                // Agrupar por usuario, mano y dedo
                result.data.forEach(item => {
                    const parsed = this._parseTag(item.tag);
                    if (parsed) {
                        if (!this.enrolledFingers[parsed.userId]) {
                            this.enrolledFingers[parsed.userId] = { LEFT: {}, RIGHT: {} };
                        }
                        this.enrolledFingers[parsed.userId][parsed.hand][parsed.finger] = true;
                    }
                });

                this._updateEnrolledList();
                this._updateVisualization();
            }

        } catch (error) {
            console.error('[FingerManagement] Error cargando dedos:', error);
        }
    }

    /**
     * Actualizar lista de dedos enrolados
     */
    _updateEnrolledList() {
        const users = Object.keys(this.enrolledFingers);

        if (users.length === 0) {
            this.enrolledListContent.innerHTML = '<p style="text-align: center; color: #6b7280;">No hay dedos enrolados</p>';
            return;
        }

        let html = '';
        users.forEach(userId => {
            const hands = this.enrolledFingers[userId];
            html += `<div style="margin-bottom: 15px; padding: 10px; background: #f9fafb; border-radius: 8px;">`;
            html += `<strong style="color: #374151;">👤 ${userId}</strong>`;

            ['LEFT', 'RIGHT'].forEach(hand => {
                const fingers = Object.keys(hands[hand]);
                if (fingers.length > 0) {
                    const handLabel = hand === 'LEFT' ? '👈 Izquierda' : '👉 Derecha';
                    html += `<div style="margin-top: 8px; margin-left: 10px;">`;
                    html += `<span style="font-weight: 500; color: #6b7280;">${handLabel}:</span> `;
                    fingers.forEach(finger => {
                        const fingerInfo = this.FINGERS[finger];
                        html += `<span style="margin-right: 8px;" title="${fingerInfo.label}">${fingerInfo.emoji}</span>`;
                    });
                    html += `</div>`;
                }
            });

            html += `</div>`;
        });

        this.enrolledListContent.innerHTML = html;
    }

    /**
     * Actualizar visualización de manos (Estilo SDK DigitalPersona)
     * SIEMPRE muestra las manos, incluso sin ID de usuario
     */
    _updateVisualization() {
        const userId = this.userIdInput.value.trim();

        // Obtener dedos enrolados del usuario (o vacío si no existe o no hay ID)
        const hands = userId && this.enrolledFingers[userId]
            ? this.enrolledFingers[userId]
            : { LEFT: {}, RIGHT: {} };

        let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0;">';

        // Instrucción clara
        if (!userId) {
            html += `<div style="grid-column: 1 / -1; text-align: center; padding: 15px; background: #fef3c7; border-radius: 10px; border: 2px solid #ca8a04; margin-bottom: 10px;">
                <p style="margin: 0; font-weight: 600; color: #92400e;">👆 Ingresa un ID de usuario arriba, luego haz clic en cualquier dedo para enrolar</p>
            </div>`;
        }

        // Mano Izquierda
        html += this._renderHand('LEFT', hands.LEFT, userId);

        // Mano Derecha
        html += this._renderHand('RIGHT', hands.RIGHT, userId);

        html += '</div>';

        this.handsVisualization.innerHTML = html;

        // Agregar event listeners a cada dedo después de renderizar
        this._attachFingerClickListeners();
    }

    /**
     * Renderizar una mano (Estilo SDK DigitalPersona - Clickeable)
     */
    _renderHand(hand, fingers, userId) {
        const handLabel = hand === 'LEFT' ? '👈 Mano Izquierda' : '👉 Mano Derecha';
        const handEmoji = hand === 'LEFT' ? '🫲' : '🫱';

        let html = `<div style="text-align: center; padding: 20px; background: #f9fafb; border-radius: 16px; border: 2px solid #e5e7eb;">`;
        html += `<h4 style="margin-bottom: 20px; color: #374151; font-size: 16px;">${handEmoji} ${handLabel}</h4>`;
        html += `<div style="display: flex; justify-content: center; gap: 10px;">`;

        // Renderizar los 5 dedos en orden
        Object.keys(this.FINGERS).forEach(fingerKey => {
            const finger = this.FINGERS[fingerKey];
            const isEnrolled = fingers[fingerKey];
            const bgColor = isEnrolled ? '#dcfce7' : '#fef3c7';
            const borderColor = isEnrolled ? '#16a34a' : '#ca8a04';
            const statusIcon = isEnrolled ? '✅' : '⭕';

            html += `<div
                class="finger-button"
                data-hand="${hand}"
                data-finger="${fingerKey}"
                style="
                    width: 55px;
                    height: 80px;
                    background: ${bgColor};
                    border: 3px solid ${borderColor};
                    border-radius: 10px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    font-size: 28px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    user-select: none;
                "
                title="Clic para enrolar: ${finger.label} - ${hand === 'LEFT' ? 'Izquierda' : 'Derecha'}\n${isEnrolled ? '✅ Ya enrolado' : '⭕ No enrolado'}">
                <span style="font-size: 32px;">${finger.emoji}</span>
                <span style="font-size: 12px; margin-top: 4px;">${statusIcon}</span>
                <span style="font-size: 8px; color: #6b7280; margin-top: 2px;">${finger.label.slice(0, 3)}</span>
            </div>`;
        });

        html += `</div></div>`;
        return html;
    }

    /**
     * Adjuntar event listeners a los dedos clickeables
     */
    _attachFingerClickListeners() {
        const fingerButtons = this.handsVisualization.querySelectorAll('.finger-button');

        fingerButtons.forEach(button => {
            // Efecto hover
            button.addEventListener('mouseenter', (e) => {
                e.target.style.transform = 'scale(1.1)';
                e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
            });

            button.addEventListener('mouseleave', (e) => {
                e.target.style.transform = 'scale(1)';
                e.target.style.boxShadow = 'none';
            });

            // Click para enrolar
            button.addEventListener('click', (e) => {
                const hand = e.currentTarget.dataset.hand;
                const finger = e.currentTarget.dataset.finger;
                this._onFingerClick(hand, finger);
            });
        });
    }

    /**
     * Manejar clic en un dedo (Estilo SDK DigitalPersona)
     */
    async _onFingerClick(hand, finger) {
        const userId = this.userIdInput.value.trim();

        if (!userId) {
            this._updateStatus('error', 'Debes ingresar un ID de usuario primero');
            this.userIdInput.focus();
            return;
        }

        if (this.isProcessing) {
            this._updateStatus('warning', 'Operación en progreso, espera a que termine');
            return;
        }

        // Actualizar selectores (solo visualización)
        this.selectedHand = hand;
        this.selectedFinger = finger;
        this.selectedUserId = userId;
        this.handSelect.value = hand;
        this.fingerSelect.value = finger;

        const fingerInfo = this.FINGERS[finger];
        const handInfo = hand === 'LEFT' ? 'Izquierda' : 'Derecha';

        this._updateStatus('info', `${fingerInfo.emoji} Enrolando: ${fingerInfo.label} - Mano ${handInfo}`);

        // Iniciar enrolamiento automáticamente
        await this.enrollFinger();
    }

    /**
     * Actualizar progreso de enrolamiento
     */
    _updateProgress(current, total) {
        const percentage = Math.round((current / total) * 100);
        this.fingerCounter.textContent = `${current}/${total}`;
        this.fingerProgressBar.style.width = `${percentage}%`;
        this.fingerPercentage.textContent = `${percentage}%`;

        // Actualizar indicadores
        const indicators = this.fingerSamples.querySelectorAll('.sample-indicator');
        indicators.forEach((indicator, index) => {
            if (index < current) {
                indicator.classList.add('collected');
            } else {
                indicator.classList.remove('collected');
            }
        });
    }

    /**
     * Mostrar imagen de huella
     */
    _showImage(imageBase64) {
        this.fingerImage.src = `data:image/png;base64,${imageBase64}`;
        this.fingerImage.style.display = 'block';
        this.fingerPlaceholder.style.display = 'none';
    }

    /**
     * Actualizar estado
     */
    _updateStatus(type, message) {
        const statusClasses = {
            info: 'status-info',
            success: 'status-success',
            error: 'status-error',
            warning: 'status-warning'
        };

        this.statusElement.className = `component-status ${statusClasses[type] || 'status-info'}`;
        this.statusElement.querySelector('.status-message').textContent = message;
        this.statusElement.querySelector('.status-timestamp').textContent =
            `[${new Date().toLocaleTimeString('es-ES')}]`;

        const icons = {
            info: 'ℹ️',
            success: '✅',
            error: '❌',
            warning: '⚠️'
        };
        this.statusElement.querySelector('.status-icon').textContent = icons[type] || 'ℹ️';
    }

    /**
     * Limpiar
     */
    clear() {
        super.clear();
        this.userIdInput.value = '';
        this.isProcessing = false;
        this.fingerProgress.style.display = 'none';
        this.fingerImage.style.display = 'none';
        this.fingerPlaceholder.style.display = 'block';
        this._updateStatus('info', 'Control limpiado');
    }
}

// Registrar componente
if (typeof window !== 'undefined') {
    window.FingerManagementControl = FingerManagementControl;
}
