# ZEXL Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and package a Render-hosted URL-to-MP3/FLAC/WAV converter with web and Android clients.

**Architecture:** Node's built-in HTTP server owns validation, temporary jobs, a single-worker queue, yt-dlp execution, downloads, and static assets. Docker supplies yt-dlp and FFmpeg. Android talks to the same job API and accounts for Render cold starts.

**Tech Stack:** Node.js 22, yt-dlp, FFmpeg, Docker, HTML/CSS/JS, Kotlin/Jetpack Compose.

**Spec:** `docs/superpowers/specs/2026-09-13-zexl-audio-design.md`

## Global Constraints

- Formats are exactly MP3, FLAC, WAV.
- No DRM, paywall, or login-protection bypasses.
- Render Free is the deployment target.
- Converted files are temporary and no database is required.
- Default concurrency is one conversion.

---

### Task 1: Input validation and converter command layer
- [x] Write failing tests for formats, URLs, private addresses, command arguments, progress parsing, and filenames.
- [x] Implement `src/validation.js` and `src/converter.js`.
- [x] Run the tests and verify green.

### Task 2: Temporary jobs and Render-safe queue
- [x] Write failing tests for job lifecycle and concurrency.
- [x] Implement `src/jobs.js` and `src/queue.js`.
- [x] Run the tests and verify green.

### Task 3: HTTP API and downloads
- [x] Write failing HTTP tests for health, validation errors, and missing jobs.
- [x] Implement `src/server.js` with convert, poll, file, CORS, optional bearer auth, cleanup, and static serving.
- [x] Run the HTTP tests and verify green.

### Task 4: Web client and Render packaging
- [x] Add the responsive single-link web UI and polling flow.
- [x] Add `Dockerfile`, `.dockerignore`, and `render.yaml`.
- [x] Add deployment and API documentation.

### Task 5: Android integration
- [x] Add reusable `ConverterClient.kt` with warmup, create/poll, and DownloadManager support.
- [x] Add a minimal Compose sample with MP3/FLAC/WAV and share-sheet intake.
- [x] Document how to copy the client into an existing app.

### Task 6: Verification and packaging
- [x] Run all Node tests and syntax checks.
- [x] Start the server locally and verify `/health` and `/`.
- [x] Package the source as a ZIP.
