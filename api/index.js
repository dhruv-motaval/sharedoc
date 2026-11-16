// Vercel serverless entry: the same Express app, backed by Turso. Static files are served by Vercel from dist/.
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

export default createApp(await openDb());
