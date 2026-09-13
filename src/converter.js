import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export function processConversion(job, jobId, url, format, quality, outputDir) {
    job.status = 'processing';
    job.progress = 20;
    job.message = 'Extracting and downloading stream...';

    const cleanFormat = ['mp3', 'flac', 'wav'].includes(String(format).toLowerCase()) 
        ? format.toLowerCase() 
        : 'mp3';

    const cookiePath = path.resolve(process.cwd(), 'cookies.txt');
    const hasCookies = fs.existsSync(cookiePath);

    const args = [
        '-f', 'bestaudio/best',
        '-x',
        '--audio-format', cleanFormat,
        '--audio-quality', quality === '320k' ? '0' : '5',
        '--extractor-args', 'youtube:player_client=android'
    ];

    if (hasCookies) {
        args.push('--cookies', cookiePath);
    }

    args.push(
        '-o', path.join(outputDir, `${jobId}.%(ext)s`),
        url
    );

    const ytdlp = spawn('yt-dlp', args);
    let stderrData = '';

    ytdlp.stdout.on('data', (data) => {
        const text = data.toString();
        if (text.includes('%')) {
            job.progress = 50;
            job.message = 'Converting media stream...';
        }
    });

    ytdlp.stderr.on('data', (data) => {
        stderrData += data.toString();
    });

    ytdlp.on('close', (code) => {
        if (code === 0) {
            const files = fs.readdirSync(outputDir);
            const generatedFile = files.find(f => f.startsWith(jobId));
            
            if (generatedFile) {
                job.status = 'completed';
                job.progress = 100;
                job.message = 'Conversion complete';
                job.downloadUrl = `/files/${generatedFile}`;
                job.filePath = path.join(outputDir, generatedFile);
            } else {
                job.status = 'failed';
                job.error = 'Output file missing after conversion process';
            }
        } else {
            job.status = 'failed';
            const cleanErr = stderrData.trim().split('\n').pop() || `Exit code ${code}`;
            job.error = cleanErr;
            console.error(`yt-dlp error for job ${jobId}:`, stderrData);
        }
    });
}
