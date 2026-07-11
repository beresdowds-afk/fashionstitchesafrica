#!/usr/bin/env node
/**
 * Scans src/ for `supabase.from("<table>").select("col1, col2, ...")` and
 * `.eq("<col>", ...)` calls, then merges the discovered {table -> columns}
 * map into supabase/functions/schema-validator/expected-schema.json so the
 * daily validator flags any missing column.
 *
 * Run locally: node scripts/scan-schema-usage.mjs
 * Diff shown; commit if you added new .select() calls.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";

const files = (await import("node:fs/promises")).then; // placeholder

import { readdirSync, statSync } from "node:fs";

function walk(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(f)) acc.push(p);
  }
  return acc;
}

const usage = new Map(); // table -> Set(columns)
const fromRe = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)([\s\S]{0,600}?)(?=\.from\(|;|\n\n|$)/gi;
const selectRe = /\.select\(\s*["'`]([^"'`]+)["'`]/g;
const filterRe = /\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains)\(\s*["'`]([a-z0-9_]+)["'`]/gi;

for (const file of walk("src")) {
  const src = readFileSync(file, "utf8");
  let m;
  while ((m = fromRe.exec(src))) {
    const table = m[1];
    const chunk = m[2];
    if (!usage.has(table)) usage.set(table, new Set());
    const cols = usage.get(table);
    let s;
    while ((s = selectRe.exec(chunk))) {
      for (const part of s[1].split(",")) {
        const col = part.trim().split(/[\s(:]/)[0];
        if (/^[a-z0-9_*]+$/i.test(col) && col !== "*") cols.add(col);
      }
    }
    let f;
    while ((f = filterRe.exec(chunk))) cols.add(f[1]);
    selectRe.lastIndex = 0;
    filterRe.lastIndex = 0;
  }
}

const manifestPath = "supabase/functions/schema-validator/expected-schema.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const byName = new Map(manifest.objects.map((o) => [o.name, o]));

for (const [table, cols] of usage) {
  if (!byName.has(table)) {
    byName.set(table, {
      type: "table",
      name: table,
      columns: [...cols].sort(),
      auto_scanned: true,
    });
  } else {
    const existing = byName.get(table);
    const merged = new Set([...(existing.columns ?? []), ...cols]);
    existing.columns = [...merged].sort();
  }
}

manifest.objects = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Updated ${manifestPath} with ${byName.size} objects (${usage.size} auto-scanned).`);