import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';

const app = createApp(await openDb(), { staticDir: fileURLToPath(new URL('../dist', import.meta.url)) });
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Ajaia Docs on http://localhost:${port}`));
