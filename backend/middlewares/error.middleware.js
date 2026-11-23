const multer = require('multer');
const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');

function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Endpoint not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;
  let code = err.code || 'INTERNAL_ERROR';

  // Handle Zod Schema Validation Errors
  if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    errors = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    message = errors[0]?.message || 'Invalid request payload';
  }
  // Handle Multer File Upload Errors
  else if (err instanceof multer.MulterError) {
    statusCode = 400;
    code = 'UPLOAD_ERROR';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Uploaded file exceeds the maximum allowed size of 2MB';
    } else {
      message = `File upload error: ${err.message}`;
    }
  }
  // Handle malformed JSON body
  else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Malformed JSON payload';
  }
  // Handle SQLite constraint violations cleanly without leaking SQL internals
  else if (err.message && err.message.includes('UNIQUE constraint failed')) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'A record with this unique identifier already exists';
  } else if (err.message && err.message.includes('FOREIGN KEY constraint failed')) {
    statusCode = 400;
    code = 'REFERENTIAL_INTEGRITY_ERROR';
    message = 'Operation violates relational integrity constraints';
  }

  // Mask unexpected internal 500 error details in production
  if (statusCode === 500 && !err.isOperational && env.NODE_ENV === 'production') {
    message = 'An unexpected server error occurred';
  }

  const response = {
    success: false,
    code,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  res.status(statusCode).json(response);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
