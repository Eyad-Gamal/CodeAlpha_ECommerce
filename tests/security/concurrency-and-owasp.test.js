process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../backend/app');
const { initDatabase, getDb, closeDatabase } = require('../../backend/config/database');

describe('Security & Concurrency Penetration Suite (OWASP Top 10 + Race Condition Stress Test)', () => {
  let adminToken = '';
  let customerAToken = '';
  let customerBToken = '';

  before(async () => {
    initDatabase({ forceReset: true, skipSeed: false });

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@aura-atelier.com', password: 'Admin@123456' });
    adminToken = adminLogin.body.token;

    const custALogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer@aura-atelier.com', password: 'Customer@123456' });
    customerAToken = custALogin.body.token;

    const custBLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'layla@aura-atelier.com', password: 'Layla@123456' });
    customerBToken = custBLogin.body.token;
  });

  after(() => {
    closeDatabase();
  });

  it('CONCURRENCY STRESS TEST: 10 simultaneous checkouts for a product with stock_qty = 3 never oversell', async () => {
    const db = getDb();
    // Set prd-006 stock_qty to exactly 3
    db.prepare('UPDATE products SET stock_qty = 3 WHERE id = ?').run('prd-006');

    // Register 10 distinct buyers and put 1 unit of prd-006 in each buyer's cart
    const buyerTokens = [];
    for (let i = 0; i < 10; i++) {
      const regRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: `Concurrent Buyer ${i}`,
          email: `buyer${i}@concurrency-test.com`,
          password: 'ConcurrentPass123',
        });
      const token = regRes.body.token;
      buyerTokens.push(token);

      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: 'prd-006', quantity: 1 });
    }

    // Fire all 10 checkout requests concurrently
    const checkoutPromises = buyerTokens.map((token, idx) =>
      request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${token}`)
        .send({
          paymentMethod: 'Card',
          shippingAddress: {
            fullName: `Concurrent Buyer ${idx}`,
            street: '100 Concurrency Way',
            city: 'Austin',
            state: 'TX',
            postalCode: '78701',
            country: 'United States',
            phone: '+1 555 000 1111',
          },
        })
    );

    const results = await Promise.all(checkoutPromises);
    const succeeded = results.filter((r) => r.status === 201);
    const failedConflict = results.filter((r) => r.status === 409);

    assert.equal(succeeded.length, 3, 'Exactly 3 orders must succeed for stock_qty = 3');
    assert.equal(failedConflict.length, 7, 'Remaining 7 concurrent checkouts must fail with 409 Conflict');

    const finalStock = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get('prd-006');
    assert.equal(finalStock.stock_qty, 0, 'Final stock_qty must be exactly 0 and never negative');
  });

  it('PRICE-TAMPERING DEFENSE: Checkout ignores client-supplied forged prices or totals', async () => {
    // Customer A adds prd-001 (effective_price = $495.00)
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({
        productId: 'prd-001',
        quantity: 1,
        price: 0.01,
        unit_price: 0.01,
      });

    const checkoutRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({
        paymentMethod: 'COD',
        subtotal_amount: 0.01,
        total_amount: 0.01,
        shippingAddress: {
          fullName: 'Marcus Sterling',
          street: '450 Mercer Street',
          city: 'New York',
          state: 'NY',
          postalCode: '10013',
          country: 'United States',
          phone: '+1 555 876 5432',
        },
      });

    assert.equal(checkoutRes.status, 201);
    const order = checkoutRes.body.data.order;
    assert.equal(order.subtotal_amount, 495.0, 'Server must enforce DB price ($495), not forged $0.01');
    assert.ok(order.total_amount > 500, 'Total amount must include real DB price + VAT');
  });

  it('IDOR DEFENSE: Customer B cannot access or cancel Customer A orders', async () => {
    const custAOrders = await request(app)
      .get('/api/v1/orders/my-orders')
      .set('Authorization', `Bearer ${customerAToken}`);
    const targetOrderId = custAOrders.body.data.orders[0].id;

    // Customer B tries to read Customer A's order
    const idorReadRes = await request(app)
      .get(`/api/v1/orders/${targetOrderId}`)
      .set('Authorization', `Bearer ${customerBToken}`);
    assert.equal(idorReadRes.status, 403);

    // Customer B tries to cancel Customer A's order
    const idorCancelRes = await request(app)
      .patch(`/api/v1/orders/${targetOrderId}/cancel`)
      .set('Authorization', `Bearer ${customerBToken}`);
    assert.equal(idorCancelRes.status, 403);
  });

  it('RBAC PRIVILEGE ESCALATION DEFENSE: Customer token is blocked from all Admin endpoints', async () => {
    const createProdAttempt = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({
        category_id: 'cat-audio',
        title: 'Unauthorized Product',
        description: 'Should be blocked by RBAC',
        price: 100,
        stock_qty: 10,
      });
    assert.equal(createProdAttempt.status, 403);

    const adminStatsAttempt = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${customerAToken}`);
    assert.equal(adminStatsAttempt.status, 403);

    const adminOrderPatchAttempt = await request(app)
      .patch('/api/v1/admin/orders/ord-sample-0001/status')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({ order_status: 'delivered' });
    assert.equal(adminOrderPatchAttempt.status, 403);
  });

  it('SQL INJECTION DEFENSE: SQLi payloads in login, search, and product slug fail safely', async () => {
    const sqliLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: "admin@aura-atelier.com' OR '1'='1' --",
        password: "' OR '1'='1",
      });
    assert.ok([400, 401].includes(sqliLogin.status));

    const sqliSearch = await request(app).get(
      "/api/v1/products?search=' UNION SELECT id, email, password_hash FROM users --"
    );
    assert.equal(sqliSearch.status, 200);
    assert.equal(sqliSearch.body.data.products.length, 0);

    const sqliSlug = await request(app).get(
      "/api/v1/products/aura-sovereign'; DROP TABLE products; --"
    );
    assert.equal(sqliSlug.status, 404);

    // Confirm products table is completely intact
    const checkProducts = await request(app).get('/api/v1/products');
    assert.ok(checkProducts.body.data.products.length > 0);
  });

  it('STORED XSS DEFENSE: Malicious script tags in reviews and profiles are neutralized', async () => {
    const xssReview = await request(app)
      .post('/api/v1/products/prd-001/reviews')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({
        rating: 5,
        title: '<script>window.hacked=true</script>Great Headphones',
        comment: 'Awesome sound <img src=x onerror="alert(document.cookie)">',
      });

    assert.equal(xssReview.status, 201);
    const savedReview = xssReview.body.data.product.reviews.find(
      (r) => r.title.includes('Great Headphones')
    );
    assert.ok(savedReview);
    assert.equal(savedReview.title.includes('<script>'), false);
    assert.equal(savedReview.comment.includes('onerror='), false);
  });

  it('MALICIOUS FILE UPLOAD DEFENSE: Rejects PHP script disguised with .jpg extension & image/jpeg MIME', async () => {
    const fakeJpgBuffer = Buffer.from('<?php exec("/bin/sh -i <&3 >&3 2>&3"); ?>', 'utf8');

    const uploadAttempt = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('category_id', 'cat-audio')
      .field('title', 'Exploit Upload Test')
      .field('description', 'Testing magic byte filter')
      .field('price', '199')
      .field('stock_qty', '5')
      .attach('imageFiles', fakeJpgBuffer, {
        filename: 'backdoor.jpg',
        contentType: 'image/jpeg',
      });

    assert.equal(uploadAttempt.status, 400);
    assert.equal(uploadAttempt.body.code, 'MALICIOUS_FILE_SIGNATURE');
  });
});
