// Removes existing duplicates (same company + name, ignoring upper/lower case), keeping the oldest row,
// then adds a database rule so duplicates can never be inserted again.
//   node --env-file=.env scripts/db.mjs
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const removed = await sql`
  DELETE FROM contacts a USING contacts b
  WHERE a.id > b.id
    AND lower(a.company) = lower(b.company)
    AND lower(a.name) = lower(b.name)
  RETURNING a.id, a.company, a.name`;
removed.forEach((r) => console.log(`removed duplicate: ${r.company} / ${r.name || '-'} (id ${r.id})`));

await sql`CREATE UNIQUE INDEX IF NOT EXISTS contacts_unique_person ON contacts (lower(company), lower(name))`;
console.log(`Done. Duplicates removed: ${removed.length}. Unique rule is active.`);
