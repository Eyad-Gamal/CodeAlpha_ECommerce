export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatCurrency(amount) {
  const num = Number(amount || 0);
  return `$${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function getFallbackSvgDataUri(label = 'AURA') {
  const clean = escapeHtml(String(label).slice(0, 22));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="550" viewBox="0 0 800 550">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#11131f"/>
        <stop offset="50%" stop-color="#1e1b4b"/>
        <stop offset="100%" stop-color="#090a0f"/>
      </linearGradient>
    </defs>
    <rect width="800" height="550" fill="url(#g)"/>
    <circle cx="400" cy="245" r="90" fill="none" stroke="#6366f1" stroke-width="2" opacity="0.5"/>
    <text x="400" y="258" text-anchor="middle" fill="#f59e0b" font-family="monospace" font-size="36" font-weight="bold">◆ AURA</text>
    <text x="400" y="375" text-anchor="middle" fill="#a5b4fc" font-family="sans-serif" font-size="21" letter-spacing="2">${clean}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Dynamically updates Document Title, Meta Description, Canonical URL,
 * OpenGraph/Twitter tags, and Schema.org JSON-LD Structured Data for SEO.
 */
export function updateSeoMeta({
  title,
  description,
  image,
  urlPath = '/',
  type = 'website',
  jsonLd = null,
}) {
  const fullTitle = title
    ? `${title} | AURA // ATELIER`
    : 'AURA // ATELIER — Architectural Objects, Horology & Spatial Audio Store';
  const desc =
    description ||
    'Shop AURA // ATELIER for Grade-5 titanium planar headphones, Swiss automatic chronographs, CNC mechanical keyboards, and cellular skincare.';
  const img =
    image ||
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=85';
  const origin = window.location.origin;
  const fullUrl = `${origin}${urlPath}`;

  document.title = fullTitle;

  const setMeta = (selector, attr, val) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, val);
  };

  setMeta('meta[name="description"]', 'content', desc);
  setMeta('#link-canonical', 'href', fullUrl);
  setMeta('#og-type', 'content', type);
  setMeta('#og-title', 'content', fullTitle);
  setMeta('#og-description', 'content', desc);
  setMeta('#og-image', 'content', img);
  setMeta('#tw-title', 'content', fullTitle);
  setMeta('#tw-description', 'content', desc);
  setMeta('#tw-image', 'content', img);

  const schemaEl = document.getElementById('schema-org-graph');
  if (schemaEl && jsonLd) {
    schemaEl.textContent = JSON.stringify(jsonLd);
  }
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast-item ${type}`;
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;">
      <span>${escapeHtml(message)}</span>
      <button type="button" style="opacity:0.65;font-size:1rem;" aria-label="Dismiss">&times;</button>
    </div>
  `;

  el.querySelector('button')?.addEventListener('click', () => el.remove());
  container.appendChild(el);

  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 3800);
}

export function renderProductCard(product) {
  const hasDiscount =
    product.discount_price !== null &&
    product.discount_price !== undefined &&
    Number(product.discount_price) < Number(product.price);

  const discountPct = hasDiscount
    ? Math.round(((product.price - product.discount_price) / product.price) * 100)
    : 0;

  let stockBadgeHtml = '';
  if (product.stock_qty <= 0) {
    stockBadgeHtml = `<span class="badge-pill badge-stock-out">SOLD OUT</span>`;
  } else if (product.stock_qty <= 5) {
    stockBadgeHtml = `<span class="badge-pill badge-stock-low">ONLY ${product.stock_qty} LEFT</span>`;
  } else {
    stockBadgeHtml = `<span class="badge-pill badge-stock-ok">${product.stock_qty} IN STOCK</span>`;
  }

  const primaryImage = product.images?.[0] || getFallbackSvgDataUri(product.title);
  const fallbackUri = getFallbackSvgDataUri(product.title);

  return `
    <article
      class="product-card"
      data-product-id="${escapeHtml(product.id)}"
      itemscope
      itemtype="https://schema.org/Product"
    >
      <div class="product-media-wrap" data-view-product="${escapeHtml(product.slug)}">
        <img
          src="${escapeHtml(primaryImage)}"
          alt="${escapeHtml(product.title)}"
          width="640"
          height="440"
          loading="lazy"
          decoding="async"
          itemprop="image"
          onerror="this.onerror=null;this.src='${fallbackUri}'"
        />
        <div class="card-badges-top">
          <div style="display:flex;gap:0.3rem;flex-wrap:wrap;">
            ${hasDiscount ? `<span class="badge-pill badge-discount">-${discountPct}%</span>` : ''}
            ${product.featured ? `<span class="badge-pill badge-featured">ATELIER PICK</span>` : ''}
          </div>
          ${stockBadgeHtml}
        </div>
      </div>

      <div class="product-card-body">
        <div class="product-meta-top">
          <span class="product-meta-cat">
            ${escapeHtml(product.category_name || 'Atelier Collection')} &bull; <code class="mono-text" itemprop="sku">${escapeHtml(product.sku)}</code>
          </span>
          <span class="product-rating-chip" title="${product.rating_count} Verified Reviews">
            ★ ${Number(product.rating_avg || 0).toFixed(1)}
            <span style="color:var(--text-muted);font-weight:400;">(${product.rating_count})</span>
          </span>
        </div>

        <h3 class="product-card-title" data-view-product="${escapeHtml(product.slug)}" itemprop="name">
          ${escapeHtml(product.title)}
        </h3>

        <p class="product-card-desc" itemprop="description">${escapeHtml(product.description)}</p>

        <div class="product-card-footer" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
          <meta itemprop="priceCurrency" content="USD" />
          <meta itemprop="price" content="${Number(product.effective_price).toFixed(2)}" />
          <link itemprop="availability" href="https://schema.org/${product.stock_qty > 0 ? 'InStock' : 'OutOfStock'}" />

          <div class="price-stack">
            <span class="price-current">${formatCurrency(product.effective_price)}</span>
            ${hasDiscount ? `<span class="price-old">${formatCurrency(product.price)}</span>` : ''}
          </div>

          <div style="display:flex;gap:0.4rem;">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              data-view-product="${escapeHtml(product.slug)}"
              aria-label="Inspect ${escapeHtml(product.title)}"
            >
              Inspect
            </button>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              data-add-cart="${escapeHtml(product.id)}"
              ${product.stock_qty <= 0 ? 'disabled' : ''}
            >
              ${product.stock_qty <= 0 ? 'Sold Out' : '+ Bag'}
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
}

export function renderOrderTimeline(orderStatus) {
  if (orderStatus === 'cancelled') {
    return `
      <div style="padding:0.7rem 0.95rem;border-radius:var(--radius-sm);background:rgba(244,63,94,0.14);border:1px solid rgba(244,63,94,0.35);color:#fb7185;font-size:0.82rem;margin:0.85rem 0;">
        <strong>Order Cancelled</strong> &mdash; Inventory allocation has been released back to the warehouse.
      </div>
    `;
  }

  const stages = ['pending', 'processing', 'shipped', 'delivered'];
  const labels = {
    pending: '1. Placed',
    processing: '2. Atelier QA',
    shipped: '3. In Transit',
    delivered: '4. Delivered',
  };
  const currentIdx = stages.indexOf(orderStatus);

  return `
    <div class="order-timeline">
      ${stages
        .map((st, idx) => {
          const cls = idx <= currentIdx ? 'done' : '';
          return `<div class="timeline-step ${cls}">
            <strong>${labels[st]}</strong>
          </div>`;
        })
        .join('')}
    </div>
  `;
}

export function openInvoiceModal(order) {
  const backdrop = document.getElementById('invoice-modal-backdrop');
  const content = document.getElementById('invoice-modal-content');
  if (!backdrop || !content) return;

  const addr = order.shipping_address || {};
  content.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;border-bottom:1px solid var(--border-subtle);padding-bottom:1rem;margin-bottom:1rem;">
      <div>
        <span class="eyebrow-tag">OFFICIAL DIGITAL TAX INVOICE</span>
        <h2 id="invoice-modal-title" style="font-family:var(--font-display);font-size:1.35rem;margin-top:0.2rem;">
          AURA // ATELIER &mdash; <span class="mono-text">${escapeHtml(order.order_number)}</span>
        </h2>
        <p style="font-size:0.78rem;color:var(--text-muted);">
          Issued: ${escapeHtml(order.created_at)} &bull; Payment: <strong>${escapeHtml(order.payment_method)}</strong> (${escapeHtml(order.payment_status.toUpperCase())})
        </p>
      </div>
      <div class="no-print" style="display:flex;gap:0.45rem;">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-print-invoice">🖨️ Print</button>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-close-invoice">&times; Close</button>
      </div>
    </div>

    ${renderOrderTimeline(order.order_status)}

    <div class="form-grid-2" style="margin-bottom:1rem;font-size:0.83rem;">
      <div style="padding:0.85rem;border-radius:var(--radius-sm);background:var(--bg-secondary);border:1px solid var(--border-subtle);">
        <span class="eyebrow-tag" style="font-size:0.64rem;">SHIPPING DESTINATION</span>
        <p style="margin-top:0.25rem;"><strong>${escapeHtml(addr.fullName || order.customer_name || 'Valued Client')}</strong></p>
        <p>${escapeHtml(addr.street || '')}</p>
        <p>${escapeHtml(addr.city || '')}, ${escapeHtml(addr.state || '')} ${escapeHtml(addr.postalCode || '')}</p>
        <p>${escapeHtml(addr.country || '')} &bull; ${escapeHtml(addr.phone || '')}</p>
      </div>
      <div style="padding:0.85rem;border-radius:var(--radius-sm);background:var(--bg-secondary);border:1px solid var(--border-subtle);">
        <span class="eyebrow-tag" style="font-size:0.64rem;">VERIFICATION TELEMETRY</span>
        <p style="margin-top:0.25rem;">Order Status: <span class="status-badge status-${escapeHtml(order.order_status)}">${escapeHtml(order.order_status)}</span></p>
        <p style="margin-top:0.3rem;">Payment Status: <span class="status-badge status-${escapeHtml(order.payment_status)}">${escapeHtml(order.payment_status)}</span></p>
        ${order.notes ? `<p style="margin-top:0.3rem;color:var(--text-secondary);">Notes: ${escapeHtml(order.notes)}</p>` : ''}
      </div>
    </div>

    <div class="table-responsive" style="margin-bottom:1rem;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Item Snapshot</th>
            <th>SKU</th>
            <th>Unit Price</th>
            <th>Qty</th>
            <th>Line Total</th>
          </tr>
        </thead>
        <tbody>
          ${(order.items || [])
            .map(
              (item) => `
            <tr>
              <td><strong>${escapeHtml(item.product_name_snapshot)}</strong></td>
              <td class="mono-text">${escapeHtml(item.product_sku_snapshot || 'N/A')}</td>
              <td class="mono-text">${formatCurrency(item.unit_price_snapshot)}</td>
              <td class="mono-text">${item.quantity}</td>
              <td class="mono-text"><strong>${formatCurrency(item.subtotal)}</strong></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <div style="max-width:300px;margin-left:auto;">
      <div class="summary-row">
        <span>Subtotal</span>
        <span class="mono-text">${formatCurrency(order.subtotal_amount)}</span>
      </div>
      <div class="summary-row">
        <span>VAT / Tax (14%)</span>
        <span class="mono-text">${formatCurrency(order.tax_amount)}</span>
      </div>
      <div class="summary-row">
        <span>Insured Courier Shipping</span>
        <span class="mono-text">${order.shipping_fee === 0 ? 'COMPLIMENTARY' : formatCurrency(order.shipping_fee)}</span>
      </div>
      <div class="summary-row total">
        <span>Total Paid / Due</span>
        <span>${formatCurrency(order.total_amount)}</span>
      </div>
    </div>
  `;

  backdrop.hidden = false;

  document.getElementById('btn-close-invoice')?.addEventListener('click', () => {
    backdrop.hidden = true;
  });
  document.getElementById('btn-print-invoice')?.addEventListener('click', () => {
    window.print();
  });
}
