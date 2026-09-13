# ZEXL Audio Design

## Goal
Build a small link-to-audio converter for MP3, FLAC, and WAV with a web UI and an Android integration client.

## Architecture
A stateless Node.js HTTP service accepts jobs, validates public HTTP(S) URLs, serializes conversion work for small Render instances, invokes yt-dlp/FFmpeg, exposes job polling, and serves temporary files. A same-origin static web UI and Kotlin Android client both consume the same HTTP interface.

## Hosting
Target Render Free through Docker. Bind to `0.0.0.0:$PORT`, expose `/health`, store no persistent application state, and keep conversion output in temporary local storage.

## Safety and limits
Reject non-HTTP(S), localhost, and private-network targets before invoking yt-dlp. Support only MP3/FLAC/WAV. Do not implement DRM, paywall, or authentication bypasses. Limit concurrent conversions to one by default.

## Android
Provide a reusable Kotlin client with Render cold-start warmup/retry behavior, polling, and DownloadManager integration, plus a minimal Compose sample and share-sheet URL intake.
