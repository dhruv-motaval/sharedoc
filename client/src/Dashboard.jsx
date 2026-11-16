import { useEffect, useRef, useState } from 'react';
import { api, timeAgo } from './api.js';
import Icon from './Icon.jsx';

function DocRow({ d, role, onDelete }) {
  return (
    <li className="doc-row">
      <a className="doc-link" href={`#/doc/${d.id}`}>
        <span className="doc-icon" aria-hidden="true"><Icon name="file" size={20} /></span>
        <span className="doc-main">
          <span className="doc-title">{d.title}</span>
          <span className="muted small">
            {role ? `Owner: ${d.owner_name} · ` : ''}Edited {timeAgo(d.updated_at)}
            {!role && d.share_count > 0 ? ` · Shared with ${d.share_count}` : ''}
          </span>
        </span>
      </a>
      <span className={`badge ${role ? role : 'owner'}`}>{role ?? 'Owner'}</span>
      {onDelete && (
        <button className="btn icon" aria-label={`Delete ${d.title}`} onClick={() => onDelete(d)}>
          <Icon name="trash" />
        </button>
      )}
    </li>
  );
}

export default function Dashboard() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const load = () => api('GET', '/docs').then(setDocs).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const guard = async (fn) => {
    setError('');
    setBusy(true);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const create = () => guard(async () => { location.hash = `#/doc/${(await api('POST', '/docs', {})).id}`; });
  const upload = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    guard(async () => {
      const form = new FormData();
      form.append('file', file);
      location.hash = `#/doc/${(await api('POST', '/upload', form)).id}`;
    });
  };
  const remove = (d) => {
    if (confirm(`Delete "${d.title}"? This also removes access for everyone it was shared with and cannot be undone.`)) guard(async () => { await api('DELETE', `/docs/${d.id}`); await load(); });
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>Documents</h1>
        <div className="actions">
          <input ref={fileRef} type="file" accept=".txt,.md,.docx" hidden onChange={upload} />
          <button className="btn" disabled={busy} onClick={() => fileRef.current.click()}><Icon name="upload" /> Import file</button>
          <button className="btn primary" disabled={busy} onClick={create}><Icon name="plus" /> New document</button>
        </div>
      </div>
      <p className="muted small hint">Import supports <strong>.txt, .md and .docx</strong> (max 2 MB). The file becomes a new editable document.</p>
      {error && <p role="alert" className="error">{error}</p>}
      {!docs ? <p className="muted">Loading…</p> : (
        <>
          <section aria-labelledby="own-h">
            <h2 id="own-h">My documents <span className="count">{docs.owned.length}</span></h2>
            {docs.owned.length === 0
              ? <p className="empty">No documents yet. Create one or import a file to get started.</p>
              : <ul className="doc-list">{docs.owned.map((d) => <DocRow key={d.id} d={d} onDelete={remove} />)}</ul>}
          </section>
          <section aria-labelledby="shared-h">
            <h2 id="shared-h">Shared with me <span className="count">{docs.shared.length}</span></h2>
            {docs.shared.length === 0
              ? <p className="empty">Nothing has been shared with you yet.</p>
              : <ul className="doc-list">{docs.shared.map((d) => <DocRow key={d.id} d={d} role={d.role} />)}</ul>}
          </section>
        </>
      )}
    </main>
  );
}
