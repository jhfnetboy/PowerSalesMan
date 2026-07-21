#!/usr/bin/env node
import { Command } from "commander";
import { initSchema } from "./db.js";
import { runSeed } from "./seed.js";
import { scoreCompany } from "./score.js";
import { AI_ENABLED, AI_MODEL_NAME } from "./ai.js";
import { getCompany, listCompanies, saveAssessment, stats } from "./store.js";
import { startServer } from "./server.js";

const program = new Command();
program.name("psm").description("PowerSalesMan — 清迈 AI token 销售的本地线索引擎").version("0.1.0");

program
  .command("seed")
  .description("把清迈科技生态种子清单灌入本地数据库(幂等)")
  .action(() => {
    const r = runSeed();
    console.log(`✅ 种子完成:新增 ${r.created} 家,已存在 ${r.updated} 家。`);
  });

program
  .command("list")
  .description("按购买意向排序列出所有线索")
  .action(() => {
    initSchema();
    const rows = listCompanies();
    if (rows.length === 0) return console.log("空。先跑 `pnpm psm seed`。");
    console.log("意向  成功率  类型             名称");
    for (const r of rows) {
      const intent = r.intent_score == null ? " -- " : String(r.intent_score).padStart(3) + " ";
      const succ = r.success_probability == null ? " -- " : String(r.success_probability).padStart(3) + " ";
      console.log(`${intent}  ${succ}   ${(r.type ?? "").padEnd(16)} ${r.name}`);
    }
    const s = stats();
    console.log(`\n共 ${s.total} 家 · 已评分 ${s.scored} · 联系人 ${s.contacts}`);
  });

program
  .command("score")
  .description("对线索做 AI 潜力打分(无 key 时用启发式)")
  .option("-a, --all", "给所有还没评分的公司打分")
  .option("-i, --id <id>", "只给某个 id 打分")
  .action(async (opts: { all?: boolean; id?: string }) => {
    initSchema();
    console.log(`打分引擎:${AI_ENABLED ? AI_MODEL_NAME : "heuristic(未配置 AI key)"}\n`);
    let targets = listCompanies();
    if (opts.id) targets = targets.filter((c) => c.id === Number(opts.id));
    else if (!opts.all) targets = targets.filter((c) => c.intent_score == null);
    if (targets.length === 0) return console.log("没有需要打分的公司(用 --all 强制全部重打)。");
    for (const row of targets) {
      const c = getCompany(row.id)!;
      const { result, model } = await scoreCompany(c);
      saveAssessment(c.id, result, model);
      console.log(`  [${String(result.intent_score).padStart(3)}] ${c.name} → ${result.recommended_channel} · ${result.budget_estimate}`);
    }
    console.log(`\n✅ 打分完成 ${targets.length} 家。`);
  });

program
  .command("serve")
  .description("启动本地管理网页")
  .option("-p, --port <port>", "端口", "57219")
  .action((opts: { port: string }) => {
    initSchema();
    startServer(Number(opts.port));
  });

program.parseAsync();
