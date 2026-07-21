# PowerSalesMan

清迈(Chiang Mai / CNX)**AI token 转售**的本地销售线索引擎 + CRM。

把 Claude Code / Codex / DeepSeek 等 AI 编程 token 卖给清迈的科技公司、大学、组织。
这个工具帮一个**零销售经验**的人系统化地:找到目标 → 评估潜力 → 管理触达。

## 它做什么

一个持续循环(设计目标),分三步:

1. **采集** — 增量搜集清迈科技公司/大学/组织的公开信息(名称、地址、电话、网站)。
2. **富集 + 打分** — 补全负责人与联系方式(email / 电话 / Line / Telegram),并用大模型评估:
   预算多少、购买意向、该打电话还是直接拜访、成功率预测。
3. **触达** — 生成个性化 email / Line 文案,人工确认后发送。

配一个**本地管理网页**,可视化管理所有线索、编辑信息、加联系人、一键打分。

## 当前进度(v0.1)

✅ 本地 SQLite 数据库(companies / contacts / assessments / outreach)
✅ 清迈科技生态**种子清单**(24 家:coworking / 大学 CS 系 / 社群 / 软件公司)
✅ **AI 潜力打分**(接大模型;没配 key 时用内置启发式打分,流水线照跑)
✅ **本地管理网页**(增删改查线索、加联系人、一键打分)

🚧 下一步:自动联网采集(地址/电话/联系人富集)、每 4h 增量循环、email/Line 自动触达

## 快速开始

```bash
pnpm install
pnpm psm seed          # 灌入清迈种子清单
pnpm psm score --all   # 给所有线索打分(无 key = 启发式)
pnpm psm serve         # 打开 http://localhost:57219 管理台
```

### 命令

| 命令 | 作用 |
|---|---|
| `pnpm psm seed` | 灌入/增量更新种子清单(幂等) |
| `pnpm psm list` | 终端里按意向排序列出线索 |
| `pnpm psm score --all` | 给全部线索打分(`--id N` 只打一个) |
| `pnpm psm serve -p 57219` | 启动本地管理网页 |

### 接大模型打分(可选)

复制 `.env.example` 为 `.env`,填 `AI_API_KEY`。支持 OpenAI 兼容(DeepSeek / GLM)与 Anthropic(Claude)。
不配也能用——会退化成基于机构类型的启发式打分。

## 销售打法(为什么这样设计)

清迈是**关系型 + 面子文化**,cold call 效率最低。漏斗按泰国本地调过:

`建名单 → 加 Line 暖场 → 约一杯咖啡(不是卖东西)→ SPIN 挖需求 → 现场演示 → 小额试用先上车`

所以打分默认倾向 `visit`(当面/活动触达)和 `line`,而非陌生电话。

## 技术栈

Node/TypeScript · better-sqlite3 · 零框架 HTTP(内置 http)· tsx

## 数据说明

种子清单只到「机构级」,**不含编造的联系人**。联系人/电话/地址等在富集阶段
从公开来源补全并经人工在管理台确认。`confidence` 字段标注每条数据的可信度。
