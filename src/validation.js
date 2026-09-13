
export function validateRequest(body) {
    if (!body || !body.url) {
        return { valid: false, error: 'URL is required' };
    }
    return { valid: true };
}