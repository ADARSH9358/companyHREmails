// Renames destination -> title, adds linkedin, DELETES ALL ROWS, then imports the CSV.
// Usage (from project root):
//   node --env-file=.env scripts/reset-and-import.mjs
//   node --env-file=.env scripts/reset-and-import.mjs path/to/other.csv
// Requires Node 20.6+. Safe to run more than once (it always starts from an empty table).
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const file = process.argv[2] || 'scripts/hr_contacts.csv';
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL missing. Run with --env-file=.env'); process.exit(1); }
const sql = neon(process.env.DATABASE_URL);

// ---------- CSV helpers ----------
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
const blank = (v) => { v = (v || '').trim(); return v === '—' || v === '-' ? '' : v; };
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Masked emails (m***@bayut.com) are skipped; "(estimated)" suffixes are dropped.
const findEmails = (s) => (String(s || '').match(EMAIL_RE) || []).filter((e) => !e.includes('*')).map((e) => e.toLowerCase());

// ---------- 1. Make sure the table exists, then fix the columns ----------
await sql`
  CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL DEFAULT '', company TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '', linkedin TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '', emails JSONB NOT NULL DEFAULT '[]', phones JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;

await sql`
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'contacts' AND column_name = 'destination') THEN
      ALTER TABLE contacts RENAME COLUMN destination TO title;
    END IF;
  END $$`;
await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin TEXT NOT NULL DEFAULT ''`;
console.log('Columns ready: title, linkedin');

// ---------- 2. Delete everything ----------
await sql`TRUNCATE TABLE contacts RESTART IDENTITY`;
console.log('Table emptied');

// ---------- 3. Import the CSV ----------
const [header, ...data] = parseCsv(readFileSync(file, 'utf8'));
const idx = Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase(), i]));
const get = (r, k) => r[idx[k]] ?? '';

let inserted = 0, skipped = 0;
for (const r of data) {
  const company = blank(get(r, 'company'));
  if (!company) { skipped++; continue; }
  const name = blank(get(r, 'name'));
  const title = blank(get(r, 'title'));
  const linkedin = blank(get(r, 'linkedin'));
  const notes = blank(get(r, 'action'));
  // Email column plus any extra address mentioned in the Action text (e.g. careers@...)
  const emails = [...new Set([...findEmails(get(r, 'email')), ...findEmails(get(r, 'action'))])];

  await sql`
    INSERT INTO contacts (name, company, title, linkedin, notes, emails, phones)
    VALUES (${name}, ${company}, ${title}, ${linkedin}, ${notes}, ${JSON.stringify(emails)}::jsonb, '[]'::jsonb)`;
  console.log(`added: ${company} / ${name || '-'} -> ${emails.join(', ') || 'no email'}`);
  inserted++;
}
console.log(`\nDone. Inserted: ${inserted}, skipped: ${skipped}`);