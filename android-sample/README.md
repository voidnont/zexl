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
