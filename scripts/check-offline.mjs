#!/usr/bin/env node
// npm run check:offline   (run `npm run build` first)
//
// Proves the Pathways offline claim end to end with a real (headless) Chromium:
//   1. serve ./dist on a private port and load /pathways once, online
//   2. wait for the service worker to install and precache; check IndexedDB
//   3. kill the server (CDP network emulation only affects the page, not the
//      service worker, so stopping the server is the only honest cut) and
//      navigate again — a plain navigation, since a hard reload bypasses
//      service workers
//   4. assert the shell renders, the offline banner shows, and records are
//      still listed from the device; and that in-app navigation added no
//      history entries
//
// Needs Chrome or Edge on the machine.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PORT = 4300 + Math.floor(Math.random() * 500);
const ORIGIN = `http://localhost:${SERVER_PORT}`;
const PAGE = `${ORIGIN}/pathways`;

const CANDIDATES = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error("no Chrome/Edge found; set CHROME=/path/to/chrome");
  process.exit(2);
}
if (!existsSync(join(__dirname, "..", "dist", "index.html"))) {
  console.error("dist/ not found; run `npm run build` first");
  process.exit(2);
}

let server = spawn(process.execPath, [join(__dirname, "serve.mjs")], { stdio: "ignore", env: { ...process.env, PORT: String(SERVER_PORT) } });
const up = () => fetch(`${ORIGIN}/pathways/dataset-version.json`).then((r) => r.ok).catch(() => false);
for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));

const profile = mkdtempSync(join(tmpdir(), "haven-chrome-"));
const port = 9333 + Math.floor(Math.random() * 500);
const browser = spawn(
  chrome,
  ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank"],
  { stdio: "ignore" },
);

const cleanup = () => {
  try { browser.kill(); } catch {}
  try { server?.kill(); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);

async function waitForDevtools() {
  for (let i = 0; i < 50; i++) {
    try {
      const v = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
      if (v.webSocketDebuggerUrl) return v.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("devtools did not come up");
}

const ws = new WebSocket(await waitForDevtools());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForText(re, ms = 8000) {
  const t0 = Date.now();
  let text = "";
  while (Date.now() - t0 < ms) {
    text = await evaluate("document.body.innerText").catch(() => "");
    if (re.test(text)) return text;
    await sleep(150);
  }
  return text;
}

await send("Page.enable", {}, sessionId);
await send("Network.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 740, deviceScaleFactor: 2, mobile: true }, sessionId);

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!ok) failures++;
};

// 1. online first visit
await send("Page.navigate", { url: PAGE }, sessionId);
let text = await waitForText(/What do you need\?/);
check("online: /pathways renders needs", /What do you need\?/.test(text));

// 2. service worker + precache + IndexedDB
const swState = await evaluate(`navigator.serviceWorker.ready.then(async r => {
  const keys = await caches.keys();
  return { active: !!r.active, keys, shell: !!(await caches.match('/index.html', { ignoreSearch: true })), dataset: !!(await caches.match('/pathways/dataset.json', { ignoreSearch: true })) };
})`);
check("service worker active", swState.active);
check("shell precached", swState.shell, swState.keys.join(","));
check("dataset precached", swState.dataset);
const idb = await evaluate(`new Promise(res => { const q = indexedDB.open('pathways'); q.onsuccess = () => { try { const g = q.result.transaction('kv').objectStore('kv').get('dataset'); g.onsuccess = () => res(g.result ? g.result.record_count : 0); g.onerror = () => res(-1); } catch { res(-3); } }; q.onerror = () => res(-2); })`);
check("dataset stored in IndexedDB", idb > 0, `${idb} records`);
await sleep(1500);
const onlineText = await evaluate("document.body.innerText");
const bannerHidden = !/Working offline/.test(onlineText);
if (!bannerHidden) {
  const probe = await evaluate(`fetch("/pathways/dataset-version.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.status + " " + r.headers.get("content-type")).catch(e => "ERR " + e.message)`);
  console.log("  [debug] navigator.onLine =", await evaluate("navigator.onLine"), "| version fetch:", probe, "| controller:", await evaluate("!!navigator.serviceWorker.controller"));
}
check("online: offline banner hidden", bannerHidden);

// 3. offline: stop the server, flip the page offline, navigate again
server.kill();
for (let i = 0; i < 50 && (await up()); i++) await sleep(100);
server = null;
await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
await send("Page.navigate", { url: PAGE }, sessionId);
text = await waitForText(/What do you need\?/);
check("offline: shell renders", /What do you need\?/.test(text));
if (!/What do you need\?/.test(text)) console.log("  page text was:", JSON.stringify(text.slice(0, 200)));
text = await waitForText(/Working offline/);
check("offline: banner shown", /Working offline/.test(text));
await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => /All places/.test(x.textContent)); b && b.click(); })()`);
text = await waitForText(/Not yet confirmed|Verified|Reported closed/);
const n = (text.match(/Not yet confirmed|Verified|Reported closed/g) || []).length;
check("offline: records listed from device", n > 0, `${n} status pills`);
await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Gandhi/.test(x.textContent)); b && b.click(); })()`);
text = await waitForText(/Original source text/);
check("offline: record detail renders", /Original source text/.test(text));

// 4. no history entries were created while navigating inside the app
const hist = await evaluate("history.length");
check("no history entries added by in-app navigation", hist <= 3, `history.length=${hist}`);

ws.close();
cleanup();
console.log(failures ? `\n${failures} check(s) failed` : "\nall offline checks passed");
process.exit(failures ? 1 : 0);
