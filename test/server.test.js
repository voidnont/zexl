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

test('passes validated session auth to the converter without exposing it in job JSON', async () => {
  let capturedAuth;
  const server = createAppServer({
    validateUrl: async url => url,
    convert: async ({ auth, jobDir }) => {
      capturedAuth = auth;
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      await fs.mkdir(jobDir, { recursive: true });
      const file = path.join(jobDir, 'song.mp3');
      await fs.writeFile(file, 'audio');
      return file;
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const res = await fetch(`${base}/api/convert`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/private',
        format: 'mp3',
        auth: {
          cookies: '# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tTRUE\t0\tsession\tsecret\n',
          userAgent: 'Mozilla/5.0 Test'
        }
      })
    });
    assert.equal(res.status, 202);
    const created = await res.json();
    assert.equal(JSON.stringify(created).includes('secret'), false);

    for (let i = 0; i < 30 && !capturedAuth; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(capturedAuth.cookies.includes('\tsession\tsecret'), true);
    assert.equal(capturedAuth.userAgent, 'Mozilla/5.0 Test');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
