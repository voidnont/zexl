# ZEXL Local YouTube + Hosted Transcode Design

## Goal

Make YouTube conversion reliable on Android by resolving and downloading public YouTube audio on the user's device with NewPipeExtractor, then uploading that local source audio to the existing Render service for MP3/FLAC/WAV transcoding. Keep non-YouTube URLs on the existing hosted URL-conversion path.

## Architecture

Android gains a local YouTube pipeline: detect a YouTube URL, initialize NewPipeExtractor with an OkHttp/Brotli downloader, resolve the best public URL-backed audio stream, download it into app cache, and upload the temporary source file to Render. Render gains a raw streaming upload endpoint that creates a normal conversion job and invokes FFmpeg against the uploaded source file. The existing job polling and file download endpoints remain unchanged, so host apps still consume `ConversionJob` the same way.

Non-YouTube URLs continue through `POST /api/convert`. Authenticated sessions continue through the existing hosted yt-dlp path. DRM and access-control bypasses are not supported.

## Android Components

- `YouTubeLocalExtractor.kt`: URL detection, NewPipe initialization, best-audio selection, local stream download.
- `NewPipeDownloader.kt`: OkHttp 5.5.0 + Brotli implementation of NewPipe's `Downloader` interface.
- `ConverterClient.kt`: adds raw source upload and `convertSmart(...)`; YouTube uses local extraction, other sources use hosted conversion.
- `MainActivity.kt`: calls `convertSmart(...)` and reports local extraction/upload status through the existing compact Liquid Glass UI.

NewPipeExtractor is pinned to the latest known `dev` commit at build time (`8584a0d636ce6b8371d2c5c83dbe7f01a3d21d59`) and Dependabot remains enabled for Gradle dependencies.

## Server Components

- `POST /api/transcode?format=<mp3|flac|wav>&title=<name>` accepts `application/octet-stream`.
- Request data is streamed directly to a private temporary source file; maximum upload size defaults to 250 MiB and is configurable with `MAX_UPLOAD_BYTES`.
- A normal queued job is created and returned immediately after upload finishes.
- FFmpeg converts the source file locally; the same `/api/jobs/:id` and `/api/jobs/:id/file` endpoints expose status/output.
- Temporary source and output files are removed by the existing job TTL cleanup.

## Build

The Android sample includes the Gradle 9.7.1 wrapper. Root `build.bat` validates Java and Android SDK availability, runs `android-sample\gradlew.bat :app:assembleDebug`, and copies the APK to `dist\zexl-debug.apk`. It reports actionable errors when Java, the SDK, or the wrapper is missing.

## Security and Limits

- Public YouTube media only for the local NewPipe path.
- No DRM/login/access-control circumvention.
- Upload body is size-limited while streaming to disk.
- API-key protection applies to `/api/transcode` just like other `/api/*` endpoints.
- No uploaded media is persisted beyond the conversion job TTL.
