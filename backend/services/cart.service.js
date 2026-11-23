const crypto = require('node:crypto');
const { getDb } = require('../config/database');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

function ensureUserCart(userId) {
  const db = getDb();
  let cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(userId);
  if (!cart) {
    const cartId = `cart-${crypto.randomUUID()}`;
    db.prepare('INSERT INTO carts (id, user_id) VALUES (?, ?)').run(cartId, userId);
    cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId);
  }
  return cart;
}

function roundCurrency(amount) {
  return Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
}

/**
 * Computes full cart summary with live stock validation, savings, tax, and shipping (FR-04)
 */
function getCart(userId) {
  const db = getDb();
  const cart = ensureUserCart(userId);

  const rows = db
    .prepare(`
      SELECT
        ci.id AS item_id,
        ci.quantity,
        p.id AS product_id,
        p.title,
        p.slug,
        p.sku,
        p.price,
        p.discount_price,
        p.stock_qty,
        p.images,
        c.name AS category_name
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      JOIN categories c ON c.id = p.category_id
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at ASC
    `)
    .all(cart.id);

  let subtotal = 0;
  let originalSubtotal = 0;
  let totalItems = 0;
  const stockWarnings = [];

  const items = rows.map((row) => {
    let images = [];
    try {
      images = JSON.parse(row.images || '[]');
    } catch {
      images = [];
    }

    const unitPrice =
      row.discount_price !== null &&
      row.discount_price !== undefined &&
      Number(row.discount_price) < Number(row.price)
        ? Number(row.discount_price)
        : Number(row.price);

    const lineSubtotal = roundCurrency(unitPrice * row.quantity);
    const lineOriginal = roundCurrency(Number(row.price) * row.quantity);

    subtotal = roundCurrency(subtotal + lineSubtotal);
    originalSubtotal = roundCurrency(originalSubtotal + lineOriginal);
    totalItems += Number(row.quantity);

    const exceedsStock = row.quantity > row.stock_qty;
    if (exceedsStock) {
      stockWarnings.push({
        productId: row.product_id,
        title: row.title,
        requested: row.quantity,
        available: row.stock_qty,
      });
    }

    return {
      id: row.item_id,
      product_id: row.product_id,
      title: row.title,
      slug: row.slug,
      sku: row.sku,
      category_name: row.category_name,
      image: images[0] || '',
      regular_price: Number(row.price),
      discount_price:
        row.discount_price !== null && row.discount_price !== undefined
          ? Number(row.discount_price)
          : null,
      unit_price: unitPrice,
      quantity: Number(row.quantity),
      stock_qty: Number(row.stock_qty),
      exceeds_stock: exceedsStock,
      line_subtotal: lineSubtotal,
    };
  });

  const discountSavings = roundCurrency(Math.max(0, originalSubtotal - subtotal));
  const taxAmount = roundCurrency(subtotal * env.TAX_RATE);
  const shippingFee =
    subtotal === 0 || subtotal >= env.FREE_SHIPPING_THRESHOLD
      ? 0
      : env.STANDARD_SHIPPING_FEE;
  const totalAmount = roundCurrency(subtotal + taxAmount + shippingFee);
  const amountToFreeShipping = roundCurrency(
    Math.max(0, env.FREE_SHIPPING_THRESHOLD - subtotal)
  );

  return {
    cart_id: cart.id,
    user_id: userId,
    items,
    summary: {
      total_items: totalItems,
      original_subtotal: originalSubtotal,
      discount_savings: discountSavings,
      subtotal_amount: subtotal,
      tax_rate: env.TAX_RATE,
      tax_amount: taxAmount,
      shipping_fee: shippingFee,
      free_shipping_threshold: env.FREE_SHIPPING_THRESHOLD,
      amount_to_free_shipping: amountToFreeShipping,
      total_amount: totalAmount,
      is_valid_for_checkout: items.length > 0 && stockWarnings.length === 0,
      stock_warnings: stockWarnings,
    },
  };
}

/**
 * Adds or updates a product in the user's cart with strict real-time stock validation (FR-04)
 */
function upsertCartItem(userId, { productId, quantity, mode = 'set' }) {
  const db = getDb();
  const cart = ensureUserCart(userId);

  const product = db
    .prepare('SELECT id, title, stock_qty FROM products WHERE id = ?')
    .get(productId);
  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  if (product.stock_qty <= 0) {
    throw ApiError.conflict(`"${product.title}" is currently out of stock`, null, 'OUT_OF_STOCK');
  }

  const existingItem = db
    .prepare('SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?')
    .get(cart.id, productId);

  const targetQty =
    mode === 'increment' && existingItem
      ? existingItem.quantity + quantity
      : quantity;

  if (targetQty > product.stock_qty) {
    throw ApiError.conflict(
      `Only ${product.stock_qty} unit(s) of "${product.title}" are available in stock`,
      { availableStock: product.stock_qty },
      'INSUFFICIENT_STOCK'
    );
  }

  if (existingItem) {
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(
      targetQty,
      existingItem.id
    );
  } else {
    db.prepare(`
      INSERT INTO cart_items (id, cart_id, product_id, quantity)
      VALUES (?, ?, ?, ?)
    `).run(`ci-${crypto.randomUUID()}`, cart.id, productId, targetQty);
  }

  db.prepare(`UPDATE carts SET updated_at = datetime('now') WHERE id = ?`).run(cart.id);
  return getCart(userId);
}

/**
 * Merges Guest LocalStorage cart items into Customer database cart upon login/registration
 */
function syncGuestCart(userId, guestItems = []) {
  const db = getDb();
  const cart = ensureUserCart(userId);

  for (const item of guestItems) {
    if (!item || !item.productId || !item.quantity || item.quantity < 1) continue;
    const product = db
      .prepare('SELECT id, stock_qty FROM products WHERE id = ?')
      .get(item.productId);
    if (!product || product.stock_qty <= 0) continue;

    const existing = db
      .prepare('SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?')
      .get(cart.id, product.id);

    const cappedQty = Math.min(
      product.stock_qty,
      existing ? Math.max(existing.quantity, item.quantity) : item.quantity
    );

    if (cappedQty < 1) continue;

    if (existing) {
      db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(cappedQty, existing.id);
    } else {
      db.prepare(`
        INSERT INTO cart_items (id, cart_id, product_id, quantity)
        VALUES (?, ?, ?, ?)
      `).run(`ci-${crypto.randomUUID()}`, cart.id, product.id, cappedQty);
    }
  }

  db.prepare(`UPDATE carts SET updated_at = datetime('now') WHERE id = ?`).run(cart.id);
  return getCart(userId);
}

function removeCartItem(userId, itemIdOrProductId) {
  const db = getDb();
  const cart = ensureUserCart(userId);

  const result = db
    .prepare('DELETE FROM cart_items WHERE cart_id = ? AND (id = ? OR product_id = ?)')
    .run(cart.id, itemIdOrProductId, itemIdOrProductId);

  if (result.changes === 0) {
    throw ApiError.notFound('Cart item not found');
  }

  db.prepare(`UPDATE carts SET updated_at = datetime('now') WHERE id = ?`).run(cart.id);
  return getCart(userId);
}

function clearCart(userId) {
  const db = getDb();
  const cart = ensureUserCart(userId);
  db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
  db.prepare(`UPDATE carts SET updated_at = datetime('now') WHERE id = ?`).run(cart.id);
  return getCart(userId);
}

module.exports = {
  ensureUserCart,
  roundCurrency,
  getCart,
  upsertCartItem,
  syncGuestCart,
  removeCartItem,
  clearCart,
};
