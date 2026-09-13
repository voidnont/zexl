import test from 'node:test';
import assert from 'node:assert/strict';
import { JobStore } from '../src/jobs.js';

test('creates and updates jobs without exposing internal file paths', () => {
  const store = new JobStore({ ttlMs: 1000 });
  const job = store.create({ url: 'https://example.com/x', format: 'mp3' });
  assert.equal(job.status, 'queued');
  store.update(job.id, { status: 'ready', progress: 100, filePath: '/tmp/secret.mp3', title: 'Song' });
  const publicJob = store.public(job.id);
  assert.equal(publicJob.status, 'ready');
  assert.equal(publicJob.progress, 100);
  assert.equal(publicJob.downloadUrl, `/api/jobs/${job.id}/file`);
  assert.equal('filePath' in publicJob, false);
});

test('expires old jobs', async () => {
  const store = new JobStore({ ttlMs: 5 });
  const job = store.create({ url: 'https://example.com/x', format: 'wav' });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(store.get(job.id), null);
});
