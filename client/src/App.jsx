import { useEffect, useState } from 'react';
import { api } from './api.js';
import Icon from './Icon.jsx';
import Dashboard from './Dashboard.jsx';
import DocPage from './DocPage.jsx';

function Login({ onLogin }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api('GET', '/users').then(setUsers).catch((e) => setError(e.message));
  }, []);
  const hint = { 1: 'Owns the demo document', 2: 'Editor on the demo document', 3: 'Viewer on the demo document' };
  const pick = (id) => api('POST', '/login', { userId: id }).then(onLogin).catch((e) => setError(e.message));
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand"><Icon name="file" size={22} /> Ajaia Docs</div>
        <h1>Sign in to continue</h1>
        <p className="muted">Demo environment: pick a seeded account. Open a second browser profile as another user to test sharing.</p>
        {error && <p role="alert" className="error">{error}</p>}
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.id}>
              <button className="user-btn" onClick={() => pick(u.id)}>
                <span className="avatar" aria-hidden="true">{u.name[0]}</span>
                <span><strong>{u.name}</strong><br /><span className="muted small">{u.email} · {hint[u.id]}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

const parseRoute = () => {
  const m = /^#\/doc\/(\d+)/.exec(location.hash);
  return m ? Number(m[1]) : null;
};

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
  const [docId, setDocId] = useState(parseRoute);

  useEffect(() => {
    api('GET', '/me').then(setMe).catch(() => setMe(null));
    const onHash = () => setDocId(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (me === undefined) return <p className="center muted">Loading…</p>;
  if (!me) return <Login onLogin={setMe} />;

  const logout = async () => {
    await api('POST', '/logout');
    location.hash = '';
    setMe(null);
  };

  return (
    <>
      <header className="topbar">
        <a href="#/" className="brand"><Icon name="file" size={22} /> Ajaia Docs</a>
        <div className="who">
          <span className="avatar" aria-hidden="true">{me.name[0]}</span>
          <span className="who-name">{me.name}</span>
          <button className="btn ghost" onClick={logout}><Icon name="out" /> <span>Switch user</span></button>
        </div>
      </header>
      {docId ? <DocPage key={docId} id={docId} me={me} /> : <Dashboard me={me} />}
    </>
  );
}
