# JavaScript Component Architecture

## Overview

This directory contains the JavaScript component system for the biometric fingerprint reader application. The components are organized by **purpose** to provide clear separation between infrastructure code and business logic.

---

## Directory Structure

```
js/
├── infrastructure/          # Core infrastructure - DOM framework & communication
│   ├── BaseComponent.js     # Base class for building UI components
│   ├── BiometricAdapter.js  # Backend-frontend communication adapter
│   ├── EventRouter.js       # Middleware for routing SSE events to components
│   └── ComponentFactory.js  # Factory pattern for component creation
│
└── biometric-controls/      # Business logic - Fingerprint reader UI
    ├── EnrollmentControl.js       # Enrollment workflow (4 samples)
    ├── VerificationControl.js     # Verification workflow (1:1)
    ├── SimpleCaptureControl.js    # Basic fingerprint capture
    ├── ReaderControl.js           # Device management & initialization
    ├── LogDeviceControl.js        # Device logging & debugging
    └── TechDeviceControl.js       # Technical device information
```

---

## Component Categories

### 1. Infrastructure Components (`infrastructure/`)

**Purpose**: Foundational framework for building DOM-based UI components

These components provide the **core capabilities** needed to build any interactive UI component, independent of the specific business domain (biometrics). They handle:

- DOM construction and manipulation
- Event handling and lifecycle management
- Communication with backend APIs
- State management
- UI updates (status messages, loading indicators, images)

**Key Characteristics**:
- Domain-agnostic (not specific to biometrics)
- Reusable across different types of applications
- Provide infrastructure services to business logic components
- Handle technical concerns (HTTP, SSE, DOM APIs)

#### `BaseComponent.js`

Base class that all biometric controls extend from.

**Responsibilities**:
- Initialize component structure (container, status, buttons)
- Manage component lifecycle (initialization, cleanup)
- Handle event listeners and subscriptions
- Update UI status and display images
- Show/hide loading indicators
- Enable/disable inputs and buttons

**Usage**:
```javascript
class MyControl extends BaseComponent {
    constructor(containerId, adapter, config) {
        super(containerId, adapter, config);
    }

    async performOperation() {
        this.showLoading('Processing...');
        // ... business logic
        this.hideLoading();
    }
}
```

#### `BiometricAdapter.js`

Abstraction layer for backend communication.

**Responsibilities**:
- Connect to Server-Sent Events (SSE) stream
- Make API calls to backend endpoints
- Emit frontend events for UI components
- Manage event subscriptions
- Handle connection lifecycle

**Usage**:
```javascript
const adapter = new BiometricAdapter();

// Connect to events
adapter.connectEvents('/events');

// Subscribe to events
adapter.on('enrollment:completed', (data) => {
    console.log('Enrollment complete:', data);
});

// Call backend API
const result = await adapter.enrollV2({ userId: 'USER001' });
```

#### `EventRouter.js`

**NEW**: Middleware for routing SSE events to components.

**Purpose**: Solves the problem of event routing by directing backend SSE events to the correct component based on active operations.

**Responsibilities**:
- Capture all SSE events from BiometricAdapter
- Route events to subscribed components based on operation type
- Track active operations (enrollment, verification, identification)
- Provide event history and statistics for debugging
- Ensure events reach the correct component's status display

**Key Features**:
- **Context-aware routing**: Events like `CAPTURE_STARTED` are routed to the currently active operation
- **Subscription model**: Components subscribe to specific event categories
- **Operation tracking**: Knows which component is performing which operation
- **Isolated dispatch**: Events are dispatched ONLY to the component with active operation (prevents cross-component contamination)
- **Debugging tools**: Built-in statistics and event history

**Usage**:
```javascript
// Initialize EventRouter
const eventRouter = new EventRouter(biometricAdapter);

// Subscribe a component to enrollment events
const enrollCtrl = new EnrollmentControl('container', adapter, { eventRouter });
eventRouter.subscribe('enrollment', enrollCtrl, enrollCtrl.componentId);

// Start an operation (automatically routes future events)
eventRouter.startOperation('enrollment', enrollCtrl.componentId, { userId: 'USER001' });

// End operation when done
eventRouter.endOperation('enrollment');

// Debug: View routing statistics
eventRouter.debugStatus();
```

**Event Categories**:
- `enrollment` - ENROLLMENT_* events
- `verification` - VERIFICATION_* events
- `identification` - IDENTIFICATION_* events
- `reader` - READER_*, DEVICE_STATUS events
- `system` - SYSTEM_* events
- `all` - All events (for logging components)

**How it works**:
```
Backend SSE → BiometricAdapter → EventRouter → Active Component ONLY
                                      ↓
                                 [Routes based on:
                                  - Event type prefix (ENROLLMENT_*, VERIFICATION_*, etc.)
                                  - Active operation tracking
                                  - Component isolation (1 active component per operation type)]

Example Flow:
1. EnrollmentControl calls eventRouter.startOperation('enrollment', componentId)
2. Backend sends ENROLLMENT_STARTED event
3. EventRouter dispatches to EnrollmentControl ONLY (not VerificationControl)
4. Event displays in EnrollmentControl's SSE status area
5. VerificationControl remains clean (no cross-contamination)
```

#### `ComponentFactory.js`

Factory pattern for creating component instances.

**Responsibilities**:
- Centralized component instantiation
- Consistent configuration management
- Dependency injection

---

### 2. Biometric Controls (`biometric-controls/`)

**Purpose**: Fingerprint reader-specific UI components and workflows

These components implement the **business logic** for biometric operations. They handle:

- Fingerprint enrollment workflows
- Fingerprint verification workflows
- Device management and status
- Biometric-specific user interactions
- DigitalPersona DP4500 integration

**Key Characteristics**:
- Domain-specific (biometric fingerprint operations)
- Extend infrastructure components (BaseComponent)
- Implement biometric workflows and state machines
- Handle device-specific logic

#### `EnrollmentControl.js`

Enrollment workflow component (captures 4 fingerprint samples).

**Extends**: `BaseComponent`

**Responsibilities**:
- Guide user through 4-sample capture process
- Track enrollment progress (1/4, 2/4, 3/4, 4/4)
- Display fingerprint images during capture
- Handle enrollment success/failure
- Emit enrollment events

**Usage**:
```html
<div id="enrollment-container"></div>

<script>
    const enrollCtrl = new EnrollmentControl(
        'enrollment-container',
        biometricAdapter,
        { showImages: true }
    );

    enrollCtrl.on('enrollmentComplete', (data) => {
        console.log('User enrolled:', data.userId);
    });

    await enrollCtrl.startEnrollment('USER001');
</script>
```

#### `VerificationControl.js`

Verification workflow component (1:1 matching).

**Extends**: `BaseComponent`

**Responsibilities**:
- Capture fingerprint for verification
- Compare against stored template
- Display match/no-match result
- Show confidence scores
- Emit verification events

**Usage**:
```html
<div id="verification-container"></div>

<script>
    const verifyCtrl = new VerificationControl(
        'verification-container',
        biometricAdapter
    );

    verifyCtrl.on('verificationComplete', (data) => {
        if (data.match) {
            console.log('Match! Confidence:', data.confidence);
        }
    });

    await verifyCtrl.startVerification('USER001');
</script>
```

#### `SimpleCaptureControl.js`

Basic fingerprint capture without enrollment/verification logic.

**Extends**: `BaseComponent`

**Responsibilities**:
- Capture single fingerprint image
- Display captured image
- Provide raw fingerprint data
- Simple capture workflow

#### `ReaderControl.js`

Device management and initialization.

**Extends**: `BaseComponent`

**Responsibilities**:
- Initialize DigitalPersona DP4500 reader
- Display device status (connected/disconnected)
- Handle device errors
- Show reader information

#### `LogDeviceControl.js`

Device logging and debugging component.

**Extends**: `BaseComponent`

**Responsibilities**:
- Display device operation logs
- Show debug information
- Track device events
- Help troubleshoot issues

#### `TechDeviceControl.js`

Technical device information display.

**Extends**: `BaseComponent`

**Responsibilities**:
- Show device hardware details
- Display SDK version information
- Show device capabilities
- Technical diagnostics

---

## Architecture Principles

### Separation of Concerns

- **Infrastructure**: Handles technical concerns (DOM, HTTP, events)
- **Biometric Controls**: Handles business logic (fingerprint workflows)

### Inheritance Hierarchy

```
BaseComponent (infrastructure)
    ↓
EnrollmentControl (biometric-controls)
VerificationControl (biometric-controls)
SimpleCaptureControl (biometric-controls)
ReaderControl (biometric-controls)
LogDeviceControl (biometric-controls)
TechDeviceControl (biometric-controls)
```

### Event-Driven Communication

Components use events for decoupled communication:

1. **Backend → Adapter**: Server-Sent Events (SSE)
2. **Adapter → Components**: JavaScript events
3. **Components → Application**: Custom events

---

## Loading Components

### Correct Load Order

Components must be loaded in dependency order:

```html
<!-- 1. Infrastructure (no dependencies) -->
<script src="/js/infrastructure/BiometricAdapter.js"></script>
<script src="/js/infrastructure/BaseComponent.js"></script>
<script src="/js/infrastructure/ComponentFactory.js"></script>

<!-- 2. Biometric Controls (depend on infrastructure) -->
<script src="/js/biometric-controls/EnrollmentControl.js"></script>
<script src="/js/biometric-controls/VerificationControl.js"></script>
<script src="/js/biometric-controls/SimpleCaptureControl.js"></script>
<script src="/js/biometric-controls/ReaderControl.js"></script>
<script src="/js/biometric-controls/LogDeviceControl.js"></script>
<script src="/js/biometric-controls/TechDeviceControl.js"></script>
```

### Example HTML

See `v2-ceddfa/template-workflow-ceddfa.html` for complete implementation.

---

## Development Guidelines

### Creating New Infrastructure Components

1. Place in `infrastructure/` directory
2. Should be domain-agnostic (not biometric-specific)
3. Provide reusable capabilities
4. No dependencies on biometric-controls

Example:
```javascript
// infrastructure/DataTableComponent.js
class DataTableComponent {
    constructor(containerId, data) {
        this.containerId = containerId;
        this.data = data;
    }

    render() {
        // Generic table rendering logic
    }
}
```

### Creating New Biometric Controls

1. Place in `biometric-controls/` directory
2. Extend `BaseComponent`
3. Implement biometric-specific workflow
4. Use `BiometricAdapter` for backend communication

Example:
```javascript
// biometric-controls/IdentificationControl.js
class IdentificationControl extends BaseComponent {
    constructor(containerId, adapter, config = {}) {
        super(containerId, adapter, config);
    }

    async startIdentification() {
        this.showLoading('Identifying...');
        try {
            const result = await this.adapter.identify1N();
            this.updateStatus(`Match found: ${result.userId}`);
        } catch (error) {
            this.updateStatus('Identification failed', 'error');
        } finally {
            this.hideLoading();
        }
    }
}
```

### Testing Components

1. Load infrastructure components first
2. Verify no console errors
3. Test biometric controls with actual device
4. Check event flow (backend → adapter → component)

---

## Migration Notes

### From Old Structure

**Before** (mixed purposes):
```
js/
├── core/
│   ├── BaseComponent.js
│   ├── BiometricAdapter.js
├── components/
│   ├── EnrollmentControl.js
│   └── VerificationControl.js
```

**After** (separated by purpose):
```
js/
├── infrastructure/
│   ├── BaseComponent.js
│   ├── BiometricAdapter.js
└── biometric-controls/
    ├── EnrollmentControl.js
    └── VerificationControl.js
```

### Benefits of New Structure

1. **Clarity**: Clear distinction between framework and business logic
2. **Reusability**: Infrastructure components can be used in other projects
3. **Maintainability**: Changes to business logic don't affect infrastructure
4. **Testability**: Easier to test components in isolation
5. **Onboarding**: New developers understand architecture faster

---

## Related Documentation

- **Project Structure**: See `ESTRUCTURA-PROYECTO.md` in project root
- **CEDDFA Architecture**: See `arquitectura CEDDFA.md`
- **API Reference**: See inline comments in each component file
- **V2 CEDDFA UI**: See `v2-ceddfa/template-workflow-ceddfa.html`

---

**Last Updated**: 2025-10-12
**Version**: 1.0
