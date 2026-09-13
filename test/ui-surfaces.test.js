import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('web UI includes liquid-glass layers, animated state hooks, and reduced-motion fallback', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = await fs.readFile(new URL('../public/style.css', import.meta.url), 'utf8');
  const js = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.match(html, /class="ambient"/);
  assert.match(html, /class="glass-card/);
  assert.match(html, /class="format-option/);
  assert.match(css, /backdrop-filter:\s*blur/);
  assert.match(css, /@keyframes\s+float/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(js, /dataset\.state/);
  assert.match(js, /pointermove/);
});

test('Android sample includes animated glass surfaces and spring-driven format selection', async () => {
  const kotlin = await fs.readFile(new URL('../android-sample/app/src/main/java/tools/zexl/demo/MainActivity.kt', import.meta.url), 'utf8');

  assert.match(kotlin, /GlassPanel/);
  assert.match(kotlin, /rememberInfiniteTransition/);
  assert.match(kotlin, /spring\(/);
  assert.match(kotlin, /LinearProgressIndicator/);
  assert.match(kotlin, /Brush\.linearGradient/);
});
