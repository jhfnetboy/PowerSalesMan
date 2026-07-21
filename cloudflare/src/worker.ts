import type { Env } from "./score";
import { aiEnabled, aiModelName, draftOutreach, scoreCompany } from "./score";
import {
  createGrant, getSession, listGrants, login, logout, purgeExpiredSessions, revokeGrant, type Session,
} from "./auth";
import {
  addContact, addOutreach, deleteContact, getAssessment, getCompany, listCompanies, listContacts,
  listOutreach, saveAssessment, stats, updateCompanyFields, updateOutreach,
} from "./store";

const COOKIE = "psm_session";

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}
function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}
function sessionCookie(token: string, expiresAt: string): string {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`;
}
function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
async function body(req: Request): Promise<any> {
  try { return await req.json(); } catch { return {}; }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;
    const adminPw = env.ADMIN_PASSWORD ?? "change-me-please";
    const ttl = Number(env.SESSION_TTL_DAYS ?? "30");

    // 非 API 请求交给静态资源(index.html 等)
    if (!path.startsWith("/api/")) {
      return env.ASSETS.fetch(req);
    }

    try {
      const session: Session | null = await getSession(env.DB, getCookie(req, COOKIE));

      // 公开
      if (path === "/api/config" && method === "GET") {
        return json({ default_lang: env.DEFAULT_LANG ?? "en" });
      }
      if (path === "/api/login" && method === "POST") {
        // 登录限流(D1 实现):60s 内失败满 8 次即 429;仅记失败,登录成功清零
        const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
        const now = Date.now();
        const WINDOW = 60000, MAX = 8;
        await env.DB.prepare("DELETE FROM login_attempts WHERE CAST(window_start AS INTEGER) < ?").bind(now - WINDOW).run();
        const row = await env.DB.prepare("SELECT count FROM login_attempts WHERE ip=?").bind(ip).first<{ count: number }>();
        if (row && row.count >= MAX) return json({ error: "rate_limited" }, 429);

        await purgeExpiredSessions(env.DB);
        const b = await body(req);
        const s = await login(env.DB, String(b.password ?? ""), adminPw, ttl);
        if (!s) {
          if (row) await env.DB.prepare("UPDATE login_attempts SET count=count+1 WHERE ip=?").bind(ip).run();
          else await env.DB.prepare("INSERT INTO login_attempts (ip,count,window_start) VALUES (?,1,?)").bind(ip, String(now)).run();
          return json({ error: "invalid_password" }, 401);
        }
        await env.DB.prepare("DELETE FROM login_attempts WHERE ip=?").bind(ip).run();
        return json({ role: s.role, label: s.label, expires_at: s.expires_at }, 200, { "set-cookie": sessionCookie(s.token, s.expires_at) });
      }
      if (path === "/api/logout" && method === "POST") {
        await logout(env.DB, getCookie(req, COOKIE));
        return json({ ok: true }, 200, { "set-cookie": clearCookie() });
      }
      if (path === "/api/me" && method === "GET") {
        if (!session) return json({ error: "unauthenticated" }, 401);
        return json({ role: session.role, label: session.label, expires_at: session.expires_at });
      }

      // 需登陆
      if (!session) return json({ error: "unauthenticated" }, 401);

      if (path === "/api/stats" && method === "GET") {
        return json({ ...(await stats(env.DB)), ai_enabled: aiEnabled(env), ai_model: aiModelName(env) });
      }
      if (path === "/api/companies" && method === "GET") {
        return json(await listCompanies(env.DB));
      }

      const m = path.match(/^\/api\/companies\/(\d+)(\/(score|contacts|outreach))?$/);
      if (m) {
        const id = Number(m[1]);
        const sub = m[3];
        const company = await getCompany(env.DB, id);
        if (!company) return json({ error: "not found" }, 404);

        if (!sub && method === "GET") {
          return json({
            company,
            assessment: await getAssessment(env.DB, id),
            contacts: await listContacts(env.DB, id),
            outreach: await listOutreach(env.DB, id),
          });
        }
        if (!sub && method === "PATCH") {
          await updateCompanyFields(env.DB, id, await body(req));
          return json({ ok: true });
        }
        if (sub === "score" && method === "POST") {
          const { result, model } = await scoreCompany(env, company);
          await saveAssessment(env.DB, id, result, model);
          return json({ result, model });
        }
        if (sub === "contacts" && method === "POST") {
          const cid = await addContact(env.DB, id, await body(req));
          return json({ id: cid });
        }
        if (sub === "outreach" && method === "POST") {
          const b = await body(req);
          const channel = b.channel === "line" ? "line" : "email";
          const content = await draftOutreach(env, company, channel, String(b.lang ?? "en"));
          const oid = await addOutreach(env.DB, id, channel, content);
          return json({ id: oid, channel, content });
        }
      }

      const cm = path.match(/^\/api\/contacts\/(\d+)$/);
      if (cm && method === "DELETE") {
        await deleteContact(env.DB, Number(cm[1]));
        return json({ ok: true });
      }

      const om = path.match(/^\/api\/outreach\/(\d+)$/);
      if (om && method === "PATCH") {
        await updateOutreach(env.DB, Number(om[1]), await body(req));
        return json({ ok: true });
      }

      if (path.startsWith("/api/grants")) {
        if (session.role !== "admin") return json({ error: "admin_only" }, 403);
        if (path === "/api/grants" && method === "GET") return json(await listGrants(env.DB));
        if (path === "/api/grants" && method === "POST") {
          const b = await body(req);
          const { grant, code } = await createGrant(env.DB, String(b.label ?? ""), Number(b.days ?? 7));
          return json({ grant, code });
        }
        const gm = path.match(/^\/api\/grants\/(\d+)\/revoke$/);
        if (gm && method === "POST") {
          await revokeGrant(env.DB, Number(gm[1]));
          return json({ ok: true });
        }
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }
  },
};
