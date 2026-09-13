import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export function buildYtDlpArgs(url, format, outputDir) {
  const args = [
    '--no-playlist', '--no-warnings', '--newline', '--extract-audio',
    '--audio-format', format,
    '--progress-template', 'download:PROGRESS\t%(progress._percent_str)s',
    '--print', 'after_move:FILE\t%(filepath)s',
    '-o', path.join(outputDir, '%(title).180B [%(id)s].%(ext)s')
  ];
  if (format === 'mp3') args.push('--audio-quality', '0');
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

export async function convertAudio({ url, format, jobDir, onProgress = () => {} }) {
  await fs.mkdir(jobDir, { recursive: true });
  const args = buildYtDlpArgs(url, format, jobDir);
  return await new Promise((resolve, reject) => {
    const child = spawn(process.env.YTDLP_PATH || 'yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
      if (code !== 0) return reject(new Error(stderr.trim() || `yt-dlp exited with ${code}`));
      if (!filePath) {
        const files = await fs.readdir(jobDir);
        const match = files.find(f => f.toLowerCase().endsWith(`.${format}`));
        if (match) filePath = path.join(jobDir, match);
      }
      if (!filePath) return reject(new Error('Conversion completed but no output file was found.'));
      resolve(filePath);
    });
  });
}
