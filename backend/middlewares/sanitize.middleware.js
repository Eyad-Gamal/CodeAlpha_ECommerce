/**
 * Deeply sanitizes incoming strings against stored/reflected XSS payloads,
 * dangerous HTML tags, inline event handlers, and prototype pollution keys.
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeString(value) {
  if (typeof value !== 'string') return value;

  return value
    // Strip <script>...</script>, <iframe>, <object>, <embed>, <svg onload...>
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|iframe|object|embed|applet|meta|link|style|form|input|button)[^>]*>/gi, '')
    // Strip inline event handlers like onerror=, onload=, onclick=
    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Strip javascript: and data:text/html URIs
    .replace(/(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/gi, '')
    // Escape remaining raw angle brackets to prevent tag injection
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

function sanitizeValue(input) {
  if (typeof input === 'string') {
    return sanitizeString(input);
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeValue(item));
  }
  if (input !== null && typeof input === 'object') {
    const clean = {};
    for (const [key, val] of Object.entries(input)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      // Do not corrupt raw password fields with HTML entity replacements
      if (key === 'password' || key === 'currentPassword' || key === 'newPassword') {
        clean[key] = typeof val === 'string' ? val : val;
      } else {
        clean[key] = sanitizeValue(val);
      }
    }
    return clean;
  }
  return input;
}

function sanitizeMiddleware(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeValue(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeValue(req.params);
  }
  next();
}

module.exports = {
  sanitizeString,
  sanitizeValue,
  sanitizeMiddleware,
};
