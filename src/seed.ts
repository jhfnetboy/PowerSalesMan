import { initSchema } from "./db.js";
import { SEED_COMPANIES } from "./seed/companies.js";
import { upsertCompany } from "./store.js";

/** 把种子清单灌入数据库(幂等:已存在的只补空字段)。 */
export function runSeed(): { created: number; updated: number } {
  initSchema();
  let created = 0;
  let updated = 0;
  for (const c of SEED_COMPANIES) {
    const r = upsertCompany(c, "claude-seed");
    if (r.created) created++;
    else updated++;
  }
  return { created, updated };
}
