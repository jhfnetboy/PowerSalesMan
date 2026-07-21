import { db } from "./db.js";
import type { Company, ScoreResult, SeedCompany } from "./types.js";

/** 插入或按 name 更新公司(增量:已存在的只补空字段,不覆盖已有值)。 */
export function upsertCompany(c: SeedCompany, source: string): { id: number; created: boolean } {
  const existing = db.prepare("SELECT * FROM companies WHERE name = ?").get(c.name) as Company | undefined;
  if (existing) {
    db.prepare(
      `UPDATE companies SET
         type        = COALESCE(type, @type),
         area        = COALESCE(area, @area),
         address     = COALESCE(address, @address),
         phone       = COALESCE(phone, @phone),
         website     = COALESCE(website, @website),
         description = COALESCE(description, @description),
         updated_at  = datetime('now')
       WHERE id = @id`,
    ).run({
      id: existing.id,
      type: c.type ?? null,
      area: c.area ?? null,
      address: c.address ?? null,
      phone: c.phone ?? null,
      website: c.website ?? null,
      description: c.description ?? null,
    });
    return { id: existing.id, created: false };
  }
  const info = db.prepare(
    `INSERT INTO companies (name, type, area, address, phone, website, description, source, confidence, status)
     VALUES (@name, @type, @area, @address, @phone, @website, @description, @source, @confidence, 'new')`,
  ).run({
    name: c.name,
    type: c.type ?? null,
    area: c.area ?? null,
    address: c.address ?? null,
    phone: c.phone ?? null,
    website: c.website ?? null,
    description: c.description ?? null,
    source,
    confidence: c.confidence ?? 0.5,
  });
  return { id: Number(info.lastInsertRowid), created: true };
}

export interface CompanyRow extends Company {
  intent_score: number | null;
  success_probability: number | null;
  recommended_channel: string | null;
  budget_estimate: string | null;
  contacts_count: number;
}

/** 列表:每家公司带上「最新一次」评分和联系人数量。 */
export function listCompanies(): CompanyRow[] {
  return db.prepare(`
    SELECT c.*,
           a.intent_score, a.success_probability, a.recommended_channel, a.budget_estimate,
           (SELECT COUNT(*) FROM contacts ct WHERE ct.company_id = c.id) AS contacts_count
    FROM companies c
    LEFT JOIN assessments a ON a.id = (
      SELECT id FROM assessments WHERE company_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
    )
    ORDER BY COALESCE(a.intent_score, -1) DESC, c.confidence DESC
  `).all() as CompanyRow[];
}

export function getCompany(id: number): Company | undefined {
  return db.prepare("SELECT * FROM companies WHERE id = ?").get(id) as Company | undefined;
}

export function updateCompanyFields(id: number, fields: Partial<Company>): void {
  const allowed = ["name", "type", "area", "address", "phone", "website", "description", "status"] as const;
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const key of allowed) {
    if (key in fields && fields[key] !== undefined) {
      sets.push(`${key} = @${key}`);
      params[key] = (fields as Record<string, unknown>)[key];
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE companies SET ${sets.join(", ")} WHERE id = @id`).run(params);
}

export function saveAssessment(companyId: number, r: ScoreResult, model: string): void {
  db.prepare(
    `INSERT INTO assessments (company_id, budget_estimate, intent_score, success_probability, recommended_channel, reasoning, model)
     VALUES (@company_id, @budget_estimate, @intent_score, @success_probability, @recommended_channel, @reasoning, @model)`,
  ).run({ company_id: companyId, ...r, model });
  db.prepare("UPDATE companies SET status = 'scored', updated_at = datetime('now') WHERE id = ? AND status IN ('new','enriched')").run(companyId);
}

// ---- contacts ----
export interface Contact {
  id: number;
  company_id: number;
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  line_id: string | null;
  telegram: string | null;
  confidence: number | null;
  source: string | null;
}

export function listContacts(companyId: number): Contact[] {
  return db.prepare("SELECT * FROM contacts WHERE company_id = ? ORDER BY id").all(companyId) as Contact[];
}

export function addContact(companyId: number, c: Partial<Contact>): number {
  const info = db.prepare(
    `INSERT INTO contacts (company_id, name, role, email, phone, line_id, telegram, confidence, source)
     VALUES (@company_id, @name, @role, @email, @phone, @line_id, @telegram, @confidence, @source)`,
  ).run({
    company_id: companyId,
    name: c.name ?? null, role: c.role ?? null, email: c.email ?? null,
    phone: c.phone ?? null, line_id: c.line_id ?? null, telegram: c.telegram ?? null,
    confidence: c.confidence ?? null, source: c.source ?? "manual",
  });
  return Number(info.lastInsertRowid);
}

export function deleteContact(id: number): void {
  db.prepare("DELETE FROM contacts WHERE id = ?").run(id);
}

export function getAssessment(companyId: number) {
  return db.prepare("SELECT * FROM assessments WHERE company_id = ? ORDER BY created_at DESC, id DESC LIMIT 1").get(companyId);
}

export function stats() {
  const total = (db.prepare("SELECT COUNT(*) n FROM companies").get() as { n: number }).n;
  const scored = (db.prepare("SELECT COUNT(*) n FROM companies WHERE status NOT IN ('new')").get() as { n: number }).n;
  const contacts = (db.prepare("SELECT COUNT(*) n FROM contacts").get() as { n: number }).n;
  return { total, scored, contacts };
}
