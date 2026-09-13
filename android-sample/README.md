# ZEXL Android integration

**signed by void**

The Android client uses a smart split route:

- Public YouTube URL, no session auth: NewPipeExtractor resolves and downloads audio locally on the phone, then `ConverterClient` uploads the temporary source to Render for MP3/FLAC/WAV transcoding.
- Other URLs or authenticated jobs: the URL goes to the normal hosted `/api/convert` route.

Copy these client files into your host app:

- `tools/zexl/client/ConverterClient.kt`
- `tools/zexl/client/NewPipeDownloader.kt`
- `tools/zexl/client/YouTubeLocalExtractor.kt`

Mirror the dependencies and core-library desugaring settings from `app/build.gradle.kts`, keep JitPack in `settings.gradle.kts`, and add:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

Usage:

```kotlin
val converter = ConverterClient("https://YOUR-SERVICE.onrender.com")
val job = converter.convertSmart(
    context = context,
    url = mediaUrl,
    format = AudioFormat.MP3
) { update ->
    // update.status / update.progress
}
converter.enqueueDownload(context, job)
```

`convertSmart()` cleans up the local YouTube source after upload/conversion handoff, including on failures.

## Build on Windows

From the repository root run `build.bat`. It validates Java + Android SDK Platform 37, bootstraps and SHA-256-verifies Gradle 9.7.1 when necessary, builds the debug APK, and copies it to `dist\zexl-debug.apk`. JDK 21 is recommended; JDK 17+ is accepted.

## Authenticated, non-DRM sources

For media your own account is authorized to access, keep using `SessionAuth` with a fresh Netscape-format `cookies.txt`. Authenticated jobs intentionally use the hosted yt-dlp path rather than passing session credentials into the local NewPipe route. Do not hard-code cookies in the APK. DRM-protected media remains unsupported.

## Licensing

The local YouTube route directly depends on TeamNewPipe/NewPipeExtractor, licensed GPL-3.0-or-later. Review and comply with its license obligations before integrating or redistributing this code in another Android app.
