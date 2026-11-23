const crypto = require('node:crypto');
const { getDb } = require('../config/database');
const ApiError = require('../utils/ApiError');

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatProductRow(row) {
  if (!row) return null;
  let images = [];
  let specs = {};
  try {
    images = typeof row.images === 'string' ? JSON.parse(row.images) : row.images || [];
  } catch {
    images = [];
  }
  try {
    specs = typeof row.specs === 'string' ? JSON.parse(row.specs) : row.specs || {};
  } catch {
    specs = {};
  }

  const effectivePrice =
    row.discount_price !== null &&
    row.discount_price !== undefined &&
    Number(row.discount_price) < Number(row.price)
      ? Number(row.discount_price)
      : Number(row.price);

  return {
    id: row.id,
    category_id: row.category_id,
    category_name: row.category_name || undefined,
    category_slug: row.category_slug || undefined,
    title: row.title,
    slug: row.slug,
    description: row.description,
    price: Number(row.price),
    discount_price:
      row.discount_price !== null && row.discount_price !== undefined
        ? Number(row.discount_price)
        : null,
    effective_price: effectivePrice,
    stock_qty: Number(row.stock_qty),
    in_stock: Number(row.stock_qty) > 0,
    low_stock: Number(row.stock_qty) > 0 && Number(row.stock_qty) <= 5,
    sku: row.sku,
    images,
    specs,
    featured: Boolean(row.featured),
    rating_avg: Number(Number(row.rating_avg || 0).toFixed(2)),
    rating_count: Number(row.rating_count || 0),
    sales_count: Number(row.sales_count || 0),
    created_at: row.created_at,
  };
}

/**
 * Lists categories with active product counts
 */
function listCategories({ includeInactive = false } = {}) {
  const db = getDb();
  const whereClause = includeInactive ? '' : 'WHERE c.is_active = 1';
  const rows = db
    .prepare(`
      SELECT
        c.*,
        COUNT(p.id) AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.name ASC
    `)
    .all();

  return rows.map((r) => ({
    ...r,
    is_active: Boolean(r.is_active),
    product_count: Number(r.product_count || 0),
  }));
}

function createCategory(payload) {
  const db = getDb();
  const slug = payload.slug || slugify(payload.name);
  const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
  if (existing) {
    throw ApiError.conflict(`Category with slug "${slug}" already exists`);
  }

  const id = `cat-${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO categories (id, name, slug, description, image_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    payload.name,
    slug,
    payload.description || '',
    payload.image_url || '',
    payload.is_active !== undefined ? Number(Boolean(payload.is_active)) : 1
  );

  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

function updateCategory(id, payload) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) {
    throw ApiError.notFound('Category not found');
  }

  const nextSlug = payload.slug || (payload.name ? slugify(payload.name) : existing.slug);
  const duplicate = db
    .prepare('SELECT id FROM categories WHERE slug = ? AND id != ?')
    .get(nextSlug, id);
  if (duplicate) {
    throw ApiError.conflict(`Another category already uses slug "${nextSlug}"`);
  }

  db.prepare(`
    UPDATE categories
    SET name = ?, slug = ?, description = ?, image_url = ?, is_active = ?
    WHERE id = ?
  `).run(
    payload.name ?? existing.name,
    nextSlug,
    payload.description ?? existing.description,
    payload.image_url ?? existing.image_url,
    payload.is_active !== undefined ? Number(Boolean(payload.is_active)) : existing.is_active,
    id
  );

  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

function deleteCategory(id) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) {
    throw ApiError.notFound('Category not found');
  }

  const countRow = db
    .prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?')
    .get(id);
  if (countRow && countRow.count > 0) {
    throw ApiError.conflict(
      'Cannot delete category while products are assigned to it. Reassign or remove its products first.'
    );
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return { id };
}

/**
 * Lists products with pagination, search, category, price range, rating, and sorting (FR-02)
 */
function listProducts(query = {}) {
  const db = getDb();
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit || '12', 10) || 12));
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];

  if (query.category && query.category !== 'all') {
    conditions.push('(c.slug = ? OR c.id = ?)');
    params.push(query.category, query.category);
  }

  if (query.search && String(query.search).trim() !== '') {
    const term = `%${String(query.search).trim()}%`;
    conditions.push('(p.title LIKE ? OR p.description LIKE ? OR p.sku LIKE ? OR c.name LIKE ?)');
    params.push(term, term, term, term);
  }

  if (query.minPrice !== undefined && query.minPrice !== '') {
    const minP = parseFloat(query.minPrice);
    if (!Number.isNaN(minP)) {
      conditions.push('COALESCE(p.discount_price, p.price) >= ?');
      params.push(minP);
    }
  }

  if (query.maxPrice !== undefined && query.maxPrice !== '') {
    const maxP = parseFloat(query.maxPrice);
    if (!Number.isNaN(maxP)) {
      conditions.push('COALESCE(p.discount_price, p.price) <= ?');
      params.push(maxP);
    }
  }

  if (query.minRating !== undefined && query.minRating !== '') {
    const minR = parseFloat(query.minRating);
    if (!Number.isNaN(minR)) {
      conditions.push('p.rating_avg >= ?');
      params.push(minR);
    }
  }

  if (query.inStock === 'true' || query.inStock === true || query.inStock === '1') {
    conditions.push('p.stock_qty > 0');
  }

  if (query.featured === 'true' || query.featured === true || query.featured === '1') {
    conditions.push('p.featured = 1');
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let orderBySql = 'ORDER BY p.created_at DESC, p.id ASC';
  switch (query.sort) {
    case 'price_asc':
      orderBySql = 'ORDER BY COALESCE(p.discount_price, p.price) ASC';
      break;
    case 'price_desc':
      orderBySql = 'ORDER BY COALESCE(p.discount_price, p.price) DESC';
      break;
    case 'best_selling':
      orderBySql = 'ORDER BY p.sales_count DESC, p.rating_avg DESC';
      break;
    case 'rating':
      orderBySql = 'ORDER BY p.rating_avg DESC, p.rating_count DESC';
      break;
    case 'newest':
    default:
      orderBySql = 'ORDER BY p.featured DESC, p.created_at DESC';
      break;
  }

  const totalRow = db
    .prepare(`
      SELECT COUNT(*) as total
      FROM products p
      JOIN categories c ON c.id = p.category_id
      ${whereSql}
    `)
    .get(...params);

  const total = Number(totalRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const rows = db
    .prepare(`
      SELECT
        p.*,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      JOIN categories c ON c.id = p.category_id
      ${whereSql}
      ${orderBySql}
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset);

  return {
    products: rows.map(formatProductRow),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

/**
 * Fetches single product by slug (or ID fallback) with reviews and similar products (FR-03)
 */
function getProductBySlugOrId(slugOrId) {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT
        p.*,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.slug = ? OR p.id = ?
    `)
    .get(slugOrId, slugOrId);

  if (!row) {
    throw ApiError.notFound('Product not found');
  }

  const product = formatProductRow(row);

  // Fetch customer reviews
  const reviews = db
    .prepare(`
      SELECT
        r.id,
        r.user_id,
        u.name AS user_name,
        r.rating,
        r.title,
        r.comment,
        r.is_verified_purchase,
        r.created_at
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      WHERE r.product_id = ?
      ORDER BY r.created_at DESC
    `)
    .all(product.id)
    .map((rev) => ({
      ...rev,
      is_verified_purchase: Boolean(rev.is_verified_purchase),
    }));

  // Fetch similar products in the same category
  const similarRows = db
    .prepare(`
      SELECT
        p.*,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.category_id = ? AND p.id != ?
      ORDER BY p.rating_avg DESC, p.sales_count DESC
      LIMIT 4
    `)
    .all(product.category_id, product.id);

  return {
    ...product,
    reviews,
    similar_products: similarRows.map(formatProductRow),
  };
}

function parseImagesInput(rawImages, uploadedUrls = []) {
  let parsed = [];
  if (Array.isArray(rawImages)) {
    parsed = rawImages.filter((u) => typeof u === 'string' && u.trim() !== '');
  } else if (typeof rawImages === 'string' && rawImages.trim() !== '') {
    try {
      const json = JSON.parse(rawImages);
      if (Array.isArray(json)) {
        parsed = json.filter((u) => typeof u === 'string' && u.trim() !== '');
      } else {
        parsed = [rawImages.trim()];
      }
    } catch {
      parsed = rawImages
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  const combined = [...uploadedUrls, ...parsed];
  if (combined.length === 0) {
    return [
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=85',
    ];
  }
  return combined;
}

function parseSpecsInput(rawSpecs) {
  if (!rawSpecs) return {};
  if (typeof rawSpecs === 'object' && !Array.isArray(rawSpecs)) return rawSpecs;
  if (typeof rawSpecs === 'string') {
    try {
      return JSON.parse(rawSpecs);
    } catch {
      return {};
    }
  }
  return {};
}

function createProduct(payload, uploadedUrls = []) {
  const db = getDb();

  const category = db
    .prepare('SELECT id FROM categories WHERE id = ? OR slug = ?')
    .get(payload.category_id, payload.category_id);
  if (!category) {
    throw ApiError.badRequest('Specified category does not exist');
  }

  if (
    payload.discount_price !== null &&
    payload.discount_price !== undefined &&
    payload.discount_price > payload.price
  ) {
    throw ApiError.badRequest('Discount price cannot exceed regular price');
  }

  let baseSlug = payload.slug || slugify(payload.title);
  if (!baseSlug) baseSlug = `product-${Date.now()}`;
  let slug = baseSlug;
  const existingSlug = db.prepare('SELECT id FROM products WHERE slug = ?').get(slug);
  if (existingSlug) {
    slug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;
  }

  const sku =
    payload.sku ||
    `AUR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const existingSku = db.prepare('SELECT id FROM products WHERE sku = ?').get(sku);
  if (existingSku) {
    throw ApiError.conflict(`A product with SKU "${sku}" already exists`);
  }

  const images = parseImagesInput(payload.images, uploadedUrls);
  const specs = parseSpecsInput(payload.specs);
  const id = `prd-${crypto.randomUUID()}`;

  db.prepare(`
    INSERT INTO products (
      id, category_id, title, slug, description, price, discount_price,
      stock_qty, sku, images, specs, featured, rating_avg, rating_count, sales_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
  `).run(
    id,
    category.id,
    payload.title,
    slug,
    payload.description,
    payload.price,
    payload.discount_price ?? null,
    payload.stock_qty,
    sku,
    JSON.stringify(images),
    JSON.stringify(specs),
    payload.featured ? 1 : 0
  );

  return getProductBySlugOrId(id);
}

function updateProduct(id, payload, uploadedUrls = []) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) {
    throw ApiError.notFound('Product not found');
  }

  let categoryId = existing.category_id;
  if (payload.category_id) {
    const category = db
      .prepare('SELECT id FROM categories WHERE id = ? OR slug = ?')
      .get(payload.category_id, payload.category_id);
    if (!category) {
      throw ApiError.badRequest('Specified category does not exist');
    }
    categoryId = category.id;
  }

  const nextPrice = payload.price !== undefined ? payload.price : existing.price;
  const nextDiscountPrice =
    payload.discount_price !== undefined ? payload.discount_price : existing.discount_price;

  if (
    nextDiscountPrice !== null &&
    nextDiscountPrice !== undefined &&
    Number(nextDiscountPrice) > Number(nextPrice)
  ) {
    throw ApiError.badRequest('Discount price cannot exceed regular price');
  }

  const nextSlug = payload.slug || existing.slug;
  if (nextSlug !== existing.slug) {
    const dupSlug = db
      .prepare('SELECT id FROM products WHERE slug = ? AND id != ?')
      .get(nextSlug, id);
    if (dupSlug) {
      throw ApiError.conflict(`Slug "${nextSlug}" is already in use`);
    }
  }

  const nextSku = payload.sku || existing.sku;
  if (nextSku !== existing.sku) {
    const dupSku = db
      .prepare('SELECT id FROM products WHERE sku = ? AND id != ?')
      .get(nextSku, id);
    if (dupSku) {
      throw ApiError.conflict(`SKU "${nextSku}" is already in use`);
    }
  }

  let nextImages = JSON.parse(existing.images || '[]');
  if (payload.images !== undefined || uploadedUrls.length > 0) {
    nextImages = parseImagesInput(
      payload.images !== undefined ? payload.images : nextImages,
      uploadedUrls
    );
  }

  const nextSpecs =
    payload.specs !== undefined ? parseSpecsInput(payload.specs) : JSON.parse(existing.specs || '{}');

  db.prepare(`
    UPDATE products
    SET
      category_id = ?,
      title = ?,
      slug = ?,
      description = ?,
      price = ?,
      discount_price = ?,
      stock_qty = ?,
      sku = ?,
      images = ?,
      specs = ?,
      featured = ?
    WHERE id = ?
  `).run(
    categoryId,
    payload.title ?? existing.title,
    nextSlug,
    payload.description ?? existing.description,
    nextPrice,
    nextDiscountPrice,
    payload.stock_qty !== undefined ? payload.stock_qty : existing.stock_qty,
    nextSku,
    JSON.stringify(nextImages),
    JSON.stringify(nextSpecs),
    payload.featured !== undefined ? (payload.featured ? 1 : 0) : existing.featured,
    id
  );

  return getProductBySlugOrId(id);
}

function deleteProduct(id) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) {
    throw ApiError.notFound('Product not found');
  }

  const orderRefs = db
    .prepare('SELECT COUNT(*) as count FROM order_items WHERE product_id = ?')
    .get(id);
  if (orderRefs && orderRefs.count > 0) {
    // Preserve historical invoice integrity by setting stock_qty = 0 instead of hard-breaking historical foreign keys
    db.prepare('UPDATE products SET stock_qty = 0, featured = 0 WHERE id = ?').run(id);
    return {
      id,
      archived: true,
      message: 'Product is referenced in historical orders; stock has been set to 0 (archived).',
    };
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return { id, deleted: true };
}

function addOrUpdateReview(userId, productId, payload) {
  const db = getDb();
  const product = db
    .prepare('SELECT id FROM products WHERE id = ? OR slug = ?')
    .get(productId, productId);
  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  // Check if user has a confirmed purchase of this product
  const purchased = db
    .prepare(`
      SELECT oi.id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.user_id = ? AND oi.product_id = ? AND o.order_status != 'cancelled'
      LIMIT 1
    `)
    .get(userId, product.id);

  const isVerified = purchased ? 1 : 0;

  const existing = db
    .prepare('SELECT id FROM reviews WHERE user_id = ? AND product_id = ?')
    .get(userId, product.id);

  if (existing) {
    db.prepare(`
      UPDATE reviews
      SET rating = ?, title = ?, comment = ?, is_verified_purchase = ?, created_at = datetime('now')
      WHERE id = ?
    `).run(payload.rating, payload.title || '', payload.comment, isVerified, existing.id);
  } else {
    db.prepare(`
      INSERT INTO reviews (id, user_id, product_id, rating, title, comment, is_verified_purchase)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `rev-${crypto.randomUUID()}`,
      userId,
      product.id,
      payload.rating,
      payload.title || '',
      payload.comment,
      isVerified
    );
  }

  // Recalculate product rating_avg and rating_count
  const stats = db
    .prepare(`
      SELECT AVG(rating) AS avg_rating, COUNT(*) AS total_reviews
      FROM reviews
      WHERE product_id = ?
    `)
    .get(product.id);

  db.prepare(`
    UPDATE products
    SET rating_avg = ?, rating_count = ?
    WHERE id = ?
  `).run(
    Number(Number(stats.avg_rating || 0).toFixed(2)),
    Number(stats.total_reviews || 0),
    product.id
  );

  return getProductBySlugOrId(product.id);
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listProducts,
  getProductBySlugOrId,
  createProduct,
  updateProduct,
  deleteProduct,
  addOrUpdateReview,
};
