import test from 'node:test';
import assert from 'node:assert/strict';
import { extractYouTubeVideoId, resolveWithInnerTube, selectDirectAudioFormat } from '../src/innertube.js';

for (const url of [
  'https://www.youtube.com/watch?v=abcdefghijk',
  'https://youtu.be/abcdefghijk',
  'https://www.youtube.com/shorts/abcdefghijk',
  'https://www.youtube.com/embed/abcdefghijk'
]) {
  test(`parses ${url}`, () => assert.equal(extractYouTubeVideoId(url), 'abcdefghijk'));
}

test('returns null for non-YouTube URL', () => {
  assert.equal(extractYouTubeVideoId('https://example.com/watch?v=abcdefghijk'), null);
});

test('selects highest-bitrate direct audio and ignores cipher-only entries', () => {
  const selected = selectDirectAudioFormat([
    { mimeType: 'audio/webm; codecs="opus"', bitrate: 192000, signatureCipher: 'x=1' },
    { mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000, url: 'https://cdn.example/a.m4a' },
    { mimeType: 'audio/webm; codecs="opus"', bitrate: 160000, url: 'https://cdn.example/a.webm' },
    { mimeType: 'video/mp4', bitrate: 999999, url: 'https://cdn.example/v.mp4' }
  ]);
  assert.equal(selected.url, 'https://cdn.example/a.webm');
});

function okText(text) { return { ok: true, text: async () => text }; }
function okJson(value) { return { ok: true, json: async () => value }; }

test('resolves a direct public audio stream through InnerTube player data', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return okText('<script>{"INNERTUBE_API_KEY":"test-key","INNERTUBE_CLIENT_VERSION":"2.test"}</script>');
    return okJson({
      playabilityStatus: { status: 'OK' },
      videoDetails: { title: 'Signal', lengthSeconds: '90' },
      streamingData: { adaptiveFormats: [
        { mimeType: 'audio/webm; codecs="opus"', bitrate: 160000, url: 'https://cdn.example/signal.webm' }
      ] }
    });
  };
  const result = await resolveWithInnerTube('https://youtube.com/watch?v=abcdefghijk', { fetchImpl });
  assert.equal(result.title, 'Signal');
  assert.equal(result.streamUrl, 'https://cdn.example/signal.webm');
  assert.equal(result.duration, 90);
  assert.match(calls[1].url, /youtubei\/v1\/player\?key=test-key/);
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.context.client.clientName, 'WEB');
  assert.equal(body.context.client.clientVersion, '2.test');
});

test('returns null when player data contains only ciphered audio', async () => {
  let count = 0;
  const fetchImpl = async () => {
    count += 1;
    if (count === 1) return okText('{"INNERTUBE_API_KEY":"k","INNERTUBE_CLIENT_VERSION":"v"}');
    return okJson({
      playabilityStatus: { status: 'OK' },
      videoDetails: { title: 'Ciphered' },
      streamingData: { adaptiveFormats: [
        { mimeType: 'audio/webm', bitrate: 160000, signatureCipher: 's=secret' }
      ] }
    });
  };
  assert.equal(await resolveWithInnerTube('https://youtu.be/abcdefghijk', { fetchImpl }), null);
});

test('surfaces age challenge instead of silently falling through', async () => {
  let count = 0;
  const fetchImpl = async () => {
    count += 1;
    if (count === 1) return okText('{"INNERTUBE_API_KEY":"k","INNERTUBE_CLIENT_VERSION":"v"}');
    return okJson({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm your age' } });
  };
  await assert.rejects(
    () => resolveWithInnerTube('https://youtube.com/watch?v=abcdefghijk', { fetchImpl }),
    error => error.code === 'age_check'
  );
});
