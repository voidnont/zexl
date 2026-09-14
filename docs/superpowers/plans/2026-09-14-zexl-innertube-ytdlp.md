# ZEXL InnerTube → yt-dlp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ZEXL's NewPipe-based extraction with a single-container InnerTube-first YouTube path, yt-dlp fallback/broad extractor path, normalized user-visible challenges, and the existing FFmpeg MP3/FLAC/WAV conversion flow.

**Architecture:** Public YouTube jobs first call a small Node `src/innertube.js` resolver that only accepts direct audio URLs. Unresolved or unusable public YouTube results fall through to yt-dlp; non-YouTube and user-authenticated jobs start with yt-dlp. Both extraction paths feed the existing FFmpeg/output/job system, while normalized challenge metadata is exposed through the existing async job API to web and Android clients.

**Tech Stack:** Node.js 24.21.x, built-in `fetch`, yt-dlp 2026.08.19, Python 3 runtime for yt-dlp, FFmpeg, plain browser JS/CSS/HTML, Android Kotlin/Compose sample, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-14-zexl-innertube-ytdlp-design.md`

## Global Constraints

- Scope is `voidnont/zexl` only; do not modify or add dependencies on FRXE or `nont.me`.
- Output formats remain exactly `mp3`, `flac`, and `wav`.
- Preserve Node engine `>=24.21.0 <25`.
- Preserve the existing yt-dlp pin `2026.08.19` unless a separate dependency-update task explicitly changes it.
- InnerTube is public-YouTube-only and must never receive user cookies, usernames, passwords, or provider session tokens.
- User-supplied Netscape cookies are temporary per-job yt-dlp input only, stored mode `0600`, never echoed, and deleted on success or failure.
- Login/CAPTCHA/consent/age challenges must be surfaced to the user; do not automate or bypass them.
- DRM, paywalls, and access-control bypasses are unsupported.
- Delete the tracked root `cookies.txt` without reading or using its contents; do not rewrite repository history in this task.
- Remove NewPipe/JVM runtime code and dependencies completely from the active product.
- Preserve the existing asynchronous job API and temporary-file cleanup model.

---

### Task 1: Remove tracked credential material and add security regression coverage

**Files:**
- Create: `.gitignore`
- Create: `test/security-hygiene.test.js`
- Delete: `cookies.txt`

**Interfaces:**
- Consumes: repository filesystem only.
- Produces: a repository invariant that root cookie/session files cannot be accidentally committed again.

- [ ] **Step 1: Write the failing security test**

Create `test/security-hygiene.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('repository does not track a root cookies.txt and ignores session cookie files', async () => {
  assert.equal(fs.existsSync(new URL('cookies.txt', root)), false);
  const ignore = await fsp.readFile(new URL('.gitignore', root), 'utf8');
  assert.match(ignore, /^cookies\.txt$/m);
  assert.match(ignore, /^\*\.cookies\.txt$/m);
  assert.match(ignore, /^\.session\.cookies\.txt$/m);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test test/security-hygiene.test.js
```

Expected: FAIL because root `cookies.txt` exists and `.gitignore` does not.

- [ ] **Step 3: Delete the tracked file without opening it, and create `.gitignore`**

Delete `cookies.txt` directly. Create `.gitignore` containing:

```gitignore
cookies.txt
*.cookies.txt
.session.cookies.txt
node_modules/
.DS_Store
```

Do not inspect, print, parse, copy, or reuse the deleted cookie file contents.

- [ ] **Step 4: Run the security test and the existing validation suite**

Run:

```bash
node --test test/security-hygiene.test.js
npm test
```

Expected: security test PASS; existing suite may still fail later on NewPipe-specific tests, which are addressed in later tasks, but no new failure may involve credential handling.

- [ ] **Step 5: Commit**

```bash
git add .gitignore test/security-hygiene.test.js
git rm cookies.txt
git commit -m "security: remove tracked session cookies"
```

---

### Task 2: Add normalized extractor/challenge errors

**Files:**
- Create: `src/extractor-errors.js`
- Create: `test/extractor-errors.test.js`

**Interfaces:**
- Produces: `ExtractorError`, `classifyExtractorMessage(message)`, and `isUserActionCode(code)`.
- Later tasks rely on exact error codes: `login_required`, `captcha_required`, `consent_required`, `age_check`, `drm`, `unavailable`, `unsupported`, `extractor_error`.

- [ ] **Step 1: Write failing classifier tests**

Create `test/extractor-errors.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtractorError, classifyExtractorMessage, isUserActionCode } from '../src/extractor-errors.js';

const cases = [
  ['Sign in to confirm you are not a bot', 'login_required'],
  ['Please complete the CAPTCHA to continue', 'captcha_required'],
  ['Before you continue to YouTube, review consent', 'consent_required'],
  ['This video may be inappropriate for some users. Sign in to confirm your age', 'age_check'],
  ['This video is DRM protected', 'drm'],
  ['Video unavailable', 'unavailable'],
  ['Unsupported URL', 'unsupported'],
  ['unknown extractor failure', 'extractor_error']
];

for (const [message, code] of cases) {
  test(`classifies ${code}`, () => assert.equal(classifyExtractorMessage(message), code));
}

test('marks only user-solvable challenge codes as actionable', () => {
  for (const code of ['login_required', 'captcha_required', 'consent_required', 'age_check']) {
    assert.equal(isUserActionCode(code), true);
  }
  for (const code of ['drm', 'unavailable', 'unsupported', 'extractor_error']) {
    assert.equal(isUserActionCode(code), false);
  }
});

test('ExtractorError preserves normalized code and safe source URL', () => {
  const error = new ExtractorError('captcha_required', 'Complete the CAPTCHA.', 'https://example.com/watch');
  assert.equal(error.code, 'captcha_required');
  assert.equal(error.sourceUrl, 'https://example.com/watch');
});
```

- [ ] **Step 2: Run RED**

```bash
node --test test/extractor-errors.test.js
```

Expected: FAIL because `src/extractor-errors.js` does not exist.

- [ ] **Step 3: Implement the minimal normalized error module**

Create `src/extractor-errors.js` with this public shape:

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

Keep ordering exactly so age/CAPTCHA/consent messages containing “sign in” classify to the more specific code first.

- [ ] **Step 4: Run GREEN**

```bash
node --test test/extractor-errors.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/extractor-errors.js test/extractor-errors.test.js
git commit -m "feat: normalize extractor challenge errors"
```

---

### Task 3: Build the YouTube-only InnerTube resolver

**Files:**
- Create: `src/innertube.js`
- Create: `test/innertube.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `extractYouTubeVideoId(url)`, `selectDirectAudioFormat(adaptiveFormats)`, and `resolveWithInnerTube(url, { fetchImpl = fetch } = {})`.
- `resolveWithInnerTube` returns `null` for normal unresolved/unusable cases; returns `{ title, streamUrl, duration, bitrate, mimeType }` for a direct audio stream; throws `ExtractorError` for challenge/DRM/unavailable conditions that must be shown to the user.

- [ ] **Step 1: Write URL parsing and direct-format selection tests**

Create `test/innertube.test.js` covering at least:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractYouTubeVideoId, resolveWithInnerTube, selectDirectAudioFormat } from '../src/innertube.js';

for (const url of [
  'https://www.youtube.com/watch?v=abcdefghijk',
  'https://youtu.be/abcdefghijk',
  'https://www.youtube.com/shorts/abcdefghijk'
]) {
  test(`parses ${url}`, () => assert.equal(extractYouTubeVideoId(url), 'abcdefghijk'));
}

test('returns null for non-YouTube URLs', () => {
  assert.equal(extractYouTubeVideoId('https://example.com/watch?v=abcdefghijk'), null);
});

test('chooses the highest-bitrate direct audio format and ignores cipher-only entries', () => {
  const selected = selectDirectAudioFormat([
    { mimeType: 'audio/webm; codecs="opus"', bitrate: 128000, signatureCipher: 'x=1' },
    { mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000, url: 'https://cdn.example/a.m4a' },
    { mimeType: 'audio/webm; codecs="opus"', bitrate: 160000, url: 'https://cdn.example/a.webm' }
  ]);
  assert.equal(selected.url, 'https://cdn.example/a.webm');
});
```

Also add mocked-fetch tests where the first fetch returns a watch page containing `"INNERTUBE_API_KEY":"test-key"` and `"INNERTUBE_CLIENT_VERSION":"2.test"`, and the second fetch returns a player JSON with a direct audio `adaptiveFormats` entry. Assert the POST URL contains `key=test-key`, the body uses client name `WEB`, and the returned stream is normalized.

Add one mocked response containing only `signatureCipher` entries and assert `resolveWithInnerTube(...) === null`.

Add one player response with `playabilityStatus.reason = 'Sign in to confirm your age'` and assert it rejects with `error.code === 'age_check'`.

- [ ] **Step 2: Run RED**

```bash
node --test test/innertube.test.js
```

Expected: FAIL because `src/innertube.js` does not exist.

- [ ] **Step 3: Implement the resolver**

Implement `extractYouTubeVideoId` with `URL`, accepting hosts `youtube.com`, `www.youtube.com`, `m.youtube.com`, and `youtu.be`, and IDs from `v`, `/shorts/:id`, `/embed/:id`, or the youtu.be pathname. Require the normal 11-character YouTube ID shape `[A-Za-z0-9_-]{11}`.

Implement `resolveWithInnerTube` as:

```js
export async function resolveWithInnerTube(url, { fetchImpl = fetch } = {}) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  const watch = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { 'user-agent': 'Mozilla/5.0 ZEXL/1.0' },
    redirect: 'follow'
  });
  if (!watch.ok) return null;
  const html = await watch.text();
  const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
  if (!apiKey || !clientVersion) return null;

  const player = await fetchImpl(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}&prettyPrint=false`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 ZEXL/1.0' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion, hl: 'en' } },
      videoId,
      contentCheckOk: false,
      racyCheckOk: false
    })
  });
  if (!player.ok) return null;
  const data = await player.json();
  const status = String(data?.playabilityStatus?.status || '');
  if (status && status !== 'OK') {
    const message = String(data?.playabilityStatus?.reason || data?.playabilityStatus?.messages?.[0] || status);
    const code = classifyExtractorMessage(message);
    if (code !== 'extractor_error') throw new ExtractorError(code, message, url);
    return null;
  }
  const selected = selectDirectAudioFormat(data?.streamingData?.adaptiveFormats || []);
  if (!selected) return null;
  return {
    title: String(data?.videoDetails?.title || 'audio'),
    streamUrl: selected.url,
    duration: Number(data?.videoDetails?.lengthSeconds || 0),
    bitrate: Number(selected.bitrate || 0),
    mimeType: String(selected.mimeType || '')
  };
}
```

Do not add deciphering, signature manipulation, cookie import, or login handling to this module.

Update `package.json` `check` script so `node --check src/innertube.js` and `node --check src/extractor-errors.js` are included and `src/newpipe.js` is removed later in Task 8.

- [ ] **Step 4: Run GREEN**

```bash
node --test test/innertube.test.js test/extractor-errors.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/innertube.js src/extractor-errors.js test/innertube.test.js package.json
git commit -m "feat: add InnerTube public YouTube resolver"
```

---

### Task 4: Replace converter orchestration with InnerTube → yt-dlp

**Files:**
- Modify: `src/converter.js`
- Modify: `test/converter.test.js`

**Interfaces:**
- Consumes: `resolveWithInnerTube`, `extractYouTubeVideoId`, `ExtractorError`, `classifyExtractorMessage`.
- Produces: existing `convertAudio(...)` API, now with optional injection `resolveInnerTube = resolveWithInnerTube` for tests.

- [ ] **Step 1: Replace the NewPipe-specific converter tests with failing InnerTube-order tests**

Remove tests named around NewPipe and add these behaviors:

```js
test('uses InnerTube direct audio before yt-dlp for public YouTube links', async () => {
  // Inject resolveInnerTube returning a direct stream.
  // Point ytDlpPath at a missing path so the test proves yt-dlp was not invoked.
  // Use the existing fake FFmpeg pattern and assert the output basename.
});

test('falls back to yt-dlp when InnerTube cannot resolve public YouTube', async () => {
  // Inject resolveInnerTube: async () => null and use the existing fake yt-dlp script.
});

test('non-YouTube public links skip InnerTube and use yt-dlp immediately', async () => {
  let called = false;
  // convert https://example.com/media, set resolveInnerTube to flip called=true.
  // Assert called === false and output exists from fake yt-dlp.
});

test('authenticated jobs skip InnerTube and preserve temporary yt-dlp cookie handling', async () => {
  // Keep the current mode-0600/deletion assertions and assert resolveInnerTube was never called.
});
```

Add a test where fake yt-dlp exits non-zero with stderr `Please complete the CAPTCHA to continue` and assert `convertAudio` rejects with `error.code === 'captcha_required'` and `sourceUrl` equal to the original URL.

Add a test proving a thrown InnerTube `ExtractorError('age_check', ...)` is propagated instead of falling through to yt-dlp.

- [ ] **Step 2: Run RED**

```bash
node --test test/converter.test.js
```

Expected: FAIL because `convertAudio` still imports/calls NewPipe and does not classify yt-dlp failures.

- [ ] **Step 3: Implement the new orchestration**

In `src/converter.js`:

```js
import { classifyExtractorMessage, ExtractorError } from './extractor-errors.js';
import { extractYouTubeVideoId, resolveWithInnerTube } from './innertube.js';
```

Change the injection parameter from `resolveNewPipe` to `resolveInnerTube = resolveWithInnerTube`.

Before yt-dlp:

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

Normal unresolved/direct-stream FFmpeg failures may fall through to yt-dlp. An `ExtractorError` from the resolver must not be caught by this fallback block; only wrap `convertResolvedAudio`, not `resolveInnerTube`.

On yt-dlp non-zero exit, replace the raw stderr error with:

```js
const message = stderr.trim() || `yt-dlp exited with ${code}`;
const normalized = classifyExtractorMessage(message);
throw new ExtractorError(normalized, message, url);
```

Preserve cookie temp-file creation/deletion, format arguments, progress parsing, and output discovery exactly.

- [ ] **Step 4: Run GREEN and regression tests**

```bash
node --test test/converter.test.js test/innertube.test.js test/extractor-errors.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/converter.js test/converter.test.js
git commit -m "feat: use InnerTube before yt-dlp"
```

---

### Task 5: Expose normalized challenge metadata through existing jobs/API

**Files:**
- Modify: `src/jobs.js`
- Modify: `src/server.js`
- Modify: `test/jobs.test.js`
- Modify: `test/server.test.js`

**Interfaces:**
- Job public fields add optional `errorCode` and `sourceUrl`.
- Existing routes remain unchanged: `POST /api/convert`, `GET /api/jobs/:id`, `GET /api/jobs/:id/file`.

- [ ] **Step 1: Write failing JobStore tests**

Add a test asserting that after:

```js
store.update(job.id, {
  status: 'error',
  error: 'Complete the CAPTCHA.',
  errorCode: 'captcha_required',
  sourceUrl: 'https://example.com/watch'
});
```

`store.public(job.id)` includes those exact two fields and still omits `filePath`.

- [ ] **Step 2: Write failing server challenge test**

In `test/server.test.js`, inject a converter that throws:

```js
new ExtractorError('captcha_required', 'Complete the CAPTCHA on the source site.', 'https://example.com/watch')
```

Create a job, poll it until `status === 'error'`, then assert:

```js
assert.equal(job.errorCode, 'captcha_required');
assert.equal(job.sourceUrl, 'https://example.com/watch');
assert.equal(JSON.stringify(job).includes('cookies'), false);
```

- [ ] **Step 3: Run RED**

```bash
node --test test/jobs.test.js test/server.test.js
```

Expected: FAIL because those public fields are not modeled.

- [ ] **Step 4: Implement job/API metadata**

Initialize `errorCode: null` and `sourceUrl: null` in `JobStore.create`, and include them in `public()`.

In `src/server.js`, import `ExtractorError`. In the conversion catch block, use:

```js
const normalized = error instanceof ExtractorError ? error : null;
jobs.update(job.id, {
  status: 'error',
  error: String(error?.message || error).slice(0, 1200),
  errorCode: normalized?.code || 'extractor_error',
  sourceUrl: normalized?.sourceUrl || url
});
```

Do not put auth/cookie data into the job object.

- [ ] **Step 5: Run GREEN**

```bash
node --test test/jobs.test.js test/server.test.js test/converter.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/jobs.js src/server.js test/jobs.test.js test/server.test.js
git commit -m "feat: expose extractor challenge metadata"
```

---

### Task 6: Show Open source / Retry challenges in the web UI

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/style.css`
- Modify: `test/ui-surfaces.test.js`
- Modify: `test/auth-surfaces.test.js`

**Interfaces:**
- Consumes job fields `errorCode` and `sourceUrl`.
- Produces browser actions `#open-source` and `#retry` for actionable codes only.

- [ ] **Step 1: Add failing static UI assertions**

Extend `test/ui-surfaces.test.js` to assert HTML contains `id="challenge-actions"`, `id="open-source"`, and `id="retry"`. Assert JS contains the actionable-code set and calls `form.requestSubmit()` for retry.

Also assert DRM does not enter the actionable set:

```js
assert.match(js, /login_required/);
assert.match(js, /captcha_required/);
assert.match(js, /consent_required/);
assert.match(js, /age_check/);
assert.doesNotMatch(js, /ACTIONABLE[^\n]*drm/);
```

Keep the existing cookie-upload assertions in `test/auth-surfaces.test.js` unchanged.

- [ ] **Step 2: Run RED**

```bash
node --test test/ui-surfaces.test.js test/auth-surfaces.test.js
```

Expected: FAIL because challenge actions do not exist.

- [ ] **Step 3: Add challenge markup and browser behavior**

Inside the existing status section in `public/index.html`, add:

```html
<div id="challenge-actions" class="challenge-actions" hidden>
  <a id="open-source" class="challenge-link" target="_blank" rel="noreferrer">Open source</a>
  <button id="retry" class="challenge-retry" type="button">Retry</button>
</div>
```

In `public/app.js`, cache those nodes and define:

```js
const ACTIONABLE = new Set(['login_required', 'captcha_required', 'consent_required', 'age_check']);

function setChallenge(job) {
  const actionable = ACTIONABLE.has(job.errorCode) && job.sourceUrl;
  challengeActions.hidden = !actionable;
  if (actionable) openSource.href = job.sourceUrl;
  else openSource.removeAttribute('href');
}

retry.addEventListener('click', () => form.requestSubmit());
```

Reset challenge actions at the beginning of each form submission and after a successful job. When an error job arrives, call `setChallenge(job)` before throwing/displaying its message. DRM therefore displays its error text but no Open source/Retry challenge controls.

Add CSS using the existing glass visual language; keep both controls at least 44px tall and responsive below 330px.

- [ ] **Step 4: Run GREEN**

```bash
node --test test/ui-surfaces.test.js test/auth-surfaces.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js public/style.css test/ui-surfaces.test.js test/auth-surfaces.test.js
git commit -m "feat: surface provider challenges in web UI"
```

---

### Task 7: Make Android use the same hosted extractor pipeline

**Files:**
- Modify: `android-sample/app/src/main/java/tools/zexl/client/ConverterClient.kt`
- Modify: `android-sample/app/src/main/java/tools/zexl/demo/MainActivity.kt`
- Modify: `android-sample/app/build.gradle.kts`
- Modify: `android-sample/settings.gradle.kts`
- Delete: `android-sample/app/src/main/java/tools/zexl/client/NewPipeDownloader.kt`
- Delete: `android-sample/app/src/main/java/tools/zexl/client/YouTubeLocalExtractor.kt`
- Replace: `test/android-local-youtube.test.js`
- Modify: `test/auth-surfaces.test.js`

**Interfaces:**
- `ConversionJob` gains nullable `errorCode` and `sourceUrl`.
- `convertSmart(...)` remains source-compatible for the demo but delegates to `convertAndWait(...)`; it no longer downloads/extracts YouTube locally.
- Add `ConversionFailedException(val job: ConversionJob)` so UI can inspect normalized challenge metadata.

- [ ] **Step 1: Replace the old Android-local tests with failing hosted-pipeline assertions**

Rewrite `test/android-local-youtube.test.js` to assert:

```js
assert.doesNotMatch(appGradleText, /NewPipeExtractor|okhttp-brotli/);
assert.doesNotMatch(settingsText, /jitpack\.io/);
assert.equal(fs.existsSync(downloader), false);
assert.equal(fs.existsSync(extractor), false);
assert.match(clientText, /errorCode:\s*String\?/);
assert.match(clientText, /sourceUrl:\s*String\?/);
assert.match(clientText, /class ConversionFailedException/);
assert.match(clientText, /return convertAndWait\(url, format, pollMs, auth, onUpdate\)/);
assert.doesNotMatch(clientText, /YouTubeLocalExtractor/);
assert.match(mainText, /Open source/);
assert.match(mainText, /Intent\.ACTION_VIEW/);
assert.doesNotMatch(mainText, /resolving locally|downloading locally|uploading to converter/);
```

- [ ] **Step 2: Run RED**

```bash
node --test test/android-local-youtube.test.js test/auth-surfaces.test.js
```

Expected: FAIL because the local NewPipe path still exists.

- [ ] **Step 3: Simplify Android dependencies and client**

Delete the two local extractor Kotlin files. Remove NewPipe/JitPack/OkHttp-Brotli dependencies that were used only for local extraction, leaving the Compose/app dependencies intact.

Update `ConversionJob`:

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
```

Add:

```kotlin
class ConversionFailedException(val job: ConversionJob) : IOException(job.error ?: "Conversion failed")
```

In `waitForJob`, throw `ConversionFailedException(job)` for error jobs. Parse `errorCode` and `sourceUrl` from JSON.

Replace `convertSmart` body with:

```kotlin
return convertAndWait(url, format, pollMs, auth, onUpdate)
```

Remove unused local-upload coroutine/import code from `ConverterClient.kt` only if it became unused; keep `startUploadedConversion` if the sample or API still intentionally supports manual uploaded source conversion.

- [ ] **Step 4: Surface challenge action in Compose**

In `MainActivity.kt`, add state:

```kotlin
var challengeUrl by remember { mutableStateOf<String?>(null) }
var challengeCode by remember { mutableStateOf<String?>(null) }
```

On `ConversionFailedException`, set those from `job`; for other failures clear them. Render an `Open source` button only when `challengeCode` is one of `login_required`, `captcha_required`, `consent_required`, `age_check` and `challengeUrl != null`. Its click handler launches:

```kotlin
context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(challengeUrl)))
```

Keep the main conversion button enabled after failure so it acts as Retry with the existing URL/format. Do not show Open source for `drm`.

Replace the old copy that says YouTube downloads locally with copy explaining the shared hosted ZEXL pipeline.

- [ ] **Step 5: Run GREEN**

```bash
node --test test/android-local-youtube.test.js test/auth-surfaces.test.js test/ui-surfaces.test.js
```

If Gradle is available locally, also run:

```bash
cd android-sample && ./gradlew test assembleDebug
```

Expected: Node structural tests PASS; Gradle build PASS when run in an Android-capable environment.

- [ ] **Step 6: Commit**

```bash
git add android-sample test/android-local-youtube.test.js test/auth-surfaces.test.js
git commit -m "refactor: route Android through hosted extractor pipeline"
```

---

### Task 8: Remove NewPipe/JVM runtime and update dependency/documentation invariants

**Files:**
- Delete: `src/newpipe.js`
- Delete: `newpipe-bridge/`
- Delete: `test/newpipe.test.js`
- Modify: `Dockerfile`
- Modify: `package.json`
- Modify: `test/dependencies.test.js`
- Modify: `.github/dependabot.yml`
- Modify: `THIRD_PARTY_NOTICES.md`
- Delete NewPipe-only license file(s) under `licenses/` if no longer applicable
- Modify: `README.md`
- Modify: `android-sample/README.md`
- Create: `test/extractor-stack.test.js`

**Interfaces:**
- Produces the final single-container runtime: Node + Python/yt-dlp + FFmpeg + CA certificates.
- Produces a repository-wide invariant that NewPipe/JVM/FRXE/nont.me extractor dependencies are absent.

- [ ] **Step 1: Write the failing extractor-stack regression test**

Create `test/extractor-stack.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const files = ['Dockerfile', 'package.json', 'README.md', 'THIRD_PARTY_NOTICES.md', '.github/dependabot.yml'];

test('active ZEXL extractor stack has no NewPipe/JVM or FRXE/nont.me dependency', async () => {
  assert.equal(fs.existsSync('src/newpipe.js'), false);
  assert.equal(fs.existsSync('newpipe-bridge'), false);
  for (const file of files) {
    const text = (await fsp.readFile(file, 'utf8')).toLowerCase();
    assert.doesNotMatch(text, /newpipe/);
    assert.doesNotMatch(text, /openjdk|jdk21|gradle:9\.7\.1-jdk21/);
    assert.doesNotMatch(text, /frxe/);
    assert.doesNotMatch(text, /nont\.me/);
  }
});
```

- [ ] **Step 2: Run RED**

```bash
node --test test/extractor-stack.test.js test/dependencies.test.js
```

Expected: FAIL because NewPipe/JVM references still exist.

- [ ] **Step 3: Simplify Dockerfile and package checks**

Replace the Dockerfile with a single Node runtime stage preserving the current pinned versions:

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

Update `package.json` `check` to cover `server.js`, `converter.js`, `innertube.js`, `extractor-errors.js`, and `validation.js`, with no `newpipe.js` reference.

Delete `src/newpipe.js`, the `newpipe-bridge/` directory, and `test/newpipe.test.js`.

- [ ] **Step 4: Update dependency tests and Dependabot**

Rewrite the runtime dependency test to assert:

```js
assert.match(docker, /node:24\.21\.0-trixie-slim/);
assert.match(docker, /YTDLP_VERSION=2026\.08\.19/);
assert.match(docker, /yt-dlp\[default\]==\$\{YTDLP_VERSION\}/);
assert.doesNotMatch(docker, /openjdk|gradle:|newpipe/i);
```

Keep Android AGP/Kotlin/Compose version tests unchanged.

Remove the NewPipe Gradle entry from `.github/dependabot.yml`; keep Docker and any still-relevant npm/Gradle update entries.

- [ ] **Step 5: Update notices and docs**

Remove NewPipe-specific notices and its bundled GPL copy only if that license file exists solely because NewPipe was distributed. Do not remove notices for remaining dependencies.

Rewrite README architecture to:

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

Document that provider challenges are shown to the user, DRM remains unsupported, and cookie uploads are temporary. Remove NewPipe language from `android-sample/README.md` as well.

- [ ] **Step 6: Run GREEN plus full Node verification**

```bash
npm run check
npm test
```

Expected: all Node tests PASS, including `extractor-stack.test.js`, with no attempt to read root `cookies.txt`.

- [ ] **Step 7: Build the production container**

```bash
docker build -t zexl:innertube-ytdlp .
```

Expected: build succeeds without downloading/building Java or NewPipe artifacts.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove NewPipe runtime"
```

---

### Task 9: Final acceptance verification and PR

**Files:**
- No feature files should change unless verification exposes a defect.

**Interfaces:**
- Verifies all acceptance criteria from the spec.

- [ ] **Step 1: Run the complete test and syntax suite fresh**

```bash
npm run check
npm test
```

Expected: exit 0; zero failing tests.

- [ ] **Step 2: Run focused extractor/security tests fresh**

```bash
node --test \
  test/security-hygiene.test.js \
  test/extractor-errors.test.js \
  test/innertube.test.js \
  test/converter.test.js \
  test/server.test.js \
  test/ui-surfaces.test.js \
  test/android-local-youtube.test.js \
  test/extractor-stack.test.js
```

Expected: exit 0.

- [ ] **Step 3: Build production Docker image fresh**

```bash
docker build -t zexl:innertube-ytdlp .
```

Expected: exit 0.

- [ ] **Step 4: Verify forbidden references and credential file absence**

Run:

```bash
test ! -e cookies.txt
test ! -e src/newpipe.js
test ! -d newpipe-bridge
! grep -RniE 'NewPipe|FRXE|nont\.me' src public Dockerfile package.json README.md THIRD_PARTY_NOTICES.md .github android-sample
```

Expected: every command exits 0.

- [ ] **Step 5: Review diff scope**

```bash
git diff main...HEAD --stat
git diff main...HEAD --name-only
```

Expected: changes are confined to ZEXL extractor/security/UI/docs/tests; no external repository changes exist.

- [ ] **Step 6: Open PR**

Use title:

```text
Replace NewPipe with InnerTube → yt-dlp
```

Use body:

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

Do not merge until CI and the final verification are green.
