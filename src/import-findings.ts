/**
 * 把研究代理产出的 enrich-*.json 合并入库。
 * 用法: pnpm tsx src/import-findings.ts <含 enrich-*.json 的目录>
 *
 * 规则:
 *  - 按公司名归一化去重(跨文件合并,择优取非空 + 取高 confidence)。
 *  - 已在库的公司:只补空字段(COALESCE),不覆盖已有值(“完善”而非“清洗”)。
 *  - 新公司:插入,source=web-enrich,status=enriched。
 *  - 联系人:单独入库,按 (公司, 姓名/邮箱/电话) 去重。
 *  - 幂等:可重复运行。
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db, initSchema } from "./db.js";

initSchema();

const dir = process.argv[2];
if (!dir) {
  console.error("usage: pnpm tsx src/import-findings.ts <dir-with-enrich-*.json>");
  process.exit(1);
}

interface Contact { name?: string | null; role?: string | null; email?: string | null; phone?: string | null; line_id?: string | null; telegram?: string | null; }
interface Finding {
  name: string; type?: string; area?: string | null; address?: string | null;
  phone?: string | null; website?: string | null; email?: string | null; line_id?: string | null;
  description?: string | null; confidence?: number; contacts?: Contact[]; sources?: string[];
}

const TYPES = new Set(["coworking", "university", "software_company", "agency", "community", "other"]);
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9฀-๿]+/g, " ").trim();
const clean = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s && !/^(n\/?a|null|unknown|-)$/i.test(s) ? s : null;
};

// 1) 读取所有 enrich-*.json
const files = readdirSync(dir).filter((f) => /^enrich-.*\.json$/.test(f));
if (files.length === 0) { console.error(`目录里没有 enrich-*.json: ${dir}`); process.exit(1); }
const raw: Finding[] = [];
for (const f of files) {
  try {
    const j = JSON.parse(readFileSync(resolve(dir, f), "utf8"));
    const arr: Finding[] = Array.isArray(j) ? j : j.companies ?? [];
    raw.push(...arr);
    console.log(`  读取 ${f}: ${arr.length} 条`);
  } catch (e) {
    console.warn(`  跳过 ${f}: ${(e as Error).message}`);
  }
}

// 2) 跨文件按名归一化合并
const merged = new Map<string, Finding>();
for (const f of raw) {
  const name = clean(f?.name);
  if (!name) continue;
  const k = norm(name);
  if (!k) continue;
  const cur = merged.get(k);
  if (!cur) {
    merged.set(k, { ...f, name, contacts: f.contacts ?? [], sources: f.sources ?? [] });
  } else {
    cur.address ??= clean(f.address); cur.phone ??= clean(f.phone); cur.website ??= clean(f.website);
    cur.email ??= clean(f.email); cur.line_id ??= clean(f.line_id); cur.area ??= clean(f.area);
    cur.description ??= clean(f.description); cur.type ??= f.type;
    cur.confidence = Math.max(cur.confidence ?? 0, f.confidence ?? 0);
    cur.contacts!.push(...(f.contacts ?? []));
    cur.sources!.push(...(f.sources ?? []));
  }
}
console.log(`\n合并后去重公司数: ${merged.size}`);

// 3) 现有库内公司(归一化名 → row)
const dbRows = db.prepare("SELECT id, name FROM companies").all() as { id: number; name: string }[];
const dbByNorm = new Map(dbRows.map((r) => [norm(r.name), r.id]));

const insCompany = db.prepare(
  `INSERT INTO companies (name, type, area, address, phone, website, description, source, confidence, status)
   VALUES (@name, @type, @area, @address, @phone, @website, @description, 'web-enrich', @confidence, 'enriched')`,
);
const updCompany = db.prepare(
  `UPDATE companies SET
     area        = COALESCE(area, @area),
     address     = COALESCE(address, @address),
     phone       = COALESCE(phone, @phone),
     website     = COALESCE(website, @website),
     description = COALESCE(description, @description),
     status      = CASE WHEN status = 'new' THEN 'enriched' ELSE status END,
     updated_at  = datetime('now')
   WHERE id = @id`,
);
const findContact = db.prepare(
  `SELECT id FROM contacts WHERE company_id = ? AND
     COALESCE(name,'') = COALESCE(?, '') AND COALESCE(email,'') = COALESCE(?, '') AND COALESCE(phone,'') = COALESCE(?, '')`,
);
const insContact = db.prepare(
  `INSERT INTO contacts (company_id, name, role, email, phone, line_id, telegram, confidence, source)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'web-enrich')`,
);

let inserted = 0, updated = 0, contactsAdded = 0;

const run = db.transaction(() => {
  for (const f of merged.values()) {
    let companyId = dbByNorm.get(norm(f.name));
    const type = f.type && TYPES.has(f.type) ? f.type : "software_company";

    if (companyId) {
      updCompany.run({
        id: companyId, area: clean(f.area), address: clean(f.address), phone: clean(f.phone),
        website: clean(f.website), description: clean(f.description),
      });
      updated++;
    } else {
      const info = insCompany.run({
        name: f.name, type, area: clean(f.area), address: clean(f.address), phone: clean(f.phone),
        website: clean(f.website), description: clean(f.description),
        confidence: typeof f.confidence === "number" ? f.confidence : 0.5,
      });
      companyId = Number(info.lastInsertRowid);
      dbByNorm.set(norm(f.name), companyId);
      inserted++;
    }

    // 组织级 email/line 若无对应命名联系人 → 存成一个 general 联系人
    const contacts: Contact[] = [...(f.contacts ?? [])];
    if ((clean(f.email) || clean(f.line_id)) && contacts.length === 0) {
      contacts.push({ name: null, role: "general", email: clean(f.email), line_id: clean(f.line_id) });
    }
    for (const c of contacts) {
      const name = clean(c.name), email = clean(c.email), phone = clean(c.phone);
      const line = clean(c.line_id), tg = clean(c.telegram), role = clean(c.role);
      if (!name && !email && !phone && !line && !tg) continue;
      const dup = findContact.get(companyId, name, email, phone);
      if (dup) continue;
      insContact.run(companyId, name, role, email, phone, line, tg, f.confidence ?? null);
      contactsAdded++;
    }
  }
});
run();

const total = (db.prepare("SELECT COUNT(*) n FROM companies").get() as { n: number }).n;
const withAddr = (db.prepare("SELECT COUNT(*) n FROM companies WHERE address IS NOT NULL").get() as { n: number }).n;
const withPhone = (db.prepare("SELECT COUNT(*) n FROM companies WHERE phone IS NOT NULL").get() as { n: number }).n;
console.log(`\n✅ 入库完成:新增 ${inserted} 家,更新 ${updated} 家,新增联系人 ${contactsAdded}。`);
console.log(`   现在库里共 ${total} 家 · 有地址 ${withAddr} · 有电话 ${withPhone}。`);
