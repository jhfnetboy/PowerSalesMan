import "dotenv/config";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me-please";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? "30");

if (!process.env.ADMIN_PASSWORD) {
  console.warn("⚠️  ADMIN_PASSWORD 未在 .env 设置,暂用默认口令 'change-me-please' —— 上线前务必修改!");
}

export type Role = "admin" | "sales";

export interface Session {
  token: string;
  role: Role;
  label: string | null;
  grant_id: number | null;
  expires_at: string;
}

export interface Grant {
  id: number;
  label: string | null;
  role: string;
  created_at: string;
  expires_at: string;
  revoked: number;
  active: boolean; // 计算字段:未撤销且未过期
}

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** 常数时间比较,避免计时侧信道。 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function isoInDays(days: number): string {
  const ms = Date.now() + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

/**
 * 用口令登陆。admin 口令来自 env;否则匹配一个未撤销未过期的 sales 授权码。
 * 成功返回新建的 session,失败返回 null。
 */
export function login(password: string): Session | null {
  if (!password) return null;

  // 管理员
  if (safeEqual(password, ADMIN_PASSWORD)) {
    return createSession("admin", "admin", null, isoInDays(SESSION_TTL_DAYS));
  }

  // 销售授权码
  const hash = sha256(password);
  const grant = db
    .prepare(
      `SELECT * FROM access_grants
       WHERE code_hash = ? AND revoked = 0 AND expires_at > datetime('now')
       ORDER BY expires_at DESC LIMIT 1`,
    )
    .get(hash) as { id: number; label: string | null; expires_at: string } | undefined;

  if (!grant) return null;
  // 会话有效期不超过授权码有效期
  return createSession("sales", grant.label, grant.id, grant.expires_at);
}

function createSession(role: Role, label: string | null, grantId: number | null, expiresAt: string): Session {
  const token = randomBytes(32).toString("hex");
  db.prepare(
    `INSERT INTO sessions (token, role, label, grant_id, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(token, role, label, grantId, expiresAt);
  return { token, role, label, grant_id: grantId, expires_at: expiresAt };
}

/** 校验 cookie token,过期/无效返回 null。 */
export function getSession(token: string | undefined): Session | null {
  if (!token) return null;
  const s = db
    .prepare(`SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')`)
    .get(token) as Session | undefined;
  return s ?? null;
}

export function logout(token: string | undefined): void {
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

/** 清理过期会话(登陆时顺手调一次)。 */
export function purgeExpiredSessions(): void {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

// ---- 管理员:销售授权码管理 ----

/** 生成一个新的销售登陆码(明文只返回这一次)。默认 7 天有效。 */
export function createGrant(label: string, days = 7): { grant: Grant; code: string } {
  const validDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 7;
  // 人类可读但足够随机的登陆码
  const code = "psm-" + randomBytes(6).toString("base64url");
  const info = db
    .prepare(
      `INSERT INTO access_grants (label, code_hash, role, expires_at)
       VALUES (?, ?, 'sales', ?)`,
    )
    .run(label || null, sha256(code), isoInDays(validDays));
  const grant = getGrant(Number(info.lastInsertRowid))!;
  return { grant, code };
}

function rowToGrant(g: any): Grant {
  const expired = new Date(g.expires_at).getTime() <= Date.now();
  const { code_hash, ...rest } = g; // 不外泄 code_hash
  return { ...rest, active: g.revoked === 0 && !expired };
}

export function getGrant(id: number): Grant | undefined {
  const g = db.prepare("SELECT * FROM access_grants WHERE id = ?").get(id);
  return g ? rowToGrant(g) : undefined;
}

export function listGrants(): Grant[] {
  const rows = db.prepare("SELECT * FROM access_grants ORDER BY created_at DESC").all();
  return rows.map(rowToGrant);
}

export function revokeGrant(id: number): void {
  db.prepare("UPDATE access_grants SET revoked = 1 WHERE id = ?").run(id);
  // 同时踢掉该授权码现有会话
  db.prepare("DELETE FROM sessions WHERE grant_id = ?").run(id);
}

export const DEFAULT_LANG = process.env.DEFAULT_LANG ?? "en";
