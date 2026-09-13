import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

export async function processConversion(job, jobId, url, format, quality, outputDir) {
    job.status = 'processing';
    job.progress = 10;
    job.message = 'Requesting conversion from Cobalt API...';

    const cleanFormat = ['mp3', 'wav', 'ogg', 'opus'].includes(String(format).toLowerCase()) 
        ? format.toLowerCase() 
        : 'mp3';

    try {
        // 1. Ask Cobalt to process the media
        const response = await fetch('https://api.cobalt.tools/', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                // Mimic a standard browser to avoid Cobalt's basic bot filters
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({
                url: url,
                downloadMode: 'audio',
                audioFormat: cleanFormat,
                audioBitrate: quality === '320k' ? '320' : '128',
                filenameStyle: 'basic'
            })
        });

        if (!response.ok) {
            throw new Error(`Cobalt API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Cobalt returns a "status" of "error", "rate-limit", "tunnel", or "redirect"
        if (data.status === 'error' || data.status === 'rate-limit') {
            throw new Error(data.text || 'Cobalt API refused the request.');
        }

        if (!data.url) {
            throw new Error('Cobalt API did not return a valid download URL.');
        }

        job.progress = 50;
        job.message = 'Downloading converted file from Cobalt servers...';

        // 2. Download the finished audio file from Cobalt's tunnel/redirect URL
        const downloadRes = await fetch(data.url);
        if (!downloadRes.ok) {
            throw new Error(`Failed to download from Cobalt tunnel: ${downloadRes.status}`);
        }

        const outputFile = path.join(outputDir, `${jobId}.${cleanFormat}`);
        const fileStream = fs.createWriteStream(outputFile);
        
        // Stream the download directly to your Render disk
        await pipeline(downloadRes.body, fileStream);

        // 3. Complete the job
        job.status = 'completed';
        job.progress = 100;
        job.message = 'Conversion complete';
        job.downloadUrl = `/files/${jobId}.${cleanFormat}`;
        job.filePath = outputFile;

    } catch (err) {
        job.status = 'failed';
        job.error = err.message;
        console.error(`Cobalt API error for job ${jobId}:`, err);
    }
}
