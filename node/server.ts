/* server.ts */
import path = require("path");
import fs = require("fs");
import express = require("express");
import bodyParser = require("body-parser");

const edge = require("edge-js");
type EdgeFunc = (payload: any, cb: (err: any, res: any) => void) => void;

const assemblyFile = path.join(__dirname, "..", "..", "out", "net472", "bridge-csharp.dll");

// Bridge original (v1)
const bridge: EdgeFunc = edge.func({
  assemblyFile,
  typeName: "EdgeBridge.EdgeUruBridge",
  methodName: "Invoke"
});

// Bridge V2 con CEDDFA
const bridgeV2: EdgeFunc = edge.func({
  assemblyFile,
  typeName: "EdgeBridge.EdgeUruBridgeV2",
  methodName: "Invoke"
});

function call(payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    bridge(payload, (err: any, res: any) => (err ? reject(err) : resolve(res)));
  });
}

function callV2(payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    bridgeV2(payload, (err: any, res: any) => (err ? reject(err) : resolve(res)));
  });
}

const app = express();
app.use(bodyParser.json());
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

type SseClient = { id: number; res: express.Response };
const clients: SseClient[] = [];
let nextId = 1;
function sseBroadcast(ev: any) {
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const c of clients) c.res.write(line);
}

app.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  res.flushHeaders();
  const id = nextId++;
  clients.push({ id, res });
  res.write(`data: ${JSON.stringify({ evt: "hello", id })}\n\n`);
  req.on("close", () => {
    const i = clients.findIndex((c) => c.id === id);
    if (i >= 0) clients.splice(i, 1);
  });
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

app.post("/api/identify1n", async (req, res) => {
  try {
    const timeoutMs = req.body?.timeoutMs ?? 12000;
    const targetFarn = req.body?.targetFarn ?? 21474;
    const top = req.body?.top ?? 5;
    res.json(await call({ op: "identify1N", timeoutMs, targetFarn, top }));
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

app.post("/api/verify", async (req, res) => {
  try {
    const tag = req.body?.tag;
    if (!tag) {
      return res.status(400).json({ ok: false, error: "Tag is required for verification" });
    }
    const timeoutMs = req.body?.timeoutMs ?? 15000;
    const targetFarn = req.body?.targetFarn ?? 21474;
    res.json(await call({ op: "verify1to1", tag, timeoutMs, targetFarn }));
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

// Template Management Endpoints
app.post("/api/enroll-with-template", async (req, res) => {
  try {
    const userId = req.body?.userId || `User_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const timeoutMs = req.body?.timeoutMs ?? 30000;
    const targetFarn = req.body?.targetFarn ?? 21474;
    const maxRetriesPerSample = req.body?.maxRetriesPerSample ?? 3;
    const maxSamples = req.body?.maxSamples ?? 4;
    res.json(await call({ op: "enrollWithTemplate", userId, timeoutMs, targetFarn, maxRetriesPerSample, maxSamples }));
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.get("/api/template/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({ ok: false, error: "userId is required" });
    }
    res.json(await call({ op: "templateGet", userId }));
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.post("/api/template/load", async (req, res) => {
  try {
    const templateJson = req.body?.templateJson;
    if (!templateJson) {
      return res.status(400).json({ ok: false, error: "templateJson is required" });
    }
    res.json(await call({ op: "templateLoad", templateJson }));
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.post("/api/template/save", async (req, res) => {
  try {
    const userId = req.body?.userId;
    const templateJson = req.body?.templateJson;
    if (!userId || !templateJson) {
      return res.status(400).json({ ok: false, error: "userId and templateJson are required" });
    }
    res.json(await call({ op: "templateSave", userId, templateJson }));
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.get("/api/template/list", async (_, res) => {
  try { res.json(await call({ op: "templateList" })); }
  catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.delete("/api/template/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({ ok: false, error: "userId is required" });
    }
    res.json(await call({ op: "templateDelete", userId }));
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.delete("/api/template/clear-all", async (_, res) => {
  try { res.json(await call({ op: "templateClear" })); }
  catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

// ============================================================
// V2 ENDPOINTS - CEDDFA Architecture
// ============================================================

// V2: Initialize reader
app.post("/api/v2/init", async (_, res) => {
  try { res.json(await callV2({ op: "init" })); }
  catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

// V2: Enroll with DTOs
app.post("/api/v2/enroll", async (req, res) => {
  try {
    const tag = req.body?.tag || `User_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const timeoutMs = req.body?.timeoutMs ?? 60000;
    const targetFarn = req.body?.targetFarn ?? 21474;
    const maxRetriesPerSample = req.body?.maxRetriesPerSample ?? 3;
    const maxSamples = req.body?.maxSamples ?? 4;
    res.json(await callV2({ op: "enrollV2", tag, timeoutMs, targetFarn, maxRetriesPerSample, maxSamples }));
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

// V2: Verify with DTOs
app.post("/api/v2/verify", async (req, res) => {
  try {
    const tag = req.body?.tag;
    if (!tag) {
      return res.status(400).json({ ok: false, error: "Tag is required for verification" });
    }
    const timeoutMs = req.body?.timeoutMs ?? 15000;
    const targetFarn = req.body?.targetFarn ?? 21474;
    res.json(await callV2({ op: "verifyV2", tag, timeoutMs, targetFarn }));
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

// V2: Identify with DTOs
app.post("/api/v2/identify1n", async (req, res) => {
  try {
    const timeoutMs = req.body?.timeoutMs ?? 12000;
    const targetFarn = req.body?.targetFarn ?? 21474;
    const top = req.body?.top ?? 5;
    res.json(await callV2({ op: "identify1NV2", timeoutMs, targetFarn, top }));
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

// Event Bus Statistics
app.get("/api/v2/eventbus/stats", async (_, res) => {
  try { res.json(await callV2({ op: "getEventBusStats" })); }
  catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

// Clear Event History
app.delete("/api/v2/eventbus/history", async (_, res) => {
  try { res.json(await callV2({ op: "clearEventHistory" })); }
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
    // Inicializar Bridge V1 (legacy)
    await call({
      op: "registerCallback",
      callback: (eventData: any) => {
        console.log("[C# Event V1]", eventData);
        sseBroadcast(eventData);
      }
    });
    const nativeDir = path.join(__dirname, "..", "..", "bin-deps");
    await call({ op: "bootstrap", searchPath: nativeDir });
    console.log("[OK] Bridge V1 bootstrap");

    // Inicializar Bridge V2 (CEDDFA)
    await callV2({
      op: "registerCallback",
      callback: (eventData: any) => {
        console.log("[C# Event V2 CEDDFA]", eventData);
        sseBroadcast(eventData);
      }
    });
    await callV2({ op: "bootstrap", searchPath: nativeDir });
    console.log("[OK] Bridge V2 CEDDFA bootstrap");
  } catch (e) {
    console.error("[WARN] Bootstrap/register failed:", e);
  }
})();

app.listen(PORT, () => console.log(`UI at http://localhost:${PORT}`));
