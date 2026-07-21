import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { scoreCompany } from "./score.js";
import { AI_ENABLED, AI_MODEL_NAME } from "./ai.js";
import {
  addContact, deleteContact, getAssessment, getCompany,
  listCompanies, listContacts, saveAssessment, stats, updateCompanyFields,
} from "./store.js";
import { PAGE } from "./webpage.js";

function json(res: ServerResponse, code: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
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

export function startServer(port: number): void {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const path = url.pathname;
    const method = req.method ?? "GET";

    try {
      // 首页
      if (path === "/" && method === "GET") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(PAGE);
      }

      if (path === "/api/stats" && method === "GET") {
        return json(res, 200, { ...stats(), ai_enabled: AI_ENABLED, ai_model: AI_MODEL_NAME });
      }

      if (path === "/api/companies" && method === "GET") {
        return json(res, 200, listCompanies());
      }

      // /api/companies/:id ...
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
          const body = await readBody(req);
          updateCompanyFields(id, body);
          return json(res, 200, { ok: true });
        }
        if (sub === "score" && method === "POST") {
          const { result, model } = await scoreCompany(getCompany(id)!);
          saveAssessment(id, result, model);
          return json(res, 200, { result, model });
        }
        if (sub === "contacts" && method === "POST") {
          const body = await readBody(req);
          const cid = addContact(id, body);
          return json(res, 200, { id: cid });
        }
      }

      const cm = path.match(/^\/api\/contacts\/(\d+)$/);
      if (cm && method === "DELETE") {
        deleteContact(Number(cm[1]));
        return json(res, 200, { ok: true });
      }

      json(res, 404, { error: "not found" });
    } catch (err) {
      json(res, 500, { error: (err as Error).message });
    }
  });

  server.listen(port, () => {
    console.log(`\n🚀 PowerSalesMan 管理台已启动:  http://localhost:${port}`);
    console.log(`   AI 打分:${AI_ENABLED ? AI_MODEL_NAME : "heuristic(未配置 key)"}\n   Ctrl+C 退出。`);
  });
}
