const ACTIONABLE = new Set(['login_required', 'captcha_required', 'consent_required', 'age_check']);

export class ExtractorError extends Error {
  constructor(code, message, sourceUrl = null) {
    super(message);
    this.name = 'ExtractorError';
    this.code = code;
    this.sourceUrl = sourceUrl;
  }
}

export function isUserActionCode(code) {
  return ACTIONABLE.has(code);
}

export function classifyExtractorMessage(message) {
  const text = String(message || '').toLowerCase();
  if (/captcha/.test(text)) return 'captcha_required';
  if (/confirm your age|age[- ]?restricted|age verification/.test(text)) return 'age_check';
  if (/consent|before you continue/.test(text)) return 'consent_required';
  if (/sign in|log in|login required|not a bot/.test(text)) return 'login_required';
  if (/drm|protected content|encrypted media/.test(text)) return 'drm';
  if (/unavailable|removed|private video/.test(text)) return 'unavailable';
  if (/unsupported url|unsupported site|not supported/.test(text)) return 'unsupported';
  return 'extractor_error';
}
