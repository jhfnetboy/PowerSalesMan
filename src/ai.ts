import "dotenv/config";

const PROVIDER = process.env.AI_PROVIDER ?? "openai";
const API_KEY = process.env.AI_API_KEY ?? "";
const MODEL = process.env.AI_MODEL ?? "deepseek-chat";
const BASE_URL =
  process.env.AI_BASE_URL ??
  (PROVIDER === "anthropic"
    ? "https://api.anthropic.com"
    : "https://api.deepseek.com");

export const AI_ENABLED = API_KEY.length > 0;
export const AI_MODEL_NAME = AI_ENABLED ? MODEL : "heuristic";

/**
 * 统一的一问一答接口。支持 OpenAI 兼容(DeepSeek/GLM/OpenAI)与 Anthropic。
 * 返回模型的纯文本回复。若未配置 key,抛错(调用方应先判断 AI_ENABLED)。
 */
export async function chat(system: string, user: string): Promise<string> {
  if (!AI_ENABLED) throw new Error("AI_API_KEY 未配置");

  if (PROVIDER === "anthropic") {
    const res = await fetch(`${BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content: { text: string }[] };
    return data.content.map((c) => c.text).join("");
  }

  // OpenAI 兼容
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI-compat ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? "";
}

/** 从模型回复里抠出第一个 JSON 对象(容忍 ```json 包裹或前后废话)。 */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`回复中找不到 JSON: ${text.slice(0, 200)}`);
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
