import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { scoreCompany } from "./score.js";
import { AI_ENABLED, AI_MODEL_NAME } from "./ai.js";
import {
  addContact, deleteContact, getAssessment, getCompany,
  listCompanies, listContacts, saveAssessment, stats, updateCompanyFields,
} from "./store.js";
import {
  createGrant, DEFAULT_LANG, getSession, listGrants, login, logout,
  purgeExpiredSessions, revokeGrant, type Session,
} from "./auth.js";
import { PAGE } from "./webpage.js";

function json(res: ServerResponse, code: number, data: unknown): void {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 1_000_000) { // 1MB 上限,防滥用
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      raw += c;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function getCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

const COOKIE = "psm_session";
function setSessionCookie(res: ServerResponse, token: string, expiresAt: string): void {
  const expires = new Date(expiresAt).toUTCString();
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`,
  );
}
function clearSessionCookie(res: ServerResponse): void {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function startServer(port: number): void {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const path = url.pathname;
    const method = req.method ?? "GET";
    const session: Session | null = getSession(getCookie(req, COOKIE));

    try {
      // ---- 公开路由 ----
      if (path === "/" && method === "GET") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(PAGE);
      }
      if (path === "/api/config" && method === "GET") {
        return json(res, 200, { default_lang: DEFAULT_LANG });
      }
      if (path === "/api/login" && method === "POST") {
        purgeExpiredSessions();
        const body = await readBody(req);
        const s = login(String(body.password ?? ""));
        if (!s) return json(res, 401, { error: "invalid_password" });
        setSessionCookie(res, s.token, s.expires_at);
        return json(res, 200, { role: s.role, label: s.label, expires_at: s.expires_at });
      }
      if (path === "/api/logout" && method === "POST") {
        logout(getCookie(req, COOKIE));
        clearSessionCookie(res);
        return json(res, 200, { ok: true });
      }
      if (path === "/api/me" && method === "GET") {
        if (!session) return json(res, 401, { error: "unauthenticated" });
        return json(res, 200, { role: session.role, label: session.label, expires_at: session.expires_at });
      }

      // ---- 以下均需登陆 ----
      if (!session) return json(res, 401, { error: "unauthenticated" });

      if (path === "/api/stats" && method === "GET") {
        return json(res, 200, { ...stats(), ai_enabled: AI_ENABLED, ai_model: AI_MODEL_NAME });
      }
      if (path === "/api/companies" && method === "GET") {
        return json(res, 200, listCompanies());
      }

      const m = path.match(/^\/api\/companies\/(\d+)(\/(score|contacts))?$/);
      if (m) {
        const id = Number(m[1]);
        const sub = m[3];
        const company = getCompany(id);
        if (!company) return json(res, 404, { error: "not found" });

        if (!sub && method === "GET") {
          return json(res, 200, { company, assessment: getAssessment(id), contacts: listContacts(id) });
        }
        if (!sub && method === "PATCH") {
          updateCompanyFields(id, await readBody(req));
          return json(res, 200, { ok: true });
        }
        if (sub === "score" && method === "POST") {
          const { result, model } = await scoreCompany(getCompany(id)!);
          saveAssessment(id, result, model);
          return json(res, 200, { result, model });
        }
        if (sub === "contacts" && method === "POST") {
          const cid = addContact(id, await readBody(req));
          return json(res, 200, { id: cid });
        }
      }

      const cm = path.match(/^\/api\/contacts\/(\d+)$/);
      if (cm && method === "DELETE") {
        deleteContact(Number(cm[1]));
        return json(res, 200, { ok: true });
      }

      // ---- 管理员专属:销售授权码 ----
      if (path.startsWith("/api/grants")) {
        if (session.role !== "admin") return json(res, 403, { error: "admin_only" });

        if (path === "/api/grants" && method === "GET") {
          return json(res, 200, listGrants());
        }
        if (path === "/api/grants" && method === "POST") {
          const body = await readBody(req);
          const { grant, code } = createGrant(String(body.label ?? ""), Number(body.days ?? 7));
          return json(res, 200, { grant, code }); // code 明文只此一次
        }
        const gm = path.match(/^\/api\/grants\/(\d+)\/revoke$/);
        if (gm && method === "POST") {
          revokeGrant(Number(gm[1]));
          return json(res, 200, { ok: true });
        }
      }

      json(res, 404, { error: "not found" });
    } catch (err) {
      json(res, 500, { error: (err as Error).message });
    }
  });

  server.listen(port, () => {
    console.log(`\n🚀 PowerSalesMan 管理台已启动:  http://localhost:${port}`);
    console.log(`   AI 打分:${AI_ENABLED ? AI_MODEL_NAME : "heuristic(未配置 key)"}`);
    console.log(`   登陆:管理员用 .env 里的 ADMIN_PASSWORD;销售用管理员生成的登陆码。`);
    console.log(`   Ctrl+C 退出。\n`);
  });
}
