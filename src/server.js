import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateFormat, validateMediaUrl } from './validation.js';
import { convertAudio, safeDownloadName } from './converter.js';
import { JobStore } from './jobs.js';
import { TaskQueue } from './queue.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../public');
const defaultJobs = new JobStore({ ttlMs: Number(process.env.JOB_TTL_MS || 15 * 60 * 1000) });
const defaultQueue = new TaskQueue(Number(process.env.MAX_CONCURRENT_JOBS || 1));

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav'
};

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

function cors(req, res) {
  const origin = process.env.CORS_ORIGIN || '*';
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,authorization');
}

function authorized(req) {
  const expected = process.env.CONVERTER_API_KEY;
  if (!expected) return true;
  return req.headers.authorization === `Bearer ${expected}`;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32 * 1024) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new Error('Invalid JSON body.'); }
}

async function serveStatic(urlPath, res) {
  const table = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/app.js': 'app.js',
    '/style.css': 'style.css',
    '/favicon.svg': 'favicon.svg'
  };
  const file = table[urlPath];
  if (!file) return false;
  const full = path.join(publicDir, file);
  try {
    const stat = await fsp.stat(full);
    res.writeHead(200, {
      'content-type': mime[path.extname(full)] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': file === 'index.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(full).pipe(res);
    return true;
  } catch {
    return false;
  }
}

function scheduleCleanup(jobDir, store, id) {
  const ttl = store.ttlMs || 15 * 60 * 1000;
  const timer = setTimeout(async () => {
    store.delete(id);
    await fsp.rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }, ttl + 1000);
  timer.unref?.();
}

export function createAppServer({
  validateUrl = validateMediaUrl,
  convert = convertAudio,
  jobs = defaultJobs,
  queue = defaultQueue
} = {}) {
  return http.createServer(async (req, res) => {
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = requestUrl.pathname;

    try {
      if (req.method === 'GET' && pathname === '/health') return json(res, 200, { ok: true });

      if (pathname.startsWith('/api/') && !authorized(req)) return json(res, 401, { error: 'Unauthorized.' });

      if (req.method === 'POST' && pathname === '/api/convert') {
        const body = await readJson(req);
        const format = validateFormat(body.format);
        const url = await validateUrl(body.url);
        const job = jobs.create({ url, format });
        const jobDir = path.join(os.tmpdir(), 'zexl', job.id);
        scheduleCleanup(jobDir, jobs, job.id);

        queueMicrotask(() => {
          queue.add(async () => {
            try {
              jobs.update(job.id, { status: 'converting', progress: 1 });
              const filePath = await convert({
                url,
                format,
                jobDir,
                onProgress: progress => jobs.update(job.id, { progress })
              });
              const ext = path.extname(filePath);
              const title = path.basename(filePath, ext).replace(/\s+\[[^\]]+\]$/, '');
              jobs.update(job.id, { status: 'ready', progress: 100, filePath, title });
            } catch (error) {
              jobs.update(job.id, {
                status: 'error',
                error: String(error?.message || error).slice(0, 1200)
              });
            }
          }).catch(() => {});
        });

        return json(res, 202, jobs.public(job.id));
      }

      const jobMatch = pathname.match(/^\/api\/jobs\/([a-zA-Z0-9-]+)$/);
      if (req.method === 'GET' && jobMatch) {
        const job = jobs.public(jobMatch[1]);
        return job ? json(res, 200, job) : json(res, 404, { error: 'Job not found or expired.' });
      }

      const fileMatch = pathname.match(/^\/api\/jobs\/([a-zA-Z0-9-]+)\/file$/);
      if (req.method === 'GET' && fileMatch) {
        const job = jobs.get(fileMatch[1]);
        if (!job) return json(res, 404, { error: 'Job not found or expired.' });
        if (job.status !== 'ready' || !job.filePath) return json(res, 409, { error: 'File is not ready yet.' });
        let stat;
        try { stat = await fsp.stat(job.filePath); }
        catch { return json(res, 410, { error: 'Converted file has expired.' }); }
        const filename = safeDownloadName(job.title, job.format);
        res.writeHead(200, {
          'content-type': mime[path.extname(job.filePath).toLowerCase()] || 'application/octet-stream',
          'content-length': stat.size,
          'content-disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
          'cache-control': 'private, no-store'
        });
        return fs.createReadStream(job.filePath).pipe(res);
      }

      if (req.method === 'GET' && await serveStatic(pathname, res)) return;
      json(res, 404, { error: 'Not found.' });
    } catch (error) {
      json(res, 400, { error: String(error?.message || error) });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createAppServer().listen(port, '0.0.0.0', () => {
    console.log(`zexl listening on :${port}`);
  });
}
