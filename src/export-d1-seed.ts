/**
 * 把本地 SQLite 数据导出成 D1 可反复执行的 seed(INSERT OR REPLACE,幂等)。
 * 用法: pnpm tsx src/export-d1-seed.ts
 * 产物: cloudflare/seed-data.sql
 * 之后: cd cloudflare && npx wrangler d1 execute powersalesman --remote --file seed-data.sql -y
 */
import Database from "better-sqlite3";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(resolve(__dirname, "../data/psm.db"));

const q = (v: unknown) =>
  v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;

const out: string[] = ["-- PowerSalesMan D1 seed (INSERT OR REPLACE, idempotent)", "PRAGMA foreign_keys=OFF;"];
function dump(table: string, cols: string[]): number {
  const rows = db.prepare(`SELECT ${cols.join(",")} FROM ${table}`).all() as Record<string, unknown>[];
  for (const r of rows) {
    out.push(`INSERT OR REPLACE INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => q(r[c])).join(",")});`);
  }
  return rows.length;
}

const nc = dump("companies", ["id", "name", "type", "area", "address", "phone", "website", "description", "source", "confidence", "status"]);
const nk = dump("contacts", ["id", "company_id", "name", "role", "email", "phone", "line_id", "telegram", "confidence", "source"]);
const na = dump("assessments", ["id", "company_id", "budget_estimate", "intent_score", "success_probability", "recommended_channel", "reasoning", "model"]);

const path = resolve(__dirname, "../cloudflare/seed-data.sql");
writeFileSync(path, out.join("\n") + "\n");
console.log(`✅ 导出 → cloudflare/seed-data.sql  (companies ${nc} / contacts ${nk} / assessments ${na})`);
