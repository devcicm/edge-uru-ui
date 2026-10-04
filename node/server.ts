/* server.ts */
import path = require("path");
import fs = require("fs");
import express = require("express");
import bodyParser = require("body-parser");
import { RawBiometricEvent, SseBridge } from "./sseBridge";

// Configurar encoding UTF-8 para la consola en Windows
if (process.platform === 'win32') {
  process.stdout.setDefaultEncoding('utf8');
  process.stderr.setDefaultEncoding('utf8');
}

const edge = require("edge-js");
type EdgeFunc = (payload: any, cb: (err: any, res: any) => void) => void;

const assemblyFile = path.join(__dirname, "..", "..", "out", "net472", "bridge-csharp.dll");

// Bridge simple y directo
const bridge: EdgeFunc = edge.func({
  assemblyFile,
  typeName: "EdgeBridge.EdgeUruBridge",
  methodName: "Invoke"
});

function call(payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    bridge(payload, (err: any, res: any) => (err ? reject(err) : resolve(res)));
  });
}

const app = express();
app.use(bodyParser.json());
const PORT = Number(process.env.BIOMETRIC_PORT ?? process.env.PORT) || 8080;
// B1: bind por env (default loopback). Guard: si HOST no es loopback, exigir X-Api-Token.
const HOST = process.env.BIOMETRIC_HOST || "127.0.0.1";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const API_TOKEN = process.env.BIOMETRIC_API_TOKEN;
const REMOTE_REQUIRED = !LOOPBACK_HOSTS.has(HOST);

if (REMOTE_REQUIRED && !API_TOKEN) {
  console.error(`[ERROR] BIOMETRIC_HOST=${HOST} no es loopback: BIOMETRIC_API_TOKEN es obligatorio. Abortando.`);
  process.exit(1);
}

if (REMOTE_REQUIRED) {
  app.use((req, res, next) => {
    const token = req.header("X-Api-Token");
    if (token !== API_TOKEN) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    next();
  });
}

const sseBridge = new SseBridge((message, ...meta) => console.log(message, ...meta));
const ATTEMPT_REGEX = /Intento\s+(\d+)/i;
const SAMPLE_REGEX = /muestra\s*(\d+)\s*\/\s*(\d+)/i;

sseBridge.registerProcessor((event: RawBiometricEvent) => {
  const eventType = (event.eventType || "").toUpperCase();
  const severity = (event.severity || "").toUpperCase();

  if (eventType === "ENROLLMENT_SAMPLE_COLLECTED") {
    const sampleNumber = Number(event.data?.sampleNumber);
    const totalSamples = Number(event.data?.totalSamples);
    const progress = Number(event.data?.progress);

    if (Number.isFinite(sampleNumber)) {
      event.sampleNumber = Math.trunc(sampleNumber);
    }
    if (Number.isFinite(totalSamples)) {
      event.totalSamples = Math.trunc(totalSamples);
    }
    if (Number.isFinite(progress)) {
      event.progress = progress;
      event.progressPercent = Math.round(progress);
    }

    const derived: RawBiometricEvent = {
      eventType: severity === "SUCCESS" ? "ENROLLMENT_SAMPLE_SUCCESS" : "ENROLLMENT_SAMPLE_STATUS",
      originalEventType: event.eventType,
      severity: event.severity,
      origin: event.origin,
      timestamp: event.timestamp,
      message: event.message,
      bridgeVersion: event.bridgeVersion,
      sampleNumber: event.sampleNumber,
      totalSamples: event.totalSamples,
      progress: event.progress,
      progressPercent: event.progressPercent
    };

    return [event, derived];
  }

  if (eventType === "SYSTEM_STATUS" && typeof event.message === "string") {
    const attemptMatch = ATTEMPT_REGEX.exec(event.message);
    const sampleMatch = SAMPLE_REGEX.exec(event.message);

    if (attemptMatch || sampleMatch) {
      const attempt = attemptMatch ? Number(attemptMatch[1]) : undefined;
      const sampleNumber = sampleMatch ? Number(sampleMatch[1]) : attempt;
      const totalSamples = sampleMatch ? Number(sampleMatch[2]) : event.totalSamples;

      const derived: RawBiometricEvent = {
        eventType: "SYSTEM_ATTEMPT_STATUS",
        originalEventType: event.eventType,
        severity: event.severity,
        origin: event.origin,
        timestamp: event.timestamp,
        message: event.message,
        bridgeVersion: event.bridgeVersion,
        attempt: Number.isFinite(attempt) ? Math.trunc(attempt!) : undefined,
        sampleNumber: Number.isFinite(sampleNumber) ? Math.trunc(sampleNumber!) : undefined,
        totalSamples: Number.isFinite(totalSamples) ? Math.trunc(totalSamples!) : undefined
      };

      return [event, derived];
    }
  }

  return event;
});

app.get("/events", (req, res) => {
  const detach = sseBridge.attachClient(res);

  req.on("close", detach);
  req.on("error", detach);
});

app.post("/api/bootstrap", async (req, res) => {
  try {
    const nativeDir = path.join(__dirname, "..", "..", "bin-deps");
    const out = await call({ op: "bootstrap", searchPath: nativeDir });
    res.json(out);
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.post("/api/init", async (_, res) => {
  try { res.json(await call({ op: "init" })); }
  catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.post("/api/single", async (req, res) => {
  try { res.json(await call({ op: "single", timeoutMs: req.body?.timeoutMs ?? 10000 })); }
  catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.post("/api/identify", async (req, res) => {
  try {
    const timeoutMs = req.body?.timeoutMs ?? 12000;
    const targetFarn = req.body?.targetFarn ?? 21474;
    const top = req.body?.top ?? 5;
    const maxAttempts = req.body?.maxAttempts ?? 4;
    res.json(await call({ op: "identify", timeoutMs, targetFarn, top, maxAttempts }));
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.post("/api/enroll", async (req, res) => {
  try {
    const tag = req.body?.tag || `User_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const timeoutMs = req.body?.timeoutMs ?? 30000;
    const targetFarn = req.body?.targetFarn ?? 21474;
    const maxRetriesPerSample = req.body?.maxRetriesPerSample ?? 3;
    const maxSamples = req.body?.maxSamples ?? 4;
    res.json(await call({ op: "enroll", tag, timeoutMs, targetFarn, maxRetriesPerSample, maxSamples }));
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.post("/api/enroll-all-fingers", async (req, res) => {
  try {
    const userId = req.body?.userId;
    if (!userId) {
      return res.status(400).json({ ok: false, error: "UserId is required for enrollAllFingers" });
    }
    const timeoutPerFingerMs = req.body?.timeoutPerFingerMs ?? 240000; // 4 minutos POR DEDO (1 min por muestra)
    const targetFarn = req.body?.targetFarn ?? 21474;
    const maxRetriesPerSample = req.body?.maxRetriesPerSample ?? 3;
    const maxSamples = req.body?.maxSamples ?? 4;
    res.json(await call({ op: "enrollAllFingers", userId, timeoutPerFingerMs, targetFarn, maxRetriesPerSample, maxSamples }));
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.post("/api/verify", async (req, res) => {
  try {
    const tag = req.body?.tag;
    if (!tag) {
      return res.status(400).json({ ok: false, error: "Tag is required for verification" });
    }
    const timeoutMs = req.body?.timeoutMs ?? 15000;
    const targetFarn = req.body?.targetFarn ?? 21474;
    const maxAttempts = req.body?.maxAttempts ?? 4;
    res.json(await call({ op: "verify", tag, timeoutMs, targetFarn, maxAttempts }));
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.get("/api/store", async (_, res) => {
  try { res.json(await call({ op: "storeList" })); }
  catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.delete("/api/store", async (_, res) => {
  try { res.json(await call({ op: "storeClear" })); }
  catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.post("/api/dispose", async (_, res) => {
  try { res.json(await call({ op: "dispose" })); }
  catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.get("/api/reader-info", async (_, res) => {
  try { res.json(await call({ op: "getReaderInfo" })); }
  catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.get("/api/store-stats", async (_, res) => {
  try { res.json(await call({ op: "storeStats" })); }
  catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.post("/api/load-template", async (req, res) => {
  try {
    const { userId, templateBase64, hand, finger } = req.body;

    if (!userId || !templateBase64) {
      return res.status(400).json({ ok: false, error: "userId and templateBase64 are required" });
    }

    res.json(await call({ op: "loadTemplate", userId, templateBase64, hand, finger }));
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

// ==========================================
// EXTERNAL API INTEGRATION ENDPOINTS
// ==========================================

/**
 * POST /api/external/register
 * Captura huella(s) y genera DTO para envío a API externa
 *
 * Body:
 * {
 *   userId: string,
 *   firstName?: string,
 *   lastName?: string,
 *   email?: string,
 *   documentId?: string,
 *   fingers?: Array<{hand: string, finger: string}>,  // Opcional: dedos específicos
 *   metadata?: object
 * }
 *
 * Response: BiometricRegistrationRequest DTO
 */
app.post("/api/external/register", async (req, res) => {
  try {
    const { userId, firstName, lastName, email, documentId, fingers, metadata } = req.body;

    if (!userId) {
      return res.status(400).json({ ok: false, error: "userId es requerido" });
    }

    const result = await call({
      op: "captureForExternalRegistration",
      userId,
      firstName,
      lastName,
      email,
      documentId,
      fingers,  // Opcional: si no se proporciona, captura todos los dedos
      metadata
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * POST /api/external/verify
 * Verifica huella capturada contra plantilla recibida de API externa
 *
 * Body:
 * {
 *   fingerprintData: {
 *     hand: string,
 *     finger: string,
 *     templateBase64: string,
 *     format: string,
 *     ... otros campos del DTO
 *   },
 *   timeoutMs?: number,
 *   targetFarn?: number,
 *   maxAttempts?: number
 * }
 *
 * Response: BiometricMatchResult
 */
app.post("/api/external/verify", async (req, res) => {
  try {
    const { fingerprintData, timeoutMs, targetFarn, maxAttempts } = req.body;

    if (!fingerprintData || !fingerprintData.templateBase64) {
      return res.status(400).json({ ok: false, error: "fingerprintData.templateBase64 es requerido" });
    }

    const result = await call({
      op: "verifyAgainstExternalFingerprint",
      fingerprintData,
      timeoutMs: timeoutMs ?? 15000,
      targetFarn: targetFarn ?? 21474,
      maxAttempts: maxAttempts ?? 4
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * POST /api/external/verify-multiple
 * Verifica huella capturada contra múltiples plantillas (1:N)
 *
 * Body:
 * {
 *   fingerprints: Array<FingerprintData>,
 *   timeoutMs?: number,
 *   targetFarn?: number
 * }
 *
 * Response: BiometricMatchResult
 */
app.post("/api/external/verify-multiple", async (req, res) => {
  try {
    const { fingerprints, timeoutMs, targetFarn } = req.body;

    if (!fingerprints || !Array.isArray(fingerprints) || fingerprints.length === 0) {
      return res.status(400).json({ ok: false, error: "Se requiere al menos una huella en 'fingerprints'" });
    }

    const result = await call({
      op: "verifyAgainstMultipleFingerprints",
      fingerprints,
      timeoutMs: timeoutMs ?? 15000,
      targetFarn: targetFarn ?? 21474
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * POST /api/external/convert-template
 * Convierte template almacenada localmente a FingerprintData DTO
 * Útil para obtener plantillas del store local y enviarlas a API externa
 *
 * Body:
 * {
 *   tag: string  // Tag de la plantilla local
 * }
 *
 * Response: FingerprintData DTO
 */
app.post("/api/external/convert-template", async (req, res) => {
  try {
    const { tag } = req.body;

    if (!tag) {
      return res.status(400).json({ ok: false, error: "tag es requerido" });
    }

    const result = await call({
      op: "convertTemplateToDTO",
      tag
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ==========================================
// TOUCH MODE ENDPOINTS (Continuous Capture)
// ==========================================

/**
 * POST /api/touch/start
 * Iniciar modo de eventos touch (escucha continua sin timers)
 * Response: { ok: boolean, message: string, mode: "Continuous", events: string[] }
 */
app.post("/api/touch/start", async (req, res) => {
  try {
    const result = await call({ op: "startTouchMode" });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * POST /api/touch/stop
 * Detener modo de eventos touch
 * Response: { ok: boolean, message: string, mode: "OnDemand" }
 */
app.post("/api/touch/stop", async (req, res) => {
  try {
    const result = await call({ op: "stopTouchMode" });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * GET /api/touch/status
 * Obtener estado actual del modo touch
 * Response: { ok: boolean, isActive: boolean, mode: string, modeDescription: string }
 */
app.get("/api/touch/status", async (req, res) => {
  try {
    const result = await call({ op: "getTouchModeStatus" });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * POST /api/touch/identify-last
 * Identificar usando la última huella capturada en modo touch
 * Request body: { targetFarn?: number }
 * Response: { ok: boolean, matched: boolean, userId?: string, score: number, gallerySize: number, message: string }
 */
app.post("/api/touch/identify-last", async (req, res) => {
  try {
    const targetFarn = req.body?.targetFarn ?? 21474;
    const result = await call({ op: "identifyLastCapture", targetFarn });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Static file serving - MUST be after API routes
const sourcePublicDir = path.join(__dirname, "..", "public");
console.log(`[STATIC ROUTES] Serving static files from: ${sourcePublicDir}`);
console.log(`[STATIC ROUTES] Source directory exists: ${fs.existsSync(sourcePublicDir)}`);

app.use("/", express.static(sourcePublicDir));
app.use("/images", express.static(path.join(__dirname, "..", "..", "images")));

(async () => {
  try {
    // Registrar callback para eventos en tiempo real
    await call({
      op: "registerCallback",
      callback: async (eventData: any) => {
        console.log("[C# Event]", eventData);
        sseBridge.emit(eventData);
        return null; // ⚡ CRÍTICO: Retornar inmediatamente para no bloquear Edge.js
      }
    });

    // Bootstrap del bridge
    const nativeDir = path.join(__dirname, "..", "..", "bin-deps");
    await call({ op: "bootstrap", searchPath: nativeDir });
    console.log("[OK] Bridge initialized and ready");
  } catch (e) {
    console.error("[ERROR] Bootstrap failed:", e);
  }
})();

app.listen(PORT, HOST, () => console.log(`UI at http://${HOST}:${PORT}`));
