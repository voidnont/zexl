import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtractorError, classifyExtractorMessage, isUserActionCode } from '../src/extractor-errors.js';

const cases = [
  ['Sign in to confirm you are not a bot', 'login_required'],
  ['Please complete the CAPTCHA to continue', 'captcha_required'],
  ['Before you continue to YouTube, review consent', 'consent_required'],
  ['Sign in to confirm your age', 'age_check'],
  ['This video is DRM protected', 'drm'],
  ['Video unavailable', 'unavailable'],
  ['Unsupported URL', 'unsupported'],
  ['unknown extractor failure', 'extractor_error']
];

for (const [message, code] of cases) {
  test(`classifies ${code}`, () => assert.equal(classifyExtractorMessage(message), code));
}

test('only user-solvable challenge codes are actionable', () => {
  for (const code of ['login_required', 'captcha_required', 'consent_required', 'age_check']) {
    assert.equal(isUserActionCode(code), true);
  }
  for (const code of ['drm', 'unavailable', 'unsupported', 'extractor_error']) {
    assert.equal(isUserActionCode(code), false);
  }
});

test('ExtractorError preserves code and source URL', () => {
  const error = new ExtractorError('captcha_required', 'Complete the CAPTCHA.', 'https://example.com/watch');
  assert.equal(error.code, 'captcha_required');
  assert.equal(error.sourceUrl, 'https://example.com/watch');
});
