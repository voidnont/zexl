# ZEXL Android integration

**signed by void**

The Android sample uses the same hosted ZEXL extractor pipeline as the web client. It does not ship a separate local YouTube extractor.

Copy this client file into your host app:

- `tools/zexl/client/ConverterClient.kt`

Add:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

Basic usage:

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

`convertSmart()` is source-compatible with the sample's previous smart entry point, but all URL extraction now happens through the hosted ZEXL service: public YouTube uses InnerTube first and yt-dlp second, while other sources use yt-dlp.

## Provider challenges

`ConversionJob` includes nullable `errorCode` and `sourceUrl`. `convertAndWait()` / `convertSmart()` throw `ConversionFailedException` when a job finishes in an error state, preserving the failed job metadata.

The sample UI offers **Open source** for these user-solvable states:

- `login_required`
- `captcha_required`
- `consent_required`
- `age_check`

The user completes that action normally on the provider's site, returns to ZEXL, and retries. DRM remains unsupported and does not receive a bypass action.

## Authenticated, non-DRM sources

For media your own account is already authorized to access, host apps can pass `SessionAuth` with a fresh Netscape-format cookie file. Session data is sent only to the hosted yt-dlp path and is not used by InnerTube. Do not hard-code cookies in the APK.

## Generic local-audio upload

`startUploadedConversion()` and `LocalAudioSource` remain available for apps that already have an authorized local audio file and want ZEXL to transcode it through `/api/transcode`. This is independent of URL extraction.

## Build on Windows

From the repository root run `build.bat`. It validates Java and the Android SDK, installs the required Android SDK packages with `sdkmanager` when needed, bootstraps and SHA-256-verifies Gradle 9.7.1, builds the debug APK, and copies it to `dist\zexl-debug.apk`. JDK 21 is recommended; JDK 17+ is accepted.

## Build memory

The project includes `gradle.properties` with a 2 GB Gradle heap and two workers for Compose/Android builds.
