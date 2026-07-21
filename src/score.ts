import { AI_ENABLED, AI_MODEL_NAME, chat, extractJson } from "./ai.js";
import type { Company, ScoreResult } from "./types.js";

const SYSTEM = `你是一名资深 B2B 销售分析师,专精泰国清迈市场的 AI/开发者工具销售。
我们要把 AI 编程 token(Claude Code / Codex / DeepSeek 等)转售给清迈的科技公司、大学、组织。
请只输出一个 JSON 对象,字段:
{
  "budget_estimate": "月度可支配 AI 预算的粗估,如 '$50-200/月' 或 '几乎为零(学生/公益)'",
  "intent_score": 0-100 的整数,购买意向可能性,
  "success_probability": 0-100 的整数,首次触达/陌拜谈成的概率,
  "recommended_channel": "call | visit | line | email 里选一个最优先的触达方式",
  "reasoning": "一两句中文说明理由,含泰国本地文化考量"
}`;

function heuristic(c: Company): ScoreResult {
  // 无 AI key 时的兜底:按机构类型给经验值,让流水线能立即跑通。
  const table: Record<string, Omit<ScoreResult, "reasoning">> = {
    software_company: { budget_estimate: "$100-500/月", intent_score: 70, success_probability: 45, recommended_channel: "line" },
    agency: { budget_estimate: "$50-300/月", intent_score: 60, success_probability: 40, recommended_channel: "line" },
    coworking: { budget_estimate: "空间本身预算低,但可作介绍人触达内部团队", intent_score: 45, success_probability: 55, recommended_channel: "visit" },
    university: { budget_estimate: "机构采购慢,但学生/实验室是早期采用者", intent_score: 40, success_probability: 35, recommended_channel: "email" },
    community: { budget_estimate: "无直接预算,但是活动/介绍人入口", intent_score: 35, success_probability: 50, recommended_channel: "visit" },
    other: { budget_estimate: "未知", intent_score: 30, success_probability: 30, recommended_channel: "email" },
  };
  const base = table[c.type] ?? table.other;
  // 数据可信度低的条目,成功率打折
  const success = Math.round(base.success_probability * (0.6 + 0.4 * c.confidence));
  return {
    ...base,
    success_probability: success,
    reasoning: `启发式评分(未接大模型):基于机构类型 ${c.type}、数据可信度 ${c.confidence}。清迈偏关系型销售,${base.recommended_channel === "visit" ? "当面/活动触达优先" : base.recommended_channel === "line" ? "Line 私信优先" : "先低承诺触达"}。`,
  };
}

function outreachTemplate(c: Company, channel: string): string {
  if (channel === "line") {
    return `Hi ${c.name} 👋 I run a small Chiang Mai service helping dev teams get cheaper & easier access to AI coding tokens (Claude Code, Codex, DeepSeek) — no overseas card hassle. Curious how your team handles AI coding tools now? Happy to grab a coffee. ☕`;
  }
  return `Subject: AI coding tokens for ${c.name} — quick question\n\nHi ${c.name} team,\n\nI run a small local service in Chiang Mai helping dev teams get cheaper & easier access to AI coding tokens (Claude Code, Codex, and top Chinese models like DeepSeek) — without the overseas-card headaches. Not selling anything today, just curious how your team currently handles AI coding tools. Open to a quick coffee near you?\n\nBest,\n`;
}

export async function draftOutreach(c: Company, channel: string, lang: string): Promise<string> {
  const langName = lang === "th" ? "Thai" : lang === "zh" ? "Chinese" : "English";
  if (!AI_ENABLED) return outreachTemplate(c, channel);
  const sys = `You write short, warm, CONSULTATIVE B2B outreach for a small Chiang Mai service that resells AI coding tokens (Claude Code / Codex / DeepSeek) to local dev teams — cheaper & easier access, no overseas-card hassle, flexible top-ups. Not pushy; lead with a genuine question about how their team uses AI coding tools; offer a quick coffee; respect Thai relationship-first culture. Channel=${channel} (email: Subject line then short body; line: ONE short casual message with maybe an emoji). Write in ${langName}. Output ONLY the message text.`;
  try {
    const text = await chat(sys, `Company: ${c.name} | type: ${c.type} | area: ${c.area ?? "?"} | ${c.description ?? ""}`);
    return text.trim() || outreachTemplate(c, channel);
  } catch {
    return outreachTemplate(c, channel);
  }
}

export async function scoreCompany(c: Company): Promise<{ result: ScoreResult; model: string }> {
  if (!AI_ENABLED) return { result: heuristic(c), model: "heuristic" };

  const user = `公司/机构信息:
- 名称: ${c.name}
- 类型: ${c.type}
- 区域: ${c.area ?? "未知"}
- 网站: ${c.website ?? "未知"}
- 描述: ${c.description ?? "无"}
- 数据可信度: ${c.confidence}

请评估并只输出 JSON。`;

  try {
    const raw = await chat(SYSTEM, user);
    const parsed = extractJson<ScoreResult>(raw);
    // 夹取到合法范围
    parsed.intent_score = Math.max(0, Math.min(100, Math.round(parsed.intent_score)));
    parsed.success_probability = Math.max(0, Math.min(100, Math.round(parsed.success_probability)));
    return { result: parsed, model: AI_MODEL_NAME };
  } catch (err) {
    console.warn(`  ⚠️  AI 打分失败,退化为启发式: ${(err as Error).message}`);
    return { result: heuristic(c), model: "heuristic(fallback)" };
  }
}
