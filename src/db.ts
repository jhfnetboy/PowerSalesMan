import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../data/psm.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      type        TEXT,
      area        TEXT,
      address     TEXT,
      phone       TEXT,
      website     TEXT,
      description TEXT,
      source      TEXT,
      confidence  REAL DEFAULT 0.5,
      status      TEXT DEFAULT 'new',
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id          INTEGER PRIMARY KEY,
      company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      name        TEXT,
      role        TEXT,
      email       TEXT,
      phone       TEXT,
      line_id     TEXT,
      telegram    TEXT,
      confidence  REAL,
      source      TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id                  INTEGER PRIMARY KEY,
      company_id          INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      budget_estimate     TEXT,
      intent_score        INTEGER,
      success_probability INTEGER,
      recommended_channel TEXT,
      reasoning           TEXT,
      model               TEXT,
      created_at          TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outreach (
      id          INTEGER PRIMARY KEY,
      company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      contact_id  INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      channel     TEXT,
      content     TEXT,
      status      TEXT DEFAULT 'draft',
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
    CREATE INDEX IF NOT EXISTS idx_assess_company ON assessments(company_id);
    CREATE INDEX IF NOT EXISTS idx_outreach_company ON outreach(company_id);
  `);
}

export { DB_PATH };
