const form = document.querySelector('#convert-form');
const button = document.querySelector('#convert');
const statusBox = document.querySelector('#status');
const title = document.querySelector('#status-title');
const percent = document.querySelector('#percent');
const bar = document.querySelector('#bar');
const message = document.querySelector('#status-message');
const download = document.querySelector('#download');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function setStatus(label, progress, text) {
  statusBox.hidden = false;
  title.textContent = label;
  percent.textContent = `${progress}%`;
  bar.style.width = `${progress}%`;
  message.textContent = text;
}

async function jsonRequest(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  download.hidden = true;
  download.removeAttribute('href');
  const url = document.querySelector('#url').value.trim();
  const format = new FormData(form).get('format');

  try {
    setStatus('connecting', 0, 'Contacting the converter…');
    await jsonRequest('/health');
    setStatus('queued', 1, 'Creating conversion job…');
    let job = await jsonRequest('/api/convert', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, format })
    });

    while (!['ready', 'error'].includes(job.status)) {
      const p = Number(job.progress || 1);
      setStatus('converting', p, 'Downloading the source audio and converting it…');
      await sleep(1000);
      job = await jsonRequest(`/api/jobs/${job.id}`);
    }

    if (job.status === 'error') throw new Error(job.error || 'Conversion failed.');
    setStatus(job.title || 'ready', 100, `Your ${String(format).toUpperCase()} file is ready.`);
    download.href = job.downloadUrl;
    download.textContent = `download ${String(format).toUpperCase()}`;
    download.hidden = false;
  } catch (error) {
    setStatus('couldn’t convert', 0, error.message || String(error));
  } finally {
    button.disabled = false;
  }
});
