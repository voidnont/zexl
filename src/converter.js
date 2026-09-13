import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Helper to extract the 11-character YouTube Video ID
function extractVideoId(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/))([0-9A-Za-z_-]{11})/);
    return match ? match[1] : null;
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
        // Querying the official Piped instance API
        const pipedApiUrl = `https://pipedapi.kavin.rocks/streams/${videoId}`;
        const res = await fetch(pipedApiUrl);
        
        if (!res.ok) {
            throw new Error(`Piped API returned ${res.status} ${res.statusText}`);
        }
        
        const data = await res.json();
        
        if (!data.audioStreams || data.audioStreams.length === 0) {
            throw new Error('No audio streams found for this video via Piped.');
        }

        // Pick the highest bitrate audio stream provided by NewPipeExtractor
        const bestAudio = data.audioStreams.sort((a, b) => b.bitrate - a.bitrate)[0];
        const streamUrl = bestAudio.url;

        job.progress = 30;
        job.message = 'Downloading and converting stream...';

        const cleanFormat = ['mp3', 'flac', 'wav'].includes(String(format).toLowerCase()) 
            ? format.toLowerCase() 
            : 'mp3';

        const outputFile = path.join(outputDir, `${jobId}.${cleanFormat}`);
        
        // Feed the direct Piped stream URL directly into FFmpeg
        const args = [
            '-i', streamUrl, // Input direct URL
            '-vn',           // Strip any video data just in case
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
            
            // Basic FFmpeg progress sniffing
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
