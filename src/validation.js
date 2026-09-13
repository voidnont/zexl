import dns from 'node:dns/promises';
import net from 'node:net';

export function validateFormat(format) {
  const value = String(format || '').toLowerCase();
  if (!['mp3', 'flac', 'wav'].includes(value)) throw new Error('Unsupported format. Use mp3, flac, or wav.');
  return value;
}

export function isPrivateIp(ip) {
  if (!net.isIP(ip)) return true;
  if (ip === '::1' || ip === '0.0.0.0') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) return true;
  if (net.isIPv4(ip)) {
    const [a,b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return false;
}


export function validateSessionAuth(input) {
  if (input == null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Authentication must be an object.');

  const rawCookies = String(input.cookies || '');
  if (!rawCookies) throw new Error('A Netscape cookies file is required for authenticated sources.');
  if (Buffer.byteLength(rawCookies, 'utf8') > 256 * 1024) throw new Error('Cookie file is too large.');

  const cookies = rawCookies.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const firstLine = cookies.split('\n', 1)[0].trim();
  if (!['# Netscape HTTP Cookie File', '# HTTP Cookie File'].includes(firstLine)) {
    throw new Error('Cookies must use Netscape cookies.txt format.');
  }

  const rawUserAgent = input.userAgent == null ? '' : String(input.userAgent).trim();
  if (rawUserAgent.length > 512) throw new Error('User-Agent is too long.');

  return {
    cookies: cookies.endsWith('\n') ? cookies : `${cookies}\n`,
    userAgent: rawUserAgent || null
  };
}

export async function validateMediaUrl(input, lookup = async (host) => dns.lookup(host, { all: true })) {
  let url;
  try { url = new URL(String(input || '')); } catch { throw new Error('Invalid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are allowed.');
  if (!url.hostname || ['localhost', 'localhost.localdomain'].includes(url.hostname.toLowerCase())) throw new Error('Local/private URLs are not allowed.');
  if (net.isIP(url.hostname) && isPrivateIp(url.hostname)) throw new Error('Private network URLs are not allowed.');
  const records = await lookup(url.hostname);
  if (!records.length || records.some(r => isPrivateIp(r.address))) throw new Error('Private network URLs are not allowed.');
  return url.toString();
}
