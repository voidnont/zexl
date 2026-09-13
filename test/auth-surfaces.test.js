import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('web UI exposes optional cookie-session upload and sends auth only when selected', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const js = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="cookies"/);
  assert.match(html, /id="user-agent"/);
  assert.match(js, /cookieFile\.text\(\)/);
  assert.match(js, /payload\.auth/);
});

test('Android client exposes optional SessionAuth for authenticated conversions', async () => {
  const kotlin = await fs.readFile(new URL('../android-sample/app/src/main/java/tools/zexl/client/ConverterClient.kt', import.meta.url), 'utf8');
  assert.match(kotlin, /data class SessionAuth/);
  assert.match(kotlin, /auth: SessionAuth\? = null/);
  assert.match(kotlin, /put\("auth"/);
});
