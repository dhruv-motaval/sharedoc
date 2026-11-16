import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SEED_USERS = [
  { id: 1, name: 'Alice Owner', email: 'alice@ajaia.test' },
  { id: 2, name: 'Bob Editor', email: 'bob@ajaia.test' },
  { id: 3, name: 'Carol Viewer', email: 'carol@ajaia.test' },
];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS shares (
    doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('viewer','editor')),
    PRIMARY KEY (doc_id, user_id)
  );
`;

const DEMO_HTML =
  '<h1>Welcome to Ajaia Docs</h1><p>This document is owned by <strong>Alice</strong> and shared with Bob (editor) and Carol (viewer).</p><ul><li>Try <em>italic</em>, <u>underline</u>, and headings</li><li>Upload a .txt, .md or .docx from the dashboard</li></ul>';

/**
 * Opens the database. Production: Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN).
 * Local: a SQLite file (DB_PATH, default ./data/app.db). Tests: pass { url: ':memory:' }.
 * Returns three small helpers instead of the raw client so routes stay short:
 *   all(sql, args) -> array of plain objects, one(sql, args) -> first row, run(sql, args) -> { rowsAffected, lastInsertRowid }
 */
export async function openDb({ url, authToken } = {}) {
  const dbPath = process.env.DB_PATH || './data/app.db';
  url ??= process.env.TURSO_DATABASE_URL || (dbPath === ':memory:' ? ':memory:' : `file:${dbPath}`);
  authToken ??= process.env.TURSO_AUTH_TOKEN;
  if (url.startsWith('file:')) mkdirSync(dirname(url.slice(5)), { recursive: true });

  const client = createClient({ url, authToken });
  const run = (sql, args = []) => client.execute({ sql, args });
  const all = async (sql, args) => (await run(sql, args)).rows.map((r) => ({ ...r }));
  const one = async (sql, args) => (await all(sql, args))[0];

  await client.executeMultiple(SCHEMA);
  for (const u of SEED_USERS) await run('INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)', [u.id, u.name, u.email]);

  // Seed one demo doc (fixed id, OR IGNORE: safe if two serverless cold starts race) shared with Bob (editor) and Carol (viewer).
  if ((await one('SELECT COUNT(*) AS n FROM documents')).n === 0) {
    await run('INSERT OR IGNORE INTO documents (id, owner_id, title, content) VALUES (1, 1, ?, ?)', ['Welcome to Ajaia Docs', DEMO_HTML]);
    await run("INSERT OR IGNORE INTO shares (doc_id, user_id, role) VALUES (1, 2, 'editor'), (1, 3, 'viewer')");
  }
  return { all, one, run };
}
