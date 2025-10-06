/**
 * ComponentFactory - Factory para crear e inicializar componentes biométricos
 * Implementa el patrón Factory para la gestión de componentes
 */
class ComponentFactory {
    constructor() {
        this.components = new Map();
        this.componentTypes = new Map();
        this.adapter = window.BiometricAdapter;

        this._registerComponents();
    }

    /**
     * Registrar tipos de componentes disponibles
     */
    _registerComponents() {
        // Registrar componentes disponibles
        this.componentTypes.set('enrollment', {
            class: EnrollmentControl,
            description: 'Componente para enrolamiento de huellas dactilares',
            defaultConfig: {
                maxSamples: 4,
                autoCancel: false
            }
        });

        this.componentTypes.set('simplecapture', {
            class: SimpleCaptureControl,
            description: 'Componente para captura simple de huellas',
            defaultConfig: {
                autoCapture: false,
                captureInterval: 5000
            }
        });

        this.componentTypes.set('verification', {
            class: VerificationControl,
            description: 'Componente para verificación e identificación',
            defaultConfig: {
                scoreThreshold: 50,
                autoRefreshUsers: true
            }
        });

        // Registro para componentes adicionales
        this.componentTypes.set('readercontrol', {
            class: ReaderControl,
            description: 'Control del lector biométrico',
            defaultConfig: {
                autoInit: false,
                showTechnicalInfo: true
            }
        });

        this.componentTypes.set('logdevice', {
            class: LogDeviceControl,
            description: 'Visualización de logs en tiempo real',
            defaultConfig: {
                maxEntries: 50,
                autoScroll: true
            }
        });

        this.componentTypes.set('techdevice', {
            class: TechDeviceControl,
            description: 'Información técnica del dispositivo',
            defaultConfig: {
                autoRefresh: false,
                showDrivers: true
            }
        });

        console.log('[ComponentFactory] Componentes registrados:', Array.from(this.componentTypes.keys()));
    }

    /**
     * Crear componente por tipo y contenedor
     */
    create(type, containerId, config = {}) {
        const componentDef = this.componentTypes.get(type.toLowerCase());

        if (!componentDef) {
            throw new Error(`Tipo de componente '${type}' no registrado. Tipos disponibles: ${Array.from(this.componentTypes.keys()).join(', ')}`);
        }

        // Verificar que el contenedor existe
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Contenedor '${containerId}' no encontrado en el DOM`);
        }

        try {
            // Combinar configuración por defecto con la proporcionada
            const finalConfig = { ...componentDef.defaultConfig, ...config };

            // Crear instancia del componente con configuración
            const ComponentClass = componentDef.class;
            const component = new ComponentClass(containerId, this.adapter, finalConfig);

            // Aplicar configuración adicional
            this._applyConfig(component, finalConfig);

            // Registrar componente creado
            const componentKey = `${type}-${containerId}`;
            this.components.set(componentKey, {
                instance: component,
                type: type,
                containerId: containerId,
                config: finalConfig,
                createdAt: new Date()
            });

            const modalText = finalConfig.isModal ? ' (Modal)' : '';
            console.log(`[ComponentFactory] Componente ${type} creado en #${containerId}${modalText}`);

            return component;

        } catch (error) {
            console.error(`[ComponentFactory] Error creando componente ${type}:`, error);
            throw error;
        }
    }

    /**
     * Aplicar configuración específica al componente
     */
    _applyConfig(component, config) {
        // Aplicar configuraciones específicas según el tipo de componente
        if (component instanceof EnrollmentControl) {
            if (config.maxSamples) component.setMaxSamples(config.maxSamples);
        }

        if (component instanceof SimpleCaptureControl) {
            if (config.autoCapture) component.setAutoCapture(config.autoCapture, config.captureInterval);
        }

        if (component instanceof VerificationControl) {
            if (config.scoreThreshold) component.setScoreThreshold(config.scoreThreshold);
        }

        // Configuraciones adicionales pueden agregarse aquí
    }

    /**
     * Crear componente automáticamente basado en el ID del contenedor
     */
    autoCreate(containerId, config = {}) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`[ComponentFactory] Contenedor '${containerId}' no encontrado para auto-creación`);
            return null;
        }

        // Mapeo de IDs a tipos de componentes
        const idMappings = {
            'enrollment': 'enrollment',
            'enroll': 'enrollment',
            'enrollar': 'enrollment',

            'simplecapture': 'simplecapture',
            'capture': 'simplecapture',
            'captura': 'simplecapture',

            'verification': 'verification',
            'verify': 'verification',
            'verificar': 'verification',
            'identify': 'verification',

            'readercontrol': 'readercontrol',
            'reader': 'readercontrol',
            'lector': 'readercontrol',

            'logdevice': 'logdevice',
            'log': 'logdevice',
            'logs': 'logdevice',

            'techdevice': 'techdevice',
            'tech': 'techdevice',
            'technical': 'techdevice',
            'info': 'techdevice'
        };

        // Buscar coincidencia en el ID del contenedor
        const componentType = idMappings[containerId.toLowerCase()];

        if (componentType) {
            try {
                return this.create(componentType, containerId, config);
            } catch (error) {
                console.error(`[ComponentFactory] Error en auto-creación para '${containerId}':`, error);
                return null;
            }
        } else {
            console.warn(`[ComponentFactory] No se pudo mapear '${containerId}' a un tipo de componente`);
            return null;
        }
    }

    /**
     * Obtener componente existente
     */
    get(type, containerId) {
        const componentKey = `${type}-${containerId}`;
        const componentData = this.components.get(componentKey);
        return componentData ? componentData.instance : null;
    }

    /**
     * Destruir componente específico
     */
    destroy(type, containerId) {
        const componentKey = `${type}-${containerId}`;
        const componentData = this.components.get(componentKey);

        if (componentData) {
            componentData.instance.destroy();
            this.components.delete(componentKey);
            console.log(`[ComponentFactory] Componente ${type} destruido de #${containerId}`);
            return true;
        }

        return false;
    }

    /**
     * Destruir todos los componentes
     */
    destroyAll() {
        for (const [key, componentData] of this.components) {
            componentData.instance.destroy();
        }
        this.components.clear();
        console.log('[ComponentFactory] Todos los componentes destruidos');
    }

    /**
     * Obtener lista de componentes activos
     */
    getActiveComponents() {
        const active = [];
        for (const [key, componentData] of this.components) {
            active.push({
                key: key,
                type: componentData.type,
                containerId: componentData.containerId,
                createdAt: componentData.createdAt,
                config: componentData.config
            });
        }
        return active;
    }

    /**
     * Obtener tipos de componentes disponibles
     */
    getAvailableTypes() {
        const types = [];
        for (const [type, definition] of this.componentTypes) {
            types.push({
                type: type,
                description: definition.description,
                defaultConfig: definition.defaultConfig
            });
        }
        return types;
    }

    /**
     * Inicialización automática basada en elementos existentes en el DOM
     */
    autoInit(containerPrefix = '', config = {}) {
        console.log('[ComponentFactory] Iniciando auto-inicialización...');

        // Buscar elementos con data-component
        const elementsWithComponent = document.querySelectorAll('[data-component]');

        elementsWithComponent.forEach(element => {
            const componentType = element.getAttribute('data-component');
            const containerId = element.id;

            if (containerId && componentType) {
                try {
                    this.create(componentType, containerId, config);
                } catch (error) {
                    console.error(`[ComponentFactory] Error auto-inicializando ${componentType} en #${containerId}:`, error);
                }
            }
        });

        // Auto-detectar por ID si no hay data-component
        const commonIds = [
            'enrollment', 'enroll', 'enrollar',
            'simplecapture', 'capture', 'captura',
            'verification', 'verify', 'verificar',
            'readercontrol', 'reader', 'lector',
            'logdevice', 'log', 'logs',
            'techdevice', 'tech', 'technical'
        ];

        commonIds.forEach(id => {
            const fullId = containerPrefix + id;
            const element = document.getElementById(fullId);

            if (element && !element.hasAttribute('data-component')) {
                this.autoCreate(fullId, config);
            }
        });

        console.log(`[ComponentFactory] Auto-inicialización completada. Componentes activos: ${this.components.size}`);
    }

    /**
     * Registrar nuevo tipo de componente
     */
    registerComponent(type, componentClass, description, defaultConfig = {}) {
        this.componentTypes.set(type.toLowerCase(), {
            class: componentClass,
            description: description,
            defaultConfig: defaultConfig
        });

        console.log(`[ComponentFactory] Componente '${type}' registrado`);
    }

    /**
     * Clonar componente con nueva configuración
     */
    clone(sourceType, sourceContainerId, targetContainerId, newConfig = {}) {
        const sourceComponent = this.get(sourceType, sourceContainerId);

        if (!sourceComponent) {
            throw new Error(`Componente fuente ${sourceType}-${sourceContainerId} no encontrado`);
        }

        const sourceData = this.components.get(`${sourceType}-${sourceContainerId}`);
        const combinedConfig = { ...sourceData.config, ...newConfig };

        return this.create(sourceType, targetContainerId, combinedConfig);
    }
}

// Crear instancia global del factory
window.ComponentFactory = new ComponentFactory();

// Auto-inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Permitir configuración global opcional
    const globalConfig = window.BiometricComponentConfig || {};
    window.ComponentFactory.autoInit('', globalConfig);
});