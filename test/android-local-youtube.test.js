import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const appGradle = 'android-sample/app/build.gradle.kts';
const settingsGradle = 'android-sample/settings.gradle.kts';
const downloader = 'android-sample/app/src/main/java/tools/zexl/client/NewPipeDownloader.kt';
const extractor = 'android-sample/app/src/main/java/tools/zexl/client/YouTubeLocalExtractor.kt';
const client = 'android-sample/app/src/main/java/tools/zexl/client/ConverterClient.kt';
const main = 'android-sample/app/src/main/java/tools/zexl/demo/MainActivity.kt';

async function text(file) { return fsp.readFile(file, 'utf8'); }

test('Android uses hosted extractor pipeline with no local NewPipe stack', async () => {
  const gradle = await text(appGradle);
  const settings = await text(settingsGradle);
  const clientText = await text(client);
  assert.doesNotMatch(gradle, /NewPipeExtractor|okhttp-brotli/);
  assert.doesNotMatch(settings, /jitpack\.io/);
  assert.equal(fs.existsSync(downloader), false);
  assert.equal(fs.existsSync(extractor), false);
  assert.match(clientText, /errorCode:\s*String\?/);
  assert.match(clientText, /sourceUrl:\s*String\?/);
  assert.match(clientText, /class ConversionFailedException/);
  assert.match(clientText, /return convertAndWait\(url, format, pollMs, auth, onUpdate\)/);
  assert.doesNotMatch(clientText, /YouTubeLocalExtractor/);
});

test('Android UI can open a challenge source and no longer claims local extraction', async () => {
  const mainText = await text(main);
  assert.match(mainText, /Open source/);
  assert.match(mainText, /Intent\.ACTION_VIEW/);
  assert.doesNotMatch(mainText, /resolving locally|downloading locally|uploading to converter/);
});

test('Compose weight remains valid', async () => {
  const mainText = await text(main);
  assert.doesNotMatch(mainText, /import androidx\.compose\.foundation\.layout\.weight/);
  assert.match(mainText, /Modifier\.weight\(1f\)/);
});
