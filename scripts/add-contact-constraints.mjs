// One-time setup: no email address and no phone number can belong to two different contacts.
//   node --env-file=.env scripts/add-contact-constraints.mjs
// Safe to run more than once.
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const DEFAULT_COUNTRY_CODE = '91';
const normEmail = (v) => String(v).trim().toLowerCase();
const normPhone = (v) => {
  let d = String(v).replace(/\D/g, '');
  if (d.length === 10) d = DEFAULT_COUNTRY_CODE + d;
  return d ? '+' + d : '';
};
const uniq = (a) => [...new Set(a.filter(Boolean))];

await sql`DROP TRIGGER IF EXISTS contacts_unique_channels ON contacts`;

// 1. Normalise existing data and strip values already used by an older contact (the oldest owner keeps it).
const rows = await sql`SELECT id, name, company, emails, phones FROM contacts ORDER BY id`;
const seenEmail = new Set(), seenPhone = new Set();
for (const r of rows) {
  const emails = uniq(r.emails.map(normEmail)).filter((e) => {
    if (seenEmail.has(e)) { console.log(`removed duplicate email ${e} from ${r.name || '-'} (${r.company})`); return false; }
    seenEmail.add(e); return true;
  });
  const phones = uniq(r.phones.map(normPhone)).filter((p) => {
    if (seenPhone.has(p)) { console.log(`removed duplicate phone ${p} from ${r.name || '-'} (${r.company})`); return false; }
    seenPhone.add(p); return true;
  });
  if (JSON.stringify(emails) !== JSON.stringify(r.emails) || JSON.stringify(phones) !== JSON.stringify(r.phones)) {
    await sql`UPDATE contacts SET emails = ${JSON.stringify(emails)}::jsonb, phones = ${JSON.stringify(phones)}::jsonb WHERE id = ${r.id}`;
  }
}

// 2. Database rule: reject any insert/update that reuses an email or phone from another contact.
await sql`
  CREATE OR REPLACE FUNCTION contacts_check_unique() RETURNS trigger AS $$
  DECLARE dup text; owner text;
  BEGIN
    PERFORM pg_advisory_xact_lock(727001);  -- one writer at a time, so two saves cannot slip past each other
    SELECT e.v, COALESCE(NULLIF(c.name, ''), 'a contact') || ' (' || c.company || ')' INTO dup, owner
      FROM contacts c, jsonb_array_elements_text(NEW.emails) AS e(v)
     WHERE c.id <> COALESCE(NEW.id, -1) AND jsonb_exists(c.emails, e.v) LIMIT 1;
    IF dup IS NOT NULL THEN
      RAISE EXCEPTION 'Email % is already used by %', dup, owner USING ERRCODE = '23505';
    END IF;
    SELECT p.v, COALESCE(NULLIF(c.name, ''), 'a contact') || ' (' || c.company || ')' INTO dup, owner
      FROM contacts c, jsonb_array_elements_text(NEW.phones) AS p(v)
     WHERE c.id <> COALESCE(NEW.id, -1) AND jsonb_exists(c.phones, p.v) LIMIT 1;
    IF dup IS NOT NULL THEN
      RAISE EXCEPTION 'Phone % is already used by %', dup, owner USING ERRCODE = '23505';
    END IF;
    RETURN NEW;
  END $$ LANGUAGE plpgsql`;

await sql`
  CREATE TRIGGER contacts_unique_channels
  BEFORE INSERT OR UPDATE OF emails, phones ON contacts
  FOR EACH ROW EXECUTE FUNCTION contacts_check_unique()`;

console.log('Done. Emails and phone numbers are now unique across all contacts.');
