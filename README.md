# ZEXL Audio

**signed by void**

ZEXL is a small hosted link-to-audio converter with a web UI and Android integration.

## UI / UX

Both included clients use the ZEXL **Liquid Glass** direction: translucent layered surfaces, animated ambient light, springy format selection, responsive conversion progress, and reduced-motion support on the web. The Android Compose sample mirrors the same black/white glass identity with the ZEXL acid accent.

Paste a media URL and convert its audio to:

- MP3
- FLAC
- WAV

The backend uses a **hybrid extractor pipeline**. Public links are offered to **NewPipeExtractor first**; when NewPipe supports the source, ZEXL takes its best direct audio stream and converts it with **FFmpeg**. If NewPipe cannot resolve the link, or the resolved stream fails, ZEXL automatically falls back to **yt-dlp**. This keeps NewPipe's strong support for YouTube, SoundCloud, PeerTube, Bandcamp, and media.ccc.de while preserving yt-dlp's broader site coverage.

For supported non-DRM sources that require an account, ZEXL keeps the existing user-supplied Netscape `cookies.txt` flow and sends those jobs directly to yt-dlp so session credentials never enter the JVM bridge. It does not defeat DRM, paywalls, or access controls.

## Architecture

```text
Web UI / Android app
        |
        | HTTPS
        v
Node.js converter service
        |
        +-- NewPipeExtractor JVM resolver (public links first)
        |       |
        |       +-- direct audio stream -> FFmpeg
        |
        +-- yt-dlp fallback / authenticated jobs -> FFmpeg
        |
        v
Temporary converted file
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

Response:

```json
{
  "id": "job-id",
  "format": "mp3",
  "status": "queued",
  "progress": 0,
  "error": null,
  "title": null,
  "downloadUrl": null
}
```


### Authenticated source sessions

For supported media your own account is authorized to access, send a fresh **Netscape-format** cookies file in `auth.cookies`. `auth.userAgent` is optional but can help when a site expects the same browser identity as the session.

ZEXL validates the cookie-file format, keeps credentials out of job responses and command-line arguments, writes the temporary cookie file with mode `0600`, and deletes it immediately after yt-dlp exits. Do not send cookie sessions to a ZEXL host you do not trust. DRM-protected media remains unsupported.

### Poll a job

```http
GET /api/jobs/JOB_ID
```

When `status` becomes `ready`, `downloadUrl` points to the converted file.

### Download

```http
GET /api/jobs/JOB_ID/file
```

## Dependency policy

ZEXL pins stable production versions instead of floating `latest` tags. This build targets Node.js 24.21.0 LTS, Gradle 9.7.1, NewPipeExtractor v0.26.5, yt-dlp 2026.08.19, Android Gradle Plugin 9.4.0, Kotlin 2.4.20, Compose BOM 2026.08.00, Activity 1.13.0, and Lifecycle 2.11.0. `.github/dependabot.yml` checks Docker, npm, and Gradle dependencies weekly so version bumps are visible and reviewable.

## Third-party licensing

NewPipeExtractor is GPL-3.0-or-later. ZEXL includes `THIRD_PARTY_NOTICES.md` and a GPL-3.0 license copy under `licenses/`.

## Notes on audio quality

FLAC and WAV output is lossless as a **file format**, but converting a lossy source to FLAC/WAV cannot recreate audio information that was missing from the source.

## Responsible use

Only download media you have permission to access and save. Site terms and copyright rules still apply. This project intentionally does not include DRM or access-control bypasses. Authenticated-source support only uses a session the user explicitly supplies for media that session is already authorized to access.
