import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const appGradle = 'android-sample/app/build.gradle.kts';
const settingsGradle = 'android-sample/settings.gradle.kts';
const downloader = 'android-sample/app/src/main/java/tools/zexl/client/NewPipeDownloader.kt';
const extractor = 'android-sample/app/src/main/java/tools/zexl/client/YouTubeLocalExtractor.kt';
const client = 'android-sample/app/src/main/java/tools/zexl/client/ConverterClient.kt';
const main = 'android-sample/app/src/main/java/tools/zexl/demo/MainActivity.kt';

async function text(path) { return fs.readFile(path, 'utf8'); }

test('Android app includes current NewPipeExtractor and upstream HTTP transport dependencies', async () => {
  const gradle = await text(appGradle);
  const settings = await text(settingsGradle);
  assert.match(settings, /jitpack\.io/);
  assert.match(gradle, /NewPipeExtractor:8584a0d636ce6b8371d2c5c83dbe7f01a3d21d59/);
  assert.match(gradle, /okhttp:5\.5\.0/);
  assert.match(gradle, /okhttp-brotli:5\.5\.0/);
  assert.match(gradle, /coreLibraryDesugaring/);
  assert.match(gradle, /isCoreLibraryDesugaringEnabled\s*=\s*true/);
});

test('Android NewPipe downloader mirrors Brotli-capable upstream request behavior', async () => {
  const source = await text(downloader);
  assert.match(source, /class NewPipeDownloader\s*:\s*Downloader/);
  assert.match(source, /CompressionInterceptor/);
  assert.match(source, /Brotli\.INSTANCE/);
  assert.match(source, /Gzip\.INSTANCE/);
  assert.match(source, /request\.headers\(\)/);
  assert.match(source, /request\.dataToSend\(\)/);
  assert.match(source, /Response\(/);
});

test('Android YouTube extractor resolves and downloads public audio locally', async () => {
  const source = await text(extractor);
  assert.match(source, /object YouTubeLocalExtractor/);
  assert.match(source, /fun isYouTubeUrl/);
  assert.match(source, /youtube\.com/);
  assert.match(source, /youtu\.be/);
  assert.match(source, /StreamInfo\.getInfo/);
  assert.match(source, /audioStreams/);
  assert.match(source, /getAverageBitrate\(\)/);
  assert.match(source, /cacheDir/);
  assert.match(source, /LocalAudioSource/);
});

test('smart Android client uses local YouTube path and hosted path for other sites', async () => {
  const source = await text(client);
  assert.match(source, /suspend fun convertSmart/);
  assert.match(source, /YouTubeLocalExtractor\.isYouTubeUrl\(url\)/);
  assert.match(source, /YouTubeLocalExtractor\.downloadBestAudio/);
  assert.match(source, /\/api\/transcode/);
  assert.match(source, /source\?\.file\?\.delete\(\)/);
  assert.match(source, /return convertAndWait\(url, format/);
});

test('demo UI calls the smart route', async () => {
  const source = await text(main);
  assert.match(source, /client\.convertSmart\(context, url, format/);
  assert.match(source, /downloading locally|resolving locally/);
});
