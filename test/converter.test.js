import test from 'node:test';
import assert from 'node:assert/strict';
import { buildYtDlpArgs, convertAudio, parseProgressLine, safeDownloadName } from '../src/converter.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('builds mp3 conversion args with best audio quality', () => {
  const args = buildYtDlpArgs('https://example.com/media', 'mp3', '/tmp/job');
  assert.ok(args.includes('--extract-audio'));
  assert.deepEqual(args.slice(args.indexOf('--audio-format'), args.indexOf('--audio-format') + 2), ['--audio-format', 'mp3']);
  assert.deepEqual(args.slice(args.indexOf('--audio-quality'), args.indexOf('--audio-quality') + 2), ['--audio-quality', '0']);
  assert.equal(args.at(-1), 'https://example.com/media');
});

test('builds flac and wav args without lossy quality switches', () => {
  for (const format of ['flac', 'wav']) {
    const args = buildYtDlpArgs('https://example.com/media', format, '/tmp/job');
    assert.equal(args.includes('--audio-quality'), false);
    assert.equal(args[args.indexOf('--audio-format') + 1], format);
  }
});

test('parses machine-readable progress records', () => {
  assert.deepEqual(parseProgressLine('PROGRESS\t42.7'), { kind: 'progress', value: 43 });
  assert.deepEqual(parseProgressLine('FILE\t/tmp/x/song.mp3'), { kind: 'file', value: '/tmp/x/song.mp3' });
  assert.equal(parseProgressLine('noise'), null);
});

test('creates safe content-disposition filenames', () => {
  assert.equal(safeDownloadName('A / B: song?', 'mp3'), 'A _ B_ song_.mp3');
  assert.equal(safeDownloadName('', 'wav'), 'audio.wav');
});

test('adds cookie file and user agent without placing cookie values in command args', () => {
  const args = buildYtDlpArgs('https://example.com/media', 'mp3', '/tmp/job', {
    cookiesPath: '/tmp/job/session.cookies.txt',
    userAgent: 'Mozilla/5.0 Test'
  });
  assert.deepEqual(args.slice(args.indexOf('--cookies'), args.indexOf('--cookies') + 2), ['--cookies', '/tmp/job/session.cookies.txt']);
  assert.deepEqual(args.slice(args.indexOf('--user-agent'), args.indexOf('--user-agent') + 2), ['--user-agent', 'Mozilla/5.0 Test']);
  assert.equal(args.some(value => value.includes('secret-cookie')), false);
});


test('stores session cookies as mode 0600 only during conversion', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zexl-cookie-test-'));
  const fakeYtDlp = path.join(root, 'fake-yt-dlp.mjs');
  const jobDir = path.join(root, 'job');
  await fs.writeFile(fakeYtDlp, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const valueAfter = key => args[args.indexOf(key) + 1];
const cookiesPath = valueAfter('--cookies');
const mode = fs.statSync(cookiesPath).mode & 0o777;
if (mode !== 0o600) process.exit(21);
const cookies = fs.readFileSync(cookiesPath, 'utf8');
if (!cookies.includes('session\\tsecret')) process.exit(22);
const template = valueAfter('-o');
const format = valueAfter('--audio-format');
const output = path.join(path.dirname(template), 'test song.' + format);
fs.writeFileSync(output, 'audio');
console.log('FILE\\t' + output);
`);
  await fs.chmod(fakeYtDlp, 0o700);

  try {
    const output = await convertAudio({
      url: 'https://example.com/private',
      format: 'mp3',
      jobDir,
      ytDlpPath: fakeYtDlp,
      auth: {
        cookies: '# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tTRUE\t0\tsession\tsecret\n',
        userAgent: 'Mozilla/5.0 Test'
      }
    });
    assert.equal(path.basename(output), 'test song.mp3');
    await assert.rejects(() => fs.stat(path.join(jobDir, '.session.cookies.txt')), /ENOENT/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
