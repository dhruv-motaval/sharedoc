import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SEED_USERS = [
  { id: 1, name: 'Alice Owner', email: 'alice@ajaia.test' },
  { id: 2, name: 'Bob Editor', email: 'bob@ajaia.test' },
  { id: 3, name: 'Carol Viewer', email: 'carol@ajaia.test' },
];

export function openDb(path = './data/app.db') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
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
  `);
  const ins = db.prepare('INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)');
  for (const u of SEED_USERS) ins.run(u.id, u.name, u.email);

  // Seed one demo doc shared with Bob (editor) and Carol (viewer) so sharing is demoable on first load.
  if (db.prepare('SELECT COUNT(*) AS n FROM documents').get().n === 0) {
    const r = db
      .prepare('INSERT INTO documents (owner_id, title, content) VALUES (1, ?, ?)')
      .run(
        'Welcome to Ajaia Docs',
        '<h1>Welcome to Ajaia Docs</h1><p>This document is owned by <strong>Alice</strong> and shared with Bob (editor) and Carol (viewer).</p><ul><li>Try <em>italic</em>, <u>underline</u>, and headings</li><li>Upload a .txt, .md or .docx from the dashboard</li></ul>',
      );
    const s = db.prepare('INSERT INTO shares (doc_id, user_id, role) VALUES (?, ?, ?)');
    s.run(r.lastInsertRowid, 2, 'editor');
    s.run(r.lastInsertRowid, 3, 'viewer');
  }
  return db;
}
