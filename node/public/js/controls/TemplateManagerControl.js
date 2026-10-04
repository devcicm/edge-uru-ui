/**
 * TemplateManagerControl.js
 *
 * Control de gestión y administración de plantillas biométricas almacenadas.
 * Permite visualizar, buscar y gestionar las plantillas en TemplateStore.
 *
 * Funcionalidades:
 * - Listar todas las plantillas almacenadas
 * - Ver detalles de cada plantilla (tag, formato, hash, fecha)
 * - Eliminar todas las plantillas (con confirmación)
 * - Buscar y filtrar plantillas
 * - Estadísticas de almacenamiento
 * - Actualización automática en tiempo real
 *
 * Ubicación: js/controls/TemplateManagerControl.js
 * Arquitectura: EdgeUruBridgeCore
 */

class TemplateManagerControl extends BaseComponent {
    constructor(containerId, adapter, config = {}) {
        super(containerId, adapter, config);

        // Configuración
        this.autoRefresh = config.autoRefresh !== false; // Auto-refresh por defecto
        this.refreshInterval = config.refreshInterval || 5000; // 5 segundos
        this.showHash = config.showHash !== false; // Mostrar hash por defecto

        // Estado
        this.templates = [];
        this.filteredTemplates = [];
        this.searchTerm = '';
        this.sortBy = 'date'; // 'date', 'tag', 'size'
        this.sortOrder = 'desc'; // 'asc', 'desc'
        this.refreshTimer = null;

        // Referencias DOM
        this.refs = {
            searchInput: null,
            templateList: null,
            statsContainer: null,
            sortSelect: null,
            clearAllBtn: null,
            refreshBtn: null,
            autoRefreshToggle: null
        };

        // Inicializar UI
        this._createUI();
        this._setupEventListeners();

        // Cargar plantillas iniciales
        this.loadTemplates();

        // Escuchar eventos de enrolamiento para auto-refresh
        if (this.autoRefresh) {
            this._setupAutoRefresh();
        }

        console.log('[TemplateManagerControl] Inicializado', {
            containerId,
            autoRefresh: this.autoRefresh,
            refreshInterval: this.refreshInterval
        });
    }

    /**
     * Crear estructura de UI
     */
    _createUI() {
        this.container.innerHTML = `
            <div class="template-manager">
                <!-- Header con estadísticas -->
                <div class="manager-header">
                    <div class="stats-grid" id="statsContainer">
                        <div class="stat-card">
                            <span class="stat-label">Total Plantillas</span>
                            <span class="stat-value" id="totalTemplates">0</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-label">Espacio Usado</span>
                            <span class="stat-value" id="totalSize">0 KB</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-label">Última Actualización</span>
                            <span class="stat-value" id="lastUpdate">Nunca</span>
                        </div>
                    </div>
                </div>

                <!-- Barra de herramientas -->
                <div class="manager-toolbar">
                    <div class="search-box">
                        <input
                            type="text"
                            id="searchInput"
                            placeholder="🔍 Buscar por usuario..."
                            class="search-input"
                        />
                    </div>

                    <div class="toolbar-actions">
                        <select id="sortSelect" class="sort-select">
                            <option value="date-desc">📅 Más recientes</option>
                            <option value="date-asc">📅 Más antiguos</option>
                            <option value="tag-asc">🔤 A-Z</option>
                            <option value="tag-desc">🔤 Z-A</option>
                            <option value="size-desc">📦 Mayor tamaño</option>
                            <option value="size-asc">📦 Menor tamaño</option>
                        </select>

                        <button id="refreshBtn" class="btn-action" title="Actualizar lista">
                            🔄 Actualizar
                        </button>

                        <label class="toggle-label">
                            <input type="checkbox" id="autoRefreshToggle" checked />
                            <span>Auto-refresh</span>
                        </label>

                        <button id="clearAllBtn" class="btn-danger" title="Eliminar todas las plantillas">
                            🗑️ Limpiar Todo
                        </button>
                    </div>
                </div>

                <!-- Lista de plantillas -->
                <div class="template-list" id="templateList">
                    <div class="loading-message">
                        Cargando plantillas...
                    </div>
                </div>

                <!-- Status del componente -->
                <div class="component-status" id="componentStatus">
                    Listo
                </div>
            </div>
        `;

        // Guardar referencias
        this.refs.searchInput = this.container.querySelector('#searchInput');
        this.refs.templateList = this.container.querySelector('#templateList');
        this.refs.statsContainer = this.container.querySelector('#statsContainer');
        this.refs.sortSelect = this.container.querySelector('#sortSelect');
        this.refs.clearAllBtn = this.container.querySelector('#clearAllBtn');
        this.refs.refreshBtn = this.container.querySelector('#refreshBtn');
        this.refs.autoRefreshToggle = this.container.querySelector('#autoRefreshToggle');

        this._applyStyles();
    }

    /**
     * Aplicar estilos CSS al componente
     */
    _applyStyles() {
        const styles = `
            <style>
                .template-manager {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    font-family: 'Segoe UI', sans-serif;
                }

                .manager-header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 10px;
                    padding: 20px;
                    color: white;
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 15px;
                }

                .stat-card {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 8px;
                    padding: 15px;
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }

                .stat-label {
                    font-size: 0.85rem;
                    opacity: 0.9;
                    font-weight: 500;
                }

                .stat-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                }

                .manager-toolbar {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                    align-items: center;
                }

                .search-box {
                    flex: 1;
                    min-width: 200px;
                }

                .search-input {
                    width: 100%;
                    padding: 10px 15px;
                    border: 2px solid #e5e7eb;
                    border-radius: 8px;
                    font-size: 0.95rem;
                    transition: border-color 0.3s;
                }

                .search-input:focus {
                    outline: none;
                    border-color: #667eea;
                }

                .toolbar-actions {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                    align-items: center;
                }

                .sort-select {
                    padding: 10px 15px;
                    border: 2px solid #e5e7eb;
                    border-radius: 8px;
                    font-size: 0.95rem;
                    cursor: pointer;
                    background: white;
                }

                .btn-action, .btn-danger {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                    font-size: 0.95rem;
                }

                .btn-action {
                    background: linear-gradient(135deg, #4fd1c7, #06b6d4);
                    color: white;
                }

                .btn-action:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(6, 182, 212, 0.3);
                }

                .btn-danger {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    color: white;
                }

                .btn-danger:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(239, 68, 68, 0.3);
                }

                .toggle-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    user-select: none;
                    font-size: 0.95rem;
                    color: #6b7280;
                }

                .toggle-label input[type="checkbox"] {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                }

                .template-list {
                    max-height: 500px;
                    overflow-y: auto;
                    border: 2px solid #e5e7eb;
                    border-radius: 10px;
                    background: #f9fafb;
                }

                .template-item {
                    background: white;
                    border-bottom: 1px solid #e5e7eb;
                    padding: 15px 20px;
                    transition: background 0.2s;
                    cursor: pointer;
                }

                .template-item:hover {
                    background: #f3f4f6;
                }

                .template-item:last-child {
                    border-bottom: none;
                }

                .template-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }

                .template-tag {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #1f2933;
                }

                .template-date {
                    font-size: 0.85rem;
                    color: #6b7280;
                }

                .template-details {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 10px;
                    font-size: 0.9rem;
                    color: #4b5563;
                }

                .detail-item {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                }

                .detail-label {
                    font-weight: 600;
                    font-size: 0.8rem;
                    text-transform: uppercase;
                    color: #6b7280;
                }

                .detail-value {
                    font-family: 'Courier New', monospace;
                    font-size: 0.85rem;
                    color: #1f2933;
                }

                .loading-message, .empty-message {
                    text-align: center;
                    padding: 40px 20px;
                    color: #6b7280;
                    font-size: 1rem;
                }

                .component-status {
                    text-align: center;
                    padding: 10px;
                    background: #f3f4f6;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    color: #6b7280;
                }

                @media (max-width: 768px) {
                    .manager-toolbar {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .toolbar-actions {
                        flex-direction: column;
                    }

                    .btn-action, .btn-danger {
                        width: 100%;
                    }
                }
            </style>
        `;

        // Insertar estilos
        this.container.insertAdjacentHTML('afterbegin', styles);
    }

    /**
     * Configurar event listeners
     */
    _setupEventListeners() {
        // Búsqueda
        this.refs.searchInput.addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this._filterAndRenderTemplates();
        });

        // Ordenamiento
        this.refs.sortSelect.addEventListener('change', (e) => {
            const [sortBy, sortOrder] = e.target.value.split('-');
            this.sortBy = sortBy;
            this.sortOrder = sortOrder;
            this._filterAndRenderTemplates();
        });

        // Actualizar manualmente
        this.refs.refreshBtn.addEventListener('click', () => {
            this.loadTemplates();
        });

        // Auto-refresh toggle
        this.refs.autoRefreshToggle.addEventListener('change', (e) => {
            this.autoRefresh = e.target.checked;
            if (this.autoRefresh) {
                this._startAutoRefresh();
            } else {
                this._stopAutoRefresh();
            }
        });

        // Limpiar todas las plantillas
        this.refs.clearAllBtn.addEventListener('click', () => {
            this.clearAllTemplates();
        });
    }

    /**
     * Configurar auto-refresh en tiempo real
     */
    _setupAutoRefresh() {
        // Escuchar evento de enrolamiento completado
        this.adapter.on('USER_ENROLLED', () => {
            console.log('[TemplateManagerControl] Nuevo usuario enrolado, actualizando lista...');
            setTimeout(() => this.loadTemplates(), 500); // Delay para asegurar que se guardó
        });

        // Escuchar evento de limpieza de almacenamiento
        this.adapter.on('STORE_CLEARED', () => {
            console.log('[TemplateManagerControl] Almacenamiento limpiado, actualizando lista...');
            this.loadTemplates();
        });

        // Iniciar polling automático
        this._startAutoRefresh();
    }

    /**
     * Iniciar auto-refresh periódico
     */
    _startAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }

        this.refreshTimer = setInterval(() => {
            this.loadTemplates(true); // Silent refresh
        }, this.refreshInterval);

        console.log('[TemplateManagerControl] Auto-refresh iniciado cada', this.refreshInterval, 'ms');
    }

    /**
     * Detener auto-refresh
     */
    _stopAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }

        console.log('[TemplateManagerControl] Auto-refresh detenido');
    }

    /**
     * Cargar plantillas desde el backend con validaciones robustas
     */
    async loadTemplates(silent = false) {
        try {
            if (!silent) {
                this._updateStatus('Cargando plantillas...');
            }

            console.log('[TemplateManagerControl] 🔄 Solicitando plantillas al backend...');

            // Usar método específico del adapter para obtener plantillas
            const response = await this.adapter.getStoredFingerprints();

            console.log('[TemplateManagerControl] 📥 Respuesta recibida:', response);

            // ===== VALIDACIÓN 1: Verificar que la respuesta existe =====
            if (!response) {
                throw new Error('Respuesta del servidor es null o undefined');
            }

            // ===== VALIDACIÓN 2: Verificar que la respuesta sea exitosa =====
            if (!response.ok) {
                const errorMsg = response.error || response.message || 'Error desconocido al cargar plantillas';
                throw new Error(errorMsg);
            }

            // ===== VALIDACIÓN 3: Verificar y normalizar el array de items =====
            let items = response.items;

            // Si items es null, undefined, o no es un array, usar array vacío
            if (!items || !Array.isArray(items)) {
                console.warn('[TemplateManagerControl] ⚠️ Items no es un array válido, usando array vacío. Items recibido:', items);
                items = [];
            }

            // ===== VALIDACIÓN 4: Verificar que count coincida con items.length =====
            const receivedCount = response.count;
            const actualCount = items.length;

            if (receivedCount !== undefined && receivedCount !== actualCount) {
                console.warn(`[TemplateManagerControl] ⚠️ Discrepancia en count. Backend reporta: ${receivedCount}, Array tiene: ${actualCount}`);
            }

            // Asignar plantillas validadas
            this.templates = items;
            this.filteredTemplates = [...this.templates];

            console.log('[TemplateManagerControl] ✅ Plantillas cargadas correctamente:', this.templates.length);

            // ===== ACTUALIZAR ESTADÍSTICAS (siempre, incluso con 0 plantillas) =====
            this._updateStats();

            // ===== RENDERIZAR LISTA =====
            this._filterAndRenderTemplates();

            // ===== ACTUALIZAR STATUS =====
            if (!silent) {
                if (this.templates.length === 0) {
                    this._updateStatus('📭 No hay plantillas almacenadas');
                } else {
                    this._updateStatus(`✅ ${this.templates.length} plantillas cargadas`);
                }
            }

            // ===== EMITIR EVENTO =====
            this.emit('templatesLoaded', {
                count: this.templates.length,
                isEmpty: this.templates.length === 0
            });

        } catch (error) {
            console.error('[TemplateManagerControl] ❌ Error cargando plantillas:', error);
            console.error('[TemplateManagerControl] 📋 Stack trace:', error.stack);

            // Inicializar con arrays vacíos en caso de error
            this.templates = [];
            this.filteredTemplates = [];

            // Actualizar estadísticas con 0 plantillas
            this._updateStats();

            // Mostrar error en UI
            this._updateStatus(`❌ Error: ${escapeHtml(error.message)}`, 'error');

            // Mostrar mensaje de error en la lista
            if (this.refs.templateList) {
                this.refs.templateList.innerHTML = `
                    <div class="empty-message" style="color: #ef4444;">
                        ❌ Error al cargar plantillas
                        <br><br>
                        <strong>Detalle:</strong> ${escapeHtml(error.message)}
                        <br><br>
                        <button id="retry-load-templates-btn"
                                style="padding: 8px 16px; border-radius: 6px; border: none;
                                       background: #ef4444; color: white; cursor: pointer;">
                            🔄 Reintentar
                        </button>
                    </div>
                `;
                const retryBtn = this.refs.templateList.querySelector('#retry-load-templates-btn');
                if (retryBtn) retryBtn.addEventListener('click', () => this.loadTemplates());
            }

            // Emitir evento de error
            this.emit('templatesLoadError', {
                error: error.message,
                count: 0
            });
        }
    }

    /**
     * Actualizar estadísticas
     */
    _updateStats() {
        const totalTemplates = this.templates.length;
        const totalBytes = this.templates.reduce((sum, t) => sum + (t.bytes || 0), 0);
        const totalKB = (totalBytes / 1024).toFixed(2);

        const lastTemplate = this.templates.length > 0
            ? this._formatDate(this.templates[0].utc)
            : 'Nunca';

        // Actualizar DOM
        this.container.querySelector('#totalTemplates').textContent = totalTemplates;
        this.container.querySelector('#totalSize').textContent = `${totalKB} KB`;
        this.container.querySelector('#lastUpdate').textContent = lastTemplate;
    }

    /**
     * Filtrar y renderizar plantillas
     */
    _filterAndRenderTemplates() {
        // Filtrar por búsqueda
        this.filteredTemplates = this.templates.filter(t =>
            t.tag.toLowerCase().includes(this.searchTerm)
        );

        // Ordenar
        this.filteredTemplates.sort((a, b) => {
            let comparison = 0;

            switch (this.sortBy) {
                case 'date':
                    comparison = new Date(a.utc) - new Date(b.utc);
                    break;
                case 'tag':
                    comparison = a.tag.localeCompare(b.tag);
                    break;
                case 'size':
                    comparison = (a.bytes || 0) - (b.bytes || 0);
                    break;
            }

            return this.sortOrder === 'asc' ? comparison : -comparison;
        });

        // Renderizar
        this._renderTemplates();
    }

    /**
     * Renderizar lista de plantillas
     */
    _renderTemplates() {
        if (this.filteredTemplates.length === 0) {
            this.refs.templateList.innerHTML = `
                <div class="empty-message">
                    ${this.searchTerm
                        ? `🔍 No se encontraron plantillas para "${this.searchTerm}"`
                        : '📭 No hay plantillas almacenadas'
                    }
                </div>
            `;
            return;
        }

        const html = this.filteredTemplates.map(template => this._renderTemplateItem(template)).join('');
        this.refs.templateList.innerHTML = html;
    }

    /**
     * Renderizar un item de plantilla
     */
    _renderTemplateItem(template) {
        const date = this._formatDate(template.utc);
        const sizeKB = ((template.bytes || 0) / 1024).toFixed(2);
        const hashShort = template.sha1 ? template.sha1.substring(0, 16) + '...' : 'N/A';

        return `
            <div class="template-item" data-tag="${escapeHtml(template.tag)}">
                <div class="template-header">
                    <span class="template-tag">👤 ${escapeHtml(template.tag)}</span>
                    <span class="template-date">${date}</span>
                </div>
                <div class="template-details">
                    <div class="detail-item">
                        <span class="detail-label">Formato</span>
                        <span class="detail-value">${template.format || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Tamaño</span>
                        <span class="detail-value">${sizeKB} KB</span>
                    </div>
                    ${this.showHash ? `
                        <div class="detail-item">
                            <span class="detail-label">SHA-1</span>
                            <span class="detail-value">${hashShort}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Formatear fecha
     */
    _formatDate(utcString) {
        if (!utcString) return 'N/A';

        try {
            const date = new Date(utcString);
            return date.toLocaleString('es-ES', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return utcString;
        }
    }

    /**
     * Limpiar todas las plantillas con validaciones robustas
     */
    async clearAllTemplates() {
        const count = this.templates.length;

        // Validación: No hay nada que eliminar
        if (count === 0) {
            alert('📭 No hay plantillas para eliminar\n\nEl almacenamiento ya está vacío.');
            return;
        }

        // Confirmación del usuario
        const confirmed = confirm(
            `⚠️ ¿Está seguro de eliminar TODAS las ${count} plantillas?\n\n` +
            `Esta acción no se puede deshacer.\n\n` +
            `Se eliminarán los siguientes usuarios:\n` +
            this.templates.slice(0, 5).map(t => `  • ${t.tag}`).join('\n') +
            (count > 5 ? `\n  ... y ${count - 5} más` : '')
        );

        if (!confirmed) {
            console.log('[TemplateManagerControl] Eliminación cancelada por el usuario');
            return;
        }

        try {
            this._updateStatus('Eliminando plantillas...');
            console.log('[TemplateManagerControl] 🗑️ Eliminando todas las plantillas...');

            // Usar método específico del adapter para limpiar store
            const success = await this.adapter.clearStore();

            console.log('[TemplateManagerControl] 📥 Respuesta de clearStore:', success);

            // ===== VALIDACIÓN: Verificar que la operación fue exitosa =====
            if (!success) {
                throw new Error('El servidor no pudo eliminar las plantillas (retornó false)');
            }

            console.log('[TemplateManagerControl] ✅ Plantillas eliminadas exitosamente');
            this._updateStatus('✅ Todas las plantillas eliminadas', 'success');

            // Recargar lista para reflejar el cambio
            await this.loadTemplates();

            // Emitir evento con información de la operación
            this.emit('templatesCleared', {
                count: count,
                timestamp: new Date().toISOString()
            });

            // Mostrar notificación al usuario
            console.log(`[TemplateManagerControl] 🎉 ${count} plantillas eliminadas del almacenamiento`);

        } catch (error) {
            console.error('[TemplateManagerControl] ❌ Error eliminando plantillas:', error);
            console.error('[TemplateManagerControl] 📋 Stack trace:', error.stack);

            // Actualizar estado con error
            this._updateStatus(`❌ Error: ${escapeHtml(error.message)}`, 'error');

            // Mostrar alerta al usuario con más detalle
            alert(
                `❌ Error al eliminar plantillas\n\n` +
                `Detalle: ${escapeHtml(error.message)}\n\n` +
                `Por favor, intente nuevamente o contacte al administrador.`
            );

            // Recargar lista para verificar el estado actual
            // (algunas plantillas podrían haberse eliminado parcialmente)
            try {
                await this.loadTemplates();
            } catch (reloadError) {
                console.error('[TemplateManagerControl] Error recargando después del fallo:', reloadError);
            }
        }
    }

    /**
     * Actualizar estado del componente
     */
    _updateStatus(message, type = 'info') {
        const statusEl = this.container.querySelector('#componentStatus');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.style.color = type === 'error' ? '#ef4444' : '#6b7280';
        }
    }

    /**
     * Destruir componente (cleanup)
     */
    destroy() {
        this._stopAutoRefresh();
        super.destroy();
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.TemplateManagerControl = TemplateManagerControl;
}
