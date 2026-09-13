# ZEXL Local YouTube + Hosted Transcode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route Android YouTube conversion through local NewPipe extraction/download and use Render only for file transcoding, while keeping non-YouTube hosted conversion unchanged.

**Architecture:** Add a streaming binary upload job endpoint to the Node service and a local NewPipeExtractor pipeline to the Android sample. The Android client chooses the route automatically; both routes converge on the existing job/status/download contract.

**Tech Stack:** Node.js 24, FFmpeg, Kotlin 2.4.20, AGP 9.4.0, Gradle 9.7.1, NewPipeExtractor commit `8584a0d636ce6b8371d2c5c83dbe7f01a3d21d59`, OkHttp/Brotli 5.5.0.

**Spec:** `docs/superpowers/specs/2026-09-13-zexl-local-youtube-design.md`

## Global Constraints

- Keep the existing compact Liquid Glass UI and `signed by void` branding.
- Preserve existing `/api/convert`, jobs, downloads, cookies, and non-YouTube behavior.
- Public YouTube only for local extraction; no DRM or access-control bypasses.
- Upload limit defaults to 250 MiB and is enforced while streaming.
- Android build must work from `build.bat` using a bundled Gradle 9.7.1 wrapper.

---

### Task 1: Streaming upload/transcode endpoint

**Files:** `test/server.test.js`, `test/converter.test.js`, `src/server.js`, `src/converter.js`

**Interfaces:**
- Produces `transcodeUploadedAudio({ inputPath, title, format, jobDir, ffmpegPath, onProgress }) -> Promise<string>`.
- Produces `POST /api/transcode?format=&title=` returning the existing public job JSON.

- [ ] Add failing tests for a successful raw upload, invalid format, and upload-size rejection.
- [ ] Add a failing test for local-file FFmpeg args/output handling.
- [ ] Implement streaming request-to-temp-file with byte-limit enforcement.
- [ ] Implement local-file FFmpeg transcoding and queue it through the existing job store.
- [ ] Run all Node tests.

### Task 2: Android local YouTube extraction

**Files:** `android-sample/app/build.gradle.kts`, `android-sample/settings.gradle.kts`, `android-sample/app/src/main/java/tools/zexl/client/NewPipeDownloader.kt`, `android-sample/app/src/main/java/tools/zexl/client/YouTubeLocalExtractor.kt`, `test/android-local-youtube.test.js`

**Interfaces:**
- Produces `YouTubeLocalExtractor.isYouTubeUrl(String): Boolean`.
- Produces `suspend fun YouTubeLocalExtractor.downloadBestAudio(context, url, onProgress): LocalAudioSource`.

- [ ] Add source-contract tests for dependencies, URL routing, cleanup, and best-audio selection.
- [ ] Add JitPack and current NewPipeExtractor/OkHttp/Brotli dependencies.
- [ ] Implement upstream-compatible NewPipe downloader transport.
- [ ] Implement public YouTube stream resolution and cache-file download.
- [ ] Run Node source-contract tests.

### Task 3: Smart Android client route

**Files:** `android-sample/app/src/main/java/tools/zexl/client/ConverterClient.kt`, `android-sample/app/src/main/java/tools/zexl/demo/MainActivity.kt`, `test/android-local-youtube.test.js`

**Interfaces:**
- Produces `suspend fun convertSmart(context, url, format, pollMs, auth, onUpdate): ConversionJob`.
- Produces `suspend fun uploadAndWait(sourceFile, title, format, pollMs, onUpdate): ConversionJob`.

- [ ] Add failing source-contract tests proving YouTube takes the local route and other URLs keep the hosted route.
- [ ] Implement binary upload request with progress and authorization header.
- [ ] Implement `convertSmart`, deleting the local cache file in `finally`.
- [ ] Update the demo button/status copy to use the smart route.
- [ ] Run Node source-contract tests.

### Task 4: Self-contained Windows Android build

**Files:** `build.bat`, `android-sample/gradlew`, `android-sample/gradlew.bat`, `android-sample/gradle/wrapper/gradle-wrapper.properties`, `android-sample/gradle/wrapper/gradle-wrapper.jar`, `test/build-script.test.js`

**Interfaces:**
- Produces root `build.bat` -> `dist\zexl-debug.apk` on success.

- [ ] Add failing source-contract test for Java/SDK checks, wrapper invocation, and output copy.
- [ ] Add official Gradle 9.7.1 wrapper files.
- [ ] Implement `build.bat` with clear validation and error messages.
- [ ] Run wrapper version check where environment permits.

### Task 5: Documentation and final verification

**Files:** `README.md`, `android-sample/README.md`, `THIRD_PARTY_NOTICES.md`, `.github/dependabot.yml`

- [ ] Document Android-local YouTube behavior and Render file-transcode endpoint.
- [ ] Document NewPipeExtractor GPL licensing implications for host-app integration.
- [ ] Update dependency monitoring paths.
- [ ] Run full Node test suite and syntax checks.
- [ ] Smoke-test `/health`, static UI, and raw upload endpoint with a generated local audio fixture.
- [ ] Package the project ZIP.
