/* server.ts */
import path = require("path");
import fs = require("fs");
import express = require("express");
import bodyParser = require("body-parser");

const edge = require("edge-js");
type EdgeFunc = (payload: any, cb: (err: any, res: any) => void) => void;

const assemblyFile = path.join(__dirname, "..", "out", "bridge-csharp.dll");
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

type SseClient = { id: number; res: express.Response };
const clients: SseClient[] = [];
let nextId = 1;
function sseBroadcast(ev: any) {
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const c of clients) c.res.write(line);
}

app.use("/", express.static(path.join(__dirname, "public")));

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
    const nativeDir = path.join(__dirname, "..", "bin-deps");
    const out = await call({ op: "bootstrap", searchPath: nativeDir });
    res.json(out);
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.post("/api/register", async (_, res) => {
  try {
    const out = await call({
      op: "registerCallback",
      callback: (err: any, data: any) => {
        if (err) console.error("[C#->JS cb err]", err);
        else sseBroadcast(data);
      }
    });
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

app.post("/api/identify1n", async (req, res) => {
  try {
    const timeoutMs = req.body?.timeoutMs ?? 12000;
    const targetFarn = req.body?.targetFarn ?? 21474;
    const top = req.body?.top ?? 5;
    res.json(await call({ op: "identify1N", timeoutMs, targetFarn, top }));
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

(async () => {
  try {
    await call({
      op: "registerCallback",
      callback: (err: any, data: any) => {
        if (err) console.error("[C#->JS cb err]", err);
        else sseBroadcast(data);
      }
    });
    const nativeDir = path.join(__dirname, "..", "bin-deps");
    await call({ op: "bootstrap", searchPath: nativeDir });
    console.log("[OK] Native bootstrap");
  } catch (e) {
    console.error("[WARN] Bootstrap/register failed:", e);
  }
})();

app.listen(PORT, () => console.log(`UI at http://localhost:${PORT}`));
