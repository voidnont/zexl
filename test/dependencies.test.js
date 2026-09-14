import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('pins Node and yt-dlp without JVM extractor runtime', async () => {
  const docker = await fs.readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(docker, /node:24\.21\.0-trixie-slim/);
  assert.match(docker, /YTDLP_VERSION=2026\.08\.19/);
  assert.match(docker, /yt-dlp\[default\]==\$\{YTDLP_VERSION\}/);
  assert.doesNotMatch(docker, /openjdk|gradle:|newpipe/i);
});

test('includes relevant automated dependency update checks', async () => {
  const dependabot = await fs.readFile(new URL('../.github/dependabot.yml', import.meta.url), 'utf8');
  assert.match(dependabot, /package-ecosystem: "docker"/);
  assert.match(dependabot, /package-ecosystem: "npm"/);
  assert.match(dependabot, /package-ecosystem: "gradle"/);
  assert.match(dependabot, /directory: "\/android-sample"/);
  assert.doesNotMatch(dependabot, /newpipe/i);
});

test('uses AGP 9 built-in Kotlin with a matching Compose compiler', async () => {
  const rootBuild = await fs.readFile(new URL('../android-sample/build.gradle.kts', import.meta.url), 'utf8');
  const appBuild = await fs.readFile(new URL('../android-sample/app/build.gradle.kts', import.meta.url), 'utf8');
  assert.match(rootBuild, /com\.android\.application"\) version "9\.4\.0"/);
  assert.match(rootBuild, /kotlin-gradle-plugin:2\.4\.20/);
  assert.match(rootBuild, /org\.jetbrains\.kotlin\.plugin\.compose"\) version "2\.4\.20"/);
  assert.doesNotMatch(rootBuild, /org\.jetbrains\.kotlin\.android/);
  assert.doesNotMatch(appBuild, /org\.jetbrains\.kotlin\.android/);
  assert.doesNotMatch(appBuild, /kotlinOptions/);
  assert.match(appBuild, /compileSdk = 37/);
  assert.match(appBuild, /targetSdk = 36/);
  assert.match(appBuild, /compose-bom:2026\.08\.00/);
  assert.match(appBuild, /activity-compose:1\.13\.0/);
  assert.match(appBuild, /lifecycle-runtime-ktx:2\.11\.0/);
});
