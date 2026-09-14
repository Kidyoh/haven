#!/usr/bin/env node
// npm run build:dataset
//
// Merges /data/meta.json and every region file into public/dataset.json, the
// single file the app fetches once and then keeps in IndexedDB. The version is
// a content hash, so an unchanged dataset produces an unchanged version and the
// client can tell "nothing new" from "new records" without a server.
//
// This script only assembles. It never edits, fills, or guesses a field.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const OUT_DIR = join(__dirname, "..", "public", "pathways");

const meta = JSON.parse(readFileSync(join(DATA_DIR, "meta.json"), "utf8"));

const regionFiles = readdirSync(DATA_DIR)
  .filter((f) => f.endsWith(".json") && f !== "schema.json" && f !== "meta.json")
  .sort();

const records = [];
for (const file of regionFiles) {
  const arr = JSON.parse(readFileSync(join(DATA_DIR, file), "utf8"));
  if (!Array.isArray(arr)) throw new Error(`${file}: expected an array of records`);
  for (const rec of arr) records.push({ ...rec, _file: file });
}

// Stable ordering so the hash only changes when content changes.
records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const canonical = JSON.stringify({ meta, records });
const version = createHash("sha256").update(canonical).digest("hex").slice(0, 12);

const dataset = {
  version,
  generated_at: new Date().toISOString().slice(0, 10),
  record_count: records.length,
  meta,
  records,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "dataset.json"), JSON.stringify(dataset));
writeFileSync(join(OUT_DIR, "dataset-version.json"), JSON.stringify({ version, record_count: records.length }));

console.log(`dataset.json: ${records.length} records from ${regionFiles.length} file(s), version ${version}`);
