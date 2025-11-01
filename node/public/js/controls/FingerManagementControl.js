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
        this.failedFingers = {}; // { userId: { LEFT: {THUMB: 'error msg', ...}, RIGHT: {...} } }
        this.isProcessing = false;
        this.isEnrollingAll = false; // Flag específico para enrollAllFingers

        // Renderizar visualización inicial (ahora que this.FINGERS está definido)
        this._updateVisualization();

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
                        <span class="instruction-text">Orden recomendado: 🫲 Mano Izquierda (1-5) → 🫱 Mano Derecha (6-10)</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-number">4</span>
                        <span class="instruction-text">Coloca el dedo 4 veces cuando se active la captura</span>
                    </div>
                    <div class="instruction-item">
                        <span class="instruction-number">5</span>
                        <span class="instruction-text">Dedos enrolados se marcarán en verde ✅</span>
                    </div>
                </div>
            </div>
        `;

        // IMPORTANTE: Configurar DOM y eventos después de renderizar HTML
        this._setupDOM();
        this._setupEvents();
    }

    /**
     * Setup de eventos y referencias DOM
     */
    _setupDOM() {
        // Referencias DOM
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

        // NO renderizar aquí - se hace al final del constructor
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

        // Evento de dedo enrolado durante enrollAllFingers (actualización en tiempo real)
        this.adapter.on('FINGER_ENROLLMENT_COMPLETED', (data) => {
            console.log('[FingerManagement] FINGER_ENROLLMENT_COMPLETED:', data);

            // Extraer tag del evento
            const tag = data.data?.tag || data.tag;
            if (!tag) return;

            // Parsear tag para obtener userId, hand, finger
            const parsed = this._parseTag(tag);
            if (!parsed) {
                console.warn('[FingerManagement] No se pudo parsear tag:', tag);
                return;
            }

            console.log('[FingerManagement] Actualizando visualización en tiempo real:', parsed);

            // Actualizar enrolledFingers inmediatamente
            if (!this.enrolledFingers[parsed.userId]) {
                this.enrolledFingers[parsed.userId] = { LEFT: {}, RIGHT: {} };
            }
            this.enrolledFingers[parsed.userId][parsed.hand][parsed.finger] = true;

            // Limpiar error si existía
            if (this.failedFingers[parsed.userId]?.[parsed.hand]?.[parsed.finger]) {
                delete this.failedFingers[parsed.userId][parsed.hand][parsed.finger];
            }

            // Actualizar visualización EN TIEMPO REAL ✅
            this._updateVisualization();
            this._updateEnrolledList();
        });

        // Evento de error en enrolamiento de dedo durante enrollAllFingers
        this.adapter.on('FINGER_ENROLLMENT_FAILED', (data) => {
            console.log('[FingerManagement] FINGER_ENROLLMENT_FAILED:', data);

            // Extraer información del evento
            const eventData = data.data || data;
            const tag = eventData.tag;
            const error = eventData.error || 'Error desconocido';

            if (!tag) return;

            // Parsear tag para obtener userId, hand, finger
            const parsed = this._parseTag(tag);
            if (!parsed) {
                console.warn('[FingerManagement] No se pudo parsear tag:', tag);
                return;
            }

            console.log('[FingerManagement] Dedo fallido:', parsed, 'Error:', error);

            // Registrar dedo fallido
            if (!this.failedFingers[parsed.userId]) {
                this.failedFingers[parsed.userId] = { LEFT: {}, RIGHT: {} };
            }
            this.failedFingers[parsed.userId][parsed.hand][parsed.finger] = error;

            // Actualizar visualización para mostrar error en ROJO ❌
            this._updateVisualization();

            // Mostrar mensaje de error en status
            const fingerInfo = this.FINGERS[parsed.finger];
            const fingerEmoji = fingerInfo?.emoji || '👆';
            const fingerLabel = fingerInfo?.label || parsed.finger;
            const handLabel = parsed.hand === 'LEFT' ? 'Izquierda' : 'Derecha';

            this._updateStatus('error',
                `❌ Error en ${fingerEmoji} ${fingerLabel} Mano ${handLabel}: ${error} - Haz clic en el dedo para reintentar`);
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
                    // Usar parsedTag si está disponible (desde backend)
                    if (result.parsedTag) {
                        const pt = result.parsedTag;
                        this._updateStatus('success',
                            `✅ VERIFICADO: ${pt.userId} | ${pt.fingerEmoji} ${pt.fingerLabel} ${pt.handEmoji} ${pt.handLabel} (Score: ${result.score})`);
                    } else {
                        this._updateStatus('success', `✅ VERIFICADO: ${this.FINGERS[finger].label} de ${userId} (Score: ${result.score})`);
                    }
                } else {
                    this._updateStatus('error', `❌ NO COINCIDE: ${this.FINGERS[finger].label} (Score: ${result.score})`);
                }
                this.emit('fingerVerified', { userId, hand, finger, verified: result.verified, score: result.score, parsedTag: result.parsedTag });
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
                // Usar parsedTag del backend si está disponible, sino parsear localmente
                const parsed = result.parsedTag || this._parseTag(result.bestTag);
                console.log(`[FingerManagement] Tag parseado:`, parsed);

                if (parsed) {
                    // Si viene del backend, usar directamente sus valores
                    const userId = parsed.userId;
                    const hand = parsed.hand;
                    const finger = parsed.finger;
                    const handEmoji = parsed.handEmoji || (hand === 'LEFT' ? '🫲' : '🫱');
                    const handLabel = parsed.handLabel || (hand === 'LEFT' ? 'Izquierda' : 'Derecha');
                    const fingerEmoji = parsed.fingerEmoji || this.FINGERS[finger]?.emoji || '👆';
                    const fingerLabel = parsed.fingerLabel || this.FINGERS[finger]?.label || finger;

                    this._updateStatus('success',
                        `✅ IDENTIFICADO: ${userId} | ${fingerEmoji} ${fingerLabel} ${handEmoji} Mano ${handLabel} (Score: ${result.bestScore})`);

                    // Actualizar selectores para mostrar qué se identificó
                    this.handSelect.value = hand;
                    this.fingerSelect.value = finger;
                    this.userIdInput.value = userId;

                    // Actualizar visualización
                    this._updateVisualization();

                    this.emit('fingerIdentified', {
                        userId,
                        hand,
                        finger,
                        score: result.bestScore,
                        parsedTag: parsed
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
     * El backend captura los 10 dedos y retorna estructura JSON organizada
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
            this.isEnrollingAll = true;
            this._updateStatus('info', `📝 Iniciando enrolamiento completo de 10 dedos para: ${userId}`);

            // ⚡ UNA SOLA LLAMADA AL BACKEND - El backend maneja toda la captura
            const result = await this.adapter.enrollAllFingers(userId);

            if (result.ok) {
                // Verificar si todos los dedos se enrolaron exitosamente
                if (result.allSuccess) {
                    this._updateStatus('success', `🎉 ¡ENROLAMIENTO COMPLETO! 10 dedos enrolados para ${userId}`);
                } else if (result.partialSuccess) {
                    const failedCount = result.failedCount || 0;
                    const successCount = result.successCount || 0;
                    this._updateStatus('warning',
                        `⚠️ ENROLAMIENTO PARCIAL: ${successCount}/10 dedos enrolados. ${failedCount} dedos fallaron. Haz clic en los dedos rojos para reintentar.`);
                } else {
                    this._updateStatus('error', `❌ Enrolamiento fallido: 0/10 dedos enrolados`);
                }

                // Emitir evento con estructura completa
                this.emit('allFingersEnrolled', result.data);

                // Log de la estructura completa
                console.log('[FingerManagement] Estructura JSON completa:', JSON.stringify(result.data, null, 2));
                if (result.failedFingers && result.failedFingers.length > 0) {
                    console.log('[FingerManagement] Dedos fallidos:', result.failedFingers);
                }

                // Recargar lista y visualización
                await this._loadEnrolledFingers();

                return result.data;
            } else {
                throw new Error(result.error || 'Error en enrolamiento completo');
            }

        } catch (error) {
            console.error('[FingerManagement] Error en enrolamiento completo:', error);
            this._updateStatus('error', `❌ Error: ${error.message}`);
            throw error;
        } finally {
            this.isProcessing = false;
            this.isEnrollingAll = false;
        }
    }

    /**
     * Cargar dedos enrolados del store
     */
    async _loadEnrolledFingers() {
        try {
            const result = await this.adapter.getStoredFingerprints();

            if (result.ok && result.items) {  // ← CORREGIDO: usar result.items
                this.enrolledFingers = {};

                // Agrupar por usuario, mano y dedo
                result.items.forEach(item => {
                    const parsed = this._parseTag(item.tag);
                    if (parsed) {
                        if (!this.enrolledFingers[parsed.userId]) {
                            this.enrolledFingers[parsed.userId] = { LEFT: {}, RIGHT: {} };
                        }
                        this.enrolledFingers[parsed.userId][parsed.hand][parsed.finger] = true;
                    }
                });

                console.log('[FingerManagement] Dedos cargados:', this.enrolledFingers);
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
        const orderOffset = hand === 'LEFT' ? 0 : 5; // Izquierda: 1-5, Derecha: 6-10

        let html = `<div style="text-align: center; padding: 20px; background: #f9fafb; border-radius: 16px; border: 2px solid #e5e7eb;">`;
        html += `<h4 style="margin-bottom: 20px; color: #374151; font-size: 16px;">${handEmoji} ${handLabel}</h4>`;
        html += `<div style="display: flex; justify-content: center; gap: 10px;">`;

        // Renderizar los 5 dedos en orden
        let fingerIndex = 0;
        Object.keys(this.FINGERS).forEach(fingerKey => {
            fingerIndex++;
            const captureOrder = orderOffset + fingerIndex; // Orden de captura: 1-10
            const finger = this.FINGERS[fingerKey];
            const isEnrolled = fingers[fingerKey];
            const hasFailed = this.failedFingers[userId]?.[hand]?.[fingerKey];

            // Determinar colores según estado
            let bgColor, borderColor, statusIcon, statusText;
            if (hasFailed) {
                // ROJO - Dedo con error
                bgColor = '#fee2e2';
                borderColor = '#dc2626';
                statusIcon = '❌';
                statusText = 'ERROR';
            } else if (isEnrolled) {
                // VERDE - Dedo enrolado
                bgColor = '#dcfce7';
                borderColor = '#16a34a';
                statusIcon = '✅';
                statusText = 'OK';
            } else {
                // AMARILLO - Dedo pendiente
                bgColor = '#fef3c7';
                borderColor = '#ca8a04';
                statusIcon = '⭕';
                statusText = 'Pendiente';
            }

            html += `<div
                class="finger-button"
                data-hand="${hand}"
                data-finger="${fingerKey}"
                style="
                    position: relative;
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
                title="Orden #${captureOrder} - ${finger.label} - ${hand === 'LEFT' ? 'Izquierda' : 'Derecha'}\n${hasFailed ? `❌ ERROR: ${hasFailed}\nClic para reintentar` : isEnrolled ? '✅ Ya enrolado' : '⭕ Clic para enrolar'}">
                <!-- Número de orden -->
                <span style="position: absolute; top: 2px; left: 4px; font-size: 10px; font-weight: bold; color: #6b7280; background: #fff; border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; border: 1px solid #e5e7eb;">${captureOrder}</span>
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
