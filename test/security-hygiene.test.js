import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('repository omits root cookies.txt and ignores session cookie files', async () => {
  assert.equal(fs.existsSync(new URL('cookies.txt', root)), false);
  const ignore = await fsp.readFile(new URL('.gitignore', root), 'utf8');
  assert.match(ignore, /^cookies\.txt$/m);
  assert.match(ignore, /^\*\.cookies\.txt$/m);
  assert.match(ignore, /^\.session\.cookies\.txt$/m);
});
