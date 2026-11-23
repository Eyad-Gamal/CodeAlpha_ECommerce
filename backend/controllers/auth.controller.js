const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
} = require('../validators/auth.validator');
const authService = require('../services/auth.service');

function setRefreshCookie(res, refreshToken) {
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth',
  });
}

const register = asyncHandler(async (req, res) => {
  const validated = registerSchema.parse(req.body);
  const result = authService.registerUser(validated, {
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
  });

  setRefreshCookie(res, result.refreshToken);

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    token: result.accessToken,
    data: {
      user: result.user,
      token: result.accessToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  });
});

const login = asyncHandler(async (req, res) => {
  const validated = loginSchema.parse(req.body);
  const result = authService.loginUser(validated, {
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
  });

  setRefreshCookie(res, result.refreshToken);

  res.status(200).json({
    success: true,
    message: 'Signed in successfully',
    token: result.accessToken,
    data: {
      user: result.user,
      token: result.accessToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  });
});

const refresh = asyncHandler(async (req, res) => {
  const rawToken =
    (req.cookies && req.cookies.refresh_token) ||
    (req.body && req.body.refreshToken) ||
    req.headers['x-refresh-token'];

  const result = authService.rotateRefreshToken(rawToken, {
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
  });

  setRefreshCookie(res, result.refreshToken);

  res.status(200).json({
    success: true,
    message: 'Token refreshed successfully',
    token: result.accessToken,
    data: {
      user: result.user,
      token: result.accessToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  });
});

const logout = asyncHandler(async (req, res) => {
  const rawToken =
    (req.cookies && req.cookies.refresh_token) ||
    (req.body && req.body.refreshToken);

  authService.revokeRefreshToken(rawToken, req.user?.id);
  res.clearCookie('refresh_token', { path: '/api/v1/auth' });

  res.status(200).json({
    success: true,
    message: 'Signed out successfully',
  });
});

const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const validated = updateProfileSchema.parse(req.body);
  const updatedUser = authService.updateProfile(req.user.id, validated);

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user: updatedUser,
    },
  });
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
  updateProfile,
};
