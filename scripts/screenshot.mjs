#!/usr/bin/env node
// node scripts/screenshot.mjs [outDir]   (run `npm run build` first)
//
// Captures every public screen at phone width using headless Chrome/Edge, in
// both languages for Pathways. Useful for reviewing the design in one pass and
// for checking Ethiopic wrapping without a device to hand.
//
// Screens behind auth (SOS, dashboard, organizations) are not captured here.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || join(__dirname, "..", "docs", "screenshots");
const PORT = 4300 + Math.floor(Math.random() * 500);
const ORIGIN = `http://localhost:${PORT}`;

const chrome = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean).find((p) => existsSync(p));
if (!chrome) { console.error("no Chrome/Edge found; set CHROME=/path/to/chrome"); process.exit(2); }
if (!existsSync(join(__dirname, "..", "dist", "index.html"))) { console.error("run `npm run build` first"); process.exit(2); }
mkdirSync(OUT, { recursive: true });

const server = spawn(process.execPath, [join(__dirname, "serve.mjs")], { stdio: "ignore", env: { ...process.env, PORT: String(PORT) } });
for (let i = 0; i < 50; i++) {
  if (await fetch(`${ORIGIN}/pathways/dataset-version.json`).then((r) => r.ok).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 100));
}

const profile = mkdtempSync(join(tmpdir(), "haven-shot-"));
const port = 9333 + Math.floor(Math.random() * 500);
const browser = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const cleanup = () => {
  try { browser.kill(); } catch {}
  try { server.kill(); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);

let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  wsUrl = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((v) => v.webSocketDebuggerUrl).catch(() => undefined);
  if (!wsUrl) await new Promise((r) => setTimeout(r, 200));
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const evaluate = (expression) =>
  send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId).then((r) => r.result.value);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (re) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll('button, a')].find(x => ${re}.test(x.textContent || x.getAttribute('aria-label') || ''));
    if (el) el.click();
    return !!el;
  })()`);
const shot = async (name) => {
  await sleep(450);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId);
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`wrote ${name}.png`);
};
const go = async (path) => {
  await send("Page.navigate", { url: `${ORIGIN}${path}` }, sessionId);
  await sleep(1400);
};

await send("Page.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);

await go("/");
await shot("01-landing");

await go("/auth");
await shot("02-auth-signup");
await click(/Sign in$/);
await shot("03-auth-signin");

await go("/respond");
await shot("04-responder-signin");

await go("/install");
await shot("05-install");

await go("/nope");
await shot("06-not-found");

await go("/pathways");
await shot("07-pathways-home");
await click(/I need somewhere to stay/);
await shot("08-pathways-results");
await click(/AWSAD/);
await shot("09-pathways-record");
await click(/አማርኛ/);
await shot("10-pathways-record-am");
await click(/English/);
await click(/Simple view/);
await shot("11-pathways-record-simple");
await go("/pathways");
await shot("12-pathways-home-simple");

// Desktop width for the marketing page.
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
await go("/");
await shot("13-landing-desktop");

ws.close();
cleanup();
