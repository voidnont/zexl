package tools.zexl.newpipe;

import org.schabi.newpipe.extractor.MediaFormat;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamInfo;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.GZIPInputStream;
import java.util.zip.InflaterInputStream;

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
        private static final Set<String> RESTRICTED_HEADERS = Set.of(
                "connection", "content-length", "expect", "host", "upgrade"
        );

        private final HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(20))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();

        @Override
        public Response execute(final Request request) throws IOException {
            try {
                final HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(request.url()))
                        .timeout(Duration.ofSeconds(40));

                boolean hasUserAgent = false;
                for (final Map.Entry<String, List<String>> entry : request.headers().entrySet()) {
                    if (entry.getKey() == null) {
                        continue;
                    }
                    final String lower = entry.getKey().toLowerCase(Locale.ROOT);
                    if (RESTRICTED_HEADERS.contains(lower)) {
                        continue;
                    }
                    if (lower.equals("user-agent")) {
                        hasUserAgent = true;
                    }
                    for (final String value : entry.getValue()) {
                        builder.header(entry.getKey(), value);
                    }
                }
                if (!hasUserAgent) {
                    builder.header("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                            + "(KHTML, like Gecko) Chrome/140.0 Safari/537.36");
                }

                final byte[] body = request.dataToSend();
                final HttpRequest.BodyPublisher publisher = body == null
                        ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofByteArray(body);
                builder.method(request.httpMethod(), publisher);

                final HttpResponse<byte[]> httpResponse = client.send(
                        builder.build(), HttpResponse.BodyHandlers.ofByteArray());
                final byte[] decoded = decodeBody(
                        httpResponse.body(), httpResponse.headers().firstValue("content-encoding").orElse(""));
                final String responseBody = request.httpMethod().equalsIgnoreCase("HEAD")
                        ? ""
                        : new String(decoded, StandardCharsets.UTF_8);

                return new Response(
                        httpResponse.statusCode(),
                        Integer.toString(httpResponse.statusCode()),
                        httpResponse.headers().map(),
                        responseBody,
                        httpResponse.uri().toString()
                );
            } catch (final InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IOException("request interrupted", interrupted);
            } catch (final IllegalArgumentException invalidRequest) {
                throw new IOException("invalid upstream request", invalidRequest);
            }
        }

        private static byte[] decodeBody(final byte[] body, final String encoding) throws IOException {
            if (body == null || body.length == 0) {
                return new byte[0];
            }
            final String normalized = encoding.toLowerCase(Locale.ROOT);
            if (!normalized.contains("gzip") && !normalized.contains("deflate")) {
                return body;
            }
            try (ByteArrayInputStream input = new ByteArrayInputStream(body);
                 ByteArrayOutputStream output = new ByteArrayOutputStream();
                 var decoded = normalized.contains("gzip")
                         ? new GZIPInputStream(input)
                         : new InflaterInputStream(input)) {
                decoded.transferTo(output);
                return output.toByteArray();
            }
        }
    }
}
