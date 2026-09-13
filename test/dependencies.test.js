import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('pins current stable runtime and extractor dependencies', async () => {
  const docker = await fs.readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  const gradle = await fs.readFile(new URL('../newpipe-bridge/build.gradle.kts', import.meta.url), 'utf8');
  assert.match(docker, /node:24\.21\.0-trixie-slim/);
  assert.match(docker, /gradle:9\.7\.1-jdk21/);
  assert.match(docker, /YTDLP_VERSION=2026\.08\.19/);
  assert.match(gradle, /NewPipeExtractor:v0\.26\.5/);
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
