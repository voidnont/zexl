import { classifyExtractorMessage, ExtractorError } from './extractor-errors.js';

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function extractYouTubeVideoId(input) {
  let url;
  try { url = new URL(input); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (!YT_HOSTS.has(host)) return null;
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/').filter(Boolean)[0] || null;
  } else if (url.pathname === '/watch') {
    id = url.searchParams.get('v');
  } else {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'shorts' || parts[0] === 'embed') id = parts[1] || null;
  }
  return VIDEO_ID.test(String(id || '')) ? id : null;
}

export function selectDirectAudioFormat(formats = []) {
  return formats
    .filter(item => String(item?.mimeType || '').startsWith('audio/') && typeof item?.url === 'string' && item.url.startsWith('https://'))
    .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0))[0] || null;
}

function extractConfig(html, key) {
  const match = String(html || '').match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
  return match?.[1] || null;
}

export async function resolveWithInnerTube(url, { fetchImpl = fetch } = {}) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  let watch;
  try {
    watch = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0' }
    });
  } catch {
    return null;
  }
  if (!watch?.ok) return null;
  const html = await watch.text();
  const apiKey = extractConfig(html, 'INNERTUBE_API_KEY');
  const clientVersion = extractConfig(html, 'INNERTUBE_CLIENT_VERSION');
  if (!apiKey || !clientVersion) return null;

  let response;
  try {
    response = await fetchImpl(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}&prettyPrint=false`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion, hl: 'en' } },
        videoId,
        contentCheckOk: false,
        racyCheckOk: false
      })
    });
  } catch {
    return null;
  }
  if (!response?.ok) return null;
  const data = await response.json();
  const status = String(data?.playabilityStatus?.status || '');
  if (status !== 'OK') {
    const message = String(data?.playabilityStatus?.reason || data?.playabilityStatus?.messages?.[0] || status || 'Extractor error');
    const code = classifyExtractorMessage(`${status} ${message}`);
    if (code !== 'extractor_error') throw new ExtractorError(code, message, url);
    return null;
  }

  const selected = selectDirectAudioFormat(data?.streamingData?.adaptiveFormats || []);
  if (!selected) return null;
  return {
    title: String(data?.videoDetails?.title || 'audio'),
    streamUrl: selected.url,
    duration: Number(data?.videoDetails?.lengthSeconds || 0) || 0,
    bitrate: Number(selected.bitrate || 0) || 0,
    mimeType: String(selected.mimeType || '')
  };
}
