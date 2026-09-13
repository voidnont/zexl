package tools.zexl.client

import okhttp3.CompressionInterceptor
import okhttp3.Gzip
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.brotli.Brotli
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import java.io.IOException
import java.util.concurrent.TimeUnit

class NewPipeDownloader : Downloader() {
    companion object {
        const val USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0"

        val shared = NewPipeDownloader()
    }

    internal val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .addInterceptor(CompressionInterceptor(Brotli, Gzip))
        .build()

    @Throws(IOException::class, ReCaptchaException::class)
    override fun execute(request: Request): Response {
        val method = request.httpMethod()
        val data = request.dataToSend()
        val needsBody = method.equals("POST", true) ||
            method.equals("PUT", true) || method.equals("PATCH", true)
        val requestBody = when {
            data != null -> data.toRequestBody(null)
            needsBody -> ByteArray(0).toRequestBody("application/octet-stream".toMediaTypeOrNull())
            else -> null
        }

        val builder = okhttp3.Request.Builder()
            .url(request.url())
            .method(method, requestBody)
            .header("User-Agent", USER_AGENT)

        request.headers().forEach { (name, values) ->
            builder.removeHeader(name)
            values.forEach { value -> builder.addHeader(name, value) }
        }

        httpClient.newCall(builder.build()).execute().use { response ->
            if (response.code == 429) {
                throw ReCaptchaException("reCaptcha challenge requested", request.url())
            }
            val body = response.body?.string().orEmpty()
            return Response(
                response.code,
                response.message,
                response.headers.toMultimap(),
                body,
                response.request.url.toString()
            )
        }
    }
}
