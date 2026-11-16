# AI workflow note

> DRAFT: edit this in your own words before submitting. The facts below come from this build session; add anything you did yourself.

## Tools used

- **Claude Code (Claude Sonnet 5.5)** for planning, implementation, tests, and docs.
- **UI/UX Pro Max skill** inside Claude Code to pick a design direction: flat SaaS style, teal palette, Plus Jakarta Sans, accessibility and touch-target rules.

## Where AI materially sped me up

- Scaffolding the Express API, SQLite schema and the React screens in one pass, so my time went into the access rules and the editing flow rather than boilerplate.
- Generating the first version of the API test suite, which I then used as the spec for the sharing rules.
- Producing an accessible, responsive, light/dark design system quickly (focus rings, 44px targets, reduced-motion).

## What I changed or rejected

- **Editor choice:** the assistant first proposed Quill for simplicity. I chose React + Tiptap instead, so the editor library was my decision.
- **Redundant dependency:** the assistant installed `@tiptap/extension-underline`; I checked Tiptap v3 and `StarterKit` already includes underline, so I removed it.
- **Test runner bug:** the generated `npm test` script passed a directory to `node --test`, which fails on Node 24; fixed it with a file glob.
- **Deployment pivot:** the first plan (SQLite file) cannot persist on Vercel, so the data layer moved to Turso (libSQL). The first Vercel deploy then crashed in production although all tests passed locally: the runtime log showed `ERR_REQUIRE_ESM` from `sanitize-html`'s dependency. Pinning Node 22 did not help, so I swapped the sanitizer for `xss`, re-checked it against script, event-handler, `javascript:` and iframe payloads, and redeployed. Lesson: tests on my machine do not prove the production runtime; I smoke-tested the live API (login, create, save, upload, delete) after deploying.
- **Button colour:** the design palette's teal (#0D9488) fails 4.5:1 contrast with white text, so buttons use a darker teal.
- **Scope cuts the assistant had to respect:** no real auth, no real-time sync, no PDF import.
- **ADD YOUR OWN:** anything else you changed or rejected while reviewing the code.

## How I verified correctness

- **Automated:** 6 API tests covering auth, persistence, the full share matrix, stale-version conflict, HTML sanitization and upload validation.
- **Manual, in a real browser:** create → format → autosave → reload (content and formatting preserved); share dialog; viewer account is locked and has no toolbar or Share button; mobile (375px) and light/dark layouts; `.docx` import checked with a hand-built Word file.
- **Reading the output:** access control, sanitization and autosave sequencing were reviewed line by line, because those are where a wrong guess causes data leaks or lost edits.
- **Not verified:** the Docker build and the live Render deployment, and Word files with images or tables.
