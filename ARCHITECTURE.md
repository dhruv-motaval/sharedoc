# Architecture note

## What I prioritized, and why

The brief asks for depth in a few areas rather than breadth. I prioritized, in order:

1. **A correct sharing and access model.** It is the part that can leak data, so it gets one choke point and tests.
2. **A usable editing loop**: type, format, autosave, reload and see the same document.
3. **File import** that is product-relevant: a file becomes a new editable document.
4. **A deployable single service** that reviewers can open without setup.

Deliberately cut: real authentication, real-time co-editing, comments, PDF import. Each is named in the README with what I would build next.

## Shape of the system

```
React SPA (Vite)  ──fetch /api──▶  Express  ──libSQL──▶  Turso / SQLite file (users, documents, shares)
  Tiptap editor                      │
                                     ├── Vercel: SPA served from the CDN, Express runs as one serverless function (api/index.js)
                                     └── local / Docker: Express also serves the built SPA
```

- **Frontend:** React with hash routing (`#/doc/12`), no router or state library. Tiptap (ProseMirror) edits documents; the document body is stored as sanitized HTML.
- **Backend:** one `createApp(db)` factory in `server/app.js`, which is why tests run against an in-memory database with no mocking.
- **Data model:** `users`, `documents(owner_id, title, content, version)`, `shares(doc_id, user_id, role)` with a composite primary key so one person has one role per document, and `ON DELETE CASCADE` so deleting a document removes its shares.

## Key decisions

**Access control lives in one function (`load`).** Every document route goes through it. It returns the document and the caller's role (`owner`, `editor`, `viewer`) or throws. A user with no access gets **404, not 403**, so document ids cannot be probed. Writes need `editor`/`owner`; sharing, revoking and deleting need `owner`. The UI hides controls for the same rules, but the server is the authority.

**Content is HTML, sanitized on the server.** Shared documents render in other people's browsers, so a stored-XSS bug would be cross-user. Saves go through an allowlist sanitizer (`xss`; it replaced `sanitize-html`, whose ESM-only dependency failed to load on Vercel's runtime). Imported `.md`/`.docx` content goes through the same path. Chosen over storing editor JSON because HTML is simple, exportable, and trivially round-trips through Tiptap for this feature set. The cost is that rich content outside the allowlist (images, tables) is dropped.

**Optimistic concurrency instead of locks.** Each save sends the version it loaded; the server rejects a stale version with 409 and the UI stops autosaving and offers Reload. This prevents silent overwrites without building real-time sync. Two people editing at once will see a conflict message rather than merged text; Yjs is the proper next step.

**Autosave with a single in-flight request.** Edits debounce for 800 ms. If a save is running when another edit lands, one follow-up save is queued, so requests never overlap and bump the version out of order. Leaving the page flushes a pending save.

**Mocked auth, real session mechanics.** Users pick a seeded account; the server sets an HMAC-signed, HttpOnly cookie and every route checks it. This is enough to demonstrate real owner/shared behavior without spending the timebox on password flows. Do not ship this to production.

**SQLite dialect via libSQL (Turso in production).** Vercel functions have no persistent disk and each instance is separate, so a SQLite file there would lose data and break sharing. libSQL keeps the same SQL and the same schema: a local file in development and tests, Turso in production, selected by environment variables. The cost is an async data layer (`server/db.js` exposes `all/one/run`) and a network hop per query. Foreign-key cascades are done explicitly in the delete route because enforcement differs between local SQLite and Turso. The save's version check is part of the `UPDATE ... WHERE version = ?`, so two concurrent saves cannot both succeed.

**Production refuses to start without `SESSION_SECRET`.** The cookie is signed with it; a default secret on a public URL would let anyone forge a login.

## Testing

`npm test` runs 7 API tests against in-memory SQLite: auth required, save and reload preserves formatting, delete (owner only, removes the document for everyone), the full share matrix (stranger 404, viewer 403 on write, editor can write, non-owner cannot share, revoke removes access), stale-version 409, HTML sanitization, and upload (accepts `.md`, rejects unsupported types). UI behavior was verified manually in a browser; there are no automated UI tests.

## Editor note (for explaining Tiptap)

Tiptap wraps ProseMirror. `useEditor` creates the editor with `StarterKit` (v3 already bundles bold, italic, underline, headings, lists). Toolbar buttons call chains like `editor.chain().focus().toggleBold().run()`. `useEditorState` re-renders the toolbar's active states, because Tiptap v3 does not re-render React on every transaction by default. `onUpdate` triggers autosave; `editor.getHTML()` is what is saved; viewers get `editable: false`.
