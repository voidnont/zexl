package tools.zexl.client

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Locale

enum class AudioFormat { MP3, FLAC, WAV }

data class SessionAuth(val cookies: String, val userAgent: String? = null)
data class LocalAudioSource(val file: File, val title: String)

data class ConversionJob(
    val id: String,
    val format: String,
    val status: String,
    val progress: Int,
    val error: String?,
    val errorCode: String?,
    val sourceUrl: String?,
    val title: String?,
    val downloadUrl: String?
)

class ConversionFailedException(val job: ConversionJob) : IOException(job.error ?: "Conversion failed")

class ConverterClient(
    baseUrl: String,
    private val apiKey: String? = null
) {
    private val baseUrl = baseUrl.trimEnd('/')

    suspend fun warmUp(maxAttempts: Int = 3) = withContext(Dispatchers.IO) {
        var lastError: Throwable? = null
        repeat(maxAttempts) { attempt ->
            try {
                request("/health", "GET", null)
                return@withContext
            } catch (e: Throwable) {
                lastError = e
                if (attempt < maxAttempts - 1) delay(2500L * (attempt + 1))
            }
        }
        throw IOException("Converter could not wake up", lastError)
    }

    suspend fun startConversion(
        url: String,
        format: AudioFormat,
        auth: SessionAuth? = null
    ): ConversionJob = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("url", url)
            .put("format", format.name.lowercase(Locale.US))
        auth?.let { session ->
            body.put(
                "auth",
                JSONObject()
                    .put("cookies", session.cookies)
                    .put("userAgent", session.userAgent)
            )
        }
        parseJob(request("/api/convert", "POST", body.toString()))
    }

    suspend fun startUploadedConversion(
        source: LocalAudioSource,
        format: AudioFormat,
        onUploadProgress: (Int) -> Unit = {}
    ): ConversionJob = withContext(Dispatchers.IO) {
        val encodedTitle = URLEncoder.encode(source.title, StandardCharsets.UTF_8.name())
        val formatName = format.name.lowercase(Locale.US)
        val connection = URL("$baseUrl/api/transcode?format=$formatName&title=$encodedTitle")
            .openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 90_000
            connection.readTimeout = 90_000
            connection.doOutput = true
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/octet-stream")
            apiKey?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            val total = source.file.length()
            require(total > 0) { "Local audio source is empty." }
            connection.setFixedLengthStreamingMode(total)

            source.file.inputStream().buffered().use { input ->
                connection.outputStream.buffered().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var sent = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        sent += read
                        onUploadProgress(((sent * 100L) / total).toInt().coerceIn(1, 100))
                    }
                }
            }

            parseJob(readResponse(connection))
        } finally {
            connection.disconnect()
        }
    }

    suspend fun getJob(id: String): ConversionJob = withContext(Dispatchers.IO) {
        parseJob(request("/api/jobs/$id", "GET", null))
    }

    private suspend fun waitForJob(
        initial: ConversionJob,
        pollMs: Long,
        onUpdate: (ConversionJob) -> Unit
    ): ConversionJob {
        var job = initial
        onUpdate(job)
        while (job.status != "ready" && job.status != "error") {
            delay(pollMs)
            job = getJob(job.id)
            onUpdate(job)
        }
        if (job.status == "error") throw ConversionFailedException(job)
        return job
    }

    suspend fun convertAndWait(
        url: String,
        format: AudioFormat,
        pollMs: Long = 1000,
        auth: SessionAuth? = null,
        onUpdate: (ConversionJob) -> Unit = {}
    ): ConversionJob {
        warmUp()
        return waitForJob(startConversion(url, format, auth), pollMs, onUpdate)
    }

    suspend fun convertSmart(
        context: Context,
        url: String,
        format: AudioFormat,
        pollMs: Long = 1000,
        auth: SessionAuth? = null,
        onUpdate: (ConversionJob) -> Unit = {}
    ): ConversionJob {
        context.applicationContext
        return convertAndWait(url, format, pollMs, auth, onUpdate)
    }

    fun absoluteDownloadUrl(job: ConversionJob): String {
        val relative = requireNotNull(job.downloadUrl) { "Job is not ready" }
        return if (relative.startsWith("http")) relative else "$baseUrl$relative"
    }

    fun enqueueDownload(context: Context, job: ConversionJob): Long {
        val format = job.format.lowercase(Locale.US)
        val title = (job.title ?: "audio").replace(Regex("[\\/:*?\"<>|]"), "_")
        val request = DownloadManager.Request(Uri.parse(absoluteDownloadUrl(job)))
            .setTitle("$title.$format")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "$title.$format")
        apiKey?.let { request.addRequestHeader("Authorization", "Bearer $it") }
        return (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
    }

    private fun parseJob(raw: String): ConversionJob {
        val o = JSONObject(raw)
        return ConversionJob(
            id = o.getString("id"),
            format = o.getString("format"),
            status = o.getString("status"),
            progress = o.optInt("progress", 0),
            error = o.optString("error").takeIf { it.isNotBlank() && it != "null" },
            errorCode = o.optString("errorCode").takeIf { it.isNotBlank() && it != "null" },
            sourceUrl = o.optString("sourceUrl").takeIf { it.isNotBlank() && it != "null" },
            title = o.optString("title").takeIf { it.isNotBlank() && it != "null" },
            downloadUrl = o.optString("downloadUrl").takeIf { it.isNotBlank() && it != "null" }
        )
    }

    private fun readResponse(connection: HttpURLConnection): String {
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        if (status !in 200..299) {
            val message = runCatching { JSONObject(text).optString("error") }.getOrNull()
            throw IOException(message?.takeIf { it.isNotBlank() } ?: "HTTP $status")
        }
        return text
    }

    private fun request(path: String, method: String, body: String?): String {
        val connection = URL("$baseUrl$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 90_000
            connection.readTimeout = 90_000
            connection.setRequestProperty("Accept", "application/json")
            apiKey?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toByteArray()) }
            }
            return readResponse(connection)
        } finally {
            connection.disconnect()
        }
    }
}
