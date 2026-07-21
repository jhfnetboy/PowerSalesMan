// 打分:接大模型(env 配置)或退化启发式。Workers 里 fetch 原生可用。
import type { ScoreResult } from "./store";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_PASSWORD?: string;
  SESSION_TTL_DAYS?: string;
  DEFAULT_LANG?: string;
  AI_PROVIDER?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  AI_API_KEY?: string;
}

export function aiEnabled(env: Env): boolean {
  return !!(env.AI_API_KEY && env.AI_API_KEY.length > 0);
}
export function aiModelName(env: Env): string {
  return aiEnabled(env) ? env.AI_MODEL ?? "unknown" : "heuristic";
}

const SYSTEM = `你是一名资深 B2B 销售分析师,专精泰国清迈市场的 AI/开发者工具销售。
我们要把 AI 编程 token(Claude Code / Codex / DeepSeek 等)转售给清迈的科技公司、大学、组织。
请只输出一个 JSON 对象,字段:budget_estimate(字符串), intent_score(0-100整数), success_probability(0-100整数), recommended_channel(call|visit|line|email 之一), reasoning(一两句中文,含泰国本地文化考量)。`;

function heuristic(c: any): ScoreResult {
  const table: Record<string, Omit<ScoreResult, "reasoning">> = {
    software_company: { budget_estimate: "$100-500/月", intent_score: 70, success_probability: 45, recommended_channel: "line" },
    agency: { budget_estimate: "$50-300/月", intent_score: 60, success_probability: 40, recommended_channel: "line" },
    coworking: { budget_estimate: "空间预算低,但可作介绍人", intent_score: 45, success_probability: 55, recommended_channel: "visit" },
    university: { budget_estimate: "机构采购慢,学生是早期采用者", intent_score: 40, success_probability: 35, recommended_channel: "email" },
    community: { budget_estimate: "无直接预算,是活动/介绍人入口", intent_score: 35, success_probability: 50, recommended_channel: "visit" },
    other: { budget_estimate: "未知", intent_score: 30, success_probability: 30, recommended_channel: "email" },
  };
  const base = table[c.type] ?? table.other;
  const conf = typeof c.confidence === "number" ? c.confidence : 0.5;
  return { ...base, success_probability: Math.round(base.success_probability * (0.6 + 0.4 * conf)),
    reasoning: `启发式评分(未接大模型):机构类型 ${c.type}、可信度 ${conf}。清迈偏关系型销售。` };
}

function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("no json");
  return JSON.parse(raw.slice(s, e + 1)) as T;
}

export async function scoreCompany(env: Env, c: any): Promise<{ result: ScoreResult; model: string }> {
  if (!aiEnabled(env)) return { result: heuristic(c), model: "heuristic" };
  const provider = env.AI_PROVIDER ?? "openai";
  const model = env.AI_MODEL ?? "deepseek-chat";
  const base = env.AI_BASE_URL ?? (provider === "anthropic" ? "https://api.anthropic.com" : "https://api.deepseek.com");
  const user = `名称:${c.name}\n类型:${c.type}\n区域:${c.area ?? "未知"}\n网站:${c.website ?? "未知"}\n描述:${c.description ?? "无"}\n可信度:${c.confidence}\n请只输出 JSON。`;
  try {
    let text: string;
    if (provider === "anthropic") {
      const res = await fetch(`${base}/v1/messages`, { method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.AI_API_KEY!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 1024, system: SYSTEM, messages: [{ role: "user", content: user }] }) });
      if (!res.ok) throw new Error(`anthropic ${res.status}`);
      const d = await res.json<any>();
      text = d.content.map((x: any) => x.text).join("");
    } else {
      const res = await fetch(`${base}/v1/chat/completions`, { method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.AI_API_KEY}` },
        body: JSON.stringify({ model, temperature: 0.3, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] }) });
      if (!res.ok) throw new Error(`openai-compat ${res.status}`);
      const d = await res.json<any>();
      text = d.choices[0]?.message?.content ?? "";
    }
    const p = extractJson<ScoreResult>(text);
    p.intent_score = Math.max(0, Math.min(100, Math.round(p.intent_score)));
    p.success_probability = Math.max(0, Math.min(100, Math.round(p.success_probability)));
    return { result: p, model };
  } catch {
    return { result: heuristic(c), model: "heuristic(fallback)" };
  }
}
