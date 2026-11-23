const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const isTest = env.NODE_ENV === 'test';

/**
 * Strict Rate Limiter for Authentication Endpoints (/api/v1/auth/login, /register)
 * Protects against credential stuffing and brute-force attacks.
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 200 : 20, // Higher allowance in automated test runner unless specifically testing rate limits
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'AUTH_RATE_LIMITED',
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes.',
  },
});

/**
 * General API Rate Limiter for /api/v1/*
 */
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 5000 : 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'API_RATE_LIMITED',
    message: 'Too many requests from this IP, please slow down.',
  },
});

module.exports = {
  authRateLimiter,
  apiRateLimiter,
};
