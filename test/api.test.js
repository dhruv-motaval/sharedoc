import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

let server, base;
before(async () => {
  server = createApp(await openDb({ url: ':memory:' })).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

// Tiny client: logs in as a seeded user (1 alice/owner, 2 bob, 3 carol) and keeps the cookie.
async function as(userId) {
  const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { cookie, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
}

test('requires sign-in', async () => {
  assert.equal((await fetch(`${base}/api/docs`)).status, 401);
});

test('owner creates, saves and reloads a document with formatting preserved', async () => {
  const alice = await as(1);
  const { body: { id } } = await alice('POST', '/api/docs', { title: 'Plan' });
  const saved = await alice('PUT', `/api/docs/${id}`, { content: '<h1>Hi</h1><p><strong>bold</strong> <u>u</u></p><ul><li>x</li></ul>', version: 1 });
  assert.equal(saved.body.version, 2);
  const got = await alice('GET', `/api/docs/${id}`);
  assert.match(got.body.content, /<h1>Hi<\/h1><p><strong>bold<\/strong> <u>u<\/u><\/p><ul><li>x<\/li><\/ul>/);
  assert.equal(got.body.role, 'owner');
});

test('sharing: stranger gets 404, viewer reads but cannot write, editor can write, only owner shares', async () => {
  const [alice, bob, carol] = [await as(1), await as(2), await as(3)];
  const { body: { id } } = await alice('POST', '/api/docs', { title: 'Secret' });

  assert.equal((await bob('GET', `/api/docs/${id}`)).status, 404);

  assert.equal((await alice('POST', `/api/docs/${id}/shares`, { email: 'carol@ajaia.test', role: 'viewer' })).status, 201);
  assert.equal((await alice('POST', `/api/docs/${id}/shares`, { email: 'bob@ajaia.test', role: 'editor' })).status, 201);

  assert.equal((await carol('GET', `/api/docs/${id}`)).body.role, 'viewer');
  assert.equal((await carol('PUT', `/api/docs/${id}`, { content: '<p>x</p>', version: 1 })).status, 403);
  assert.equal((await bob('PUT', `/api/docs/${id}`, { content: '<p>by bob</p>', version: 1 })).status, 200);
  assert.equal((await bob('POST', `/api/docs/${id}/shares`, { email: 'carol@ajaia.test', role: 'editor' })).status, 403);

  const list = await carol('GET', '/api/docs');
  assert.ok(list.body.shared.some((d) => d.id === id && d.role === 'viewer'));
  assert.ok(!list.body.owned.some((d) => d.id === id));

  await alice('DELETE', `/api/docs/${id}/shares/3`);
  assert.equal((await carol('GET', `/api/docs/${id}`)).status, 404);
});

test('owner deletes a document: it disappears for everyone, non-owners cannot delete', async () => {
  const [alice, bob] = [await as(1), await as(2)];
  const { body: { id } } = await alice('POST', '/api/docs', { title: 'Temp' });
  await alice('POST', `/api/docs/${id}/shares`, { email: 'bob@ajaia.test', role: 'editor' });
  assert.equal((await bob('DELETE', `/api/docs/${id}`)).status, 403);
  assert.equal((await alice('DELETE', `/api/docs/${id}`)).status, 200);
  assert.equal((await bob('GET', `/api/docs/${id}`)).status, 404);
  assert.ok(!(await bob('GET', '/api/docs')).body.shared.some((d) => d.id === id));
});

test('stale version is rejected with 409 instead of overwriting', async () => {
  const alice = await as(1);
  const { body: { id } } = await alice('POST', '/api/docs', {});
  await alice('PUT', `/api/docs/${id}`, { content: '<p>new</p>', version: 1 });
  assert.equal((await alice('PUT', `/api/docs/${id}`, { content: '<p>old</p>', version: 1 })).status, 409);
});

test('saved HTML is sanitized (no scripts or event handlers)', async () => {
  const alice = await as(1);
  const { body: { id } } = await alice('POST', '/api/docs', {});
  await alice('PUT', `/api/docs/${id}`, { content: '<p onclick="x()">ok</p><script>alert(1)</script><a href="javascript:alert(1)">l</a>', version: 1 });
  const { body } = await alice('GET', `/api/docs/${id}`);
  assert.doesNotMatch(body.content, /script|onclick|javascript:/);
  assert.match(body.content, /<p>ok<\/p>/);
});

test('upload turns .md into a document, rejects unsupported types', async () => {
  const alice = await as(1);
  const form = (name, text) => {
    const f = new FormData();
    f.append('file', new Blob([text]), name);
    return f;
  };
  const cookie = (await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 1 }) })).headers.get('set-cookie').split(';')[0];
  const ok = await fetch(`${base}/api/upload`, { method: 'POST', headers: { cookie }, body: form('notes.md', '# Title\n\nsome **bold**') });
  assert.equal(ok.status, 201);
  const { id } = await ok.json();
  const doc = await alice('GET', `/api/docs/${id}`);
  assert.equal(doc.body.title, 'notes');
  assert.match(doc.body.content, /<h1>Title<\/h1>[\s\S]*<strong>bold<\/strong>/);

  const bad = await fetch(`${base}/api/upload`, { method: 'POST', headers: { cookie }, body: form('evil.exe', 'x') });
  assert.equal(bad.status, 400);
});
