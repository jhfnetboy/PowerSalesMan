// D1 + Web Crypto 版鉴权(Workers 运行时,全异步)。

export type Role = "admin" | "sales";
export interface Session { token: string; role: Role; label: string | null; grant_id: number | null; expires_at: string; }

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomHex(n: number): string {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomCode(): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  const b64 = btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "psm-" + b64;
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

async function createSession(db: D1Database, role: Role, label: string | null, grantId: number | null, expiresAt: string): Promise<Session> {
  const token = randomHex(32);
  await db.prepare(`INSERT INTO sessions (token, role, label, grant_id, expires_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(token, role, label, grantId, expiresAt).run();
  return { token, role, label, grant_id: grantId, expires_at: expiresAt };
}

export async function login(db: D1Database, password: string, adminPassword: string, sessionTtlDays: number): Promise<Session | null> {
  if (!password) return null;
  if (safeEqual(password, adminPassword)) {
    return createSession(db, "admin", "admin", null, isoInDays(sessionTtlDays));
  }
  const hash = await sha256(password);
  const grant = await db.prepare(
    `SELECT id, label, expires_at FROM access_grants WHERE code_hash=? AND revoked=0 AND expires_at>datetime('now') ORDER BY expires_at DESC LIMIT 1`,
  ).bind(hash).first<{ id: number; label: string | null; expires_at: string }>();
  if (!grant) return null;
  return createSession(db, "sales", grant.label, grant.id, grant.expires_at);
}

export async function getSession(db: D1Database, token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const s = await db.prepare(`SELECT token, role, label, grant_id, expires_at FROM sessions WHERE token=? AND expires_at>datetime('now')`)
    .bind(token).first<Session>();
  return s ?? null;
}

export async function logout(db: D1Database, token: string | undefined): Promise<void> {
  if (token) await db.prepare("DELETE FROM sessions WHERE token=?").bind(token).run();
}

export async function purgeExpiredSessions(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE expires_at<=datetime('now')").run();
}

// ---- 管理员:销售授权码 ----
export interface Grant { id: number; label: string | null; role: string; created_at: string; expires_at: string; revoked: number; active: boolean; }

function toGrant(g: any): Grant {
  const expired = new Date(g.expires_at).getTime() <= Date.now();
  return { id: g.id, label: g.label, role: g.role, created_at: g.created_at, expires_at: g.expires_at, revoked: g.revoked, active: g.revoked === 0 && !expired };
}

export async function createGrant(db: D1Database, label: string, days: number): Promise<{ grant: Grant; code: string }> {
  const validDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 7;
  const code = randomCode();
  const hash = await sha256(code);
  const res = await db.prepare(`INSERT INTO access_grants (label, code_hash, role, expires_at) VALUES (?, ?, 'sales', ?)`)
    .bind(label || null, hash, isoInDays(validDays)).run();
  const id = Number(res.meta.last_row_id);
  const g = await db.prepare("SELECT * FROM access_grants WHERE id=?").bind(id).first();
  return { grant: toGrant(g), code };
}

export async function listGrants(db: D1Database): Promise<Grant[]> {
  const rows = await db.prepare("SELECT * FROM access_grants ORDER BY created_at DESC").all();
  return (rows.results as any[]).map(toGrant);
}

export async function revokeGrant(db: D1Database, id: number): Promise<void> {
  await db.prepare("UPDATE access_grants SET revoked=1 WHERE id=?").bind(id).run();
  await db.prepare("DELETE FROM sessions WHERE grant_id=?").bind(id).run();
}
