import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { marked } from 'marked';
import xss from 'xss';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';

// A guessable secret would let anyone forge a login cookie, so production refuses to start without one.
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET must be set in production');
const SECRET = process.env.SESSION_SECRET || 'dev-only-secret';
const MAX_UPLOAD = 2 * 1024 * 1024;
export const ALLOWED_UPLOADS = ['.txt', '.md', '.docx'];

// Server-side allowlist: shared docs render in other users' browsers, so never trust client HTML.
// `xss` (not sanitize-html): sanitize-html's ESM-only dependency cannot be loaded by Vercel's Node runtime.
const ALLOWED_TAGS = ['h1', 'h2', 'h3', 'p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'a'];
const filter = new xss.FilterXSS({
  whiteList: Object.fromEntries(ALLOWED_TAGS.map((t) => [t, t === 'a' ? ['href'] : []])),
  stripIgnoreTag: true, // drop unknown tags, keep their text
  stripIgnoreTagBody: ['script', 'style'], // drop these entirely, including contents
});
export const clean = (html) => filter.process(html);

const sign = (v) => createHmac('sha256', SECRET).update(String(v)).digest('hex');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// db = { all, one, run } from server/db.js. Express 5 forwards rejected async handlers to the error middleware.
export function createApp(db, { staticDir } = {}) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD } });

  // --- mocked auth: pick a seeded user, get a signed cookie (documented as a deliberate scope cut) ---
  app.use(async (req, _res, next) => {
    const m = /(?:^|;\s*)sid=(\d+)\.([a-f0-9]{64})/.exec(req.headers.cookie || '');
    if (m && timingSafeEqual(Buffer.from(m[2]), Buffer.from(sign(m[1])))) {
      req.user = await db.one('SELECT id, name, email FROM users WHERE id = ?', [Number(m[1])]);
    }
    next();
  });
  const auth = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'Please sign in')));

  app.get('/api/users', async (_req, res) => res.json(await db.all('SELECT id, name, email FROM users')));
  app.post('/api/login', async (req, res) => {
    const u = await db.one('SELECT id, name, email FROM users WHERE id = ?', [Number(req.body?.userId)]);
    if (!u) throw new HttpError(400, 'Unknown user');
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `sid=${u.id}.${sign(u.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
    res.json(u);
  });
  app.post('/api/logout', (_req, res) => {
    res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0');
    res.json({ ok: true });
  });
  app.get('/api/me', auth, (req, res) => res.json(req.user));

  // --- access logic: single choke point. No access => 404 so doc ids don't leak existence. ---
  async function load(docId, user) {
    const doc = await db.one('SELECT d.*, u.name AS owner_name FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id = ?', [Number(docId)]);
    if (!doc) throw new HttpError(404, 'Document not found');
    let role = null;
    if (doc.owner_id === user.id) role = 'owner';
    else role = (await db.one('SELECT role FROM shares WHERE doc_id = ? AND user_id = ?', [doc.id, user.id]))?.role ?? null;
    if (!role) throw new HttpError(404, 'Document not found');
    return { doc, role };
  }
  const needOwner = (role) => {
    if (role !== 'owner') throw new HttpError(403, 'Only the owner can do this');
  };

  const cols = 'd.id, d.title, d.updated_at, d.owner_id, u.name AS owner_name';
  app.get('/api/docs', auth, async (req, res) => {
    const owned = await db.all(
      `SELECT ${cols}, (SELECT COUNT(*) FROM shares s WHERE s.doc_id = d.id) AS share_count
       FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.owner_id = ? ORDER BY d.updated_at DESC, d.id DESC`,
      [req.user.id],
    );
    const shared = await db.all(
      `SELECT ${cols}, s.role FROM shares s JOIN documents d ON d.id = s.doc_id JOIN users u ON u.id = d.owner_id
       WHERE s.user_id = ? ORDER BY d.updated_at DESC, d.id DESC`,
      [req.user.id],
    );
    res.json({ owned, shared });
  });

  const insertDoc = async (ownerId, title, content) =>
    Number((await db.run('INSERT INTO documents (owner_id, title, content) VALUES (?, ?, ?)', [ownerId, title, content])).lastInsertRowid);

  app.post('/api/docs', auth, async (req, res) => {
    const title = String(req.body?.title ?? 'Untitled document').trim().slice(0, 200) || 'Untitled document';
    res.status(201).json({ id: await insertDoc(req.user.id, title, '') });
  });

  app.get('/api/docs/:id', auth, async (req, res) => {
    const { doc, role } = await load(req.params.id, req.user);
    const shares =
      role === 'owner'
        ? await db.all('SELECT u.id, u.name, u.email, s.role FROM shares s JOIN users u ON u.id = s.user_id WHERE s.doc_id = ?', [doc.id])
        : undefined;
    res.json({ ...doc, role, shares });
  });

  // Optimistic concurrency: client sends the version it loaded; stale writes get 409 instead of silently clobbering.
  // The version check lives in the UPDATE's WHERE clause, so two concurrent saves cannot both win.
  app.put('/api/docs/:id', auth, async (req, res) => {
    const { doc, role } = await load(req.params.id, req.user);
    if (role === 'viewer') throw new HttpError(403, 'You have view-only access');
    const { title, content, version } = req.body ?? {};
    if (!Number.isInteger(version)) throw new HttpError(400, 'version is required');
    const stale = new HttpError(409, 'This document was changed by someone else. Reload to get the latest.');
    if (version !== doc.version) throw stale;
    const newTitle = title === undefined ? doc.title : String(title).trim().slice(0, 200);
    if (!newTitle) throw new HttpError(400, 'Title cannot be empty');
    const newContent = content === undefined ? doc.content : clean(String(content));
    const r = await db.run(
      "UPDATE documents SET title = ?, content = ?, version = version + 1, updated_at = datetime('now') WHERE id = ? AND version = ?",
      [newTitle, newContent, doc.id, version],
    );
    if (r.rowsAffected === 0) throw stale;
    res.json({ version: doc.version + 1, title: newTitle });
  });

  app.delete('/api/docs/:id', auth, async (req, res) => {
    const { doc, role } = await load(req.params.id, req.user);
    needOwner(role);
    // Explicit, not relying on ON DELETE CASCADE: foreign-key enforcement differs between local SQLite and Turso.
    await db.run('DELETE FROM shares WHERE doc_id = ?', [doc.id]);
    await db.run('DELETE FROM documents WHERE id = ?', [doc.id]);
    res.json({ ok: true });
  });

  // --- sharing (owner only) ---
  app.post('/api/docs/:id/shares', auth, async (req, res) => {
    const { doc, role } = await load(req.params.id, req.user);
    needOwner(role);
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const shareRole = req.body?.role;
    if (!['viewer', 'editor'].includes(shareRole)) throw new HttpError(400, 'Role must be viewer or editor');
    const target = await db.one('SELECT id, name, email FROM users WHERE email = ?', [email]);
    if (!target) throw new HttpError(404, `No user with email ${email || '(empty)'}`);
    if (target.id === doc.owner_id) throw new HttpError(400, 'You already own this document');
    await db.run('INSERT INTO shares (doc_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT(doc_id, user_id) DO UPDATE SET role = excluded.role', [doc.id, target.id, shareRole]);
    res.status(201).json({ ...target, role: shareRole });
  });
  app.delete('/api/docs/:id/shares/:userId', auth, async (req, res) => {
    const { doc, role } = await load(req.params.id, req.user);
    needOwner(role);
    await db.run('DELETE FROM shares WHERE doc_id = ? AND user_id = ?', [doc.id, Number(req.params.userId)]);
    res.json({ ok: true });
  });

  // --- upload: .txt / .md / .docx become a new editable document owned by the uploader ---
  app.post('/api/upload', auth, upload.single('file'), async (req, res) => {
    const f = req.file;
    if (!f) throw new HttpError(400, 'Choose a file to upload');
    const ext = extname(f.originalname).toLowerCase();
    if (!ALLOWED_UPLOADS.includes(ext)) throw new HttpError(400, `Unsupported file type "${ext || 'unknown'}". Use ${ALLOWED_UPLOADS.join(', ')}.`);
    let html;
    if (ext === '.docx') {
      try {
        html = (await mammoth.convertToHtml({ buffer: f.buffer })).value;
      } catch {
        throw new HttpError(400, 'Could not read this .docx file. Is it a valid Word document?');
      }
    } else {
      const text = f.buffer.toString('utf8');
      html = ext === '.md' ? await marked.parse(text) : text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    }
    const title = f.originalname.replace(/\.[^.]+$/, '').slice(0, 200) || 'Imported document';
    res.status(201).json({ id: await insertDoc(req.user.id, title, clean(html)) });
  });

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(staticDir, 'index.html')));
  }

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large (max 2 MB)' });
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}
