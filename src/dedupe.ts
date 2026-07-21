/**
 * 合并重复公司(跨代理命名差异造成的近似重复)。
 * 用法: pnpm tsx src/dedupe.ts
 *
 * 策略(高精度优先,避免误并):
 *  Pass 1 —— 电话相同即同一家(强信号),合并。
 *  Pass 2 —— 两者都无电话且“核心名”相同(去掉 Co./Ltd./括号/地名后)才合并。
 *  保留信息最全的一条为存活者,缺字段用其他条 COALESCE 补齐,联系人转移过去,删除多余。
 */
import { db, initSchema } from "./db.js";

initSchema();

interface Row {
  id: number; name: string; area: string | null; address: string | null;
  phone: string | null; website: string | null; description: string | null;
}

const STRIP = new Set([
  "co", "ltd", "company", "corporation", "corp", "inc", "plc", "limited",
  "จำกัด", "บริษัท", "th", "thailand", "chiang", "mai", "cm", "cnx", "the",
]);
function corename(name: string): string {
  let s = (name || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9ก-๙]+/g, " ");
  const toks = s.split(/\s+/).filter((w) => w && !STRIP.has(w));
  return toks.join(" ").trim();
}
function normPhone(p: string | null): string | null {
  if (!p) return null;
  let d = p.replace(/[^0-9]/g, "");
  if (d.startsWith("66")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return d.length >= 6 ? d : null;
}
const completeness = (r: Row) =>
  [r.address, r.phone, r.website, r.description, r.area].filter(Boolean).length;

const getRow = (id: number) =>
  db.prepare("SELECT id,name,area,address,phone,website,description FROM companies WHERE id=?").get(id) as Row;
const fill = db.prepare(
  `UPDATE companies SET
     area=COALESCE(area,?), address=COALESCE(address,?), phone=COALESCE(phone,?),
     website=COALESCE(website,?), description=COALESCE(description,?), updated_at=datetime('now')
   WHERE id=?`,
);
const moveContacts = db.prepare("UPDATE contacts SET company_id=? WHERE company_id=?");
const delCompany = db.prepare("DELETE FROM companies WHERE id=?");

function mergeGroup(ids: number[]): number {
  if (ids.length < 2) return 0;
  const rows = ids.map(getRow).sort((a, b) => completeness(b) - completeness(a) || a.id - b.id);
  const survivor = rows[0];
  for (const r of rows.slice(1)) {
    fill.run(r.area, r.address, r.phone, r.website, r.description, survivor.id);
    moveContacts.run(survivor.id, r.id);
    delCompany.run(r.id); // 级联删除其 assessments/outreach
  }
  return rows.length - 1;
}

let removed = 0;
const run = db.transaction(() => {
  // Pass 1: 按电话分组
  const all = db.prepare("SELECT id,name,area,address,phone,website,description FROM companies").all() as Row[];
  const byPhone = new Map<string, number[]>();
  for (const r of all) {
    const p = normPhone(r.phone);
    if (!p) continue;
    (byPhone.get(p) ?? byPhone.set(p, []).get(p)!).push(r.id);
  }
  for (const ids of byPhone.values()) removed += mergeGroup(ids);

  // Pass 2: 剩余无电话记录,按核心名分组
  const rest = db.prepare("SELECT id,name,area,address,phone,website,description FROM companies WHERE phone IS NULL").all() as Row[];
  const byCore = new Map<string, number[]>();
  for (const r of rest) {
    const k = corename(r.name);
    if (k.length < 4) continue; // 太短的核心名不并,防误伤
    (byCore.get(k) ?? byCore.set(k, []).get(k)!).push(r.id);
  }
  for (const ids of byCore.values()) removed += mergeGroup(ids);
});
run();

const total = (db.prepare("SELECT COUNT(*) n FROM companies").get() as { n: number }).n;
console.log(`✅ 去重完成:合并删除 ${removed} 家重复,现存 ${total} 家。`);
