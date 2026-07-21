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

## 当前进度(v0.2)

✅ 本地 SQLite 数据库(companies / contacts / assessments / outreach + access_grants / sessions)
✅ 清迈科技生态**种子清单**(24 家:coworking / 大学 CS 系 / 社群 / 软件公司)
✅ **AI 潜力打分**(接大模型;没配 key 时用内置启发式打分,流水线照跑)
✅ **本地管理网页**(增删改查线索、加联系人、一键打分)
✅ **登陆鉴权**:管理员口令(env)+ 会话 cookie,所有数据接口需登陆
✅ **销售临时授权码**:管理员在网页里生成销售登陆码,默认 7 天到期,可撤销
✅ **三语切换**:英 / 中 / 泰(默认跟随 `DEFAULT_LANG`)

✅ **联网富集入库**:多代理扫黄页/谷歌地图/榜单聚合站/LinkedIn,发现真实清迈软件公司并补全地址/电话/联系人;`import-findings` 合并去重入库、`dedupe` 按电话/核心名合并重复
✅ 数据现状:**75 家机构**(含 54 家软件公司/agency,40 家带地址、35 家带电话) — 出处见 `findings/`

✅ **Cloudflare 上云**:Worker + D1 + 静态资源三合一,公网可访问 → **https://powersalesman.jhfnetboy.workers.dev**(登录、地图、打分、销售授权码全可用,数据在 D1)

🚧 下一步:每 4h 增量循环、email/Line 自动触达、登录限流

## ☁️ Cloudflare 部署(cloudflare/)

后端从本地 SQLite 移植到 **D1**(同步→异步)、Node http server → **Worker**,前端(`public/index.html`)原样复用。

```bash
cd cloudflare
npx wrangler d1 execute powersalesman --remote --file schema.sql -y     # 建表
npx wrangler d1 execute powersalesman --remote --file seed-data.sql -y  # 灌数据(从本地库导出)
npx wrangler deploy                                                     # 部署
printf '%s' '<强密码>' | npx wrangler secret put ADMIN_PASSWORD         # 设管理员密码(勿写进配置)
```

- 管理员密码是 Cloudflare Secret,不进代码/仓库;公网版务必用强密码(登录暂无限流)。
- `seed-data.sql` 由本地 `data/psm.db` 导出;要同步最新数据重新导出再 execute 即可。
- 接大模型打分:`wrangler secret put AI_API_KEY`(不设则用启发式)。

## 数据富集(重建库)

```bash
pnpm psm seed                       # 先灌种子
pnpm tsx src/import-findings.ts findings/   # 合并联网富集结果入库
pnpm tsx src/dedupe.ts              # 按电话/核心名去重
pnpm psm score                      # 给新公司打分
```

`findings/enrich-*.json` 是研究代理的产出(带 sources 出处、confidence);数据库 `data/psm.db` 本地生成、不进仓库。

## 登陆与权限

- **管理员**:用 `.env` 里的 `ADMIN_PASSWORD` 登陆。可管理线索,并**生成销售登陆码**。
- **销售**:用管理员发的登陆码登陆(形如 `psm-xxxx`),默认一周有效,到期或被撤销即失效。只能看/管线索,不能进权限面板。
- 会话用 HttpOnly cookie;授权码在库里只存 sha256,明文只在生成时显示一次。

## 界面语言

右上角切换 **English / 中文 / ไทย**,选择记在浏览器本地。首次进入跟随 `.env` 的 `DEFAULT_LANG`(默认 `en`)。

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
