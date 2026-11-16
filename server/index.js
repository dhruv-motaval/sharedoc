import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';

const db = openDb(process.env.DB_PATH || './data/app.db');
const app = createApp(db, { staticDir: fileURLToPath(new URL('../dist', import.meta.url)) });
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Ajaia Docs on http://localhost:${port}`));
