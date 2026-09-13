import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildFfmpegArgs, resolveWithNewPipe } from '../src/newpipe.js';

test('parses NewPipe resolver JSON from the CLI', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zexl-newpipe-resolver-'));
  const cli = path.join(root, 'resolver.mjs');
  await fs.writeFile(cli, `#!/usr/bin/env node\nconsole.log(JSON.stringify({title:'Example',streamUrl:'https://cdn.example/audio.webm',duration:123,bitrate:160000,format:'WEBMA_OPUS'}));\n`);
  await fs.chmod(cli, 0o700);
  try {
    const result = await resolveWithNewPipe('https://example.com/watch?v=1', { resolverPath: cli });
    assert.deepEqual(result, {
      title: 'Example',
      streamUrl: 'https://cdn.example/audio.webm',
      duration: 123,
      bitrate: 160000,
      format: 'WEBMA_OPUS'
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('returns null when NewPipe cannot resolve a URL', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zexl-newpipe-resolver-'));
  const cli = path.join(root, 'resolver.mjs');
  await fs.writeFile(cli, '#!/usr/bin/env node\nprocess.exit(2);\n');
  await fs.chmod(cli, 0o700);
  try {
    assert.equal(await resolveWithNewPipe('https://unsupported.example/item', { resolverPath: cli }), null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('builds ffmpeg args for a resolved NewPipe stream', () => {
  const args = buildFfmpegArgs({
    streamUrl: 'https://cdn.example/audio.webm',
    outputPath: '/tmp/out.mp3',
    format: 'mp3'
  });
  assert.ok(args.includes('-vn'));
  assert.deepEqual(args.slice(args.indexOf('-user_agent'), args.indexOf('-user_agent') + 2), ['-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0']);
  assert.deepEqual(args.slice(args.indexOf('-i'), args.indexOf('-i') + 2), ['-i', 'https://cdn.example/audio.webm']);
  assert.deepEqual(args.slice(args.indexOf('-codec:a'), args.indexOf('-codec:a') + 2), ['-codec:a', 'libmp3lame']);
  assert.equal(args.at(-1), '/tmp/out.mp3');
});

test('uses lossless codecs for flac and wav targets', () => {
  const flac = buildFfmpegArgs({ streamUrl: 'https://cdn.example/a', outputPath: '/tmp/a.flac', format: 'flac' });
  const wav = buildFfmpegArgs({ streamUrl: 'https://cdn.example/a', outputPath: '/tmp/a.wav', format: 'wav' });
  assert.deepEqual(flac.slice(flac.indexOf('-codec:a'), flac.indexOf('-codec:a') + 2), ['-codec:a', 'flac']);
  assert.deepEqual(wav.slice(wav.indexOf('-codec:a'), wav.indexOf('-codec:a') + 2), ['-codec:a', 'pcm_s16le']);
});


test('parses the final JSON line even if the resolver writes startup logs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zexl-newpipe-logs-'));
  const cli = path.join(root, 'resolver.mjs');
  await fs.writeFile(cli, `#!/usr/bin/env node\nconsole.log('resolver warmup');\nconsole.log(JSON.stringify({title:'Logged',streamUrl:'https://cdn.example/logged',duration:7,bitrate:128000,format:'M4A'}));\n`);
  await fs.chmod(cli, 0o700);
  try {
    const result = await resolveWithNewPipe('https://example.com/media', { resolverPath: cli });
    assert.equal(result?.title, 'Logged');
    assert.equal(result?.streamUrl, 'https://cdn.example/logged');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
