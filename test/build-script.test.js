import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function text(path) { return fs.readFile(path, 'utf8'); }

test('root build.bat validates Java and Android SDK then builds/copies the debug APK', async () => {
  const bat = await text('build.bat');
  assert.match(bat, /where java/i);
  assert.match(bat, /ANDROID_HOME|ANDROID_SDK_ROOT/i);
  assert.match(bat, /platforms\\android-37\.0/i);
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

test('build.bat stays open on failure/success and writes a persistent build log', async () => {
  const bat = await text('build.bat');
  assert.match(bat, /set "LOG=%DIST%\\build\.log"/i);
  assert.match(bat, />>\s*"%LOG%"\s*2>&1/i);
  assert.match(bat, /pause/i);
  assert.match(bat, /ZEXL_NO_PAUSE/i);
});

test('build.bat installs the Android compile SDK package with sdkmanager', async () => {
  const bat = await text('build.bat');
  assert.match(bat, /sdkmanager\.bat/i);
  assert.match(bat, /--licenses/i);
  assert.match(bat, /platforms;android-37.0/i);
  assert.match(bat, /build-tools;37\.0\.0/i);
  assert.match(bat, /--sdk_root=/i);
  assert.match(bat, /Android SDK Command-Line Tools/i);
  assert.match(bat, /if not exist "%ANDROID_HOME%\\platforms\\android-37\.0"[\s\S]*sdkmanager/i);
});

test('Android Gradle memory is sized for Compose compilation', async () => {
  const props = await text('android-sample/gradle.properties');
  assert.match(props, /org\.gradle\.jvmargs=.*-Xmx2048m/i);
  assert.match(props, /MaxMetaspaceSize=768m/i);
  assert.match(props, /org\.gradle\.workers\.max=2/i);
});
