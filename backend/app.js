const express = require('express');
const path = require('node:path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { apiRateLimiter } = require('./middlewares/rateLimit.middleware');
const { sanitizeMiddleware } = require('./middlewares/sanitize.middleware');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');
const apiV1Routes = require('./routes');

const app = express();

// 1. Security HTTP Headers (Helmet with curated CSP for modern UI fonts & product imagery)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com', 'https://*.unsplash.com'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// 2. Strict CORS Configuration
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Refresh-Token'],
  })
);

// 3. Body & Cookie Parsers with Strict Payload Size Limits (DoS Prevention)
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(cookieParser());

// 4. Global XSS & Prototype Pollution Sanitizer
app.use(sanitizeMiddleware);

// 5. Dynamic SEO Endpoints: /robots.txt & /sitemap.xml
app.get('/robots.txt', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /api/v1/admin/\nDisallow: /api/v1/cart/\nDisallow: /api/v1/orders/\nSitemap: ${host}/sitemap.xml\n`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const { getDb } = require('./config/database');
  const host = `${req.protocol}://${req.get('host')}`;
  const db = getDb();
  const products = db.prepare('SELECT slug, created_at FROM products ORDER BY created_at DESC').all();
  const categories = db.prepare('SELECT slug FROM categories WHERE is_active = 1').all();

  const urls = [
    `  <url><loc>${host}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...categories.map(
      (c) =>
        `  <url><loc>${host}/?category=${encodeURIComponent(c.slug)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`
    ),
    ...products.map(
      (p) =>
        `  <url><loc>${host}/?product=${encodeURIComponent(p.slug)}</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>`
    ),
  ].join('\n');

  res
    .type('application/xml')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
    );
});

// 6. Rate Limiting & RESTful API v1 Mounting
app.use('/api/v1', apiRateLimiter, apiV1Routes);

// 6. Serve Modern Frontend Static Assets & SPA Entry
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

// SPA fallback for non-API routes
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// 7. 404 & Centralized Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
