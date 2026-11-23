const multer = require('multer');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const ALLOWED_MIMES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Inspects file magic bytes (first 12 bytes) to verify true image format
 * and prevent disguised executable/script uploads (.php/.exe renamed to .jpg).
 */
function verifyImageMagicBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return '.png';
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return '.webp';
  }

  return null;
}

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_BYTES,
    files: 5,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES[file.mimetype]) {
      return cb(
        ApiError.badRequest(
          'Invalid file MIME type. Only JPEG, PNG, and WebP images are permitted.',
          null,
          'INVALID_FILE_TYPE'
        )
      );
    }
    cb(null, true);
  },
});

/**
 * Middleware that validates magic bytes of uploaded buffers in memory
 * before persisting them with UUID filenames to prevent path traversal & RCE.
 */
function processProductUploads(req, _res, next) {
  try {
    const files = [];
    if (req.file) files.push(req.file);
    if (Array.isArray(req.files)) files.push(...req.files);

    if (files.length === 0) {
      req.uploadedImageUrls = [];
      return next();
    }

    if (!fs.existsSync(env.UPLOAD_DIR)) {
      fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
    }

    const savedUrls = [];
    for (const file of files) {
      const verifiedExt = verifyImageMagicBytes(file.buffer);
      if (!verifiedExt) {
        return next(
          ApiError.badRequest(
            `Security rejection: File "${file.originalname}" failed binary magic-byte image verification.`,
            null,
            'MALICIOUS_FILE_SIGNATURE'
          )
        );
      }

      const safeFilename = `${crypto.randomUUID()}${verifiedExt}`;
      const fullPath = path.join(env.UPLOAD_DIR, safeFilename);
      fs.writeFileSync(fullPath, file.buffer);
      savedUrls.push(`/assets/uploads/${safeFilename}`);
    }

    req.uploadedImageUrls = savedUrls;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadMemory,
  processProductUploads,
  verifyImageMagicBytes,
};
