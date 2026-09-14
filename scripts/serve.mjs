#!/usr/bin/env node
// Serves the production build in ./dist with SPA fallback, no dependencies.
// Used by scripts/check-offline.mjs; `npm run preview` (vite) also works for
// manual checks. Service workers need a secure context; localhost counts.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) throw new Error("outside root");
    let s = await stat(file).catch(() => null);
    if (!s || s.isDirectory()) {
      // SPA fallback: unknown paths (e.g. /pathways) serve the app shell.
      file = join(ROOT, "index.html");
      s = await stat(file).catch(() => null);
    }
    if (!s) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("not found");
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] || "application/octet-stream",
      "Cache-Control": file.includes("assets") ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end();
  }
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
