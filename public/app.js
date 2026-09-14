const form = document.querySelector('#convert-form');
const button = document.querySelector('#convert');
const statusBox = document.querySelector('#status');
const title = document.querySelector('#status-title');
const percent = document.querySelector('#percent');
const bar = document.querySelector('#bar');
const message = document.querySelector('#status-message');
const download = document.querySelector('#download');
const challengeActions = document.querySelector('#challenge-actions');
const openSource = document.querySelector('#open-source');
const retry = document.querySelector('#retry');
const glassCard = document.querySelector('#glass-card');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ACTIONABLE = new Set(['login_required', 'captcha_required', 'consent_required', 'age_check']);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function setStatus(label, progress, text, state = 'working') {
  statusBox.hidden = false;
  statusBox.dataset.state = state;
  title.textContent = label;
  percent.textContent = `${Math.max(0, Math.min(100, progress))}%`;
  bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  message.textContent = text;
}

function setBusy(busy) {
  button.disabled = busy;
  button.dataset.state = busy ? 'busy' : 'idle';
}

function clearChallenge() {
  challengeActions.hidden = true;
  openSource.removeAttribute('href');
}

function setChallenge(job) {
  const show = ACTIONABLE.has(job.errorCode) && Boolean(job.sourceUrl);
  challengeActions.hidden = !show;
  if (show) openSource.href = job.sourceUrl;
  else openSource.removeAttribute('href');
}

async function jsonRequest(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

retry.addEventListener('click', () => form.requestSubmit());

if (glassCard && !prefersReducedMotion && matchMedia('(pointer:fine)').matches) {
  glassCard.addEventListener('pointermove', event => {
    const rect = glassCard.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    glassCard.style.setProperty('--mx', `${x * 100}%`);
    glassCard.style.setProperty('--my', `${y * 100}%`);
    glassCard.style.setProperty('--rx', `${(0.5 - y) * 1.35}deg`);
    glassCard.style.setProperty('--ry', `${(x - 0.5) * 1.35}deg`);
  });
  glassCard.addEventListener('pointerleave', () => {
    glassCard.style.setProperty('--mx', '50%');
    glassCard.style.setProperty('--my', '10%');
    glassCard.style.setProperty('--rx', '0deg');
    glassCard.style.setProperty('--ry', '0deg');
  });
}

document.querySelectorAll('input[name="format"]').forEach(input => {
  input.addEventListener('change', () => {
    if (navigator.vibrate) navigator.vibrate(8);
  });
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  setBusy(true);
  clearChallenge();
  download.hidden = true;
  download.removeAttribute('href');
  const url = document.querySelector('#url').value.trim();
  const format = new FormData(form).get('format');

  try {
    setStatus('connecting', 0, 'Waking the hosted converter…');
    await jsonRequest('/health');
    setStatus('queued', 2, 'Creating your conversion job…');

    const payload = { url, format };
    const cookieFile = document.querySelector('#cookies').files[0];
    if (cookieFile) {
      if (cookieFile.size > 256 * 1024) throw new Error('cookies.txt is too large (256 KB max).');
      const cookies = await cookieFile.text();
      payload.auth = {
        cookies,
        userAgent: document.querySelector('#user-agent').value.trim() || navigator.userAgent
      };
    }

    let job = await jsonRequest('/api/convert', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    while (!['ready', 'error'].includes(job.status)) {
      const progress = Math.max(2, Number(job.progress || 2));
      const label = job.status === 'queued' ? 'in queue' : 'converting';
      const copy = job.status === 'queued'
        ? 'Waiting for the converter slot…'
        : 'Extracting the source audio and shaping your file…';
      setStatus(label, progress, copy);
      await sleep(900);
      job = await jsonRequest(`/api/jobs/${job.id}`);
    }

    if (job.status === 'error') {
      setChallenge(job);
      throw new Error(job.error || 'Conversion failed.');
    }
    clearChallenge();
    setStatus(job.title || 'ready', 100, `Your ${String(format).toUpperCase()} file is ready.`, 'ready');
    download.href = job.downloadUrl;
    download.querySelector('span').textContent = `download ${String(format).toUpperCase()}`;
    download.hidden = false;
    if (navigator.vibrate) navigator.vibrate([18, 24, 30]);
  } catch (error) {
    setStatus('couldn’t convert', 0, error.message || String(error), 'error');
  } finally {
    setBusy(false);
  }
});
