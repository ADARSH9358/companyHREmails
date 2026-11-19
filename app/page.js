'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

// Numbers entered without a country code get this prefix for WhatsApp (91 = India).
const DEFAULT_COUNTRY_CODE = '91';

const waLink = (phone) => {
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) digits = DEFAULT_COUNTRY_CODE + digits;
  return `https://wa.me/${digits}`;
};
const mailLink = (email, c) =>
  `mailto:${email}?subject=${encodeURIComponent('Hello from ' + (c.company || ''))}` +
  `&body=${encodeURIComponent(`Hi ${c.name || ''},\n\n`)}`;
const clip = (s, n) => (s && s.length > n ? s.slice(0, n) + '...' : s || '');

const EMPTY = { name: '', company: '', title: '', linkedin: '', location: '', notes: '', emails: [''], phones: [''] };

/* ---------- Searchable dropdown. allowAdd lets the user keep a company that is not in the list ---------- */
function Combobox({ id, value, onType, onSelect, options, allowAdd, placeholder, required }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const q = value.trim().toLowerCase();
  const matches = options.filter((o) => o.toLowerCase().includes(q));
  const exact = options.find((o) => o.toLowerCase() === q);
  const canAdd = allowAdd && q && !exact;
  const pick = (v) => { onSelect(v); setOpen(false); };

  function onKeyDown(e) {
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Enter' && open && q) {
      const choice = exact ?? (allowAdd ? value.trim() : matches[0]);
      if (choice) { e.preventDefault(); pick(choice); }
    }
  }

  return (
    <div className="combo" ref={ref}>
      <input id={id} value={value} required={required} placeholder={placeholder} autoComplete="off"
             role="combobox" aria-expanded={open} aria-controls={`${id}-list`}
             onChange={(e) => { onType(e.target.value); setOpen(true); }}
             onFocus={() => setOpen(true)} onKeyDown={onKeyDown} />
      {open && (matches.length > 0 || canAdd) && (
        <ul className="combo-list" id={`${id}-list`} role="listbox">
          {matches.map((o) => (
            <li key={o} role="option" onMouseDown={(e) => { e.preventDefault(); pick(o); }}>{o}</li>
          ))}
          {canAdd && (
            <li role="option" className="add" onMouseDown={(e) => { e.preventDefault(); pick(value.trim()); }}>
              + Add “{value.trim()}” as a new company
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function MultiField({ label, type, values, onChange, placeholder }) {
  const set = (i, v) => onChange(values.map((x, j) => (j === i ? v : x)));
  return (
    <div>
      <label>{label}</label>
      {values.map((v, i) => (
        <div className="row" key={i}>
          <input type={type} value={v} placeholder={placeholder} aria-label={`${label} ${i + 1}`}
                 onChange={(e) => set(i, e.target.value)} />
          {values.length > 1 && (
            <button type="button" className="small" onClick={() => onChange(values.filter((_, j) => j !== i))}>
              Remove
            </button>
          )}
        </div>
      ))}
      <button type="button" className="small" onClick={() => onChange([...values, ''])}>Add another</button>
    </div>
  );
}

export default function Home() {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { ok, text }

  const [companies, setCompanies] = useState([]);
  const [query, setQuery] = useState('');      // text in the search dropdown
  const [selected, setSelected] = useState(''); // company chosen from it
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState('');
  const [toDelete, setToDelete] = useState(null);

  const field = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const loadCompanies = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts?companies=1');
      const data = await res.json();
      if (res.ok) setCompanies(data.companies);
    } catch {}
  }, []);

  const loadResults = useCallback(async (company) => {
    try {
      const res = await fetch(`/api/contacts?company=${encodeURIComponent(company)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.contacts);
      setSearchError('');
    } catch (e) {
      setSearchError(e.message || 'Search failed.');
    }
  }, []);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);
  useEffect(() => { selected ? loadResults(selected) : setResults([]); }, [selected, loadResults]);

  useEffect(() => {
    if (!toDelete) return;
    const onKey = (e) => e.key === 'Escape' && setToDelete(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toDelete]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus({ ok: true, text: `Saved ${data.contact.name || data.contact.company}.` });
      setForm(EMPTY);
      loadCompanies();
      if (selected && selected.toLowerCase() === data.contact.company.toLowerCase()) loadResults(selected);
    } catch (err) {
      setStatus({ ok: false, text: err.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const c = toDelete;
    setToDelete(null);
    await fetch(`/api/contacts?id=${c.id}`, { method: 'DELETE' });
    loadCompanies();
    if (selected) loadResults(selected);
  }

  return (
    <main>
      <h1>Contact Hub</h1>
      <p className="sub">Save people by company, then reach them by email or WhatsApp in one click.</p>

      <form className="panel" onSubmit={save}>
        <h2>Add a contact</h2>
        <div className="grid">
          <div>
            <label htmlFor="name">Person name</label>
            <input id="name" value={form.name} onChange={field('name')} />
          </div>
          <div>
            <label htmlFor="company">Company name</label>
            <Combobox id="company" required allowAdd value={form.company} options={companies}
                      placeholder="Pick a company or type a new one"
                      onType={(v) => setForm({ ...form, company: v })}
                      onSelect={(v) => setForm({ ...form, company: v })} />
          </div>
          <MultiField label="Email" type="email" values={form.emails} placeholder="name@company.com"
                      onChange={(emails) => setForm({ ...form, emails })} />
          <MultiField label="Phone number" type="tel" values={form.phones} placeholder="+91 98765 43210"
                      onChange={(phones) => setForm({ ...form, phones })} />
          <div>
            <label htmlFor="title">Title</label>
            <input id="title" value={form.title} onChange={field('title')} />
          </div>
          <div>
            <label htmlFor="location">Location</label>
            <input id="location" value={form.location} onChange={field('location')} />
          </div>
          <div className="full">
            <label htmlFor="linkedin">LinkedIn</label>
            <input id="linkedin" type="url" value={form.linkedin} onChange={field('linkedin')}
                   placeholder="https://linkedin.com/in/..." />
          </div>
          <div className="full">
            <label htmlFor="notes">Action / notes</label>
            <textarea id="notes" value={form.notes} onChange={field('notes')} />
          </div>
        </div>
        <p style={{ marginTop: 20 }}>
          <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save contact'}</button>
        </p>
        {status && <p className={`msg ${status.ok ? 'ok' : 'err'}`} role="status">{status.text}</p>}
      </form>

      <section className="panel">
        <h2>Find a company</h2>
        <label htmlFor="q">Company name</label>
        <Combobox id="q" value={query} options={companies} placeholder="Search and pick a company…"
                  onType={(v) => { setQuery(v); if (selected && v !== selected) setSelected(''); }}
                  onSelect={(v) => { setQuery(v); setSelected(v); }} />
        {searchError && <p className="msg err">{searchError}</p>}

        <div style={{ marginTop: 20 }}>
          {!selected && <p className="empty">Pick a company from the list to see its contacts.</p>}
          {selected && results.length === 0 && !searchError && (
            <p className="empty">No contacts found for “{selected}”.</p>
          )}
          {selected && results.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Company</th><th>Name</th><th>Title</th><th>Email</th>
                    <th>Phone</th><th>LinkedIn</th><th>Action</th><th><span className="sr">Delete</span></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((c) => (
                    <tr key={c.id}>
                      <td>{c.company}</td>
                      <td>{c.name || '—'}</td>
                      <td>{c.title || '—'}</td>
                      <td>
                        {c.emails.length ? c.emails.map((em) => (
                          <div key={em}><a href={mailLink(em, c)} title="Send email">{em}</a></div>
                        )) : '—'}
                      </td>
                      <td>
                        {c.phones.length ? c.phones.map((ph) => (
                          <div key={ph}>
                            <a className="wa-link" href={waLink(ph)} target="_blank" rel="noopener noreferrer"
                               title="Send on WhatsApp">{ph}</a>
                          </div>
                        )) : '—'}
                      </td>
                      <td className="nowrap">
                        {c.linkedin ? (
                          <a href={c.linkedin} target="_blank" rel="noopener noreferrer" title={c.linkedin}>
                            {clip(c.linkedin, 20)}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="action" title={c.notes || undefined}>{clip(c.notes, 50) || '—'}</td>
                      <td>
                        <button className="icon-btn" aria-label={`Delete ${c.name || c.company}`}
                                title="Delete" onClick={() => setToDelete(c)}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {toDelete && (
        <div className="overlay" onClick={() => setToDelete(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="del-title"
               onClick={(e) => e.stopPropagation()}>
            <h2 id="del-title">Delete this contact?</h2>
            <p className="meta">
              {toDelete.name || 'This contact'} at {toDelete.company} will be removed permanently.
            </p>
            <div className="modal-actions">
              <button autoFocus onClick={() => setToDelete(null)}>Cancel</button>
              <button className="danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}