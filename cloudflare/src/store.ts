// D1 版数据访问层(全异步)。

export interface ScoreResult {
  budget_estimate: string;
  intent_score: number;
  success_probability: number;
  recommended_channel: "call" | "visit" | "line" | "email";
  reasoning: string;
}

export async function listCompanies(db: D1Database): Promise<any[]> {
  const rows = await db.prepare(`
    SELECT c.*,
           a.intent_score, a.success_probability, a.recommended_channel, a.budget_estimate,
           (SELECT COUNT(*) FROM contacts ct WHERE ct.company_id = c.id) AS contacts_count
    FROM companies c
    LEFT JOIN assessments a ON a.id = (
      SELECT id FROM assessments WHERE company_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
    )
    ORDER BY COALESCE(a.intent_score, -1) DESC, c.confidence DESC
  `).all();
  return rows.results as any[];
}

export async function getCompany(db: D1Database, id: number): Promise<any | null> {
  return await db.prepare("SELECT * FROM companies WHERE id=?").bind(id).first();
}

export async function updateCompanyFields(db: D1Database, id: number, fields: Record<string, unknown>): Promise<void> {
  const allowed = ["name", "type", "area", "address", "phone", "website", "description", "status"];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const key of allowed) {
    if (key in fields && fields[key] !== undefined) {
      sets.push(`${key}=?`);
      vals.push(fields[key]);
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at=datetime('now')");
  vals.push(id);
  await db.prepare(`UPDATE companies SET ${sets.join(", ")} WHERE id=?`).bind(...vals).run();
}

export async function getAssessment(db: D1Database, companyId: number): Promise<any | null> {
  return await db.prepare("SELECT * FROM assessments WHERE company_id=? ORDER BY created_at DESC, id DESC LIMIT 1").bind(companyId).first();
}

export async function saveAssessment(db: D1Database, companyId: number, r: ScoreResult, model: string): Promise<void> {
  await db.prepare(
    `INSERT INTO assessments (company_id, budget_estimate, intent_score, success_probability, recommended_channel, reasoning, model)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(companyId, r.budget_estimate, r.intent_score, r.success_probability, r.recommended_channel, r.reasoning, model).run();
  await db.prepare("UPDATE companies SET status='scored', updated_at=datetime('now') WHERE id=? AND status IN ('new','enriched')").bind(companyId).run();
}

export async function listContacts(db: D1Database, companyId: number): Promise<any[]> {
  const rows = await db.prepare("SELECT * FROM contacts WHERE company_id=? ORDER BY id").bind(companyId).all();
  return rows.results as any[];
}

export async function addContact(db: D1Database, companyId: number, c: Record<string, any>): Promise<number> {
  const res = await db.prepare(
    `INSERT INTO contacts (company_id, name, role, email, phone, line_id, telegram, confidence, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(companyId, c.name ?? null, c.role ?? null, c.email ?? null, c.phone ?? null, c.line_id ?? null, c.telegram ?? null, c.confidence ?? null, c.source ?? "manual").run();
  return Number(res.meta.last_row_id);
}

export async function deleteContact(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM contacts WHERE id=?").bind(id).run();
}

export async function listOutreach(db: D1Database, companyId: number): Promise<any[]> {
  const rows = await db.prepare("SELECT * FROM outreach WHERE company_id=? ORDER BY id DESC").bind(companyId).all();
  return rows.results as any[];
}
export async function addOutreach(db: D1Database, companyId: number, channel: string, content: string): Promise<number> {
  const res = await db.prepare("INSERT INTO outreach (company_id, channel, content, status) VALUES (?, ?, ?, 'draft')")
    .bind(companyId, channel, content).run();
  return Number(res.meta.last_row_id);
}
export async function updateOutreach(db: D1Database, id: number, fields: Record<string, unknown>): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const key of ["content", "status"]) {
    if (key in fields && fields[key] !== undefined) { sets.push(`${key}=?`); vals.push(fields[key]); }
  }
  if (sets.length === 0) return;
  vals.push(id);
  await db.prepare(`UPDATE outreach SET ${sets.join(", ")} WHERE id=?`).bind(...vals).run();
}

export async function stats(db: D1Database): Promise<{ total: number; scored: number; contacts: number }> {
  const total = await db.prepare("SELECT COUNT(*) n FROM companies").first<{ n: number }>();
  const scored = await db.prepare("SELECT COUNT(*) n FROM companies WHERE status NOT IN ('new')").first<{ n: number }>();
  const contacts = await db.prepare("SELECT COUNT(*) n FROM contacts").first<{ n: number }>();
  return { total: total!.n, scored: scored!.n, contacts: contacts!.n };
}
