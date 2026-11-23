const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { getDb } = require('../config/database');
const ApiError = require('../utils/ApiError');

// Precomputed dummy hash to prevent timing-based user enumeration on login
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(' DummyTimingProtectionSecret@2026 ', 8);

function hashRefreshToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    }
  );
}

function issueRefreshToken(userId, meta = {}) {
  const db = getDb();
  const rawToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(
    Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    `rt-${crypto.randomUUID()}`,
    userId,
    tokenHash,
    expiresAt,
    meta.ip || '',
    meta.userAgent || ''
  );

  return { rawToken, expiresAt };
}

function sanitizeUserRecord(user) {
  if (!user) return null;
  let parsedAddress = {};
  if (user.address) {
    try {
      parsedAddress = typeof user.address === 'string' ? JSON.parse(user.address) : user.address;
    } catch {
      parsedAddress = {};
    }
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || '',
    address: parsedAddress,
    created_at: user.created_at,
  };
}

function registerUser(payload, meta = {}) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(payload.email);
  if (existing) {
    throw ApiError.conflict('An account with this email address is already registered', null, 'EMAIL_EXISTS');
  }

  const userId = `usr-${crypto.randomUUID()}`;
  const passwordHash = bcrypt.hashSync(payload.password, env.BCRYPT_ROUNDS);

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, phone, address, created_at)
    VALUES (?, ?, ?, ?, 'customer', ?, ?, datetime('now'))
  `).run(
    userId,
    payload.name,
    payload.email,
    passwordHash,
    payload.phone || '',
    JSON.stringify(payload.address || {})
  );

  // Create dedicated 1-to-1 Cart for the user
  db.prepare('INSERT INTO carts (id, user_id) VALUES (?, ?)').run(
    `cart-${crypto.randomUUID()}`,
    userId
  );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const accessToken = generateAccessToken(user);
  const refreshToken = issueRefreshToken(user.id, meta);

  return {
    user: sanitizeUserRecord(user),
    accessToken,
    refreshToken: refreshToken.rawToken,
  };
}

function loginUser(payload, meta = {}) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(payload.email);

  // Constant-time comparison even if email does not exist
  const targetHash = user ? user.password_hash : DUMMY_PASSWORD_HASH;
  const isPasswordValid = bcrypt.compareSync(payload.password, targetHash);

  if (!user || !isPasswordValid) {
    throw ApiError.unauthorized('Invalid email address or password', 'INVALID_CREDENTIALS');
  }

  // Ensure user has a 1-to-1 cart
  const existingCart = db.prepare('SELECT id FROM carts WHERE user_id = ?').get(user.id);
  if (!existingCart) {
    db.prepare('INSERT INTO carts (id, user_id) VALUES (?, ?)').run(
      `cart-${crypto.randomUUID()}`,
      user.id
    );
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = issueRefreshToken(user.id, meta);

  return {
    user: sanitizeUserRecord(user),
    accessToken,
    refreshToken: refreshToken.rawToken,
  };
}

function rotateRefreshToken(rawToken, meta = {}) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw ApiError.unauthorized('Refresh token is required');
  }

  const db = getDb();
  const tokenHash = hashRefreshToken(rawToken);
  const stored = db
    .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
    .get(tokenHash);

  if (!stored) {
    throw ApiError.unauthorized('Invalid refresh token');
  }

  // Token reuse detection: if an already revoked refresh token is presented, revoke all tokens for this user!
  if (stored.revoked_at) {
    db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ?`).run(
      stored.user_id
    );
    throw ApiError.unauthorized('Refresh token reuse detected. Session revoked for security.', 'TOKEN_REUSE_DETECTED');
  }

  if (new Date(stored.expires_at).getTime() <= Date.now()) {
    throw ApiError.unauthorized('Refresh token has expired');
  }

  // Revoke current refresh token
  db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?`).run(stored.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(stored.user_id);
  if (!user) {
    throw ApiError.unauthorized('User account not found');
  }

  const accessToken = generateAccessToken(user);
  const nextRefresh = issueRefreshToken(user.id, meta);

  return {
    user: sanitizeUserRecord(user),
    accessToken,
    refreshToken: nextRefresh.rawToken,
  };
}

function revokeRefreshToken(rawToken, userId = null) {
  const db = getDb();
  if (rawToken && typeof rawToken === 'string') {
    const tokenHash = hashRefreshToken(rawToken);
    db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token_hash = ?`).run(
      tokenHash
    );
  } else if (userId) {
    db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ?`).run(
      userId
    );
  }
}

function updateProfile(userId, payload) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  let nextPasswordHash = user.password_hash;
  if (payload.newPassword) {
    if (!payload.currentPassword) {
      throw ApiError.badRequest('Current password is required to set a new password');
    }
    const validCurrent = bcrypt.compareSync(payload.currentPassword, user.password_hash);
    if (!validCurrent) {
      throw ApiError.unauthorized('Current password is incorrect');
    }
    nextPasswordHash = bcrypt.hashSync(payload.newPassword, env.BCRYPT_ROUNDS);
  }

  const currentAddress = sanitizeUserRecord(user).address;
  const mergedAddress = payload.address
    ? { ...currentAddress, ...payload.address }
    : currentAddress;

  db.prepare(`
    UPDATE users
    SET name = ?, phone = ?, address = ?, password_hash = ?
    WHERE id = ?
  `).run(
    payload.name !== undefined ? payload.name : user.name,
    payload.phone !== undefined ? payload.phone : user.phone,
    JSON.stringify(mergedAddress),
    nextPasswordHash,
    userId
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return sanitizeUserRecord(updated);
}

module.exports = {
  hashRefreshToken,
  generateAccessToken,
  issueRefreshToken,
  sanitizeUserRecord,
  registerUser,
  loginUser,
  rotateRefreshToken,
  revokeRefreshToken,
  updateProfile,
};
