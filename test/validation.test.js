import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFormat, validateMediaUrl, isPrivateIp } from '../src/validation.js';

test('accepts only mp3 flac and wav formats', () => {
  for (const format of ['mp3', 'flac', 'wav']) assert.equal(validateFormat(format), format);
  assert.throws(() => validateFormat('aac'), /format/i);
  assert.throws(() => validateFormat(''), /format/i);
});

test('accepts normal public http and https urls', async () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  assert.equal(await validateMediaUrl('https://example.com/watch?v=1', lookup), 'https://example.com/watch?v=1');
  assert.equal(await validateMediaUrl('http://example.com/a', lookup), 'http://example.com/a');
});

test('rejects unsupported protocols and localhost', async () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  await assert.rejects(() => validateMediaUrl('file:///etc/passwd', lookup), /http/i);
  await assert.rejects(() => validateMediaUrl('http://localhost:8080', lookup), /private|local/i);
});

test('rejects hostnames resolving to private addresses', async () => {
  const lookup = async () => [{ address: '10.0.0.7', family: 4 }];
  await assert.rejects(() => validateMediaUrl('https://internal.example', lookup), /private/i);
});

test('recognizes common private and local ip ranges', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.1.2', '192.168.1.1', '169.254.1.1', '::1', 'fc00::1', 'fe80::1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  assert.equal(isPrivateIp('8.8.8.8'), false);
  assert.equal(isPrivateIp('2606:4700:4700::1111'), false);
});
