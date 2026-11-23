process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../backend/app');
const { initDatabase, closeDatabase } = require('../../backend/config/database');

describe('Integration Suite: All /api/v1 RESTful Endpoints & Business Workflows', () => {
  let adminToken = '';
  let customerToken = '';
  let refreshCookie = '';
  let refreshRawToken = '';
  let createdProductId = '';
  let createdProductSlug = '';
  let createdOrderId = '';

  before(() => {
    initDatabase({ forceReset: true, skipSeed: false });
  });

  after(() => {
    closeDatabase();
  });

  it('GET /api/v1/health returns operational status and security headers', async () => {
    const res = await request(app).get('/api/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.status, 'operational');
    assert.ok(res.headers['x-content-type-options'], 'Helmet nosniff header must be set');
  });

  it('POST /api/v1/auth/register creates a new customer account with hashed password & JWT tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Tariq Al-Sayed',
        email: 'tariq@aura-atelier.com',
        password: 'StrongPassword123',
        phone: '+20 100 234 5678',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, 'tariq@aura-atelier.com');
    assert.equal(res.body.data.user.role, 'customer');
    assert.equal(res.body.data.user.password_hash, undefined);
    assert.ok(res.body.token);

    customerToken = res.body.token;
    refreshRawToken = res.body.data.refreshToken;
    refreshCookie = res.headers['set-cookie']?.[0] || '';
  });

  it('POST /api/v1/auth/login authenticates seeded Admin and Customer accounts', async () => {
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@aura-atelier.com',
        password: 'Admin@123456',
      });

    assert.equal(adminRes.status, 200);
    assert.equal(adminRes.body.data.user.role, 'admin');
    adminToken = adminRes.body.token;
  });

  it('POST /api/v1/auth/refresh rotates refresh token and detects token reuse', async () => {
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshRawToken });

    assert.equal(refreshRes.status, 200);
    assert.ok(refreshRes.body.token);
    customerToken = refreshRes.body.token;

    // Attempting to reuse the old already-rotated refresh token must trigger reuse detection!
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshRawToken });

    assert.equal(reuseRes.status, 401);
    assert.equal(reuseRes.body.code, 'TOKEN_REUSE_DETECTED');
  });

  it('GET /api/v1/products supports pagination, category filtering, price bounds, search & sorting', async () => {
    const listRes = await request(app).get(
      '/api/v1/products?page=1&limit=5&category=skincare&minPrice=100&search=serum&sort=price_asc'
    );

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.success, true);
    assert.ok(Array.isArray(listRes.body.data.products));
    assert.ok(listRes.body.data.products.length >= 1);
    assert.equal(listRes.body.data.products[0].category_slug, 'skincare');
  });

  it('GET /api/v1/products/:slug returns full product details, reviews, and similar products', async () => {
    const res = await request(app).get(
      '/api/v1/products/aura-sovereign-planar-wireless-headphones'
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.product.sku, 'AUR-AUD-001');
    assert.ok(Array.isArray(res.body.data.product.reviews));
    assert.ok(Array.isArray(res.body.data.product.similar_products));
  });

  it('POST /api/v1/products (Admin) creates a product with verified multipart image upload', async () => {
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('category_id', 'cat-audio')
      .field('title', 'AURA Reference Tube DAC Amplifier')
      .field('description', 'Class-A vacuum tube desktop DAC and balanced headphone amplifier.')
      .field('price', '1490.00')
      .field('discount_price', '1290.00')
      .field('stock_qty', '12')
      .field('sku', 'AUR-AUD-999')
      .attach('imageFiles', validPngBuffer, {
        filename: 'dac-amp.png',
        contentType: 'image/png',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.product.title, 'AURA Reference Tube DAC Amplifier');
    assert.equal(res.body.data.product.effective_price, 1290);
    assert.ok(res.body.data.product.images[0].startsWith('/assets/uploads/'));

    createdProductId = res.body.data.product.id;
    createdProductSlug = res.body.data.product.slug;
  });

  it('PUT /api/v1/products/:id (Admin) updates product stock and pricing', async () => {
    const res = await request(app)
      .put(`/api/v1/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stock_qty: 8,
        discount_price: 1250.0,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.product.stock_qty, 8);
    assert.equal(res.body.data.product.effective_price, 1250);
  });

  it('POST & GET & DELETE /api/v1/cart manages customer cart items and validates stock limits', async () => {
    // Add 2 units of the newly created product
    const addRes = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        productId: createdProductId,
        quantity: 2,
      });

    assert.equal(addRes.status, 200);
    assert.equal(addRes.body.data.cart.summary.total_items, 2);
    assert.equal(addRes.body.data.cart.summary.subtotal_amount, 2500);

    // Attempt to exceed available stock (stock_qty is 8)
    const exceedRes = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        productId: createdProductId,
        quantity: 25,
      });

    assert.equal(exceedRes.status, 409);
    assert.equal(exceedRes.body.code, 'INSUFFICIENT_STOCK');

    // Sync guest cart items
    const syncRes = await request(app)
      .post('/api/v1/cart/sync')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [{ productId: 'prd-008', quantity: 1 }],
      });

    assert.equal(syncRes.status, 200);
    assert.equal(syncRes.body.data.cart.items.length, 2);

    // Remove prd-008 from cart
    const delRes = await request(app)
      .delete('/api/v1/cart/items/prd-008')
      .set('Authorization', `Bearer ${customerToken}`);

    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.data.cart.items.length, 1);
  });

  it('POST /api/v1/orders/checkout atomically decrements stock, snapshots price, and clears cart', async () => {
    const checkoutRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        paymentMethod: 'Card',
        shippingAddress: {
          fullName: 'Tariq Al-Sayed',
          street: '14 Zamalek Nile View St',
          city: 'Cairo',
          state: 'Cairo',
          postalCode: '11211',
          country: 'Egypt',
          phone: '+20 100 234 5678',
        },
        notes: 'Call before arrival',
      });

    assert.equal(checkoutRes.status, 201);
    const order = checkoutRes.body.data.order;
    createdOrderId = order.id;

    assert.ok(order.order_number.startsWith('ORD-'));
    assert.equal(order.subtotal_amount, 2500);
    assert.equal(order.tax_amount, 350); // 14% of 2500
    assert.equal(order.shipping_fee, 0); // Free shipping over $250
    assert.equal(order.total_amount, 2850);
    assert.equal(order.items[0].unit_price_snapshot, 1250);

    // Verify stock was decremented from 8 to 6
    const prodRes = await request(app).get(`/api/v1/products/${createdProductSlug}`);
    assert.equal(prodRes.body.data.product.stock_qty, 6);

    // Verify cart is now empty
    const cartRes = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`);
    assert.equal(cartRes.body.data.cart.items.length, 0);
  });

  it('POST /api/v1/products/:id/reviews marks verified purchase and updates rating_avg', async () => {
    const revRes = await request(app)
      .post(`/api/v1/products/${createdProductId}/reviews`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        rating: 5,
        title: 'Warm holographic soundstage',
        comment: 'Drives my planar headphones with effortless authority.',
      });

    assert.equal(revRes.status, 201);
    assert.equal(revRes.body.data.product.rating_avg, 5);
    assert.equal(revRes.body.data.product.reviews[0].is_verified_purchase, true);
  });

  it('GET /api/v1/orders/my-orders and PATCH /api/v1/admin/orders/:id/status manage lifecycle', async () => {
    const myOrdersRes = await request(app)
      .get('/api/v1/orders/my-orders')
      .set('Authorization', `Bearer ${customerToken}`);

    assert.equal(myOrdersRes.status, 200);
    assert.equal(myOrdersRes.body.data.orders.length, 1);

    // Admin transitions order status to 'shipped'
    const patchRes = await request(app)
      .patch(`/api/v1/admin/orders/${createdOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ order_status: 'shipped' });

    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.order.order_status, 'shipped');

    // Admin cancels order -> must automatically restore the 2 units of stock (6 -> 8)!
    const cancelRes = await request(app)
      .patch(`/api/v1/admin/orders/${createdOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ order_status: 'cancelled' });

    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.data.order.order_status, 'cancelled');
    assert.equal(cancelRes.body.data.order.payment_status, 'refunded');

    const prodAfterCancel = await request(app).get(`/api/v1/products/${createdProductSlug}`);
    assert.equal(prodAfterCancel.body.data.product.stock_qty, 8);
  });
});
