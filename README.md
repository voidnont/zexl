# ZEXL Audio

**signed by void**

ZEXL is a small hosted link-to-audio converter with a web UI and Android integration.

## UI / UX

Both included clients use the ZEXL **Liquid Glass** direction: translucent layered surfaces, animated ambient light, responsive conversion progress, and compact MP3 / FLAC / WAV selection.

Paste a supported media URL and convert its audio to:

- MP3
- FLAC
- WAV

## Extractor pipeline

ZEXL uses one hosted extractor pipeline:

- Public YouTube links: **InnerTube first**. ZEXL accepts only a usable direct audio URL and sends it to FFmpeg.
- If InnerTube cannot provide a usable direct stream, ZEXL falls back to **yt-dlp**.
- Non-YouTube links use yt-dlp directly.
- Jobs with a user-supplied authorized session use yt-dlp directly; session cookies are never passed to InnerTube.

ZEXL does not implement signature deciphering, automated CAPTCHA solving, login bypasses, DRM removal, paywall bypasses, or access-control bypasses.

When a provider reports a user-solvable challenge such as login, CAPTCHA, consent, or age verification, ZEXL exposes that state so the user can open the source site, complete the provider's normal flow, and retry. DRM is shown clearly as unsupported.

## Architecture

```text
Web UI / Android app
        |
        | HTTPS
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
                                                         |
                                                         v
                                               temporary output file
```

Jobs are stored only in memory and converted files are temporary. No database or persistent disk is required.

## API

### Health

```http
GET /health
```

### Start a conversion

```http
POST /api/convert
Content-Type: application/json

{
  "url": "https://example.com/media",
  "format": "mp3",
  "auth": {
    "cookies": "# Netscape HTTP Cookie File\n...",
    "userAgent": "Mozilla/5.0 ..."
  }
}
```

Valid formats: `mp3`, `flac`, `wav`. The `auth` object is optional; omit it for public links.

Initial response:

```json
{
  "id": "job-id",
  "format": "mp3",
  "status": "queued",
  "progress": 0,
  "error": null,
  "errorCode": null,
  "sourceUrl": null,
  "title": null,
  "downloadUrl": null
}
```

### Challenge/error states

A failed job can include normalized metadata:

```json
{
  "status": "error",
  "error": "Complete the CAPTCHA on the source site.",
  "errorCode": "captcha_required",
  "sourceUrl": "https://example.com/media"
}
```

Current normalized codes are `login_required`, `captcha_required`, `consent_required`, `age_check`, `drm`, `unavailable`, `unsupported`, and `extractor_error`.

The web and Android clients offer **Open source** only for login/CAPTCHA/consent/age challenges. DRM does not receive a bypass action.

### Authenticated source sessions

For supported media your own account is already authorized to access, send a fresh **Netscape-format** cookies file in `auth.cookies`. `auth.userAgent` is optional.

ZEXL validates the cookie-file format, keeps credentials out of job responses, writes the temporary cookie file with mode `0600`, passes only its temporary path to yt-dlp, and deletes it after yt-dlp exits on success or failure. Do not send cookie sessions to a ZEXL host you do not trust.

The repository itself ignores `cookies.txt`, `*.cookies.txt`, and `.session.cookies.txt`; session credentials must not be committed.

### Poll a job

```http
GET /api/jobs/JOB_ID
```

When `status` becomes `ready`, `downloadUrl` points to the converted file.

### Download

```http
GET /api/jobs/JOB_ID/file
```

## Runtime and dependency policy

The hosted image contains Node.js 24.21.0, Python for yt-dlp, yt-dlp 2026.08.19, FFmpeg, and CA certificates. It does not require a JVM or Gradle at runtime.

The Android sample targets Android Gradle Plugin 9.4.0, Kotlin/Compose compiler 2.4.20, Compose BOM 2026.08.00, Activity 1.13.0, and Lifecycle 2.11.0. `.github/dependabot.yml` checks Docker, npm, and the Android Gradle project weekly.

## Third-party notices

See `THIRD_PARTY_NOTICES.md` for the hosted runtime dependencies.

## Notes on audio quality

FLAC and WAV output are lossless **file formats**, but converting a lossy source to FLAC/WAV cannot recreate information missing from the source.

## Responsible use

Only download media you have permission to access and save. Site terms and copyright rules still apply. Authenticated-source support only uses a session the user explicitly supplies for media that session is already authorized to access.
