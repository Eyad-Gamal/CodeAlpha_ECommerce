class ApiError extends Error {
  constructor(statusCode, message, errors = null, code = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, errors = null, code = 'BAD_REQUEST') {
    return new ApiError(400, message, errors, code);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, null, code);
  }

  static forbidden(message = 'Insufficient permissions', code = 'FORBIDDEN') {
    return new ApiError(403, message, null, code);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, message, null, code);
  }

  static conflict(message, errors = null, code = 'CONFLICT') {
    return new ApiError(409, message, errors, code);
  }

  static tooManyRequests(message = 'Too many requests, please try again later', code = 'RATE_LIMITED') {
    return new ApiError(429, message, null, code);
  }
}

module.exports = ApiError;
