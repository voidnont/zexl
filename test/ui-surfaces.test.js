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

test('web and Android layouts stay compact instead of oversized', async () => {
  const css = await fs.readFile(new URL('../public/style.css', import.meta.url), 'utf8');
  const kotlin = await fs.readFile(new URL('../android-sample/app/src/main/java/tools/zexl/demo/MainActivity.kt', import.meta.url), 'utf8');

  assert.match(css, /\.shell\s*\{[^}]*width:\s*min\(100%,\s*660px\)/s);
  assert.match(css, /\.glass-card\s*\{[^}]*padding:\s*clamp\(20px,\s*4vw,\s*30px\)/s);
  assert.match(css, /h1\s*\{[^}]*font-size:\s*clamp\(2\.45rem,\s*7vw,\s*3\.25rem\)/s);
  assert.match(css, /\.format-glass\s*\{[^}]*min-height:\s*64px/s);
  assert.match(css, /\.convert-button\s*\{[^}]*min-height:\s*48px/s);
  assert.match(css, /h1\s*\{\s*font-size:\s*clamp\(2\.05rem,\s*10vw,\s*2\.55rem\);\s*\}/s);
  assert.match(css, /@media \(max-width:\s*330px\)/);

  assert.match(kotlin, /fontSize\s*=\s*31\.sp/);
  assert.match(kotlin, /lineHeight\s*=\s*31\.sp/);
  assert.match(kotlin, /cornerRadius\s*=\s*24/);
  assert.match(kotlin, /innerPadding:\s*Int\s*=\s*18/);
  assert.match(kotlin, /\.height\(48\.dp\)/);
});
