/**
 * FingerprintAPI - Cliente JavaScript para gestión de plantillas biométricas
 * Permite fetch de plantillas desde APIs locales o externas
 */
class FingerprintAPI {
    constructor(config = {}) {
        this.localBaseUrl = config.localBaseUrl || 'http://localhost:8080/api';
        this.externalBaseUrl = config.externalBaseUrl || null;
        this.timeout = config.timeout || 30000;
        this.enableLogging = config.enableLogging !== false;
    }

    log(message, data = null) {
        if (this.enableLogging) {
            console.log(`[FingerprintAPI] ${message}`, data || '');
        }
    }

    error(message, error) {
        console.error(`[FingerprintAPI] ${message}`, error);
    }

    /**
     * Realiza una petición HTTP con timeout
     */
    async fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }

    /**
     * Enrola una nueva huella y genera el JSON de plantilla
     * @param {string} userId - ID del usuario
     * @param {object} options - Opciones de enrolamiento
     * @returns {Promise<object>} Resultado con templateJson en base64
     */
    async enrollWithTemplate(userId, options = {}) {
        this.log(`Enrolling fingerprint for user: ${userId}`);

        try {
            const result = await this.fetchWithTimeout(`${this.localBaseUrl}/enroll-with-template`, {
                method: 'POST',
                body: JSON.stringify({
                    userId,
                    timeoutMs: options.timeoutMs || 30000,
                    targetFarn: options.targetFarn || 21474,
                    maxRetriesPerSample: options.maxRetriesPerSample || 3,
                    maxSamples: options.maxSamples || 4
                })
            });

            if (result.ok) {
                this.log(`Enrollment successful for user: ${userId}`, {
                    filePath: result.filePath,
                    templateJsonLength: result.templateJson?.length || 0
                });
            }

            return result;
        } catch (error) {
            this.error('Enrollment failed:', error);
            throw error;
        }
    }

    /**
     * Obtiene la plantilla de un usuario en formato base64 JSON
     * @param {string} userId - ID del usuario
     * @param {string} source - 'local' o 'external'
     * @returns {Promise<object>} Plantilla en base64
     */
    async getTemplate(userId, source = 'local') {
        this.log(`Getting template for user: ${userId} from ${source}`);

        const baseUrl = source === 'external' && this.externalBaseUrl
            ? this.externalBaseUrl
            : this.localBaseUrl;

        try {
            const result = await this.fetchWithTimeout(`${baseUrl}/template/${userId}`, {
                method: 'GET'
            });

            if (result.ok) {
                this.log(`Template retrieved for user: ${userId}`, {
                    templateJsonLength: result.templateJson?.length || 0
                });
            }

            return result;
        } catch (error) {
            this.error('Failed to get template:', error);
            throw error;
        }
    }

    /**
     * Carga una plantilla en el store del lector de huellas
     * @param {string} templateJson - Plantilla en formato base64 JSON
     * @returns {Promise<object>} Resultado de la operación
     */
    async loadTemplateToStore(templateJson) {
        this.log('Loading template to fingerprint store');

        try {
            const result = await this.fetchWithTimeout(`${this.localBaseUrl}/template/load`, {
                method: 'POST',
                body: JSON.stringify({ templateJson })
            });

            if (result.ok) {
                this.log('Template loaded successfully to store');
            }

            return result;
        } catch (error) {
            this.error('Failed to load template to store:', error);
            throw error;
        }
    }

    /**
     * Guarda una plantilla en el sistema
     * @param {string} userId - ID del usuario
     * @param {string} templateJson - Plantilla en formato base64 JSON
     * @returns {Promise<object>} Resultado de la operación
     */
    async saveTemplate(userId, templateJson) {
        this.log(`Saving template for user: ${userId}`);

        try {
            const result = await this.fetchWithTimeout(`${this.localBaseUrl}/template/save`, {
                method: 'POST',
                body: JSON.stringify({ userId, templateJson })
            });

            if (result.ok) {
                this.log(`Template saved for user: ${userId}`);
            }

            return result;
        } catch (error) {
            this.error('Failed to save template:', error);
            throw error;
        }
    }

    /**
     * Lista todos los usuarios con plantillas almacenadas
     * @returns {Promise<object>} Lista de IDs de usuario
     */
    async listTemplates() {
        this.log('Listing all templates');

        try {
            const result = await this.fetchWithTimeout(`${this.localBaseUrl}/template/list`, {
                method: 'GET'
            });

            if (result.ok) {
                this.log(`Found ${result.count} templates`, result.userIds);
            }

            return result;
        } catch (error) {
            this.error('Failed to list templates:', error);
            throw error;
        }
    }

    /**
     * Elimina la plantilla de un usuario
     * @param {string} userId - ID del usuario
     * @returns {Promise<object>} Resultado de la operación
     */
    async deleteTemplate(userId) {
        this.log(`Deleting template for user: ${userId}`);

        try {
            const result = await this.fetchWithTimeout(`${this.localBaseUrl}/template/${userId}`, {
                method: 'DELETE'
            });

            if (result.ok) {
                this.log(`Template deleted for user: ${userId}`);
            }

            return result;
        } catch (error) {
            this.error('Failed to delete template:', error);
            throw error;
        }
    }

    /**
     * Limpia todas las plantillas
     * @returns {Promise<object>} Resultado de la operación
     */
    async clearAllTemplates() {
        this.log('Clearing all templates');

        try {
            const result = await this.fetchWithTimeout(`${this.localBaseUrl}/template/clear-all`, {
                method: 'DELETE'
            });

            if (result.ok) {
                this.log('All templates cleared');
            }

            return result;
        } catch (error) {
            this.error('Failed to clear templates:', error);
            throw error;
        }
    }

    /**
     * Flujo completo de enrolamiento con persistencia
     * @param {string} userId - ID del usuario
     * @param {object} options - Opciones de enrolamiento
     * @returns {Promise<object>} Resultado completo
     */
    async enrollAndSave(userId, options = {}) {
        this.log(`Starting enrollment and save flow for user: ${userId}`);

        try {
            // 1. Enrollar huella y obtener plantilla
            const enrollResult = await this.enrollWithTemplate(userId, options);

            if (!enrollResult.ok) {
                throw new Error(enrollResult.error || 'Enrollment failed');
            }

            this.log('Enrollment completed, template generated');

            return {
                ok: true,
                userId: enrollResult.userId,
                templateJson: enrollResult.templateJson,
                filePath: enrollResult.filePath,
                imageBase64: enrollResult.imageBase64
            };
        } catch (error) {
            this.error('Enrollment and save flow failed:', error);
            throw error;
        }
    }

    /**
     * Flujo completo de verificación con fetch de plantilla
     * @param {string} userId - ID del usuario a verificar
     * @param {string} source - 'local' o 'external'
     * @param {object} options - Opciones de verificación
     * @returns {Promise<object>} Resultado de verificación
     */
    async fetchAndVerify(userId, source = 'local', options = {}) {
        this.log(`Starting fetch and verify flow for user: ${userId}`);

        try {
            // 1. Obtener plantilla desde la fuente especificada
            const templateResult = await this.getTemplate(userId, source);

            if (!templateResult.ok) {
                throw new Error(templateResult.error || 'Failed to get template');
            }

            this.log('Template fetched successfully');

            // 2. Cargar plantilla en el store del lector
            const loadResult = await this.loadTemplateToStore(templateResult.templateJson);

            if (!loadResult.ok) {
                throw new Error(loadResult.error || 'Failed to load template to store');
            }

            this.log('Template loaded to store, ready for verification');

            // 3. Realizar verificación (usando el endpoint existente)
            const verifyResult = await this.fetchWithTimeout(`${this.localBaseUrl}/verify`, {
                method: 'POST',
                body: JSON.stringify({
                    tag: userId,
                    timeoutMs: options.timeoutMs || 15000,
                    targetFarn: options.targetFarn || 21474
                })
            });

            if (verifyResult.ok) {
                this.log(`Verification completed for user: ${userId}`, {
                    verified: verifyResult.verified,
                    score: verifyResult.score
                });
            }

            return verifyResult;
        } catch (error) {
            this.error('Fetch and verify flow failed:', error);
            throw error;
        }
    }

    /**
     * Decodifica un JSON base64 para inspección
     * @param {string} base64Json - JSON en base64
     * @returns {object} Objeto JavaScript decodificado
     */
    decodeTemplate(base64Json) {
        try {
            const jsonString = atob(base64Json);
            return JSON.parse(jsonString);
        } catch (error) {
            this.error('Failed to decode template:', error);
            throw error;
        }
    }

    /**
     * Codifica un objeto JavaScript a base64 JSON
     * @param {object} template - Objeto plantilla
     * @returns {string} JSON en base64
     */
    encodeTemplate(template) {
        try {
            const jsonString = JSON.stringify(template);
            return btoa(jsonString);
        } catch (error) {
            this.error('Failed to encode template:', error);
            throw error;
        }
    }
}

// Exportar para uso en navegador
if (typeof window !== 'undefined') {
    window.FingerprintAPI = FingerprintAPI;
}

// Exportar para uso en Node.js (si es necesario)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FingerprintAPI;
}
