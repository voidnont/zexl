import fetch from 'node-fetch'; // Built-in global fetch in Node 18+, or use global fetch directly

const API_URL = process.env.RENDER_URL || 'http://localhost:3000';
const TEST_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Replace with any media URL

async function runTest() {
    console.log(`-> Starting conversion test against: ${API_URL}`);
    
    // 1. Trigger conversion
    const res = await fetch(`${API_URL}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: TEST_URL, format: 'mp3', quality: '320k' })
    });
    
    const data = await res.json();
    if (!data.jobId) {
        console.error('Failed to start job:', data);
        return;
    }
    
    const jobId = data.jobId;
    console.log(`-> Job queued successfully. Job ID: ${jobId}`);

    // 2. Poll for status
    const pollInterval = setInterval(async () => {
        try {
            const statusRes = await fetch(`${API_URL}/api/jobs/${jobId}`);
            const job = await statusRes.json();
            
            console.log(`[Status: ${job.status.toUpperCase()}] Progress: ${job.progress}% - ${job.message}`);

            if (job.status === 'completed') {
                clearInterval(pollInterval);
                console.log('\nSuccess! Download URL:');
                console.log(`${API_URL}${job.downloadUrl}`);
                process.exit(0);
            } else if (job.status === 'failed') {
                clearInterval(pollInterval);
                console.error('\nConversion failed:', job.error);
                process.exit(1);
            }
        } catch (err) {
            console.error('Polling error:', err.message);
        }
    }, 3000);
}

runTest();