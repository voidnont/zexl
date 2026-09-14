# ZEXL InnerTube → yt-dlp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ZEXL's NewPipe-based extraction with a single-container InnerTube-first YouTube path, yt-dlp fallback/broad extractor path, normalized user-visible challenges, and the existing FFmpeg MP3/FLAC/WAV conversion flow.

**Architecture:** Public YouTube jobs first call a small Node `src/innertube.js` resolver that only accepts direct audio URLs. Unresolved or unusable public YouTube results fall through to yt-dlp; non-YouTube and user-authenticated jobs start with yt-dlp. Both extraction paths feed the existing FFmpeg/output/job system, while normalized challenge metadata travels through the existing async job API to web and Android clients.

**Tech Stack:** Node.js 24.21.x, built-in `fetch`, yt-dlp 2026.08.19, Python 3 runtime for yt-dlp, FFmpeg, plain browser JS/CSS/HTML, Android Kotlin/Compose sample, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-14-zexl-innertube-ytdlp-design.md`

## Global Constraints

- Scope is `voidnont/zexl` only; do not modify or add dependencies on FRXE or `nont.me`.
- Output formats remain exactly `mp3`, `flac`, and `wav`.
- Preserve Node engine `>=24.21.0 <25`.
- Preserve the existing yt-dlp pin `2026.08.19`.
- InnerTube is public-YouTube-only and must never receive user cookies, usernames, passwords, or provider session tokens.
- User-supplied Netscape cookies are temporary per-job yt-dlp input only, stored mode `0600`, never echoed, and deleted on success or failure.
- Login/CAPTCHA/consent/age challenges are surfaced to the user; do not automate or bypass them.
- DRM, paywalls, and access-control bypasses are unsupported.
- Delete the tracked root `cookies.txt` without reading or using its contents; do not rewrite repository history in this task.
- Remove NewPipe/JVM runtime code and dependencies completely from the active product.
- Preserve the existing asynchronous job API and temporary-file cleanup model.

---

### Task 1: Remove tracked credential material and add a regression guard

**Files:**
- Create: `.gitignore`
- Create: `test/security-hygiene.test.js`
- Delete: `cookies.txt`

**Interfaces:**
- Produces: repository-level credential-file invariant.

- [ ] **Step 1: Write the failing test**

Create `test/security-hygiene.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('repository omits root cookies.txt and ignores session cookie files', async () => {
  assert.equal(fs.existsSync(new URL('cookies.txt', root)), false);
  const ignore = await fsp.readFile(new URL('.gitignore', root), 'utf8');
  assert.match(ignore, /^cookies\.txt$/m);
  assert.match(ignore, /^\*\.cookies\.txt$/m);
  assert.match(ignore, /^\.session\.cookies\.txt$/m);
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test test/security-hygiene.test.js
```

Expected: FAIL because `cookies.txt` exists and `.gitignore` does not.

- [ ] **Step 3: Delete the credential file without opening it and add ignores**

Delete `cookies.txt` directly. Create `.gitignore`:

```gitignore
cookies.txt
*.cookies.txt
.session.cookies.txt
node_modules/
.DS_Store
```

Do not inspect, print, parse, copy, or reuse the deleted file contents.

- [ ] **Step 4: Verify GREEN**

```bash
node --test test/security-hygiene.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .gitignore test/security-hygiene.test.js
git rm cookies.txt
git commit -m "security: remove tracked session cookies"
```

---

### Task 2: Normalize extractor/challenge failures

**Files:**
- Create: `src/extractor-errors.js`
- Create: `test/extractor-errors.test.js`

**Interfaces:**
- Produces: `ExtractorError`, `classifyExtractorMessage(message)`, `isUserActionCode(code)`.
- Exact codes: `login_required`, `captcha_required`, `consent_required`, `age_check`, `drm`, `unavailable`, `unsupported`, `extractor_error`.

- [ ] **Step 1: Write failing tests**

Create `test/extractor-errors.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtractorError, classifyExtractorMessage, isUserActionCode } from '../src/extractor-errors.js';

const cases = [
  ['Sign in to confirm you are not a bot', 'login_required'],
  ['Please complete the CAPTCHA to continue', 'captcha_required'],
  ['Before you continue to YouTube, review consent', 'consent_required'],
  ['Sign in to confirm your age', 'age_check'],
  ['This video is DRM protected', 'drm'],
  ['Video unavailable', 'unavailable'],
  ['Unsupported URL', 'unsupported'],
  ['unknown extractor failure', 'extractor_error']
];

for (const [message, code] of cases) {
  test(`classifies ${code}`, () => assert.equal(classifyExtractorMessage(message), code));
}

test('only user-solvable challenge codes are actionable', () => {
  for (const code of ['login_required', 'captcha_required', 'consent_required', 'age_check']) {
    assert.equal(isUserActionCode(code), true);
  }
  for (const code of ['drm', 'unavailable', 'unsupported', 'extractor_error']) {
    assert.equal(isUserActionCode(code), false);
  }
});

test('ExtractorError preserves code and source URL', () => {
  const error = new ExtractorError('captcha_required', 'Complete the CAPTCHA.', 'https://example.com/watch');
  assert.equal(error.code, 'captcha_required');
  assert.equal(error.sourceUrl, 'https://example.com/watch');
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test test/extractor-errors.test.js
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `src/extractor-errors.js`**

```js
const ACTIONABLE = new Set(['login_required', 'captcha_required', 'consent_required', 'age_check']);

export class ExtractorError extends Error {
  constructor(code, message, sourceUrl = null) {
    super(message);
    this.name = 'ExtractorError';
    this.code = code;
    this.sourceUrl = sourceUrl;
  }
}

export function isUserActionCode(code) {
  return ACTIONABLE.has(code);
}

export function classifyExtractorMessage(message) {
  const text = String(message || '').toLowerCase();
  if (/captcha/.test(text)) return 'captcha_required';
  if (/confirm your age|age[- ]?restricted|age verification/.test(text)) return 'age_check';
  if (/consent|before you continue/.test(text)) return 'consent_required';
  if (/sign in|log in|login required|not a bot/.test(text)) return 'login_required';
  if (/drm|protected content|encrypted media/.test(text)) return 'drm';
  if (/unavailable|removed|private video/.test(text)) return 'unavailable';
  if (/unsupported url|unsupported site|not supported/.test(text)) return 'unsupported';
  return 'extractor_error';
}
```

The specific age/CAPTCHA/consent checks must remain before the generic login check.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --test test/extractor-errors.test.js
git add src/extractor-errors.js test/extractor-errors.test.js
git commit -m "feat: normalize extractor challenge errors"
```

Expected: PASS.

---

### Task 3: Add the YouTube-only InnerTube resolver

**Files:**
- Create: `src/innertube.js`
- Create: `test/innertube.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `extractYouTubeVideoId(url)`, `selectDirectAudioFormat(adaptiveFormats)`, `resolveWithInnerTube(url, { fetchImpl = fetch } = {})`.
- Resolver returns `null` for normal unresolved/unusable cases, a direct-stream object on success, and throws `ExtractorError` for a provider challenge/DRM/unavailable response.

- [ ] **Step 1: Write the complete resolver tests**

Create `test/innertube.test.js`:

```js
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

function okText(text) {
  return { ok: true, text: async () => text };
}
function okJson(value) {
  return { ok: true, json: async () => value };
}

test('resolves a direct public audio stream through InnerTube player data', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return okText('<script>{"INNERTUBE_API_KEY":"test-key","INNERTUBE_CLIENT_VERSION":"2.test"}</script>');
    }
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
```

- [ ] **Step 2: Verify RED**

```bash
node --test test/innertube.test.js
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `src/innertube.js`**

Use `URL` parsing. Accept hosts `youtube.com`, `www.youtube.com`, `m.youtube.com`, and `youtu.be`; read IDs from `v`, `/shorts/:id`, `/embed/:id`, or youtu.be path; require `[A-Za-z0-9_-]{11}`.

Implement `selectDirectAudioFormat` as:

```js
export function selectDirectAudioFormat(formats = []) {
  return formats
    .filter(item => String(item?.mimeType || '').startsWith('audio/') && typeof item?.url === 'string' && item.url.startsWith('https://'))
    .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0))[0] || null;
}
```

Implement `resolveWithInnerTube` by fetching `https://www.youtube.com/watch?v=${videoId}&hl=en`, extracting `INNERTUBE_API_KEY` and `INNERTUBE_CLIENT_VERSION`, then POSTing to:

```text
https://www.youtube.com/youtubei/v1/player?key=<encoded-key>&prettyPrint=false
```

with JSON:

```js
{
  context: { client: { clientName: 'WEB', clientVersion, hl: 'en' } },
  videoId,
  contentCheckOk: false,
  racyCheckOk: false
}
```

If `playabilityStatus.status !== 'OK'`, classify the reason/message. Throw `ExtractorError` for any non-generic normalized code; otherwise return `null`. Never implement signature deciphering or pass cookies into this module.

- [ ] **Step 4: Add syntax check and verify GREEN**

Update `package.json` `check` so it checks `src/innertube.js` and `src/extractor-errors.js` in addition to the existing server/converter/validation files.

Run:

```bash
node --test test/innertube.test.js test/extractor-errors.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/innertube.js test/innertube.test.js package.json
git commit -m "feat: add InnerTube public YouTube resolver"
```

---

### Task 4: Replace NewPipe converter orchestration with InnerTube → yt-dlp

**Files:**
- Modify: `src/converter.js`
- Modify: `test/converter.test.js`

**Interfaces:**
- `convertAudio` changes injection name to `resolveInnerTube = resolveWithInnerTube`.
- Normal unresolved InnerTube and failed direct-stream FFmpeg attempts fall through to yt-dlp.
- `ExtractorError` from InnerTube stops the attempt and is surfaced.
- yt-dlp nonzero exits become normalized `ExtractorError`s.

- [ ] **Step 1: Replace the existing NewPipe success test with this failing InnerTube test**

```js
test('uses InnerTube direct audio before yt-dlp for public YouTube links', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zexl-innertube-convert-'));
  const ffmpeg = path.join(root, 'fake-ffmpeg.mjs');
  const jobDir = path.join(root, 'job');
  await fs.writeFile(ffmpeg, `#!/usr/bin/env node
import fs from 'node:fs';
const output = process.argv.slice(2).at(-1);
fs.writeFileSync(output, 'audio');
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
        return { title: 'InnerTube Song', streamUrl: 'https://cdn.example/audio.webm', duration: 10, bitrate: 160000, mimeType: 'audio/webm' };
      }
    });
    assert.equal(calls, 1);
    assert.equal(path.basename(output), 'InnerTube Song.mp3');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Rename and update the existing fallback test**

Change the current “falls back to yt-dlp when NewPipe cannot resolve” test so its URL is `https://youtube.com/watch?v=abcdefghijk` and its injection is:

```js
resolveInnerTube: async () => null
```

Keep its existing fake yt-dlp script and assert the resulting `.flac` file.

Add this non-YouTube test to the same file:

```js
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
```

- [ ] **Step 3: Update authenticated test and add challenge tests**

Rename `resolveNewPipe` to `resolveInnerTube` in the existing authenticated-cookie test and keep `resolverCalled === false`.

Add imports:

```js
import { ExtractorError } from '../src/extractor-errors.js';
```

Add:

```js
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
```

- [ ] **Step 4: Verify RED**

```bash
node --test test/converter.test.js
```

Expected: failures reference old NewPipe injection/import and missing normalized yt-dlp errors.

- [ ] **Step 5: Implement orchestration**

In `src/converter.js`, replace the NewPipe import with:

```js
import { classifyExtractorMessage, ExtractorError } from './extractor-errors.js';
import { extractYouTubeVideoId, resolveWithInnerTube } from './innertube.js';
```

Change the injection parameter to `resolveInnerTube = resolveWithInnerTube`.

Use:

```js
if (!auth?.cookies && extractYouTubeVideoId(url)) {
  const resolved = await resolveInnerTube(url);
  if (resolved) {
    try {
      return await convertResolvedAudio({ resolved, format, jobDir, ffmpegPath, onProgress });
    } catch {
      onProgress(1);
    }
  }
}
```

Do not catch `resolveInnerTube` itself. This makes user challenges stop the attempt.

When yt-dlp exits nonzero, use:

```js
const message = stderr.trim() || `yt-dlp exited with ${code}`;
throw new ExtractorError(classifyExtractorMessage(message), message, url);
```

Keep current cookie temp-file handling, progress parsing, formats, and output lookup unchanged.

- [ ] **Step 6: Verify GREEN and commit**

```bash
node --test test/converter.test.js test/innertube.test.js test/extractor-errors.test.js
git add src/converter.js test/converter.test.js
git commit -m "feat: use InnerTube before yt-dlp"
```

Expected: PASS.

---

### Task 5: Expose challenge metadata through the existing job API

**Files:**
- Modify: `src/jobs.js`
- Modify: `src/server.js`
- Modify: `test/jobs.test.js`
- Modify: `test/server.test.js`

**Interfaces:**
- Public job JSON adds nullable `errorCode` and `sourceUrl`.
- Routes remain unchanged.

- [ ] **Step 1: Add failing JobStore test**

Append to `test/jobs.test.js`:

```js
test('public error jobs expose normalized challenge metadata only', () => {
  const store = new JobStore();
  const job = store.create({ url: 'https://example.com/watch', format: 'mp3' });
  store.update(job.id, {
    status: 'error',
    error: 'Complete the CAPTCHA.',
    errorCode: 'captcha_required',
    sourceUrl: 'https://example.com/watch'
  });
  const value = store.public(job.id);
  assert.equal(value.errorCode, 'captcha_required');
  assert.equal(value.sourceUrl, 'https://example.com/watch');
  assert.equal('filePath' in value, false);
});
```

- [ ] **Step 2: Add failing server test**

Import `ExtractorError` in `test/server.test.js`, then add a server whose injected `convert` throws:

```js
new ExtractorError('captcha_required', 'Complete the CAPTCHA on the source site.', 'https://example.com/watch')
```

POST `{ "url":"https://example.com/watch", "format":"mp3" }`, poll `/api/jobs/:id` until `status === 'error'`, then assert:

```js
assert.equal(job.errorCode, 'captcha_required');
assert.equal(job.sourceUrl, 'https://example.com/watch');
assert.equal(JSON.stringify(job).includes('cookies'), false);
```

- [ ] **Step 3: Verify RED**

```bash
node --test test/jobs.test.js test/server.test.js
```

Expected: metadata assertions fail.

- [ ] **Step 4: Implement job/server fields**

Add `errorCode: null` and `sourceUrl: null` in `JobStore.create` and expose them in `public()`.

Import `ExtractorError` in `src/server.js`. In the conversion catch block:

```js
const normalized = error instanceof ExtractorError ? error : null;
jobs.update(job.id, {
  status: 'error',
  error: String(error?.message || error).slice(0, 1200),
  errorCode: normalized?.code || 'extractor_error',
  sourceUrl: normalized?.sourceUrl || url
});
```

Never place `auth`, cookie contents, or temp cookie paths in the job object.

- [ ] **Step 5: Verify GREEN and commit**

```bash
node --test test/jobs.test.js test/server.test.js test/converter.test.js
git add src/jobs.js src/server.js test/jobs.test.js test/server.test.js
git commit -m "feat: expose extractor challenge metadata"
```

Expected: PASS.

---

### Task 6: Surface challenges in the web UI

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/style.css`
- Modify: `test/ui-surfaces.test.js`

**Interfaces:**
- Uses `errorCode` and `sourceUrl`.
- Actionable codes are exactly login/CAPTCHA/consent/age.
- DRM displays an error but no bypass/retry challenge controls.

- [ ] **Step 1: Add failing UI assertions**

Append to `test/ui-surfaces.test.js`:

```js
test('web UI exposes source and retry actions only for user-solvable challenges', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const js = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="challenge-actions"/);
  assert.match(html, /id="open-source"/);
  assert.match(html, /id="retry"/);
  assert.match(js, /login_required/);
  assert.match(js, /captcha_required/);
  assert.match(js, /consent_required/);
  assert.match(js, /age_check/);
  assert.match(js, /form\.requestSubmit\(\)/);
  assert.doesNotMatch(js, /new Set\(\[[^\]]*drm/s);
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test test/ui-surfaces.test.js
```

Expected: FAIL because the controls are absent.

- [ ] **Step 3: Add challenge markup**

Inside `#status`, after `#status-message`, add:

```html
<div id="challenge-actions" class="challenge-actions" hidden>
  <a id="open-source" class="challenge-link" target="_blank" rel="noreferrer">Open source</a>
  <button id="retry" class="challenge-retry" type="button">Retry</button>
</div>
```

- [ ] **Step 4: Add browser behavior**

In `public/app.js`, cache those nodes and add:

```js
const ACTIONABLE = new Set(['login_required', 'captcha_required', 'consent_required', 'age_check']);

function clearChallenge() {
  challengeActions.hidden = true;
  openSource.removeAttribute('href');
}

function setChallenge(job) {
  const show = ACTIONABLE.has(job.errorCode) && Boolean(job.sourceUrl);
  challengeActions.hidden = !show;
  if (show) openSource.href = job.sourceUrl;
  else openSource.removeAttribute('href');
}

retry.addEventListener('click', () => form.requestSubmit());
```

Call `clearChallenge()` at submission start and successful completion. When polling returns `status === 'error'`, call `setChallenge(job)` before displaying/throwing `job.error`.

Add CSS for `.challenge-actions`, `.challenge-link`, and `.challenge-retry` using the existing glass theme; make controls at least 44px tall and stack them in the existing `@media (max-width: 330px)` block.

- [ ] **Step 5: Verify GREEN and commit**

```bash
node --test test/ui-surfaces.test.js test/auth-surfaces.test.js
git add public/index.html public/app.js public/style.css test/ui-surfaces.test.js
git commit -m "feat: surface provider challenges in web UI"
```

Expected: PASS and the existing optional cookie-upload test remains green.

---

### Task 7: Make Android use the same hosted ZEXL extractor path

**Files:**
- Modify: `android-sample/app/src/main/java/tools/zexl/client/ConverterClient.kt`
- Modify: `android-sample/app/src/main/java/tools/zexl/demo/MainActivity.kt`
- Modify: `android-sample/app/build.gradle.kts`
- Modify: `android-sample/settings.gradle.kts`
- Delete: `android-sample/app/src/main/java/tools/zexl/client/NewPipeDownloader.kt`
- Delete: `android-sample/app/src/main/java/tools/zexl/client/YouTubeLocalExtractor.kt`
- Rewrite: `test/android-local-youtube.test.js`

**Interfaces:**
- `ConversionJob` adds nullable `errorCode` and `sourceUrl`.
- `ConversionFailedException(val job: ConversionJob)` exposes failed job metadata.
- `convertSmart(...)` stays source-compatible but delegates to hosted `convertAndWait(...)`.

- [ ] **Step 1: Replace Android-local test file with hosted-pipeline invariants**

Rewrite `test/android-local-youtube.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const appGradle = 'android-sample/app/build.gradle.kts';
const settingsGradle = 'android-sample/settings.gradle.kts';
const downloader = 'android-sample/app/src/main/java/tools/zexl/client/NewPipeDownloader.kt';
const extractor = 'android-sample/app/src/main/java/tools/zexl/client/YouTubeLocalExtractor.kt';
const client = 'android-sample/app/src/main/java/tools/zexl/client/ConverterClient.kt';
const main = 'android-sample/app/src/main/java/tools/zexl/demo/MainActivity.kt';

async function text(file) { return fsp.readFile(file, 'utf8'); }

test('Android uses hosted extractor pipeline with no local NewPipe stack', async () => {
  const gradle = await text(appGradle);
  const settings = await text(settingsGradle);
  const clientText = await text(client);
  assert.doesNotMatch(gradle, /NewPipeExtractor|okhttp-brotli/);
  assert.doesNotMatch(settings, /jitpack\.io/);
  assert.equal(fs.existsSync(downloader), false);
  assert.equal(fs.existsSync(extractor), false);
  assert.match(clientText, /errorCode:\s*String\?/);
  assert.match(clientText, /sourceUrl:\s*String\?/);
  assert.match(clientText, /class ConversionFailedException/);
  assert.match(clientText, /return convertAndWait\(url, format, pollMs, auth, onUpdate\)/);
  assert.doesNotMatch(clientText, /YouTubeLocalExtractor/);
});

test('Android UI can open a challenge source and no longer claims local extraction', async () => {
  const mainText = await text(main);
  assert.match(mainText, /Open source/);
  assert.match(mainText, /Intent\.ACTION_VIEW/);
  assert.doesNotMatch(mainText, /resolving locally|downloading locally|uploading to converter/);
});

test('Compose weight remains valid', async () => {
  const mainText = await text(main);
  assert.doesNotMatch(mainText, /import androidx\.compose\.foundation\.layout\.weight/);
  assert.match(mainText, /Modifier\.weight\(1f\)/);
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test test/android-local-youtube.test.js
```

Expected: FAIL because local extractor files/dependencies still exist.

- [ ] **Step 3: Remove local extractor dependencies and files**

Delete both Kotlin local extractor files. Remove NewPipeExtractor, OkHttp-Brotli, and JitPack entries that are present only for the local extractor path. Keep Compose/app dependencies and the existing Android version pins.

- [ ] **Step 4: Update `ConverterClient.kt`**

Change `ConversionJob` to:

```kotlin
data class ConversionJob(
    val id: String,
    val format: String,
    val status: String,
    val progress: Int,
    val error: String?,
    val errorCode: String?,
    val sourceUrl: String?,
    val title: String?,
    val downloadUrl: String?
)

class ConversionFailedException(val job: ConversionJob) : IOException(job.error ?: "Conversion failed")
```

Parse `errorCode` and `sourceUrl` in `parseJob`. In `waitForJob`, replace the generic `IOException` with `ConversionFailedException(job)`.

Replace the entire local-extraction body of `convertSmart` with:

```kotlin
return convertAndWait(url, format, pollMs, auth, onUpdate)
```

Remove now-unused coroutine/local-extractor imports. Keep `startUploadedConversion` only because `/api/transcode` remains an intentional API feature.

- [ ] **Step 5: Update `MainActivity.kt` challenge UI**

Import `android.net.Uri` and `tools.zexl.client.ConversionFailedException`.

Add state:

```kotlin
var challengeUrl by remember { mutableStateOf<String?>(null) }
var challengeCode by remember { mutableStateOf<String?>(null) }
```

At conversion start, clear both. In failure handling, detect `ConversionFailedException`, set both values from `error.job`, and show its message. Otherwise clear both.

Define actionable in the composable:

```kotlin
val canOpenSource = challengeUrl != null && challengeCode in setOf(
    "login_required", "captcha_required", "consent_required", "age_check"
)
```

When `canOpenSource`, render a button labeled `Open source` that runs:

```kotlin
context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(requireNotNull(challengeUrl))))
```

Do not include `drm` in `canOpenSource`. The normal Convert button remains available after the failure and therefore serves as Retry with the current URL/format.

Replace the old text claiming YouTube downloads locally with text saying YouTube uses ZEXL's hosted InnerTube-first pipeline.

- [ ] **Step 6: Verify GREEN and commit**

```bash
node --test test/android-local-youtube.test.js test/auth-surfaces.test.js test/ui-surfaces.test.js
```

If an Android SDK is available:

```bash
cd android-sample && ./gradlew test assembleDebug
```

Then:

```bash
git add -A android-sample test/android-local-youtube.test.js
git commit -m "refactor: route Android through hosted extractor pipeline"
```

Expected: Node structural tests PASS; Android Gradle build PASS when available.

---

### Task 8: Remove NewPipe/JVM runtime, update docs/dependency checks, and verify the release

**Files:**
- Delete: `src/newpipe.js`
- Delete: `newpipe-bridge/`
- Delete: `test/newpipe.test.js`
- Modify: `Dockerfile`
- Modify: `package.json`
- Modify: `test/dependencies.test.js`
- Modify: `.github/dependabot.yml`
- Modify: `THIRD_PARTY_NOTICES.md`
- Delete: NewPipe-only bundled license under `licenses/` if no remaining distributed component requires it
- Modify: `README.md`
- Modify: `android-sample/README.md`
- Create: `test/extractor-stack.test.js`

**Interfaces:**
- Final runtime: Node + Python/yt-dlp + FFmpeg + CA certificates only.
- Final extractor order: public YouTube InnerTube → yt-dlp; non-YouTube/authenticated jobs yt-dlp.

- [ ] **Step 1: Write the failing stack-removal test**

Create `test/extractor-stack.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const activeFiles = ['Dockerfile', 'package.json', 'README.md', 'THIRD_PARTY_NOTICES.md', '.github/dependabot.yml'];

test('active ZEXL extractor stack has no NewPipe/JVM or FRXE/nont.me dependency', async () => {
  assert.equal(fs.existsSync('src/newpipe.js'), false);
  assert.equal(fs.existsSync('newpipe-bridge'), false);
  for (const file of activeFiles) {
    const text = (await fsp.readFile(file, 'utf8')).toLowerCase();
    assert.doesNotMatch(text, /newpipe/);
    assert.doesNotMatch(text, /openjdk|jdk21|gradle:9\.7\.1-jdk21/);
    assert.doesNotMatch(text, /frxe/);
    assert.doesNotMatch(text, /nont\.me/);
  }
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test test/extractor-stack.test.js test/dependencies.test.js
```

Expected: FAIL because NewPipe/JVM references exist.

- [ ] **Step 3: Replace Dockerfile with the single-stage runtime**

```dockerfile
FROM node:24.21.0-trixie-slim
ARG YTDLP_VERSION=2026.08.19

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates \
 && python3 -m venv /opt/yt \
 && /opt/yt/bin/pip install --no-cache-dir --upgrade pip \
 && /opt/yt/bin/pip install --no-cache-dir "yt-dlp[default]==${YTDLP_VERSION}" \
 && ln -s /opt/yt/bin/yt-dlp /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY THIRD_PARTY_NOTICES.md /usr/share/doc/zexl/THIRD_PARTY_NOTICES.md

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["node", "src/server.js"]
```

Delete `src/newpipe.js`, `newpipe-bridge/`, and `test/newpipe.test.js`. Remove `src/newpipe.js` from `package.json` check script; the final check script must syntax-check `server.js`, `converter.js`, `innertube.js`, `extractor-errors.js`, and `validation.js`.

- [ ] **Step 4: Rewrite dependency assertions**

In `test/dependencies.test.js`, remove NewPipe/JVM tests. Keep Android version checks. Replace runtime dependency assertions with:

```js
test('pins Node and yt-dlp without JVM extractor runtime', async () => {
  const docker = await fs.readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(docker, /node:24\.21\.0-trixie-slim/);
  assert.match(docker, /YTDLP_VERSION=2026\.08\.19/);
  assert.match(docker, /yt-dlp\[default\]==\$\{YTDLP_VERSION\}/);
  assert.doesNotMatch(docker, /openjdk|gradle:|newpipe/i);
});
```

Update Dependabot to remove only the `/newpipe-bridge` Gradle entry while preserving Docker and still-relevant update entries.

- [ ] **Step 5: Update notices and README architecture**

Remove NewPipe-specific notice text and its bundled GPL license only if that license is no longer required by any remaining distributed component.

Rewrite the main README architecture around:

```text
Web UI / Android app
        |
        v
Node.js ZEXL service
        |
        +-- public YouTube -> InnerTube direct audio -> FFmpeg
        |                        |
        |                        +-- unresolved/unusable -> yt-dlp
        |
        +-- non-YouTube -------------------------------> yt-dlp
        +-- user-authenticated session ---------------> yt-dlp
                                                         |
                                                         v
                                                       FFmpeg
```

Document login/CAPTCHA/consent/age surfacing, temporary user cookies, and unsupported DRM. Remove local-NewPipe language from `android-sample/README.md`.

- [ ] **Step 6: Verify GREEN**

```bash
npm run check
npm test
```

Expected: exit 0.

- [ ] **Step 7: Build production container**

```bash
docker build -t zexl:innertube-ytdlp .
```

Expected: exit 0 with no Java/Gradle/NewPipe build stage.

- [ ] **Step 8: Run final forbidden-reference/security checks**

```bash
test ! -e cookies.txt
test ! -e src/newpipe.js
test ! -d newpipe-bridge
! grep -RniE 'NewPipe|FRXE|nont\.me' src public Dockerfile package.json README.md THIRD_PARTY_NOTICES.md .github android-sample
```

Expected: all commands exit 0.

- [ ] **Step 9: Review scope and open PR**

```bash
git diff main...HEAD --stat
git diff main...HEAD --name-only
```

Expected: only ZEXL files are changed.

Open PR title:

```text
Replace NewPipe with InnerTube → yt-dlp
```

PR body:

```markdown
Implements the approved ZEXL-only extractor refactor.

- public YouTube: InnerTube direct audio first, yt-dlp fallback
- other sources and user-authenticated jobs: yt-dlp
- MP3/FLAC/WAV remain FFmpeg-backed
- login/CAPTCHA/consent/age challenges are surfaced to users
- DRM remains unsupported and is not bypassed
- removes NewPipe/JVM runtime and Android local extractor path
- removes tracked root cookies.txt without reading it and ignores session cookie files
- no FRXE or nont.me dependency

Verification: npm check/tests + focused extractor/security tests + production Docker build.
```

Do not merge until CI and final verification are green.
