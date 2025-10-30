/* server.ts */
import path = require("path");
import fs = require("fs");
import express = require("express");
import bodyParser = require("body-parser");
import { RawBiometricEvent, SseBridge } from "./sseBridge";

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
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

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

app.post("/api/register", async (_, res) => {
  try {
    // Callback is already registered in server startup, just return success
    res.json({ ok: true, msg: "Callback already registered at server startup" });
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

app.listen(PORT, () => console.log(`UI at http://localhost:${PORT}`));
