# Android integration

The only file you need in your existing app is:

`app/src/main/java/tools/zexl/client/ConverterClient.kt`

Also add this permission to your manifest:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

Usage:

```kotlin
val converter = ConverterClient("https://YOUR-SERVICE.onrender.com")
val job = converter.convertAndWait(url, AudioFormat.MP3) { job ->
    // job.status / job.progress
}
converter.enqueueDownload(context, job)
```

If you set `CONVERTER_API_KEY` on Render, pass the same value as the second `ConverterClient` constructor argument. Be aware that secrets embedded in an APK can be extracted; use this only as lightweight abuse protection, not strong authentication.


## Authenticated, non-DRM sources

If a supported site requires login for media your account is authorized to access, export a fresh Netscape-format `cookies.txt` and pass its text for that conversion:

```kotlin
val session = SessionAuth(
    cookies = cookiesText,
    userAgent = browserUserAgent
)

val job = converter.convertAndWait(
    url = mediaUrl,
    format = AudioFormat.MP3,
    auth = session
) { update ->
    // update.status / update.progress
}
```

Do not hard-code cookie contents in the APK. Load them only when the user explicitly supplies them. ZEXL sends the session over HTTPS, stores it only long enough to run the job, writes the temporary server cookie file with owner-only permissions, and removes that file after yt-dlp exits. DRM-protected media remains unsupported.
