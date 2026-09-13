import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('NewPipe bridge does not require legacy javax.annotation at compile time', async () => {
  const bridge = await fs.readFile(new URL('../newpipe-bridge/src/main/java/tools/zexl/newpipe/Main.java', import.meta.url), 'utf8');
  assert.doesNotMatch(bridge, /javax\.annotation/);
  assert.doesNotMatch(bridge, /@Nonnull/);
});



test('NewPipe bridge mirrors upstream Brotli-capable HTTP transport for YouTube', async () => {
  const bridge = await fs.readFile(new URL('../newpipe-bridge/src/main/java/tools/zexl/newpipe/Main.java', import.meta.url), 'utf8');
  assert.match(bridge, /CompressionInterceptor/);
  assert.match(bridge, /brotli\.Brotli\.INSTANCE/);
  assert.match(bridge, /Gzip\.INSTANCE/);
  assert.match(bridge, /Firefox\/140\.0/);
});
test('pins current stable runtime and extractor dependencies', async () => {
  const docker = await fs.readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  const gradle = await fs.readFile(new URL('../newpipe-bridge/build.gradle.kts', import.meta.url), 'utf8');
  assert.match(docker, /node:24\.21\.0-trixie-slim/);
  assert.match(docker, /gradle:9\.7\.1-jdk21/);
  assert.match(docker, /YTDLP_VERSION=2026\.08\.19/);
  assert.match(docker, /yt-dlp\[default\]==\$\{YTDLP_VERSION\}/);
  assert.match(gradle, /NewPipeExtractor:13a655fe53e0c3065f88725fc1fb594c3ede0169/);
  assert.match(gradle, /com\.squareup\.okhttp3:okhttp:5\.5\.0/);
  assert.match(gradle, /com\.squareup\.okhttp3:okhttp-brotli:5\.5\.0/);
});

test('includes automated dependency update checks', async () => {
  const dependabot = await fs.readFile(new URL('../.github/dependabot.yml', import.meta.url), 'utf8');
  assert.match(dependabot, /package-ecosystem: "docker"/);
  assert.match(dependabot, /package-ecosystem: "gradle"/);
  assert.match(dependabot, /directory: "\/newpipe-bridge"/);
});


test('pins current stable Android build and Jetpack dependencies', async () => {
  const rootBuild = await fs.readFile(new URL('../android-sample/build.gradle.kts', import.meta.url), 'utf8');
  const appBuild = await fs.readFile(new URL('../android-sample/app/build.gradle.kts', import.meta.url), 'utf8');
  assert.match(rootBuild, /com\.android\.application\"\) version \"9\.4\.0\"/);
  assert.match(rootBuild, /org\.jetbrains\.kotlin\.android\"\) version \"2\.4\.20\"/);
  assert.match(appBuild, /compileSdk = 37/);
  assert.match(appBuild, /compose-bom:2026\.08\.00/);
  assert.match(appBuild, /activity-compose:1\.13\.0/);
  assert.match(appBuild, /lifecycle-runtime-ktx:2\.11\.0/);
});
