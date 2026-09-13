package tools.zexl.newpipe;

import org.schabi.newpipe.extractor.MediaFormat;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamInfo;

import java.io.IOException;
import java.util.Comparator;
import java.util.Locale;

public final class Main {
    private Main() {
    }

    public static void main(final String[] args) {
        if (args.length != 1 || args[0].isBlank()) {
            System.err.println("usage: zexl-newpipe <url>");
            System.exit(64);
        }

        try {
            NewPipe.init(new JavaHttpDownloader());
            final StreamInfo info = StreamInfo.getInfo(args[0]);
            final AudioStream best = info.getAudioStreams().stream()
                    .filter(AudioStream::isUrl)
                    .max(Comparator.comparingLong(Main::bitrateScore))
                    .orElseThrow(() -> new IllegalStateException("No direct audio stream found"));

            final MediaFormat mediaFormat = best.getFormat();
            final String json = "{"
                    + "\"title\":\"" + jsonEscape(info.getName()) + "\","
                    + "\"streamUrl\":\"" + jsonEscape(best.getContent()) + "\","
                    + "\"duration\":" + Math.max(0L, info.getDuration()) + ","
                    + "\"bitrate\":" + bitrateScore(best) + ","
                    + "\"format\":" + (mediaFormat == null
                    ? "null"
                    : "\"" + jsonEscape(mediaFormat.name()) + "\"")
                    + "}";
            System.out.println(json);
        } catch (final Exception error) {
            System.err.println(error.getClass().getSimpleName() + ": " + safeMessage(error));
            System.exit(2);
        }
    }

    private static long bitrateScore(final AudioStream stream) {
        final long average = stream.getAverageBitrate() > 0
                ? (long) stream.getAverageBitrate() * 1000L
                : -1L;
        final long raw = stream.getBitrate() > 0 ? stream.getBitrate() : -1L;
        return Math.max(average, raw);
    }

    private static String safeMessage(final Throwable error) {
        final String message = error.getMessage();
        if (message == null || message.isBlank()) {
            return "extraction failed";
        }
        return message.replace('\n', ' ').replace('\r', ' ');
    }

    private static String jsonEscape(final String value) {
        if (value == null) {
            return "";
        }
        final StringBuilder out = new StringBuilder(value.length() + 16);
        for (int i = 0; i < value.length(); i++) {
            final char c = value.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        return out.toString();
    }

    private static final class JavaHttpDownloader extends Downloader {
        private static final String USER_AGENT =
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";

        private final okhttp3.OkHttpClient client = new okhttp3.OkHttpClient.Builder()
                .readTimeout(40, java.util.concurrent.TimeUnit.SECONDS)
                .connectTimeout(20, java.util.concurrent.TimeUnit.SECONDS)
                .followRedirects(true)
                .followSslRedirects(true)
                .addInterceptor(new okhttp3.CompressionInterceptor(
                        okhttp3.brotli.Brotli.INSTANCE,
                        okhttp3.Gzip.INSTANCE))
                .build();

        @Override
        public Response execute(final Request request)
                throws IOException, org.schabi.newpipe.extractor.exceptions.ReCaptchaException {
            okhttp3.RequestBody requestBody = null;
            final byte[] dataToSend = request.dataToSend();
            if (dataToSend != null) {
                requestBody = okhttp3.RequestBody.create(dataToSend);
            }

            final okhttp3.Request.Builder requestBuilder = new okhttp3.Request.Builder()
                    .method(request.httpMethod(), requestBody)
                    .url(request.url())
                    .addHeader("User-Agent", USER_AGENT);

            request.headers().forEach((headerName, values) -> {
                if (headerName == null) {
                    return;
                }
                requestBuilder.removeHeader(headerName);
                values.forEach(value -> requestBuilder.addHeader(headerName, value));
            });

            try (okhttp3.Response response = client.newCall(requestBuilder.build()).execute()) {
                if (response.code() == 429) {
                    throw new org.schabi.newpipe.extractor.exceptions.ReCaptchaException(
                            "YouTube requested a verification challenge", request.url());
                }

                String body = "";
                final okhttp3.ResponseBody responseBody = response.body();
                if (responseBody != null && !request.httpMethod().equalsIgnoreCase("HEAD")) {
                    body = responseBody.string();
                }

                return new Response(
                        response.code(),
                        response.message(),
                        response.headers().toMultimap(),
                        body,
                        response.request().url().toString()
                );
            }
        }
    }
}
