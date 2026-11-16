# Submission

**Live product URL:** `TODO: paste your Render URL here`
**Walkthrough video:** see `walkthrough_video_url.txt`

## Test accounts (no passwords, one-click picker)

alice@ajaia.test (owner of the demo doc) · bob@ajaia.test (editor) · carol@ajaia.test (viewer)

## What is included

| Path | What it is |
|---|---|
| `server/` | Express API: auth cookie, documents, sharing, upload, SQLite schema + seed |
| `client/` | React + Tiptap single-page app |
| `test/api.test.js` | Automated API tests (`npm test`) |
| `samples/` | `.txt`, `.md`, `.docx` files to try the import |
| `README.md` | Setup, run, deploy, status, next steps |
| `ARCHITECTURE.md` | What I prioritized and key decisions |
| `AI_WORKFLOW.md` | AI tools used, what I changed, how I verified |
| `Dockerfile`, `render.yaml` | Deployment |
| `walkthrough_video_url.txt` | Link to the 3–5 minute video |

## Status

- **Working:** create, rename, edit, autosave, reopen; bold/italic/underline/headings/lists; `.txt`/`.md`/`.docx` import; share as viewer or editor, revoke, owned vs shared lists; HTML export; persistence in SQLite.
- **Incomplete:** no real authentication, no real-time co-editing, free-tier hosting data is not durable, no automated UI tests.
- **Next with 2–4 more hours:** real auth, Postgres, Yjs live collaboration, version history, Playwright tests.
