import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/server.js';
import { ExtractorError } from '../src/extractor-errors.js';

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

test('raw transcode upload creates a normal ready job', async () => {
  let capturedSource = '';
  const server = createAppServer({
    validateUrl: async url => url,
    convert: async () => { throw new Error('not used'); },
    transcode: async ({ inputPath, title, format, jobDir }) => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      capturedSource = await fs.readFile(inputPath, 'utf8');
      assert.equal(title, 'Phone Song');
      assert.equal(format, 'wav');
      const output = path.join(jobDir, 'Phone Song.wav');
      await fs.writeFile(output, 'converted');
      return output;
    },
    maxUploadBytes: 1024
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const res = await fetch(`${base}/api/transcode?format=wav&title=Phone%20Song`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: 'local-source-audio'
    });
    assert.equal(res.status, 202);
    const created = await res.json();
    assert.equal(created.format, 'wav');

    let job = created;
    for (let i = 0; i < 50 && job.status !== 'ready'; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
      const status = await fetch(`${base}/api/jobs/${created.id}`);
      job = await status.json();
    }
    assert.equal(capturedSource, 'local-source-audio');
    assert.equal(job.status, 'ready');
    assert.match(job.downloadUrl, /\/api\/jobs\/.+\/file$/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('raw transcode upload validates format before accepting data', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/api/transcode?format=aac&title=Nope`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: 'x'
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /format/i);
  });
});

test('raw transcode upload rejects bodies above the configured limit', async () => {
  const server = createAppServer({
    validateUrl: async url => url,
    convert: async () => { throw new Error('not used'); },
    transcode: async () => { throw new Error('must not run'); },
    maxUploadBytes: 4
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/transcode?format=mp3&title=TooBig`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: '12345'
    });
    assert.equal(res.status, 413);
    assert.match((await res.json()).error, /large/i);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('conversion errors expose normalized challenge metadata without credentials', async () => {
  const server = createAppServer({
    validateUrl: async url => url,
    convert: async () => {
      throw new ExtractorError(
        'captcha_required',
        'Complete the CAPTCHA on the source site.',
        'https://example.com/watch'
      );
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const res = await fetch(`${base}/api/convert`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/watch', format: 'mp3' })
    });
    const created = await res.json();
    let job = created;
    for (let i = 0; i < 50 && job.status !== 'error'; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
      job = await (await fetch(`${base}/api/jobs/${created.id}`)).json();
    }
    assert.equal(job.errorCode, 'captcha_required');
    assert.equal(job.sourceUrl, 'https://example.com/watch');
    assert.equal(JSON.stringify(job).includes('cookies'), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
