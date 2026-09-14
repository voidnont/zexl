import test from 'node:test';
import assert from 'node:assert/strict';
import { buildYtDlpArgs, convertAudio, parseProgressLine, safeDownloadName, transcodeUploadedAudio } from '../src/converter.js';
import { ExtractorError } from '../src/extractor-errors.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('builds mp3 conversion args with best audio quality', () => {
  const args = buildYtDlpArgs('https://example.com/media', 'mp3', '/tmp/job');
  assert.ok(args.includes('--extract-audio'));
  assert.deepEqual(args.slice(args.indexOf('--js-runtimes'), args.indexOf('--js-runtimes') + 2), ['--js-runtimes', 'node']);
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

test('uses InnerTube direct audio before yt-dlp for public YouTube links', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zexl-innertube-convert-'));
  const ffmpeg = path.join(root, 'fake-ffmpeg.mjs');
  const jobDir = path.join(root, 'job');
  await fs.writeFile(ffmpeg, `#!/usr/bin/env node
import fs from 'node:fs';
const output = process.argv.slice(2).at(-1);
fs.writeFileSync(output, 'audio');
console.log('out_time_ms=5000000');
console.log('progress=end');
`);
  await fs.chmod(ffmpeg, 0o700);
  let calls = 0;
  try {
    const output = await convertAudio({
      url: 'https://youtube.com/watch?v=abcdefghijk',
      format: 'mp3',
      jobDir,
      ytDlpPath: path.join(root, 'missing-yt-dlp'),
      ffmpegPath: ffmpeg,
      resolveInnerTube: async () => {
        calls += 1;
        return {
          title: 'InnerTube Song',
          streamUrl: 'https://cdn.example/audio.webm',
          duration: 10,
          bitrate: 160000,
          mimeType: 'audio/webm'
        };
      }
    });
    assert.equal(calls, 1);
    assert.equal(path.basename(output), 'InnerTube Song.mp3');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('falls back to yt-dlp when InnerTube cannot resolve the link', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zexl-innertube-fallback-'));
  const fakeYtDlp = path.join(root, 'fake-yt-dlp.mjs');
  const jobDir = path.join(root, 'job');
  await fs.writeFile(fakeYtDlp, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const valueAfter = key => args[args.indexOf(key) + 1];
const template = valueAfter('-o');
const format = valueAfter('--audio-format');
const output = path.join(path.dirname(template), 'Fallback Song.' + format);
fs.writeFileSync(output, 'audio');
console.log('FILE\\t' + output);
`);
  await fs.chmod(fakeYtDlp, 0o700);
  try {
    const output = await convertAudio({
      url: 'https://youtube.com/watch?v=abcdefghijk',
      format: 'flac',
      jobDir,
      ytDlpPath: fakeYtDlp,
      resolveInnerTube: async () => null
    });
    assert.equal(path.basename(output), 'Fallback Song.flac');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('non-YouTube public links skip InnerTube', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zexl-nonyoutube-'));
  const fakeYtDlp = path.join(root, 'fake-yt-dlp.mjs');
  const jobDir = path.join(root, 'job');
  await fs.writeFile(fakeYtDlp, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const valueAfter = key => args[args.indexOf(key) + 1];
const output = path.join(path.dirname(valueAfter('-o')), 'Other Site.wav');
fs.writeFileSync(output, 'audio');
console.log('FILE\\t' + output);
`);
  await fs.chmod(fakeYtDlp, 0o700);
  let resolverCalled = false;
  try {
    const output = await convertAudio({
      url: 'https://example.com/media',
      format: 'wav',
      jobDir,
      ytDlpPath: fakeYtDlp,
      resolveInnerTube: async () => { resolverCalled = true; return null; }
    });
    assert.equal(resolverCalled, false);
    assert.equal(path.basename(output), 'Other Site.wav');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('authenticated jobs skip InnerTube and preserve yt-dlp cookie handling', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zexl-auth-fallback-'));
  const fakeYtDlp = path.join(root, 'fake-yt-dlp.mjs');
  const jobDir = path.join(root, 'job');
  await fs.writeFile(fakeYtDlp, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const valueAfter = key => args[args.indexOf(key) + 1];
if (!fs.readFileSync(valueAfter('--cookies'), 'utf8').includes('session\\tsecret')) process.exit(9);
const template = valueAfter('-o');
const format = valueAfter('--audio-format');
const output = path.join(path.dirname(template), 'Private Song.' + format);
fs.writeFileSync(output, 'audio');
console.log('FILE\\t' + output);
`);
  await fs.chmod(fakeYtDlp, 0o700);
  let resolverCalled = false;
  try {
    const output = await convertAudio({
      url: 'https://example.com/private',
      format: 'wav',
      jobDir,
      ytDlpPath: fakeYtDlp,
      resolveInnerTube: async () => { resolverCalled = true; return null; },
      auth: { cookies: '# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tTRUE\t0\tsession\tsecret\n' }
    });
    assert.equal(resolverCalled, false);
    assert.equal(path.basename(output), 'Private Song.wav');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('InnerTube user challenge stops fallback', async () => {
  await assert.rejects(
    () => convertAudio({
      url: 'https://youtube.com/watch?v=abcdefghijk',
      format: 'mp3',
      jobDir: path.join(os.tmpdir(), 'zexl-challenge-' + Date.now()),
      ytDlpPath: '/definitely/missing/yt-dlp',
      resolveInnerTube: async () => { throw new ExtractorError('age_check', 'Sign in to confirm your age', 'https://youtube.com/watch?v=abcdefghijk'); }
    }),
    error => error.code === 'age_check'
  );
});

test('yt-dlp CAPTCHA failure is normalized', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zexl-ytdlp-captcha-'));
  const fakeYtDlp = path.join(root, 'fake-yt-dlp.mjs');
  await fs.writeFile(fakeYtDlp, `#!/usr/bin/env node
console.error('Please complete the CAPTCHA to continue');
process.exit(2);
`);
  await fs.chmod(fakeYtDlp, 0o700);
  try {
    await assert.rejects(
      () => convertAudio({
        url: 'https://example.com/media',
        format: 'mp3',
        jobDir: path.join(root, 'job'),
        ytDlpPath: fakeYtDlp,
        resolveInnerTube: async () => null
      }),
      error => error.code === 'captcha_required' && error.sourceUrl === 'https://example.com/media'
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('transcodes an uploaded local source file with ffmpeg', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zexl-upload-transcode-'));
  const ffmpeg = path.join(root, 'fake-ffmpeg.mjs');
  const input = path.join(root, 'source.webm');
  const jobDir = path.join(root, 'job');
  await fs.writeFile(input, 'source-audio');
  await fs.writeFile(ffmpeg, `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
const inputIndex = args.indexOf('-i');
if (inputIndex < 0 || args[inputIndex + 1] !== ${JSON.stringify(input)}) process.exit(31);
if (!args.includes('-vn')) process.exit(32);
const output = args.at(-1);
fs.mkdirSync(new URL('.', 'file://' + output).pathname, { recursive: true });
fs.writeFileSync(output, 'converted');
console.log('progress=end');
`);
  await fs.chmod(ffmpeg, 0o700);
  try {
    const output = await transcodeUploadedAudio({
      inputPath: input,
      title: 'Local YouTube Song',
      format: 'flac',
      jobDir,
      ffmpegPath: ffmpeg
    });
    assert.equal(path.basename(output), 'Local YouTube Song.flac');
    assert.equal(await fs.readFile(output, 'utf8'), 'converted');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
