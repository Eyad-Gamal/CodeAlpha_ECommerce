const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { getDb } = require('../config/database');
const ApiError = require('../utils/ApiError');

/**
 * Extracts Bearer token from Authorization header or access_token cookie,
 * verifies signature and expiration, and attaches live user profile.
 */
function requireAuth(req, _res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      return next(ApiError.unauthorized('Authentication token is missing'));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
      });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(ApiError.unauthorized('Access token has expired', 'TOKEN_EXPIRED'));
      }
      return next(ApiError.unauthorized('Invalid or tampered authentication token', 'INVALID_TOKEN'));
    }

    if (!decoded || !decoded.sub) {
      return next(ApiError.unauthorized('Malformed token payload'));
    }

    const db = getDb();
    const user = db
      .prepare('SELECT id, name, email, role, phone, address, created_at FROM users WHERE id = ?')
      .get(decoded.sub);

    if (!user) {
      return next(ApiError.unauthorized('User account no longer exists'));
    }

    req.user = {
      ...user,
      address: safeParseJson(user.address, {}),
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional auth middleware: populates req.user if valid token exists,
 * otherwise proceeds as Guest.
 */
function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const hasToken =
    (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) ||
    (req.cookies && req.cookies.access_token);

  if (!hasToken) {
    req.user = null;
    return next();
  }
  return requireAuth(req, _res, () => {
    next();
  });
}

/**
 * Role-Based Access Control (RBAC) Guard
 */
function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Access denied: requires ${allowedRoles.join(' or ')} privileges`
        )
      );
    }
    next();
  };
}

function safeParseJson(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireRole,
};
