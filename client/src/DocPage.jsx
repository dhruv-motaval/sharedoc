import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit'; // v3 bundles bold, italic, underline, headings, lists
import { api } from './api.js';
import Icon from './Icon.jsx';
import ShareDialog from './ShareDialog.jsx';

const BUTTONS = [
  ['bold', 'Bold (Ctrl+B)', 'bold', (c) => c.toggleBold()],
  ['italic', 'Italic (Ctrl+I)', 'italic', (c) => c.toggleItalic()],
  ['underline', 'Underline (Ctrl+U)', 'underline', (c) => c.toggleUnderline()],
  ['h1', 'Heading 1', 'heading1', (c) => c.toggleHeading({ level: 1 }), { name: 'heading', level: 1 }],
  ['h2', 'Heading 2', 'heading2', (c) => c.toggleHeading({ level: 2 }), { name: 'heading', level: 2 }],
  ['list', 'Bulleted list', 'bulletList', (c) => c.toggleBulletList()],
  ['olist', 'Numbered list', 'orderedList', (c) => c.toggleOrderedList()],
];

function Toolbar({ editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => Object.fromEntries(BUTTONS.map(([, , key, , check]) => [key, check ? e.isActive(check.name, { level: check.level }) : e.isActive(key)])),
  });
  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      {BUTTONS.map(([icon, label, key, run]) => (
        <button key={key} type="button" className={`tool ${active[key] ? 'on' : ''}`} aria-label={label} title={label} aria-pressed={active[key]}
          onMouseDown={(e) => e.preventDefault()} onClick={() => run(editor.chain().focus()).run()}>
          <Icon name={icon} />
        </button>
      ))}
    </div>
  );
}

function exportHtml(title, html) {
  const esc = (s) => s.replace(/</g, '&lt;');
  const blob = new Blob([`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><body style="font-family:sans-serif;max-width:720px;margin:2rem auto">${html}</body>`], { type: 'text/html' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${title.replace(/[^\w\- ]+/g, '') || 'document'}.html` });
  a.click();
  URL.revokeObjectURL(a.href);
}

function DocEditor({ initial, me }) {
  const canEdit = initial.role !== 'viewer';
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState('saved'); // saved | dirty | saving | error | conflict
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const meta = useRef({ version: initial.version, title: initial.title, timer: null, inflight: false, again: false });
  const editorRef = useRef(null);

  async function save() {
    const m = meta.current;
    if (m.inflight) { m.again = true; return; }
    m.inflight = true;
    setStatus('saving');
    try {
      const r = await api('PUT', `/docs/${initial.id}`, { title: m.title, content: editorRef.current.getHTML(), version: m.version });
      m.version = r.version;
      setError('');
      setStatus(m.again ? 'dirty' : 'saved');
    } catch (e) {
      setError(e.message);
      if (e.status === 409) m.conflict = true; // stop autosaving until the user reloads
      setStatus(e.status === 409 ? 'conflict' : 'error');
      m.again = false;
    } finally {
      m.inflight = false;
      if (m.again) { m.again = false; save(); }
    }
  }
  const schedule = () => {
    if (meta.current.conflict) return;
    setStatus('dirty');
    clearTimeout(meta.current.timer);
    meta.current.timer = setTimeout(save, 800);
  };

  const editor = useEditor({
    extensions: [StarterKit],
    content: initial.content,
    editable: canEdit,
    editorProps: { attributes: { 'aria-label': 'Document body', class: 'prose' } },
    onUpdate: schedule,
  });
  editorRef.current = editor;

  // Flush a pending save when leaving the page so the last keystrokes are not lost.
  useEffect(() => () => {
    const m = meta.current;
    if (m.timer) { clearTimeout(m.timer); if (canEdit && editorRef.current) save(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onTitle = (v) => { setTitle(v); meta.current.title = v.trim() || initial.title; schedule(); };
  const label = { saved: 'All changes saved', dirty: 'Unsaved changes…', saving: 'Saving…', error: 'Save failed', conflict: 'Out of date' }[status];

  return (
    <main className="doc-page">
      <div className="doc-bar">
        <a className="btn ghost" href="#/"><Icon name="back" /> <span>All documents</span></a>
        <input className="title-input" value={title} readOnly={!canEdit} maxLength={200} aria-label="Document title" onChange={(e) => onTitle(e.target.value)} />
        <span className={`status ${status}`} role="status">{canEdit ? label : 'View only'}</span>
        <button className="btn" onClick={() => exportHtml(title, editor.getHTML())}><Icon name="download" /> <span>Export HTML</span></button>
        {initial.role === 'owner' && <button className="btn primary" onClick={() => setSharing(true)}><Icon name="users" /> <span>Share</span></button>}
      </div>
      {!canEdit && <p className="notice"><Icon name="eye" /> You have view-only access. {initial.owner_name} owns this document.</p>}
      {initial.role === 'editor' && <p className="notice soft">Shared with you by {initial.owner_name} as an editor.</p>}
      {error && (
        <p role="alert" className="error">
          {error} {status === 'conflict' && <button className="link" onClick={() => location.reload()}>Reload latest</button>}
          {status === 'error' && <button className="link" onClick={save}>Retry</button>}
        </p>
      )}
      {canEdit && editor && <Toolbar editor={editor} />}
      <div className="sheet"><EditorContent editor={editor} /></div>
      {sharing && <ShareDialog doc={initial} me={me} onClose={() => setSharing(false)} />}
    </main>
  );
}

export default function DocPage({ id, me }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('GET', `/docs/${id}`).then(setDoc).catch((e) => setError(e.message));
  }, [id]);
  if (error) return <main className="page"><p role="alert" className="error">{error}</p><a className="btn" href="#/"><Icon name="back" /> Back to documents</a></main>;
  if (!doc) return <p className="center muted">Loading…</p>;
  return <DocEditor initial={doc} me={me} />;
}
