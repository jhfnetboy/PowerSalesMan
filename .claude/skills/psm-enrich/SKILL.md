---
name: psm-enrich
description: PowerSalesMan 触发式线索采集与富集。当用户在对话里要求"搜索/找/补全清迈的某类公司/机构并入库"、"富集线索"、"找更多软件公司"、"给某某补地址电话联系人"、"enrich leads"、"同步到云端 D1"时使用。按需(非定时)联网抓取 → 合并去重入库 → 打分 → 可选同步 D1。
---

# PowerSalesMan 触发式富集

不做定时循环采集。用户在对话里提出诉求(例如"再找 20 家清迈做 AI/后端的公司"、"给大学那几条补上院系电话"),就跑下面这条流水线。全程**只写真实、有出处的数据,绝不编造**电话/邮箱/联系人。

## 执行步骤

### 1. 摸清现状(避免重复)
```bash
cd /Users/jason/Dev/tools/PowerSalesMan
node -e 'const db=require("better-sqlite3")("./data/psm.db");console.log(db.prepare("SELECT id,name,type,area FROM companies ORDER BY id").all().map(r=>`${r.id} ${r.name} [${r.type}]`).join("\n"))'
```
把已有清单作为上下文,明确这次要"新增发现"还是"富集现有"。

### 2. 并行派研究代理(按用户诉求定制)
用 Agent 工具起 2–4 个 `general-purpose` 代理并行,各盯不同信息源,把结构化结果写到 scratchpad 的 `enrich-*.json`。信息源按需选:
- **黄页/地图**:Google Maps、yellowpages.co.th、Konigle/Localist 目录(带地址电话)
- **B2B 榜单**:Clutch、GoodFirms、DesignRush、TechBehemoths、Sortlist
- **专业网络/榜单**:LinkedIn、Wellfound、Crunchbase、"best X companies in Chiang Mai" 榜单
- **富集现有**:官网、Facebook、Google Maps 补 address/phone/公开 email/Line

每个代理必须:只收清迈(เชียงใหม่)本地;`null` 表示查不到;带 `sources`(URL)与 `confidence`;写 JSON 到
`<scratchpad>/enrich-<X>.json`,形如:
```json
{"companies":[{"name":"","type":"software_company","area":null,"address":null,"phone":null,"website":null,"email":null,"line_id":null,"description":"","confidence":0.7,"contacts":[{"name":"","role":"","email":null,"phone":null,"line_id":null}],"sources":["https://..."]}]}
```
type 取值:coworking | university | software_company | agency | community | other。

### 3. 合并去重入库
```bash
pnpm tsx src/import-findings.ts <scratchpad 目录>   # 合并多份 JSON、按名归一化、老记录只补空字段、联系人入库
pnpm tsx src/dedupe.ts                              # 按电话相同/核心名相同合并跨代理重复
```

### 4. 打分
```bash
pnpm psm score          # 只给未评分的打分(--all 全部重打;无 AI key 用启发式)
```

### 5. 留存出处 + 提交
把这次的 `enrich-*.json` 复制进仓库 `findings/`(可重建库),然后 commit。

### 6.(可选)同步到云端 D1
```bash
pnpm tsx src/export-d1-seed.ts                                          # 导出 INSERT OR REPLACE 幂等 seed
cd cloudflare && npx wrangler d1 execute powersalesman --remote --file seed-data.sql -y
```

## 报告给用户
- 新增几家、富集几家、带地址/电话各多少、总数变化
- 代理主动纠错的点(疑似关闭/不在清迈/低置信度,建议人工复核)
- 是否已同步到云端 https://powersalesman.jhfnetboy.workers.dev

## 铁律
- 不编造 PII。查不到就留空 + 标低 confidence。
- 只收清迈本地;Bangkok-only 的排除或标注。
- 数据库 `data/psm.db` 本地不进仓库;`findings/` 进仓库留证。
