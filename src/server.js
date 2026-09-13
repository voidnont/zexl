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

const PORT = process.env.PORT || 3000;
const OUTPUT_DIR = path.join(__dirname, '../downloads');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const jobs = new Map();

// Root route so the browser doesn't show "Cannot GET /"
app.get('/', (req, res) => {
    res.json({ name: 'Zexl Media Converter API', status: 'online', activeJobs: jobs.size });
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