import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStateSync } from './state-client.js';
const tick = () => new Promise(resolve => setImmediate(resolve));

test('rapid edits are serialized with the updated revision and newest pending snapshot', async () => {
  const calls = [];
  const releases = [];
  const writer = createStateSync(1, () => {}, (_url, options) => {
    calls.push(JSON.parse(options.body));
    return new Promise(resolve => releases.push(resolve));
  });
  writer.enqueue({ value: 'first' });
  writer.enqueue({ value: 'second' });
  writer.enqueue({ value: 'latest' });
  assert.equal(calls.length, 1);
  releases.shift()({ revision: 2 });
  await tick();
  assert.deepEqual(calls[1], { state: { value: 'latest' }, revision: 2 });
  releases.shift()({ revision: 3 });
  await tick();
  assert.equal(calls.length, 2);
});

test('failed saves retain the newest edits and retry without advancing revision', async () => {
  const calls = [], statuses = [];
  let fail = true;
  const writer = createStateSync(7, (status, error) => statuses.push([status, error]), async (_url, options) => {
    calls.push(JSON.parse(options.body));
    if (fail) throw new Error('Database unavailable');
    return { revision: 8 };
  });
  writer.enqueue({ value: 'first' });
  await tick();
  writer.enqueue({ value: 'latest' });
  assert.equal(calls.length, 1);
  fail = false;
  writer.retry();
  await tick();
  assert.deepEqual(calls[1], { state: { value: 'latest' }, revision: 7 });
  assert.deepEqual(statuses.at(-1), ['Đã lưu vào database', null]);
});
