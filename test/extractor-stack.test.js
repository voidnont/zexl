import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const activeFiles = ['Dockerfile', 'package.json', 'README.md', 'THIRD_PARTY_NOTICES.md', '.github/dependabot.yml'];

test('active ZEXL extractor stack has no retired JVM extractor or unrelated app dependency', async () => {
  assert.equal(fs.existsSync('src/newpipe.js'), false);
  assert.equal(fs.existsSync('newpipe-bridge'), false);
  for (const file of activeFiles) {
    const text = (await fsp.readFile(file, 'utf8')).toLowerCase();
    assert.doesNotMatch(text, /newpipe/);
    assert.doesNotMatch(text, /openjdk|jdk21|gradle:9\.7\.1-jdk21/);
    assert.doesNotMatch(text, /frxe/);
    assert.doesNotMatch(text, /nont\.me/);
  }
});
