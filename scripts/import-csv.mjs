// Usage (from project root):
//   node --env-file=.env.local scripts/import-csv.mjs hr_contact.csv
//   node --env-file=.env.local scripts/import-csv.mjs hr_contact.csv --dry-run
// Requires Node 20.6+.
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!file) { console.error('Pass the CSV path, e.g. hr_contact.csv'); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL missing. Run with --env-file=.env.local'); process.exit(1); }

const sql = neon(process.env.DATABASE_URL);

// Minimal CSV parser (handles quotes, commas and newlines inside quotes).
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
// Masked emails such as m***@bayut.com are skipped; "(estimated)" suffixes are dropped.
const findEmails = (s) => (String(s || '').match(EMAIL_RE) || []).filter((e) => !e.includes('*')).map((e) => e.toLowerCase());

const [header, ...data] = parseCsv(readFileSync(file, 'utf8'));
const idx = Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase(), i]));
const get = (r, k) => r[idx[k]] ?? '';

await sql`
  CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL DEFAULT '', company TEXT NOT NULL,
    destination TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    emails JSONB NOT NULL DEFAULT '[]', phones JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;

let inserted = 0, skipped = 0;
for (const r of data) {
  const company = blank(get(r, 'company'));
  if (!company) { skipped++; continue; }
  const name = blank(get(r, 'name'));
  // Email column first, then any extra addresses mentioned in the Action text (e.g. careers@...).
  const emails = [...new Set([...findEmails(get(r, 'email')), ...findEmails(get(r, 'action'))])];
  const notes = [
    blank(get(r, 'title')) && `Title: ${blank(get(r, 'title'))}`,
    blank(get(r, 'linkedin')) && `LinkedIn: ${blank(get(r, 'linkedin'))}`,
    blank(get(r, 'action')) && `Action: ${blank(get(r, 'action'))}`,
  ].filter(Boolean).join('\n');

  const dup = await sql`SELECT 1 FROM contacts WHERE lower(company) = ${company.toLowerCase()} AND lower(name) = ${name.toLowerCase()} LIMIT 1`;
  if (dup.length) { console.log(`skip (exists): ${company} / ${name || '-'}`); skipped++; continue; }

  console.log(`${dryRun ? 'would add' : 'add'}: ${company} / ${name || '-'} -> ${emails.join(', ') || 'no email'}`);
  if (!dryRun) {
    await sql`INSERT INTO contacts (name, company, notes, emails, phones)
              VALUES (${name}, ${company}, ${notes}, ${JSON.stringify(emails)}::jsonb, '[]'::jsonb)`;
  }
  inserted++;
}
console.log(`\nDone. ${dryRun ? 'Would insert' : 'Inserted'}: ${inserted}, skipped: ${skipped}`);