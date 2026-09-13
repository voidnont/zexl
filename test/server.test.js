import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/server.js';

async function withServer(fn) {
  const server = createAppServer({
    validateUrl: async url => url,
    convert: async () => { throw new Error('not used'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('health endpoint reports ok', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
});

test('convert endpoint rejects unsupported format', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/api/convert`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/x', format: 'aac' })
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /format/i);
  });
});

test('missing jobs return 404', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/api/jobs/nope`);
    assert.equal(res.status, 404);
  });
});
