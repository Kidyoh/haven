#!/usr/bin/env node
// npm run verify
//
// Validates every region file in /data against /data/schema.json and reports
// staleness counts. Exit code 1 on any schema error, duplicate id, or data-rule
// violation. Nothing here mutates data: a stale record is reported, never
// downgraded. (An old phone number the user knows is old is more useful than a
// silent gap; that decision is made by a human editing the file, not by a script.)
//
// Usage: node scripts/verify.mjs [--json] [--today=YYYY-MM-DD]

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const asJson = args.get("json") === true;
const today = args.get("today") ? new Date(String(args.get("today"))) : new Date();

const schema = JSON.parse(readFileSync(join(DATA_DIR, "schema.json"), "utf8"));
const meta = JSON.parse(readFileSync(join(DATA_DIR, "meta.json"), "utf8"));
const stalenessDays = Number(meta.staleness_days ?? 90);

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const regionFiles = readdirSync(DATA_DIR)
  .filter((f) => f.endsWith(".json") && f !== "schema.json" && f !== "meta.json")
  .sort();

const report = {
  today: today.toISOString().slice(0, 10),
  staleness_days: stalenessDays,
  files: [],
  totals: {
    records: 0,
    verified: 0,
    verified_stale: 0,
    unverified: 0,
    reported_closed: 0,
    placeholder: 0,
    no_phone: 0,
    no_hours: 0,
    no_source_url: 0,
    by_verified_via: { document: 0, institutional_contact: 0, phone: 0 },
    by_category: {},
  },
  errors: [],
};

const seenIds = new Map();
const idPrefix = String(meta.country_code ?? "").toLowerCase();

for (const file of regionFiles) {
  const path = join(DATA_DIR, file);
  let records;
  try {
    records = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    report.errors.push({ file, error: `invalid JSON: ${e.message}` });
    continue;
  }

  const ok = validate(records);
  if (!ok) {
    for (const err of validate.errors ?? []) {
      const idx = err.instancePath.match(/^\/(\d+)/)?.[1];
      const rec = idx !== undefined ? records[Number(idx)] : undefined;
      report.errors.push({
        file,
        id: rec?.id ?? null,
        path: err.instancePath || "/",
        error: `${err.message}${err.params?.allowedValues ? ` (${err.params.allowedValues.join(", ")})` : ""}`,
      });
    }
  }

  const fileReport = { file, records: 0, verified: 0, verified_stale: 0, unverified: 0, reported_closed: 0, stale_ids: [] };

  for (const rec of Array.isArray(records) ? records : []) {
    if (typeof rec !== "object" || rec === null) continue;
    fileReport.records += 1;
    report.totals.records += 1;

    // Data rules that JSON Schema cannot express cleanly.
    if (rec.id) {
      if (seenIds.has(rec.id)) {
        report.errors.push({ file, id: rec.id, path: "/id", error: `duplicate id (also in ${seenIds.get(rec.id)})` });
      } else {
        seenIds.set(rec.id, file);
      }
      if (idPrefix && !rec.id.startsWith(`${idPrefix}-`)) {
        report.errors.push({ file, id: rec.id, path: "/id", error: `id must start with "${idPrefix}-" (meta.country_code)` });
      }
    }
    if (rec.verified_on && !Number.isNaN(Date.parse(rec.verified_on)) && new Date(rec.verified_on) > today) {
      report.errors.push({ file, id: rec.id, path: "/verified_on", error: "verified_on is in the future" });
    }

    // Counts. Staleness is computed, never written back.
    const t = report.totals;
    if (rec.status === "verified") {
      t.verified += 1;
      fileReport.verified += 1;
      const ageDays = (today - new Date(rec.verified_on)) / 86_400_000;
      if (ageDays > stalenessDays) {
        t.verified_stale += 1;
        fileReport.verified_stale += 1;
        fileReport.stale_ids.push(rec.id);
      }
    } else if (rec.status === "unverified") {
      t.unverified += 1;
      fileReport.unverified += 1;
    } else if (rec.status === "reported_closed") {
      t.reported_closed += 1;
      fileReport.reported_closed += 1;
    }
    if (rec.placeholder) t.placeholder += 1;
    if (!rec.phone || rec.phone.length === 0) t.no_phone += 1;
    if (rec.hours == null) t.no_hours += 1;
    if (rec.source_url == null) t.no_source_url += 1;
    if (rec.verified_via in t.by_verified_via) t.by_verified_via[rec.verified_via] += 1;
    if (rec.category) t.by_category[rec.category] = (t.by_category[rec.category] ?? 0) + 1;
  }
  report.files.push(fileReport);
}

report.ok = report.errors.length === 0;

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const t = report.totals;
  console.log(`Pathways data check — ${report.today} (staleness threshold ${stalenessDays} days)\n`);
  for (const f of report.files) {
    console.log(
      `  ${f.file.padEnd(24)} ${String(f.records).padStart(3)} records   verified ${f.verified}` +
        ` (stale ${f.verified_stale})   unverified ${f.unverified}   reported_closed ${f.reported_closed}`,
    );
    for (const id of f.stale_ids) console.log(`      needs re-verification: ${id}`);
  }
  console.log("");
  console.log(`  total records        ${t.records}`);
  console.log(`  verified             ${t.verified}  (stale: ${t.verified_stale})`);
  console.log(`  unverified           ${t.unverified}`);
  console.log(`  reported_closed      ${t.reported_closed}`);
  console.log(`  placeholder rows     ${t.placeholder}`);
  console.log(`  verified_via         document ${t.by_verified_via.document}, institutional_contact ${t.by_verified_via.institutional_contact}, phone ${t.by_verified_via.phone}`);
  console.log(`  by category          ${Object.entries(t.by_category).map(([k, v]) => `${k} ${v}`).join(", ") || "-"}`);
  console.log(`  gaps                 no phone ${t.no_phone}, no hours ${t.no_hours}, no source URL ${t.no_source_url}`);
  console.log("");
  if (report.errors.length) {
    console.log(`  ${report.errors.length} problem(s):`);
    for (const e of report.errors) {
      console.log(`    ${e.file}${e.id ? ` [${e.id}]` : ""} ${e.path ?? ""}: ${e.error}`);
    }
  } else {
    console.log("  schema: all records valid, ids unique");
  }
}

process.exit(report.ok ? 0 : 1);
