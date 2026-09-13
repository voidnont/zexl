import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function text(path) { return fs.readFile(path, 'utf8'); }

test('root build.bat validates Java and Android SDK then builds/copies the debug APK', async () => {
  const bat = await text('build.bat');
  assert.match(bat, /where java/i);
  assert.match(bat, /ANDROID_HOME|ANDROID_SDK_ROOT/i);
  assert.match(bat, /platforms\\android-37/i);
  assert.match(bat, /:app:assembleDebug/i);
  assert.match(bat, /set \"OUT=%DIST%\\zexl-debug\.apk\"/i);
  assert.match(bat, /app\\build\\outputs\\apk\\debug\\app-debug\.apk/i);
});

test('build.bat bootstraps and verifies Gradle 9.7.1 when no local Gradle is present', async () => {
  const bat = await text('build.bat');
  assert.match(bat, /set \"GRADLE_VERSION=9\.7\.1\"/i);
  assert.match(bat, /gradle-%GRADLE_VERSION%-bin\.zip/i);
  assert.match(bat, /services\.gradle\.org\/distributions/i);
  assert.match(bat, /acd53f1edaf02f1a8ff99879f8a34b302661a057d9b063ae9e35b552f804d20a/i);
  assert.match(bat, /Get-FileHash/i);
  assert.match(bat, /Expand-Archive/i);
});
