package tools.zexl.client

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

enum class AudioFormat { MP3, FLAC, WAV }

data class ConversionJob(
    val id: String,
    val format: String,
    val status: String,
    val progress: Int,
    val error: String?,
    val title: String?,
    val downloadUrl: String?
)

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

    suspend fun startConversion(url: String, format: AudioFormat): ConversionJob = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("url", url)
            .put("format", format.name.lowercase(Locale.US))
            .toString()
        parseJob(request("/api/convert", "POST", body))
    }

    suspend fun getJob(id: String): ConversionJob = withContext(Dispatchers.IO) {
        parseJob(request("/api/jobs/$id", "GET", null))
    }

    suspend fun convertAndWait(
        url: String,
        format: AudioFormat,
        pollMs: Long = 1000,
        onUpdate: (ConversionJob) -> Unit = {}
    ): ConversionJob {
        warmUp()
        var job = startConversion(url, format)
        onUpdate(job)
        while (job.status != "ready" && job.status != "error") {
            delay(pollMs)
            job = getJob(job.id)
            onUpdate(job)
        }
        if (job.status == "error") throw IOException(job.error ?: "Conversion failed")
        return job
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
            title = o.optString("title").takeIf { it.isNotBlank() && it != "null" },
            downloadUrl = o.optString("downloadUrl").takeIf { it.isNotBlank() && it != "null" }
        )
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
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                val message = runCatching { JSONObject(text).optString("error") }.getOrNull()
                throw IOException(message?.takeIf { it.isNotBlank() } ?: "HTTP $status")
            }
            return text
        } finally {
            connection.disconnect()
        }
    }
}
