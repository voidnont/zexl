import { spawn } from 'node:child_process';

export const NEWPIPE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';

function runProcess(command, args, { maxStdout = 128 * 1024, maxStderr = 16 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.length > maxStdout) stdout = stdout.slice(-maxStdout);
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      if (stderr.length > maxStderr) stderr = stderr.slice(-maxStderr);
    });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

export async function resolveWithNewPipe(url, {
  resolverPath = process.env.NEWPIPE_RESOLVER_PATH || '/opt/zexl-newpipe/bin/zexl-newpipe'
} = {}) {
  try {
    const result = await runProcess(resolverPath, [url]);
    if (result.code !== 0) return null;
    const lines = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const value = JSON.parse(lines.at(-1) || '{}');
    if (!value || typeof value.streamUrl !== 'string' || !value.streamUrl.startsWith('http')) return null;
    return {
      title: String(value.title || 'audio'),
      streamUrl: value.streamUrl,
      duration: Number.isFinite(Number(value.duration)) ? Number(value.duration) : 0,
      bitrate: Number.isFinite(Number(value.bitrate)) ? Number(value.bitrate) : -1,
      format: value.format == null ? null : String(value.format)
    };
  } catch {
    return null;
  }
}

export function buildFfmpegArgs({ streamUrl, outputPath, format }) {
  const args = [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-user_agent', NEWPIPE_USER_AGENT,
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
