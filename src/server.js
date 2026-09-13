import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { processConversion } from './converter.js';
import { validateRequest } from './validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const OUTPUT_DIR = path.join(__dirname, '../downloads');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const jobs = new Map();

// Interactive Web Dashboard at the root URL
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Zexl Media Converter</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; max-width: 600px; margin: 50px auto; padding: 20px; }
                .card { background: #1e293b; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
                input, select, button { width: 100%; padding: 12px; margin-top: 10px; margin-bottom: 20px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: white; font-size: 16px; box-sizing: border-box; }
                button { background: #3b82f6; border: none; font-weight: bold; cursor: pointer; }
                button:hover { background: #2563eb; }
                #status { background: #0f172a; padding: 15px; border-radius: 6px; border: 1px solid #334155; font-family: monospace; min-height: 50px; white-space: pre-wrap; word-break: break-all; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>Zexl Media Converter</h2>
                <label>Media URL</label>
                <input type="text" id="url" placeholder="https://www.youtube.com/watch?v=...">
                
                <label>Format</label>
                <select id="format">
                    <option value="mp3">MP3</option>
                    <option value="flac">FLAC</option>
                    <option value="wav">WAV</option>
                </select>

                <button onclick="startConversion()">Convert Media</button>
                
                <h3>Status</h3>
                <div id="status">Idle...</div>
            </div>

            <script>
                async function startConversion() {
                    const url = document.getElementById('url').value;
                    const format = document.getElementById('format').value;
                    const statusDiv = id => document.getElementById('status').innerText = id;

                    if (!url) { alert('Please enter a URL'); return; }

                    statusDiv('Submitting job...');
                    
                    const res = await fetch('/api/convert', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url, format, quality: '320k' })
                    });
                    
                    const data = await res.json();
                    if (!data.jobId) {
                        statusDiv('Error: ' + JSON.stringify(data));
                        return;
                    }

                    const jobId = data.jobId;
                    statusDiv('Job queued. ID: ' + jobId);

                    const interval = setInterval(async () => {
                        const statusRes = await fetch('/api/jobs/' + jobId);
                        const job = await statusRes.json();
                        
                        statusDiv(\`[\${job.status.toUpperCase()}] \${job.progress}% - \${job.message}\`);

                        if (job.status === 'completed') {
                            clearInterval(interval);
                            statusDiv(\`Conversion complete!\\nDownload link:\\n\${job.downloadUrl}\`);
                            window.location.href = job.downloadUrl;
                        } else if (job.status === 'failed') {
                            clearInterval(interval);
                            statusDiv('Conversion failed: ' + job.error);
                        }
                    }, 3000);
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', activeJobs: jobs.size });
});

app.post('/api/convert', (req, res) => {
    const validation = validateRequest(req.body);
    if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
    }

    const { url, format = 'mp3', quality = '320k' } = req.body;
    const jobId = crypto.randomBytes(8).toString('hex');
    
    jobs.set(jobId, { status: 'queued', progress: 0, message: 'Queued for conversion', error: null, filePath: null });

    res.json({ jobId });

    processConversion(jobs.get(jobId), jobId, url, format, quality, OUTPUT_DIR);
});

app.get('/api/jobs/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

app.use('/files', express.static(OUTPUT_DIR));

app.listen(PORT, () => {
    console.log(`Zexl conversion service running on port ${PORT}`);
});