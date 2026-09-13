import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Helper to extract the 11-character YouTube Video ID
function extractVideoId(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/))([0-9A-Za-z_-]{11})/);
    return match ? match[1] : null;
}

// A list of public Piped API instances
const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.syncpundit.io',
    'https://pipedapi.adminforge.de',
    'https://api.piped.privacydev.net'
];

async function fetchStreamFromPiped(videoId) {
    for (const baseUrl of PIPED_INSTANCES) {
        try {
            console.log(`Trying Piped API: ${baseUrl}`);
            const res = await fetch(`${baseUrl}/streams/${videoId}`);
            
            if (res.ok) {
                const data = await res.json();
                if (data.audioStreams && data.audioStreams.length > 0) {
                    return data.audioStreams.sort((a, b) => b.bitrate - a.bitrate)[0].url;
                }
            }
        } catch (err) {
            console.log(`Failed to reach ${baseUrl}, trying next...`);
        }
    }
    throw new Error('All public Piped instances failed to return a valid stream.');
}

export async function processConversion(job, jobId, url, format, quality, outputDir) {
    job.status = 'processing';
    job.progress = 10;
    job.message = 'Fetching stream metadata from Piped API...';

    const videoId = extractVideoId(url);
    if (!videoId) {
        job.status = 'failed';
        job.error = 'Invalid YouTube URL provided.';
        return;
    }

    try {
        const streamUrl = await fetchStreamFromPiped(videoId);

        job.progress = 30;
        job.message = 'Downloading and converting stream...';

        const cleanFormat = ['mp3', 'flac', 'wav'].includes(String(format).toLowerCase()) 
            ? format.toLowerCase() 
            : 'mp3';

        const outputFile = path.join(outputDir, `${jobId}.${cleanFormat}`);
        
        const args = [
            '-i', streamUrl,
            '-vn',
        ];

        if (cleanFormat === 'mp3') {
            args.push('-q:a', quality === '320k' ? '0' : '5');
        } else if (cleanFormat === 'flac') {
            args.push('-compression_level', '5');
        }

        args.push('-y', outputFile); 

        const ffmpegProcess = spawn('ffmpeg', args);
        let stderrData = '';

        ffmpegProcess.stderr.on('data', (data) => {
            const text = data.toString();
            stderrData += text;
            if (text.includes('time=')) {
                job.progress = 60;
                job.message = 'Converting media format...';
            }
        });

        ffmpegProcess.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputFile)) {
                job.status = 'completed';
                job.progress = 100;
                job.message = 'Conversion complete';
                job.downloadUrl = `/files/${jobId}.${cleanFormat}`;
                job.filePath = outputFile;
            } else {
                job.status = 'failed';
                const cleanErr = stderrData.trim().split('\n').pop() || `Exit code ${code}`;
                job.error = `FFmpeg error: ${cleanErr}`;
                console.error(`FFmpeg error for job ${jobId}:`, stderrData);
            }
        });

    } catch (err) {
        job.status = 'failed';
        job.error = err.message;
        console.error(`Piped API error for job ${jobId}:`, err);
    }
}
