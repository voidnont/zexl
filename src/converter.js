import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { classifyExtractorMessage, ExtractorError } from './extractor-errors.js';
import { extractYouTubeVideoId, resolveWithInnerTube } from './innertube.js';

const STREAM_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';

export function buildFfmpegArgs({ streamUrl, outputPath, format }) {
  const args = [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-user_agent', STREAM_USER_AGENT,
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-i', streamUrl,
    '-vn'
  ];
  if (format === 'mp3') args.push('-codec:a', 'libmp3lame', '-q:a', '0');
  else if (format === 'flac') args.push('-codec:a', 'flac');
  else if (format === 'wav') args.push('-codec:a', 'pcm_s16le');
  else throw new Error(`Unsupported audio format: ${format}`);
  args.push('-progress', 'pipe:1', '-nostats', outputPath);
  return args;
}

export function buildYtDlpArgs(url, format, outputDir, { cookiesPath = null, userAgent = null } = {}) {
  const args = [
    '--no-playlist', '--no-warnings', '--newline', '--js-runtimes', 'node', '--extract-audio',
    '--audio-format', format,
    '--progress-template', 'download:PROGRESS\t%(progress._percent_str)s',
    '--print', 'after_move:FILE\t%(filepath)s',
    '-o', path.join(outputDir, '%(title).180B [%(id)s].%(ext)s')
  ];
  if (format === 'mp3') args.push('--audio-quality', '0');
  if (cookiesPath) args.push('--cookies', cookiesPath);
  if (userAgent) args.push('--user-agent', userAgent);
  args.push(url);
  return args;
}

export function parseProgressLine(line) {
  if (line.startsWith('PROGRESS\t')) {
    const n = Number.parseFloat(line.slice(9).replace('%', '').trim());
    return Number.isFinite(n) ? { kind: 'progress', value: Math.max(0, Math.min(100, Math.round(n))) } : null;
  }
  if (line.startsWith('FILE\t')) return { kind: 'file', value: line.slice(5).trim() };
  return null;
}

export function safeDownloadName(title, format) {
  const base = String(title || 'audio').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 160) || 'audio';
  return `${base}.${format}`;
}

async function convertResolvedAudio({ resolved, format, jobDir, ffmpegPath, onProgress }) {
  const outputPath = path.join(jobDir, safeDownloadName(resolved.title, format));
  const args = buildFfmpegArgs({ streamUrl: resolved.streamUrl, outputPath, format });
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let buffer = '';
    const duration = Math.max(0, Number(resolved.duration) || 0);
    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const [key, raw = ''] = line.split('=', 2);
        if ((key === 'out_time_ms' || key === 'out_time_us') && duration > 0) {
          const micros = Number(raw);
          if (Number.isFinite(micros)) onProgress(Math.max(1, Math.min(99, Math.round((micros / 1_000_000 / duration) * 100))));
        } else if (key === 'progress' && raw === 'end') onProgress(100);
      }
    });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 12000) stderr = stderr.slice(-12000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.trim() || `ffmpeg exited with ${code}`)));
  });
  return outputPath;
}

export async function transcodeUploadedAudio({ inputPath, title = 'audio', format, jobDir, ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg', onProgress = () => {} }) {
  await fs.mkdir(jobDir, { recursive: true });
  const outputPath = path.join(jobDir, safeDownloadName(title, format));
  const codecArgs = format === 'mp3' ? ['-c:a', 'libmp3lame', '-q:a', '0'] : format === 'flac' ? ['-c:a', 'flac'] : ['-c:a', 'pcm_s16le'];
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-vn', ...codecArgs, '-progress', 'pipe:1', '-nostats', outputPath];
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); if (stdout.includes('progress=end')) onProgress(100); if (stdout.length > 12000) stdout = stdout.slice(-12000); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 12000) stderr = stderr.slice(-12000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.trim() || `ffmpeg exited with ${code}`)));
  });
  return outputPath;
}

export async function convertAudio({
  url,
  format,
  jobDir,
  auth = null,
  ytDlpPath = process.env.YTDLP_PATH || 'yt-dlp',
  ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg',
  resolveInnerTube = resolveWithInnerTube,
  onProgress = () => {}
}) {
  await fs.mkdir(jobDir, { recursive: true });

  if (!auth?.cookies && extractYouTubeVideoId(url)) {
    const resolved = await resolveInnerTube(url);
    if (resolved) {
      try {
        return await convertResolvedAudio({ resolved, format, jobDir, ffmpegPath, onProgress });
      } catch {
        onProgress(1);
      }
    }
  }

  const cookiesPath = auth?.cookies ? path.join(jobDir, '.session.cookies.txt') : null;
  if (cookiesPath) await fs.writeFile(cookiesPath, auth.cookies, { encoding: 'utf8', mode: 0o600 });
  const args = buildYtDlpArgs(url, format, jobDir, { cookiesPath, userAgent: auth?.userAgent || null });

  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      let filePath = '';
      const consume = chunk => {
        for (const line of chunk.toString().split(/\r?\n/)) {
          const record = parseProgressLine(line.trim());
          if (record?.kind === 'progress') onProgress(record.value);
          if (record?.kind === 'file') filePath = record.value;
        }
      };
      child.stdout.on('data', consume);
      child.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 12000) stderr = stderr.slice(-12000); });
      child.on('error', reject);
      child.on('close', async code => {
        if (code !== 0) {
          const message = stderr.trim() || `yt-dlp exited with ${code}`;
          return reject(new ExtractorError(classifyExtractorMessage(message), message, url));
        }
        if (!filePath) {
          const files = await fs.readdir(jobDir);
          const match = files.find(f => f.toLowerCase().endsWith(`.${format}`));
          if (match) filePath = path.join(jobDir, match);
        }
        if (!filePath) return reject(new Error('Conversion completed but no output file was found.'));
        resolve(filePath);
      });
    });
  } finally {
    if (cookiesPath) await fs.rm(cookiesPath, { force: true }).catch(() => {});
  }
}
