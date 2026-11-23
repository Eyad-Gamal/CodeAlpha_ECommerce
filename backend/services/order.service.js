const crypto = require('node:crypto');
const { getDb, withTransaction } = require('../config/database');
const env = require('../config/env');
const { roundCurrency, ensureUserCart } = require('./cart.service');
const ApiError = require('../utils/ApiError');

function generateOrderNumber() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `ORD-${yyyy}${mm}${dd}-${rand}`;
}

function formatOrderRecord(orderRow, itemsRows = []) {
  if (!orderRow) return null;
  let shippingAddress = {};
  try {
    shippingAddress =
      typeof orderRow.shipping_address === 'string'
        ? JSON.parse(orderRow.shipping_address)
        : orderRow.shipping_address || {};
  } catch {
    shippingAddress = {};
  }

  return {
    id: orderRow.id,
    user_id: orderRow.user_id,
    customer_name: orderRow.customer_name || shippingAddress.fullName || undefined,
    customer_email: orderRow.customer_email || undefined,
    order_number: orderRow.order_number,
    subtotal_amount: Number(orderRow.subtotal_amount),
    tax_amount: Number(orderRow.tax_amount),
    shipping_fee: Number(orderRow.shipping_fee),
    total_amount: Number(orderRow.total_amount),
    payment_method: orderRow.payment_method,
    payment_status: orderRow.payment_status,
    order_status: orderRow.order_status,
    shipping_address: shippingAddress,
    notes: orderRow.notes || '',
    created_at: orderRow.created_at,
    updated_at: orderRow.updated_at,
    items: itemsRows.map((item) => ({
      id: item.id,
      order_id: item.order_id,
      product_id: item.product_id,
      product_name_snapshot: item.product_name_snapshot,
      product_sku_snapshot: item.product_sku_snapshot,
      product_image_snapshot: item.product_image_snapshot,
      unit_price_snapshot: Number(item.unit_price_snapshot),
      quantity: Number(item.quantity),
      subtotal: Number(item.subtotal),
    })),
  };
}

/**
 * Atomic ACID Checkout Engine (FR-05)
 * - Runs inside BEGIN IMMEDIATE TRANSACTION
 * - Never trusts client prices: queries live product prices from DB
 * - Atomically decrements stock with `WHERE id = ? AND stock_qty >= ?` to eliminate race conditions
 * - Snapshots product title, SKU, image, and effective unit price into `order_items`
 * - Clears customer cart atomically
 */
function checkoutOrder(userId, payload) {
  return withTransaction((db) => {
    const cart = ensureUserCart(userId);

    const cartRows = db
      .prepare(`
        SELECT
          ci.id AS cart_item_id,
          ci.product_id,
          ci.quantity,
          p.title,
          p.sku,
          p.price,
          p.discount_price,
          p.stock_qty,
          p.images
        FROM cart_items ci
        JOIN products p ON p.id = ci.product_id
        WHERE ci.cart_id = ?
      `)
      .all(cart.id);

    if (!cartRows || cartRows.length === 0) {
      throw ApiError.badRequest('Your shopping cart is empty', null, 'EMPTY_CART');
    }

    const decrementStmt = db.prepare(`
      UPDATE products
      SET stock_qty = stock_qty - ?, sales_count = sales_count + ?
      WHERE id = ? AND stock_qty >= ?
    `);

    let subtotal = 0;
    const preparedItems = [];

    for (const row of cartRows) {
      // Atomic conditional stock decrement prevents TOCTOU race conditions
      const updateResult = decrementStmt.run(
        row.quantity,
        row.quantity,
        row.product_id,
        row.quantity
      );

      if (updateResult.changes !== 1) {
        throw ApiError.conflict(
          `Insufficient stock for "${row.title}". Requested ${row.quantity}, but only ${row.stock_qty} left.`,
          {
            productId: row.product_id,
            title: row.title,
            requested: row.quantity,
            available: row.stock_qty,
          },
          'INSUFFICIENT_STOCK'
        );
      }

      const unitPrice =
        row.discount_price !== null &&
        row.discount_price !== undefined &&
        Number(row.discount_price) < Number(row.price)
          ? Number(row.discount_price)
          : Number(row.price);

      const lineSubtotal = roundCurrency(unitPrice * row.quantity);
      subtotal = roundCurrency(subtotal + lineSubtotal);

      let firstImage = '';
      try {
        const imgs = JSON.parse(row.images || '[]');
        firstImage = imgs[0] || '';
      } catch {
        firstImage = '';
      }

      preparedItems.push({
        id: `oi-${crypto.randomUUID()}`,
        product_id: row.product_id,
        product_name_snapshot: row.title,
        product_sku_snapshot: row.sku,
        product_image_snapshot: firstImage,
        unit_price_snapshot: unitPrice,
        quantity: row.quantity,
        subtotal: lineSubtotal,
      });
    }

    const taxAmount = roundCurrency(subtotal * env.TAX_RATE);
    const shippingFee =
      subtotal >= env.FREE_SHIPPING_THRESHOLD ? 0 : env.STANDARD_SHIPPING_FEE;
    const totalAmount = roundCurrency(subtotal + taxAmount + shippingFee);

    const orderId = `ord-${crypto.randomUUID()}`;
    const orderNumber = generateOrderNumber();
    const paymentStatus = payload.paymentMethod === 'Card' ? 'paid' : 'pending';
    const orderStatus = payload.paymentMethod === 'Card' ? 'processing' : 'pending';

    db.prepare(`
      INSERT INTO orders (
        id, user_id, order_number, subtotal_amount, tax_amount, shipping_fee,
        total_amount, payment_method, payment_status, order_status,
        shipping_address, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      orderId,
      userId,
      orderNumber,
      subtotal,
      taxAmount,
      shippingFee,
      totalAmount,
      payload.paymentMethod,
      paymentStatus,
      orderStatus,
      JSON.stringify(payload.shippingAddress),
      payload.notes || ''
    );

    const insertOrderItem = db.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, product_name_snapshot, product_sku_snapshot,
        product_image_snapshot, unit_price_snapshot, quantity, subtotal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of preparedItems) {
      insertOrderItem.run(
        item.id,
        orderId,
        item.product_id,
        item.product_name_snapshot,
        item.product_sku_snapshot,
        item.product_image_snapshot,
        item.unit_price_snapshot,
        item.quantity,
        item.subtotal
      );
    }

    // Also save default shipping address on user profile if empty
    db.prepare(`
      UPDATE users
      SET address = ?, phone = COALESCE(NULLIF(phone, ''), ?)
      WHERE id = ?
    `).run(
      JSON.stringify(payload.shippingAddress),
      payload.shippingAddress.phone || '',
      userId
    );

    // Clear user's cart
    db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
    db.prepare(`UPDATE carts SET updated_at = datetime('now') WHERE id = ?`).run(cart.id);

    const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    const createdItems = db
      .prepare('SELECT * FROM order_items WHERE order_id = ?')
      .all(orderId);

    return formatOrderRecord(createdOrder, createdItems);
  });
}

function getCustomerOrders(userId) {
  const db = getDb();
  const orders = db
    .prepare(`
      SELECT *
      FROM orders
      WHERE user_id = ?
      ORDER BY created_at DESC
    `)
    .all(userId);

  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  return orders.map((ord) => formatOrderRecord(ord, itemsStmt.all(ord.id)));
}

/**
 * Fetches single order by ID or order_number with strict ownership / IDOR protection
 */
function getOrderById(orderIdOrNumber, requestingUser) {
  const db = getDb();
  const order = db
    .prepare(`
      SELECT o.*, u.name AS customer_name, u.email AS customer_email
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE o.id = ? OR o.order_number = ?
    `)
    .get(orderIdOrNumber, orderIdOrNumber);

  if (!order) {
    throw ApiError.notFound('Order not found');
  }

  // Strict IDOR Guard: Customers can only view their own orders
  if (requestingUser.role !== 'admin' && order.user_id !== requestingUser.id) {
    throw ApiError.forbidden('You do not have permission to view this order');
  }

  const items = db
    .prepare('SELECT * FROM order_items WHERE order_id = ?')
    .all(order.id);

  return formatOrderRecord(order, items);
}

/**
 * Customer self-service order cancellation (only allowed while order is 'pending')
 */
function cancelCustomerOrder(orderId, userId) {
  return withTransaction((db) => {
    const order = db
      .prepare('SELECT * FROM orders WHERE id = ?')
      .get(orderId);

    if (!order) {
      throw ApiError.notFound('Order not found');
    }

    if (order.user_id !== userId) {
      throw ApiError.forbidden('You can only cancel your own orders');
    }

    if (order.order_status !== 'pending') {
      throw ApiError.conflict(
        `Order cannot be cancelled by customer once it is "${order.order_status}"`
      );
    }

    const items = db
      .prepare('SELECT * FROM order_items WHERE order_id = ?')
      .all(order.id);

    // Restore stock atomically
    const restoreStmt = db.prepare(`
      UPDATE products
      SET stock_qty = stock_qty + ?, sales_count = MAX(0, sales_count - ?)
      WHERE id = ?
    `);
    for (const item of items) {
      restoreStmt.run(item.quantity, item.quantity, item.product_id);
    }

    const nextPaymentStatus = order.payment_status === 'paid' ? 'refunded' : 'failed';
    db.prepare(`
      UPDATE orders
      SET order_status = 'cancelled', payment_status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nextPaymentStatus, order.id);

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    return formatOrderRecord(updated, items);
  });
}

/**
 * Admin Order Status Update with Inventory Restoration on Cancellation (FR-06)
 */
function updateOrderStatusByAdmin(orderId, payload) {
  return withTransaction((db) => {
    const order = db
      .prepare(`
        SELECT o.*, u.name AS customer_name, u.email AS customer_email
        FROM orders o
        JOIN users u ON u.id = o.user_id
        WHERE o.id = ?
      `)
      .get(orderId);

    if (!order) {
      throw ApiError.notFound('Order not found');
    }

    const prevStatus = order.order_status;
    const nextStatus = payload.order_status || prevStatus;
    let nextPaymentStatus = payload.payment_status || order.payment_status;

    if (prevStatus === 'delivered' && nextStatus === 'cancelled') {
      throw ApiError.conflict('Cannot cancel an order that has already been delivered');
    }

    const items = db
      .prepare('SELECT * FROM order_items WHERE order_id = ?')
      .all(order.id);

    // If transitioning from active to cancelled, restore stock_qty
    if (prevStatus !== 'cancelled' && nextStatus === 'cancelled') {
      const restoreStmt = db.prepare(`
        UPDATE products
        SET stock_qty = stock_qty + ?, sales_count = MAX(0, sales_count - ?)
        WHERE id = ?
      `);
      for (const item of items) {
        restoreStmt.run(item.quantity, item.quantity, item.product_id);
      }
      if (!payload.payment_status && order.payment_status === 'paid') {
        nextPaymentStatus = 'refunded';
      }
    }

    // If order is marked delivered on a COD order, auto-mark payment as paid
    if (nextStatus === 'delivered' && !payload.payment_status && order.payment_method === 'COD') {
      nextPaymentStatus = 'paid';
    }

    db.prepare(`
      UPDATE orders
      SET order_status = ?, payment_status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nextStatus, nextPaymentStatus, order.id);

    const updated = db
      .prepare(`
        SELECT o.*, u.name AS customer_name, u.email AS customer_email
        FROM orders o
        JOIN users u ON u.id = o.user_id
        WHERE o.id = ?
      `)
      .get(order.id);

    return formatOrderRecord(updated, items);
  });
}

function listAllOrdersForAdmin(query = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (query.status && query.status !== 'all') {
    conditions.push('o.order_status = ?');
    params.push(query.status);
  }

  if (query.search && String(query.search).trim() !== '') {
    const term = `%${String(query.search).trim()}%`;
    conditions.push('(o.order_number LIKE ? OR u.name LIKE ? OR u.email LIKE ?)');
    params.push(term, term, term);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orders = db
    .prepare(`
      SELECT o.*, u.name AS customer_name, u.email AS customer_email
      FROM orders o
      JOIN users u ON u.id = o.user_id
      ${whereSql}
      ORDER BY o.created_at DESC
    `)
    .all(...params);

  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  return orders.map((ord) => formatOrderRecord(ord, itemsStmt.all(ord.id)));
}

/**
 * Executive Admin Dashboard Telemetry (Section 6: Total Revenue, Total Orders, Low Stock Alerts)
 */
function getAdminDashboardStats() {
  const db = getDb();

  const revRow = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN order_status != 'cancelled' THEN total_amount ELSE 0 END), 0) AS total_revenue,
        COUNT(*) AS total_orders,
        SUM(CASE WHEN order_status = 'pending' THEN 1 ELSE 0 END) AS pending_orders,
        SUM(CASE WHEN order_status = 'processing' THEN 1 ELSE 0 END) AS processing_orders,
        SUM(CASE WHEN order_status = 'shipped' THEN 1 ELSE 0 END) AS shipped_orders,
        SUM(CASE WHEN order_status = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders,
        SUM(CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders
      FROM orders
    `)
    .get();

  const countsRow = db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM products) AS total_products,
        (SELECT COUNT(*) FROM categories) AS total_categories,
        (SELECT COUNT(*) FROM users WHERE role = 'customer') AS total_customers
    `)
    .get();

  const lowStockProducts = db
    .prepare(`
      SELECT
        p.id, p.title, p.slug, p.sku, p.stock_qty, p.price, p.discount_price,
        c.name AS category_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.stock_qty <= 5
      ORDER BY p.stock_qty ASC, p.sales_count DESC
    `)
    .all();

  const topSellingProducts = db
    .prepare(`
      SELECT
        p.id, p.title, p.slug, p.sku, p.sales_count, p.stock_qty, p.price, p.discount_price, p.rating_avg
      FROM products p
      ORDER BY p.sales_count DESC
      LIMIT 5
    `)
    .all();

  return {
    kpis: {
      total_revenue: roundCurrency(revRow.total_revenue || 0),
      total_orders: Number(revRow.total_orders || 0),
      total_products: Number(countsRow.total_products || 0),
      total_categories: Number(countsRow.total_categories || 0),
      total_customers: Number(countsRow.total_customers || 0),
      low_stock_count: lowStockProducts.length,
    },
    status_breakdown: {
      pending: Number(revRow.pending_orders || 0),
      processing: Number(revRow.processing_orders || 0),
      shipped: Number(revRow.shipped_orders || 0),
      delivered: Number(revRow.delivered_orders || 0),
      cancelled: Number(revRow.cancelled_orders || 0),
    },
    low_stock_alerts: lowStockProducts,
    top_selling_products: topSellingProducts,
  };
}

module.exports = {
  checkoutOrder,
  getCustomerOrders,
  getOrderById,
  cancelCustomerOrder,
  updateOrderStatusByAdmin,
  listAllOrdersForAdmin,
  getAdminDashboardStats,
};
