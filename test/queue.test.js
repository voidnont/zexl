import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskQueue } from '../src/queue.js';

test('limits concurrent tasks and preserves queued work', async () => {
  const queue = new TaskQueue(1);
  let active = 0;
  let maxActive = 0;
  const task = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise(r => setTimeout(r, 10));
    active -= 1;
  };
  await Promise.all([queue.add(task), queue.add(task), queue.add(task)]);
  assert.equal(maxActive, 1);
});
