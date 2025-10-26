/**
 * BiometricAdapter - Abstracción para comunicación backend-frontend
 * Funciona como un "enchufe universal" que permite intercambiar UIs sin afectar la lógica
 */
class BiometricAdapter {
    constructor() {
        this.eventSource = null;
        this.callbacks = new Map();
        this.isConnected = false;
    }

    /**
     * Conectar al backend via Server-Sent Events
     */
    async connect() {
        if (this.isConnected) return;

        return new Promise((resolve, reject) => {
            try {
                this.eventSource = new EventSource('/events');

                this.eventSource.onopen = () => {
                    this.isConnected = true;
                    console.log('[BiometricAdapter] Conectado al backend');
                    resolve(true);
                };

                this.eventSource.onmessage = (event) => {
                    this._handleBackendEvent(event);
                };

                this.eventSource.onerror = () => {
                    this.isConnected = false;
                    console.error('[BiometricAdapter] Error de conexión');
                    setTimeout(() => this.connect(), 3000); // Reconexión automática
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Realizar llamada API al backend
     */
    async apiCall(endpoint, data = null) {
        console.log(`[BiometricAdapter] 🌐 Iniciando llamada API: ${endpoint}`);
        console.log(`[BiometricAdapter] 📤 Payload:`, data || 'sin datos');

        try {
            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            };

            if (data) {
                options.body = JSON.stringify(data);
                console.log(`[BiometricAdapter] 📋 Body serializado:`, options.body);
            }

            console.log(`[BiometricAdapter] 🚀 Enviando request a ${endpoint}...`);
            const response = await fetch(endpoint, options);
            console.log(`[BiometricAdapter] 📡 Response recibido - Status: ${response.status} ${response.statusText}`);

            const result = await response.json();
            console.log(`[BiometricAdapter] 📥 Response JSON:`, result);

            if (!result.ok) {
                console.error(`[BiometricAdapter] ⚠️ API retornó error: ${result.error}`);
                throw new Error(result.error || 'Error en API');
            }

            console.log(`[BiometricAdapter] ✅ API call exitoso para ${endpoint}`);
            return result;
        } catch (error) {
            console.error(`[BiometricAdapter] ❌ Error en llamada API ${endpoint}:`, error);
            console.error(`[BiometricAdapter] 🔍 Tipo de error:`, error.constructor.name);
            console.error(`[BiometricAdapter] 💡 Es error de red:`, error instanceof TypeError);
            throw error;
        }
    }

    /**
     * Realizar llamada GET al backend
     */
    async apiGet(endpoint) {
        try {
            const response = await fetch(endpoint);
            const result = await response.json();

            if (!result.ok) {
                throw new Error(result.error || 'Error en API');
            }

            return result;
        } catch (error) {
            console.error(`[BiometricAdapter] Error en ${endpoint}:`, error);
            throw error;
        }
    }

    /**
     * Suscribirse a eventos específicos del backend
     */
    on(eventType, callback) {
        if (!this.callbacks.has(eventType)) {
            this.callbacks.set(eventType, []);
        }
        this.callbacks.get(eventType).push(callback);
    }

    /**
     * Desuscribirse de eventos
     */
    off(eventType, callback) {
        if (this.callbacks.has(eventType)) {
            const callbacks = this.callbacks.get(eventType);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Emitir evento personalizado
     */
    emit(eventType, data) {
        if (this.callbacks.has(eventType)) {
            this.callbacks.get(eventType).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[BiometricAdapter] Error en callback ${eventType}:`, error);
                }
            });
        }
    }

    /**
     * Manejar eventos del backend
     */
    _handleBackendEvent(event) {
        try {
            const data = JSON.parse(event.data);

            // Usar eventType como prioridad, luego evt
            const eventType = data.eventType || data.evt || 'unknown';

            console.log(`[BiometricAdapter] 📨 Evento recibido: ${eventType}`, data);

            // Emitir evento específico según el tipo
            this.emit(eventType, data);

            // También emitir evento genérico
            this.emit('*', data);

        } catch (error) {
            console.error('[BiometricAdapter] Error procesando evento:', error);
        }
    }

    /**
     * Desconectar del backend
     */
    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.isConnected = false;
            console.log('[BiometricAdapter] Desconectado del backend');
        }
    }

    // ========== MÉTODOS DE CONVENIENCIA PARA OPERACIONES COMUNES ==========

    /**
     * Inicializar lector biométrico
     */
    async initializeReader() {
        console.log('[BiometricAdapter] 🚀 Iniciando lector biométrico...');
        console.log('[BiometricAdapter] 📊 Estado actual - Conectado:', this.isConnected);

        try {
            console.log('[BiometricAdapter] 🔌 Inicializando lector...');
            const result = await this.apiCall('/api/init');
            console.log('[BiometricAdapter] ✅ Lector inicializado:', result);
            return result;
        } catch (error) {
            console.error('[BiometricAdapter] ❌ Error en inicialización:', error);
            console.error('[BiometricAdapter] 📋 Stack trace:', error.stack);
            throw error;
        }
    }

    /**
     * Apagar lector biométrico
     */
    async disposeReader() {
        console.log('[BiometricAdapter] Apagando lector...');
        try {
            const result = await this.apiCall('/api/dispose');
            console.log('[BiometricAdapter] Lector apagado');
            return result;
        } catch (error) {
            console.error('[BiometricAdapter] Error apagando lector:', error);
            throw error;
        }
    }

    /**
     * Capturar huella simple
     */
    async captureFingerprint() {
        console.log('[BiometricAdapter] Capturando huella...');
        try {
            return await this.apiCall('/api/single');
        } catch (error) {
            console.error('[BiometricAdapter] Error capturando huella:', error);
            throw error;
        }
    }

    /**
     * Enrolar nueva huella
     */
    async enrollFingerprint(userId) {
        console.log(`[BiometricAdapter] 👤 Iniciando enrollment para: ${userId}`);
        console.log('[BiometricAdapter] 📊 Estado conexión:', this.isConnected);

        try {
            console.log(`[BiometricAdapter] 📞 Llamando API /api/enroll`);
            const result = await this.apiCall('/api/enroll', { tag: userId });
            console.log(`[BiometricAdapter] ✅ Enrollment exitoso:`, result);
            return result;
        } catch (error) {
            console.error(`[BiometricAdapter] ❌ Error en enrollment:`, error);
            throw error;
        }
    }

    /**
     * Verificar huella
     */
    async verifyFingerprint(userId) {
        console.log(`[BiometricAdapter] 🔍 Verificación para: ${userId}`);
        try {
            return await this.apiCall('/api/verify', { tag: userId });
        } catch (error) {
            console.error('[BiometricAdapter] Error en verificación:', error);
            throw error;
        }
    }

    /**
     * Identificar huella 1:N
     */
    async identifyFingerprint() {
        console.log('[BiometricAdapter] 🔎 Identificación 1:N...');
        try {
            return await this.apiCall('/api/identify');
        } catch (error) {
            console.error('[BiometricAdapter] Error en identificación:', error);
            throw error;
        }
    }

    /**
     * Obtener huellas almacenadas
     */
    async getStoredFingerprints() {
        try {
            return await this.apiGet('/api/store');
        } catch (error) {
            console.error('[BiometricAdapter] Error obteniendo huellas almacenadas:', error);
            throw error;
        }
    }

    /**
     * Obtener información técnica del lector
     */
    async getReaderInfo() {
        try {
            return await this.apiGet('/api/reader-info');
        } catch (error) {
            console.error('[BiometricAdapter] Error obteniendo info del lector:', error);
            throw error;
        }
    }

    /**
     * Limpiar store de huellas
     */
    async clearStore() {
        try {
            const response = await fetch('/api/store', { method: 'DELETE' });
            return response.ok;
        } catch (error) {
            console.error('[BiometricAdapter] Error limpiando store:', error);
            throw error;
        }
    }
}

// Crear instancia global del adapter
window.BiometricAdapter = new BiometricAdapter();

// Auto-conectar al cargar
document.addEventListener('DOMContentLoaded', () => {
    window.BiometricAdapter.connect().catch(console.error);
});