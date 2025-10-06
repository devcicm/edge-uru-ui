/**
 * BiometricDTOs - TypeScript-like definitions for JavaScript
 * CEDDFA Architecture - Data Transfer Objects
 */

// ============================================================
// BASE DTO
// ============================================================

/**
 * @typedef {Object} BaseDto
 * @property {string} id - Unique identifier
 * @property {string} type - DTO type
 * @property {string} timestamp - ISO timestamp
 * @property {string} version - Version number
 */

// ============================================================
// EVENT DTOs
// ============================================================

/**
 * @typedef {Object} BiometricEventDto
 * @property {string} id
 * @property {string} type
 * @property {string} timestamp
 * @property {string} version
 * @property {string} eventType - Event type (STATUS, COUNT, ATTEMPT, IMAGE, CAPTURE)
 * @property {string} message - Event message
 * @property {Object} [data] - Additional event data
 * @property {string} severity - Severity level (INFO, WARNING, ERROR, SUCCESS)
 */

// ============================================================
// ENROLLMENT DTOs
// ============================================================

/**
 * @typedef {Object} EnrollmentRequest
 * @property {string} userId - User identifier
 * @property {number} [timeoutMs=30000] - Timeout in milliseconds
 * @property {number} [targetFarn=21474] - Target FARN value
 * @property {number} [maxRetriesPerSample=3] - Max retries per sample
 * @property {number} [maxSamples=4] - Maximum samples to collect
 */

/**
 * @typedef {Object} EnrollmentResponse
 * @property {boolean} success - Operation success
 * @property {string} userId - User identifier
 * @property {string} message - Result message
 * @property {string} [templateBase64] - Base64 encoded template
 * @property {string} [imageBase64] - Base64 encoded fingerprint image
 * @property {string} enrolledAt - Enrollment timestamp
 * @property {number} samplesCollected - Number of samples collected
 * @property {string} quality - Quality assessment
 */

// ============================================================
// VERIFICATION DTOs
// ============================================================

/**
 * @typedef {Object} VerificationRequest
 * @property {string} userId - User identifier to verify against
 * @property {number} [timeoutMs=15000] - Timeout in milliseconds
 * @property {number} [targetFarn=21474] - Target FARN value
 */

/**
 * @typedef {Object} VerificationResponse
 * @property {boolean} success - Operation success
 * @property {boolean} verified - Verification result
 * @property {string} userId - User identifier
 * @property {number} score - Match score
 * @property {number} threshold - Threshold used
 * @property {string} message - Result message
 * @property {string} [imageBase64] - Base64 encoded fingerprint image
 * @property {string} matchMethod - Match method used (VER, ANSI)
 */

// ============================================================
// IDENTIFICATION DTOs
// ============================================================

/**
 * @typedef {Object} MatchResult
 * @property {string} userId - Matched user ID
 * @property {number} score - Match score
 * @property {number} rank - Ranking position
 */

/**
 * @typedef {Object} IdentificationRequest
 * @property {number} [timeoutMs=12000] - Timeout in milliseconds
 * @property {number} [targetFarn=21474] - Target FARN value
 * @property {number} [topResults=5] - Number of top results to return
 */

/**
 * @typedef {Object} IdentificationResponse
 * @property {boolean} success - Operation success
 * @property {boolean} matched - Match found
 * @property {MatchResult} [bestMatch] - Best match result
 * @property {MatchResult[]} topMatches - Top match results
 * @property {string} message - Result message
 * @property {string} [imageBase64] - Base64 encoded fingerprint image
 * @property {number} gallerySize - Total gallery size
 * @property {string} galleryFormat - Gallery format used
 */

// ============================================================
// READER DTOs
// ============================================================

/**
 * @typedef {Object} ReaderCapabilities
 * @property {boolean} canCapture - Can capture fingerprints
 * @property {boolean} canStream - Can stream video
 * @property {boolean} canMatch - Can perform matching
 * @property {number[]} resolutions - Supported resolutions
 */

/**
 * @typedef {Object} ReaderStatus
 * @property {boolean} connected - Reader connected
 * @property {boolean} ready - Reader ready
 * @property {string} status - Status string
 * @property {string} model - Reader model
 * @property {string} serialNumber - Serial number
 * @property {ReaderCapabilities} [capabilities] - Reader capabilities
 */

// ============================================================
// API CLIENT - CEDDFA Architecture
// ============================================================

class BiometricApiClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
        this.eventSource = null;
        this.eventHandlers = new Map();
    }

    /**
     * Make API call
     * @private
     */
    async _call(endpoint, method = 'GET', body = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, options);
        return await response.json();
    }

    // ============================================================
    // V2 ENDPOINTS - CEDDFA
    // ============================================================

    /**
     * Enroll user with CEDDFA architecture
     * @param {EnrollmentRequest} request
     * @returns {Promise<EnrollmentResponse>}
     */
    async enrollV2(request) {
        return await this._call('/api/v2/enroll', 'POST', request);
    }

    /**
     * Verify user with CEDDFA architecture
     * @param {VerificationRequest} request
     * @returns {Promise<VerificationResponse>}
     */
    async verifyV2(request) {
        return await this._call('/api/v2/verify', 'POST', request);
    }

    /**
     * Identify user with CEDDFA architecture
     * @param {IdentificationRequest} request
     * @returns {Promise<IdentificationResponse>}
     */
    async identifyV2(request) {
        return await this._call('/api/v2/identify1n', 'POST', request);
    }

    /**
     * Get Event Bus statistics
     * @returns {Promise<Object>}
     */
    async getEventBusStats() {
        return await this._call('/api/v2/eventbus/stats', 'GET');
    }

    /**
     * Clear Event Bus history
     * @returns {Promise<Object>}
     */
    async clearEventHistory() {
        return await this._call('/api/v2/eventbus/history', 'DELETE');
    }

    // ============================================================
    // V1 ENDPOINTS - Compatibility
    // ============================================================

    async enroll(userId, timeoutMs = 30000, targetFarn = 21474) {
        return await this._call('/api/enroll', 'POST', {
            tag: userId,
            timeoutMs,
            targetFarn
        });
    }

    async verify(userId, timeoutMs = 15000, targetFarn = 21474) {
        return await this._call('/api/verify', 'POST', {
            tag: userId,
            timeoutMs,
            targetFarn
        });
    }

    async identify(timeoutMs = 12000, targetFarn = 21474, top = 5) {
        return await this._call('/api/identify1n', 'POST', {
            timeoutMs,
            targetFarn,
            top
        });
    }

    async getGallery() {
        return await this._call('/api/store', 'GET');
    }

    async clearGallery() {
        return await this._call('/api/store', 'DELETE');
    }

    // ============================================================
    // EVENT HANDLING - Server-Sent Events
    // ============================================================

    /**
     * Connect to SSE events
     * @param {string} [url='/events']
     */
    connectEvents(url = '/events') {
        if (this.eventSource) {
            this.eventSource.close();
        }

        this.eventSource = new EventSource(url);

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this._dispatchEvent(data);
            } catch (e) {
                console.error('[BiometricAPI] Error parsing event:', e);
            }
        };

        this.eventSource.onerror = (error) => {
            console.error('[BiometricAPI] SSE Error:', error);
            this._dispatchEvent({ evt: 'error', error });
        };

        console.log('[BiometricAPI] Connected to event stream');
    }

    /**
     * Disconnect from SSE events
     */
    disconnectEvents() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
            console.log('[BiometricAPI] Disconnected from event stream');
        }
    }

    /**
     * Subscribe to specific event type
     * @param {string} eventType - Event type to listen for
     * @param {Function} handler - Handler function
     */
    on(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    /**
     * Unsubscribe from event type
     * @param {string} eventType - Event type
     * @param {Function} handler - Handler to remove
     */
    off(eventType, handler) {
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Dispatch event to handlers
     * @private
     */
    _dispatchEvent(data) {
        const eventType = data.eventType || data.evt || 'unknown';

        // Call specific handlers
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (e) {
                    console.error(`[BiometricAPI] Error in handler for ${eventType}:`, e);
                }
            });
        }

        // Call wildcard handlers
        if (this.eventHandlers.has('*')) {
            const handlers = this.eventHandlers.get('*');
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (e) {
                    console.error('[BiometricAPI] Error in wildcard handler:', e);
                }
            });
        }
    }
}

// ============================================================
// EVENT TYPE CONSTANTS
// ============================================================

const BiometricEventTypes = {
    // Reader events
    READER_INITIALIZED: 'READER_INITIALIZED',
    READER_STATUS_CHANGED: 'READER_STATUS_CHANGED',
    READER_ERROR: 'READER_ERROR',

    // Capture events
    CAPTURE_STARTED: 'CAPTURE_STARTED',
    CAPTURE_PROGRESS: 'CAPTURE_PROGRESS',
    CAPTURE_COMPLETED: 'CAPTURE_COMPLETED',
    CAPTURE_FAILED: 'CAPTURE_FAILED',
    IMAGE_CAPTURED: 'IMAGE_CAPTURED',

    // Enrollment events
    ENROLLMENT_STARTED: 'ENROLLMENT_STARTED',
    ENROLLMENT_SAMPLE_COLLECTED: 'ENROLLMENT_SAMPLE_COLLECTED',
    ENROLLMENT_COMPLETED: 'ENROLLMENT_COMPLETED',
    ENROLLMENT_FAILED: 'ENROLLMENT_FAILED',

    // Verification events
    VERIFICATION_STARTED: 'VERIFICATION_STARTED',
    VERIFICATION_COMPLETED: 'VERIFICATION_COMPLETED',
    VERIFICATION_FAILED: 'VERIFICATION_FAILED',

    // Identification events
    IDENTIFICATION_STARTED: 'IDENTIFICATION_STARTED',
    IDENTIFICATION_COMPLETED: 'IDENTIFICATION_COMPLETED',
    IDENTIFICATION_FAILED: 'IDENTIFICATION_FAILED',

    // Gallery events
    GALLERY_UPDATED: 'GALLERY_UPDATED',
    GALLERY_CLEARED: 'GALLERY_CLEARED',
    USER_ENROLLED: 'USER_ENROLLED',
    USER_REMOVED: 'USER_REMOVED',

    // System events
    SYSTEM_STATUS: 'SYSTEM_STATUS',
    SYSTEM_ERROR: 'SYSTEM_ERROR'
};

// ============================================================
// EXPORT
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BiometricApiClient, BiometricEventTypes };
}
