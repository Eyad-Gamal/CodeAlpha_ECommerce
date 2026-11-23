# AURA // ATELIER (`CodeAlpha_EcommerceStore`)
### Full-Stack E-Commerce Platform — Architectural Objects & Precision Commerce

An enterprise-grade, security-hardened full-stack e-commerce platform built for **CodeAlpha Task 1**. Designed with a **Layered MVC Node.js + Express.js Backend**, a **9-Table Relational SQL Database with ACID Checkout Transactions**, and a **Neo-Editorial Luxury Glass & Bento Frontend**.

---

## 1. Key Capabilities & Specification Coverage

### Actors & Role-Based Permissions (RBAC)
| Role | Capabilities |
|---|---|
| **Guest** | Browse catalog, instant search (`Ctrl+K`), multi-facet filter & sort, inspect product zoom gallery & verified reviews, build persistent `localStorage` shopping bag with live stock validation, register account. |
| **Customer** | Automatic Guest-to-Database cart synchronization on login, atomic ACID checkout (`COD` or `Card`), printable digital invoices, 4-stage order tracking timeline, self-service pending order cancellation, profile & default shipping address management, verified-buyer product reviews. |
| **Admin** | Executive KPI Bento dashboard (Net Revenue, Order Velocity, Low-Stock Watchlist `stock_qty <= 5`), 1-click warehouse restocking, full Product CRUD with binary-verified `Multipart/form-data` image upload, Category management, and Order fulfillment pipeline transitions (`pending` → `processing` → `shipped` → `delivered` \| `cancelled`). |

---

## 2. Defense-in-Depth Security Architecture

1. **Dual-Token JWT Authentication & Reuse Detection**:
   - Short-lived `HS256` Access Tokens (`15m`) + rotating Refresh Tokens (`7d`, stored as SHA-256 hashes in `refresh_tokens` and delivered via `HttpOnly; SameSite=Strict` cookies).
   - **Token Reuse Detection**: Presenting an already-rotated refresh token immediately revokes all active sessions for that user (`401 TOKEN_REUSE_DETECTED`).
   - Passwords hashed with `bcryptjs` (`12` rounds in production) and verified in constant time (using a precomputed dummy hash when an email is absent) to prevent timing-based user enumeration.
2. **Atomic ACID Checkout & Race-Condition Immunity**:
   - Checkout executes inside `BEGIN IMMEDIATE TRANSACTION`.
   - Conditional atomic stock decrement (`UPDATE products SET stock_qty = stock_qty - ? WHERE id = ? AND stock_qty >= ?`) guarantees inventory can never go negative even under high concurrency.
   - **Zero Client-Side Price Trust**: All prices, discounts, subtotals, 14% VAT, and shipping fees are calculated exclusively from live database records and snapshotted into `order_items`.
3. **OWASP Input, XSS, SQLi & File Upload Hardening**:
   - **100% Prepared Statements**: Every SQL query uses parameterized bindings.
   - **Strict Schema Validation**: All request bodies and parameters are validated via `zod` schemas.
   - **Global XSS & Prototype Pollution Sanitizer**: Strips `<script>`, dangerous tags, inline event handlers (`onerror=`), `javascript:` URIs, and `__proto__`/`constructor` keys.
   - **Binary Magic-Byte Image Verification**: Inspects the first 12 bytes of uploaded buffers to verify true `JPEG`, `PNG`, or `WebP` file signatures before saving with randomized UUID filenames.
   - **Helmet & Tiered Rate Limiting**: Configures strict CSP, `nosniff`, frame protection, payload size limits (`50kb`), and dedicated brute-force rate limiters on `/api/v1/auth/*`.

---

## 3. RESTful API v1 Endpoints

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public | Register customer account & issue JWT tokens |
| `POST` | `/api/v1/auth/login` | Public | Authenticate credentials & issue JWT tokens |
| `POST` | `/api/v1/auth/refresh` | Public | Rotate refresh token & detect token reuse |
| `POST` | `/api/v1/auth/logout` | Auth | Revoke refresh token & clear session cookie |
| `GET` | `/api/v1/auth/me` | Auth | Retrieve current authenticated profile |
| `PUT` | `/api/v1/auth/profile` | Auth | Update profile, shipping address, or password |
| `GET` | `/api/v1/categories` | Public | List categories with active product counts |
| `POST` | `/api/v1/categories` | Admin | Create a new category |
| `PUT` | `/api/v1/categories/:id` | Admin | Update category metadata |
| `DELETE` | `/api/v1/categories/:id` | Admin | Delete empty category |
| `GET` | `/api/v1/products` | Public | Paginated catalog (`?page=&limit=&category=&minPrice=&maxPrice=&minRating=&inStock=&search=&sort=`) |
| `GET` | `/api/v1/products/:slug` | Public | Full product details, specs, verified reviews & similar objects |
| `POST` | `/api/v1/products` | Admin | Create product (`multipart/form-data` or JSON) |
| `PUT` | `/api/v1/products/:id` | Admin | Update product details, pricing, or stock quantity |
| `DELETE` | `/api/v1/products/:id` | Admin | Delete or archive product |
| `POST` | `/api/v1/products/:id/reviews` | Customer | Publish verified rating (1–5) & review |
| `GET` | `/api/v1/cart` | Customer | Retrieve live database cart & financial breakdown |
| `POST` | `/api/v1/cart/items` | Customer | Add or update item quantity with stock validation |
| `POST` | `/api/v1/cart/sync` | Customer | Merge guest `localStorage` cart into database cart |
| `DELETE` | `/api/v1/cart/items/:itemId` | Customer | Remove item from cart |
| `POST` | `/api/v1/orders/checkout` | Customer | Execute atomic ACID checkout & generate invoice |
| `GET` | `/api/v1/orders/my-orders` | Customer | Retrieve customer order history & item snapshots |
| `GET` | `/api/v1/orders/:id` | Auth | Retrieve single order invoice (Owner or Admin only) |
| `PATCH` | `/api/v1/orders/:id/cancel` | Customer | Cancel pending order & restore inventory stock |
| `GET` | `/api/v1/admin/stats` | Admin | Executive KPIs, revenue, status breakdown & low-stock alerts |
| `GET` | `/api/v1/admin/orders` | Admin | List and filter all customer orders |
| `PATCH` | `/api/v1/admin/orders/:id/status` | Admin | Update order fulfillment status & payment status |

---

## 4. Quick Start & Demo Accounts

```bash
# 1. Install dependencies
npm install

# 2. Seed / Reset the relational SQLite database
npm run seed

# 3. Run the automated Unit, API Integration, OWASP Security & Concurrency Test Suites
npm test

# 4. Start the full-stack server (http://localhost:4000)
npm start
```

### Pre-Seeded Demo Credentials
- **Executive Admin**: `admin@aura-atelier.com` / `Admin@123456`
- **Registered Customer**: `customer@aura-atelier.com` / `Customer@123456`
- **VIP Customer**: `layla@aura-atelier.com` / `Layla@123456`
