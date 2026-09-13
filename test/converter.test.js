import test from 'node:test';
import assert from 'node:assert/strict';
import { buildYtDlpArgs, parseProgressLine, safeDownloadName } from '../src/converter.js';

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
