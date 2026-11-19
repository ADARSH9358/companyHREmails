import { NextResponse } from 'next/server';
import { sql, ensureTable } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Numbers entered without a country code get this prefix (91 = India).
const DEFAULT_COUNTRY_CODE = '91';
const asList = (list) => (Array.isArray(list) ? list : []);
const cleanEmails = (list) => [...new Set(asList(list).map((v) => String(v).trim().toLowerCase()).filter(Boolean))];
const normalizePhone = (v) => {
  let d = String(v).replace(/\D/g, '');
  if (d.length === 10) d = DEFAULT_COUNTRY_CODE + d;
  return d ? '+' + d : '';
};
const cleanPhones = (list) => [...new Set(asList(list).map(normalizePhone).filter(Boolean))];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/contacts?companies=1   -> list of distinct company names (for the dropdowns)
// GET /api/contacts?company=Bayut -> every contact of exactly that company
// GET /api/contacts?q=bay         -> contacts whose company contains the text
export async function GET(req) {
  try {
    await ensureTable();
    const params = new URL(req.url).searchParams;

    if (params.get('companies')) {
      const rows = await sql`SELECT DISTINCT ON (lower(company)) company FROM contacts ORDER BY lower(company), company`;
      return NextResponse.json({ companies: rows.map((r) => r.company) });
    }

    const company = (params.get('company') || '').trim();
    const q = (params.get('q') || '').trim();
    const rows = company
      ? await sql`SELECT * FROM contacts WHERE lower(company) = ${company.toLowerCase()} ORDER BY name`
      : q
      ? await sql`SELECT * FROM contacts WHERE company ILIKE ${'%' + q + '%'} ORDER BY created_at DESC LIMIT 50`
      : await sql`SELECT * FROM contacts ORDER BY created_at DESC LIMIT 20`;
    return NextResponse.json({ contacts: rows });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Could not load contacts. Check DATABASE_URL.' }, { status: 500 });
  }
}

// POST /api/contacts -> save one person with any number of emails and phone numbers
export async function POST(req) {
  try {
    const b = await req.json();
    const company = String(b.company || '').trim();
    const emails = cleanEmails(b.emails);
    const phones = cleanPhones(b.phones);
    if (!company) return NextResponse.json({ error: 'Company name is required.' }, { status: 400 });
    if (!emails.length && !phones.length)
      return NextResponse.json({ error: 'Add at least one email or phone number.' }, { status: 400 });

    const badEmail = emails.find((e) => !EMAIL_RE.test(e));
    if (badEmail) return NextResponse.json({ error: `“${badEmail}” is not a valid email.` }, { status: 400 });
    const badPhone = phones.find((p) => p.length < 9 || p.length > 16);
    if (badPhone) return NextResponse.json({ error: `“${badPhone}” is not a valid phone number.` }, { status: 400 });

    await ensureTable();
    const rows = await sql`
      INSERT INTO contacts (name, company, title, linkedin, location, notes, emails, phones)
      VALUES (${String(b.name || '').trim()}, ${company}, ${String(b.title || '').trim()},
              ${String(b.linkedin || '').trim()}, ${String(b.location || '').trim()}, ${String(b.notes || '').trim()},
              ${JSON.stringify(emails)}::jsonb, ${JSON.stringify(phones)}::jsonb)
      ON CONFLICT (lower(company), lower(name)) DO NOTHING
      RETURNING *`;
    if (!rows.length)
      return NextResponse.json(
        { error: `${String(b.name || '').trim() || 'A contact'} at ${company} is already saved.` },
        { status: 409 });
    return NextResponse.json({ contact: rows[0] }, { status: 201 });
  } catch (e) {
    // 23505 = unique violation: the person, email or phone number is already saved
    if (e.code === '23505') return NextResponse.json({ error: e.message }, { status: 409 });
    console.error(e);
    return NextResponse.json({ error: 'Could not save contact. Check DATABASE_URL.' }, { status: 500 });
  }
}

// DELETE /api/contacts?id=5
export async function DELETE(req) {
  try {
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
    await ensureTable();
    await sql`DELETE FROM contacts WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Could not delete contact.' }, { status: 500 });
  }
}