# Ajaia Docs

A lightweight collaborative document editor: create and edit rich-text documents, import files, and share documents with other users as viewer or editor.

**Stack:** React (Vite) · Tiptap editor · Node.js + Express · SQLite through libSQL (a local file in development, [Turso](https://turso.tech) in production) · deployed on Vercel

## Run locally

Requires **Node 20 or newer** (developed on Node 24). No database setup: a local SQLite file is used.

```bash
npm install
npm run build      # builds the React app into dist/
npm start          # http://localhost:3000 (API + built UI, one process)
```

Development with hot reload (two terminals):

```bash
npm run server     # API on :3000
npm run dev        # Vite on :5173, proxies /api to :3000
```

```bash
npm test           # API tests (node:test, in-memory SQLite)
```

The SQLite file is created at `./data/app.db` (override with `DB_PATH`). Demo users and one demo document are seeded on first start.

## Test accounts (mocked auth)

Sign-in is a one-click picker of seeded users (no passwords, a deliberate scope cut, see ARCHITECTURE.md).

| User | Email | Role on the seeded "Welcome" doc |
|---|---|---|
| Alice Owner | alice@ajaia.test | Owner |
| Bob Editor | bob@ajaia.test | Editor |
| Carol Viewer | carol@ajaia.test | Viewer |

**To test sharing:** sign in as Alice, open a document, click **Share**, add `bob@ajaia.test` as Editor. Open a second browser profile (or a private window; the session cookie is shared in one profile), sign in as Bob, and the document appears under **Shared with me**.

## Features

- Create, rename (edit the title), edit, autosave, reopen documents
- Formatting: bold, italic, underline, headings (H1/H2), bulleted and numbered lists
- **Import:** `.txt`, `.md`, `.docx` (max 2 MB) become a new editable document. Samples in `samples/`.
- **Sharing:** owner shares by email as *viewer* or *editor*; change or revoke at any time. Dashboard separates **My documents** from **Shared with me** with role badges.
- Export a document as `.html`
- Light and dark theme (follows system), keyboard accessible, responsive

## Deploy (Vercel + Turso, both free)

Vercel functions have no persistent disk, so production data lives in Turso (hosted SQLite, same SQL).

1. Create a free Turso database and copy its URL (`libsql://...`) and an auth token.
2. Import the GitHub repo into Vercel. `vercel.json` already sets the build (`npm run build`), output (`dist/`) and routes `/api/*` to `api/index.js`.
3. Add environment variables in Vercel → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://<your-db>.turso.io` |
| `TURSO_AUTH_TOKEN` | token from Turso |
| `SESSION_SECRET` | a long random string (the server refuses to start in production without it) |

4. Deploy. Tables and the demo users/document are created automatically on the first request.

Alternative: `Dockerfile` + `render.yaml` run the same app as one container on Render (file-based SQLite; free-tier disk resets on redeploy).

## Status

- **Working:** everything listed above, verified in a browser (create, format, autosave, reload, share dialog, viewer lock, `.docx`/`.md`/`.txt` import) plus 6 automated API tests.
- **Not done / known limits:** no real-time co-editing (last-save-wins with a version check that returns a conflict message); no real authentication; no `.pdf` import; no automated browser (UI) tests.
- **Next with 2–4 more hours:** real auth (hashed passwords or OAuth), live collaboration (Tiptap + Yjs), version history, UI tests with Playwright.
