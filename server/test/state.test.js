import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { createStateStore, DEFAULT_SETTINGS, validState } from '../state-store.js';
import { registerStateApi } from '../state-api.js';

let db, store, server, base, directory, closeDb, reopen;
const profiles = [];
const profile = () => { const id = randomUUID(); profiles.push(id); return id; };
const seed = { topics: [{ id: 'education', name: 'Education', icon: '📚', words: [{ word: 'learn', meaning: 'học' }] }] };

before(async () => {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const connect = () => new pg.Pool({ connectionString: process.env.DATABASE_URL });
    db = connect();
    closeDb = () => db.end();
    reopen = async () => { await closeDb(); db = connect(); };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    directory = await mkdtemp(path.join(tmpdir(), 'flashcards-test-'));
    db = new PGlite(directory);
    closeDb = () => db.close();
    reopen = async () => { await closeDb(); db = new PGlite(directory); };
  }
  store = createStateStore(db, seed);
  await store.migrate();
  const app = express();
  app.use(express.json());
  // Forward to the current store after reconnecting during the persistence test.
  registerStateApi(app, {
    initialize: (...args) => store.initialize(...args),
    save: (...args) => store.save(...args),
  });
  app.use((err, _req, res, _next) => res.status(503).json({ error: err.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) {
    for (const id of profiles) await db.query('DELETE FROM flashcard_profiles WHERE profile_id = $1', [id]);
    await closeDb();
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('legacy data, custom words, targets and review progress survive reconnect/restart', async () => {
  const id = profile();
  const state = { data: { topics: [{ id: 'custom', name: 'My words', icon: '📚', words: [
    { uid: randomUUID(), word: 'resilient', meaning: 'kiên cường', box: 4, due: 1800000000000 },
  ] }] }, settings: { ...DEFAULT_SETTINGS, overall: 8, dailyGoal: 30, progress: { date: '2026-10-06', count: 12 } } };
  assert.equal(validState(state), true);
  assert.deepEqual((await store.initialize(id, state)).state, state);
  const changed = structuredClone(state);
  changed.data.topics[0].words[0].box = 5;
  changed.settings.progress.count = 13;
  assert.equal((await store.save(id, 1, changed)).revision, 2);
  await reopen();
  store = createStateStore(db, seed);
  await store.migrate();
  const restored = await store.initialize(id, state);
  assert.deepEqual(restored.state, changed);
  assert.equal(restored.revision, 2);
});

test('empty topic list stays empty and profiles are isolated', async () => {
  const id = profile();
  const empty = { data: { topics: [] }, settings: DEFAULT_SETTINGS };
  assert.equal(validState(empty), true);
  await store.initialize(id, empty);
  assert.deepEqual((await store.initialize(id)).state.data.topics, []);
  const other = await store.initialize(profile());
  assert.equal(other.state.data.topics.length, 1);
  assert.equal(other.state.data.topics[0].words[0].box, 1);
});

test('stale revisions cannot overwrite a newer snapshot', async () => {
  const id = profile();
  const first = await store.initialize(id);
  const changed = structuredClone(first.state);
  changed.settings.dailyGoal = 45;
  assert.equal((await store.save(id, 1, changed)).revision, 2);
  assert.equal(await store.save(id, 1, first.state), null);
  assert.equal((await store.initialize(id)).state.settings.dailyGoal, 45);
});

test('API sets private cookie, validates payloads, rejects anonymous and cross-site writes', async () => {
  const init = await fetch(`${base}/api/state/init`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(init.status, 200);
  const cookie = init.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  profiles.push(cookie.split(';')[0].split('=')[1]);
  const state = (await init.json()).state;
  const send = (body, headers = {}) => fetch(`${base}/api/state`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie.split(';')[0], ...headers }, body: JSON.stringify(body),
  });
  assert.equal((await send({ state, revision: 1 })).status, 200);
  assert.equal((await send({ state, revision: 1 })).status, 409);
  assert.equal((await send({ state: { data: { topics: [] } }, revision: 2 })).status, 400);
  assert.equal((await send({ state, revision: 2 }, { Cookie: '' })).status, 401);
  assert.equal((await send({ state, revision: 2 }, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await send({ state, revision: 2 }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const bad = structuredClone(state);
  bad.data.topics[0].words[0].box = 9;
  assert.equal((await send({ state: bad, revision: 2 })).status, 400);
});
