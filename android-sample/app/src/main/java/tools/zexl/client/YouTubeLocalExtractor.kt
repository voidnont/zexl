package tools.zexl.client

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.StreamInfo
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.URI
import java.util.UUID


data class LocalAudioSource(
    val file: File,
    val title: String
)

object YouTubeLocalExtractor {
    @Volatile
    private var initialized = false

    fun isYouTubeUrl(url: String): Boolean = runCatching {
        val host = URI(url.trim()).host?.lowercase()?.removePrefix("www.") ?: return@runCatching false
        host == "youtu.be" || host == "youtube.com" || host.endsWith(".youtube.com")
    }.getOrDefault(false)

    private fun ensureInitialized() {
        if (initialized) return
        synchronized(this) {
            if (!initialized) {
                NewPipe.init(NewPipeDownloader.shared)
                initialized = true
            }
        }
    }

    private fun streamScore(stream: AudioStream): Int {
        val average = stream.getAverageBitrate()
        if (average > 0) return average
        val bitrate = stream.getBitrate()
        return if (bitrate > 0) bitrate else 0
    }

    suspend fun downloadBestAudio(
        context: Context,
        url: String,
        onProgress: (Int) -> Unit = {}
    ): LocalAudioSource = withContext(Dispatchers.IO) {
        require(isYouTubeUrl(url)) { "Not a YouTube URL." }
        ensureInitialized()
        onProgress(1)

        val info = StreamInfo.getInfo(url)
        val best = info.audioStreams
            .filter { it.isUrl && it.getContent().startsWith("http", ignoreCase = true) }
            .maxByOrNull(::streamScore)
            ?: throw IOException("No downloadable public YouTube audio stream was found.")

        val title = info.name.ifBlank { "YouTube audio" }
        val suffix = runCatching { best.getFormat()?.getSuffix() }
            .getOrNull()
            ?.takeIf { it.matches(Regex("[A-Za-z0-9]{1,8}")) }
            ?: "media"
        val dir = File(context.cacheDir, "zexl-youtube").apply { mkdirs() }
        val safeTitle = title.replace(Regex("[\\/:*?\"<>|]"), "_").take(80).ifBlank { "youtube-audio" }
        val target = File(dir, "$safeTitle-${UUID.randomUUID()}.$suffix")

        val request = Request.Builder()
            .url(best.getContent())
            .header("User-Agent", NewPipeDownloader.USER_AGENT)
            .header("Accept-Encoding", "identity")
            .build()

        try {
            NewPipeDownloader.shared.httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    throw IOException("YouTube audio download failed with HTTP ${response.code}.")
                }
                val body = response.body ?: throw IOException("YouTube returned an empty audio body.")
                val total = body.contentLength()
                var copied = 0L
                body.byteStream().use { input ->
                    FileOutputStream(target).buffered().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            output.write(buffer, 0, read)
                            copied += read
                            if (total > 0) {
                                val progress = ((copied * 100L) / total).toInt().coerceIn(1, 99)
                                onProgress(progress)
                            }
                        }
                    }
                }
            }
            if (!target.exists() || target.length() == 0L) {
                throw IOException("YouTube audio download produced an empty file.")
            }
            onProgress(100)
            LocalAudioSource(target, title)
        } catch (error: Throwable) {
            target.delete()
            throw error
        }
    }
}
