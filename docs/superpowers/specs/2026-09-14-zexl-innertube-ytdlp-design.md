# ZEXL InnerTube → yt-dlp Extractor Design

Date: 2026-09-14
Status: Approved in chat for spec writing
Scope: `voidnont/zexl` only

## Goal

Replace ZEXL's current NewPipe-first extraction path with a simpler ZEXL-native pipeline:

1. InnerTube first for public YouTube media.
2. yt-dlp second when InnerTube cannot produce a usable direct stream, and first for non-YouTube sources.
3. FFmpeg remains the single conversion stage for MP3, FLAC, and WAV output.

FRXE and `nont.me` are out of scope and must not be referenced or modified by this work.

## Existing System to Preserve

ZEXL already has:

- a Node.js HTTP service;
- in-memory jobs and a small task queue;
- temporary per-job directories;
- FFmpeg conversion;
- yt-dlp fallback and authenticated-session support;
- web UI and Android sample surfaces;
- MP3, FLAC, and WAV output;
- Render/Docker deployment.

The design keeps those pieces and replaces only the extractor layer plus related UI/error handling.

## Architecture

```text
Web UI / Android client
        |
        | POST /api/convert
        v
Node.js ZEXL service
        |
        +-- YouTube public request?
        |       |
        |       +-- yes --> InnerTube resolver
        |       |             |
        |       |             +-- usable direct audio stream --> FFmpeg
        |       |             |
        |       |             +-- unresolved/unusable ---------+
        |       |
        |       +-- no -----------------------------------------+
        |                                                     |
        +-----------------------------------------------------v
                                                          yt-dlp
                                                             |
                                                             v
                                                           FFmpeg
                                                             |
                                                             v
                                                   temporary output file
```

There is no separate extractor service and no Java/JVM sidecar. The whole runtime remains one ZEXL container.

## InnerTube Resolver

Create `src/innertube.js` as a small, replaceable YouTube-only resolver.

Responsibilities:

- recognize supported YouTube watch/share/short links;
- extract a YouTube video ID safely;
- make the minimum server-side InnerTube player request needed to inspect public playback data;
- return normalized metadata and only direct, usable stream URLs;
- prefer a direct audio stream suitable for FFmpeg input;
- return a normalized unresolved/challenge result instead of throwing raw provider responses;
- never attempt signature-cipher bypass logic in ZEXL itself;
- never consume browser cookies, usernames, passwords, or provider session tokens.

If InnerTube returns only ciphered/unusable formats, unavailable media, or another unsupported result, the pipeline falls through to yt-dlp.

## yt-dlp Stage

yt-dlp remains ZEXL's broad extractor and authenticated-session path.

For public YouTube links it runs only after InnerTube cannot supply a usable direct stream. For non-YouTube links it runs immediately.

The existing three output formats remain:

- MP3
- FLAC
- WAV

The existing temporary Netscape `cookies.txt` upload flow may remain for media the user's own account is already authorized to access. Session data must:

- come only from the user's request;
- be written to a per-job temporary file with mode `0600`;
- never be echoed in job responses or logs;
- never be passed through InnerTube;
- be deleted after yt-dlp finishes, whether success or failure.

## Tracked Root `cookies.txt`

The repository currently contains a root-level `cookies.txt`. This file must be deleted from Git without reading or using its contents.

Add `cookies.txt` and common session-cookie variants to `.gitignore` so credentials are not committed again.

This task does not attempt to rewrite Git history. If historical removal is desired later, that is a separate security-maintenance task.

## Challenge and Error Model

Replace opaque extractor failures with normalized user-facing states. At minimum:

- `login_required`
- `captcha_required`
- `consent_required`
- `age_check`
- `drm`
- `unavailable`
- `unsupported`
- `extractor_error`

Rules:

- login/CAPTCHA/consent/age checks are shown to the user instead of being silently hidden;
- the UI provides `Open source` and `Retry` when a source URL is available;
- ZEXL does not automate CAPTCHA solving or login;
- ZEXL does not bypass DRM, paywalls, or access controls;
- DRM is displayed clearly as unsupported;
- if yt-dlp reports a usable authenticated flow and the user supplied their own valid session cookies, ZEXL may use that session normally.

## Job API

Keep the existing asynchronous job model:

- `POST /api/convert`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/file`

Extend job state with optional normalized challenge metadata rather than adding a second API family.

A public job response may include fields such as:

```json
{
  "status": "error",
  "errorCode": "captcha_required",
  "error": "Complete the CAPTCHA on the source site, then retry.",
  "sourceUrl": "https://example.com/media"
}
```

Credentials and cookie contents are never included in public job state.

## Web UI

Keep the existing ZEXL Liquid Glass UI and the MP3/FLAC/WAV selector.

Changes:

- keep the URL conversion flow and progress UI;
- when a normalized provider challenge is returned, show the provider-safe message;
- show `Open source` for login/CAPTCHA/consent/age-check cases when a source URL exists;
- show `Retry` without clearing the user's URL/format selection;
- keep the optional user-supplied cookie file control for authorized sessions;
- clearly label DRM as unsupported rather than presenting a retry loop that implies it can be bypassed.

## Android Surface

The Android sample remains a client of the ZEXL API. No FRXE integration is introduced.

If its current response model assumes only `ready`/`error`, update it to display the normalized challenge message and source-action affordance where appropriate. Do not add provider credential capture to the Android client.

## NewPipe Removal

Remove the NewPipe implementation and runtime dependencies:

- `src/newpipe.js`;
- `newpipe-bridge/`;
- NewPipe-specific tests;
- Java/OpenJDK/Gradle build stages and runtime environment variables;
- NewPipe-specific dependency checks;
- NewPipe-specific third-party notices/license references that are no longer needed after no NewPipe code is distributed.

Do not remove unrelated licensing notices.

## Docker and Deployment

Simplify the Docker image to the runtime ZEXL actually needs:

- Node.js 24;
- Python runtime for yt-dlp;
- pinned yt-dlp release policy already used by the repo;
- FFmpeg;
- CA certificates.

Remove Java and the Gradle build stage.

Render remains the deployment target and the existing single-service model remains intact.

## Security

Preserve or strengthen the existing controls:

- validate media URLs and reject private/local network targets before provider calls;
- do not log user cookie contents;
- do not expose temporary filesystem paths as credentials or secrets;
- keep converted files temporary;
- keep per-job cleanup;
- do not follow redirects into private/local network ranges without validation;
- do not add CAPTCHA automation, DRM bypass, account takeover, or provider-session harvesting.

## Testing

Implementation is test-first.

Required coverage:

1. InnerTube URL/video-ID parsing.
2. InnerTube accepts direct audio URLs and rejects cipher-only/unusable formats.
3. YouTube order is InnerTube first, then yt-dlp.
4. Non-YouTube skips InnerTube and uses yt-dlp.
5. MP3, FLAC, and WAV still use the existing conversion/output contract.
6. Challenge classification for login, CAPTCHA, consent, age, DRM, unavailable, and generic extractor failure.
7. User-supplied temporary cookies go only to yt-dlp and are always deleted afterward.
8. Root `cookies.txt` is absent and ignored by Git.
9. NewPipe files/runtime references are absent from the active extractor path and Docker image.
10. Web UI shows challenge text, `Open source`, and `Retry` where appropriate.
11. DRM UI is explicit and does not offer a bypass path.
12. Existing server/job/download tests remain green.
13. No FRXE or `nont.me` dependency is introduced.

## Files Expected to Change

Likely changes include:

- `src/innertube.js` (new)
- `src/converter.js`
- `src/server.js`
- `src/validation.js` if extractor-result normalization needs shared validation
- `public/app.js`
- `public/index.html` only if challenge controls need markup
- Android sample response/UI files as needed
- `Dockerfile`
- `package.json`
- `.gitignore`
- `README.md`
- `THIRD_PARTY_NOTICES.md` and `licenses/` only to remove no-longer-distributed NewPipe notices
- tests under `test/`

Expected deletions include `src/newpipe.js`, `newpipe-bridge/`, NewPipe tests, and the tracked root `cookies.txt`.

## Non-Goals

This work will not:

- modify FRXE;
- modify `nont.me`;
- add NewPipe back under another name;
- add a third extraction fallback after yt-dlp;
- automate provider login or CAPTCHA solving;
- bypass DRM, paywalls, private-media authorization, or access controls;
- persist user session cookies beyond the temporary conversion job;
- rewrite repository history.

## Acceptance Criteria

The change is complete when:

- ZEXL uses InnerTube first for public YouTube links;
- unresolved YouTube requests fall through to yt-dlp;
- non-YouTube requests start with yt-dlp;
- MP3/FLAC/WAV conversion still works through FFmpeg;
- challenges are visible and actionable by the user without automated bypassing;
- NewPipe/Java runtime pieces are gone;
- root `cookies.txt` is gone and ignored;
- no FRXE/nont.me dependency exists;
- all updated and existing tests pass;
- the production Docker build succeeds.
