import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Icon from './Icon.jsx';

export default function ShareDialog({ doc, me, onClose }) {
  const ref = useRef();
  const [shares, setShares] = useState(doc.shares ?? []);
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState('');

  useEffect(() => {
    ref.current.showModal(); // native <dialog>: focus trap + Esc for free
    api('GET', '/users').then(setUsers).catch(() => {});
  }, []);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const s = await api('POST', `/docs/${doc.id}/shares`, { email, role });
      setShares((cur) => [...cur.filter((x) => x.id !== s.id), s]);
      setEmail('');
    } catch (err) { setError(err.message); }
  };
  const remove = async (u) => {
    try { await api('DELETE', `/docs/${doc.id}/shares/${u.id}`); setShares((cur) => cur.filter((x) => x.id !== u.id)); }
    catch (err) { setError(err.message); }
  };
  const change = async (u, r) => {
    try { await api('POST', `/docs/${doc.id}/shares`, { email: u.email, role: r }); setShares((cur) => cur.map((x) => (x.id === u.id ? { ...x, role: r } : x))); }
    catch (err) { setError(err.message); }
  };
  const suggestions = users.filter((u) => u.id !== me.id && !shares.some((s) => s.id === u.id));

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="share-h">
      <div className="dialog-head">
        <h2 id="share-h">Share “{doc.title}”</h2>
        <button className="btn icon" aria-label="Close" onClick={() => ref.current.close()}><Icon name="x" /></button>
      </div>
      <form className="share-form" onSubmit={add}>
        <label className="field"><span>Person’s email</span>
          <input type="email" required list="share-suggest" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="bob@ajaia.test" autoComplete="off" />
        </label>
        <datalist id="share-suggest">{suggestions.map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}</datalist>
        <label className="field"><span>Access</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="viewer">Viewer (read only)</option>
            <option value="editor">Editor (can edit)</option>
          </select>
        </label>
        <button className="btn primary" type="submit">Share</button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      <h3>People with access</h3>
      <ul className="share-list">
        <li><span className="avatar" aria-hidden="true">{me.name[0]}</span><span className="grow"><strong>{me.name}</strong> (you)</span><span className="badge owner">Owner</span></li>
        {shares.map((u) => (
          <li key={u.id}>
            <span className="avatar" aria-hidden="true">{u.name[0]}</span>
            <span className="grow"><strong>{u.name}</strong><br /><span className="muted small">{u.email}</span></span>
            <select aria-label={`Access for ${u.name}`} value={u.role} onChange={(e) => change(u, e.target.value)}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button className="btn icon" aria-label={`Remove ${u.name}`} onClick={() => remove(u)}><Icon name="x" /></button>
          </li>
        ))}
        {shares.length === 0 && <li className="muted small">Only you can see this document.</li>}
      </ul>
    </dialog>
  );
}
