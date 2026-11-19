import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

let ready;
// Creates the table the first time it is needed, so no manual migration is required.
export function ensureTable() {
  if (!ready) {
    ready = sql`
      CREATE TABLE IF NOT EXISTS contacts (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL DEFAULT '',
        company     TEXT NOT NULL,
        title       TEXT NOT NULL DEFAULT '',
        linkedin    TEXT NOT NULL DEFAULT '',
        location    TEXT NOT NULL DEFAULT '',
        notes       TEXT NOT NULL DEFAULT '',
        emails      JSONB NOT NULL DEFAULT '[]',
        phones      JSONB NOT NULL DEFAULT '[]',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.then(() => sql`CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts (lower(company))`);
  }
  return ready;
}

export { sql };