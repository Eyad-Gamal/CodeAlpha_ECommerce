import { apiRequest } from './services/api.js';
import { store } from './services/store.js';
import {
  escapeHtml,
  formatCurrency,
  getFallbackSvgDataUri,
  updateSeoMeta,
  showToast,
  renderProductCard,
  renderOrderTimeline,
  openInvoiceModal,
} from './components/ui.js';

const appState = {
  currentView: 'home', // 'home' | 'product' | 'checkout' | 'auth' | 'customer-dashboard' | 'admin'
  currentProductSlug: null,
  currentProductData: null,
  selectedDetailQty: 1,
  authTab: 'login', // 'login' | 'register'
  adminTab: 'inventory', // 'inventory' | 'orders' | 'categories'
  mobileFiltersOpen: false,
  customerOrders: [],
  adminStats: null,
  adminOrders: [],
  searchDebounceTimer: null,
};

/* ==========================================================================
   1. Header, Mobile Dock & Slide-Over Cart Drawer Synchronization
   ========================================================================== */

function syncHeaderAndDrawer() {
  const totalItems = store.cart?.summary?.total_items || 0;
  const badge = document.getElementById('cart-count-badge');
  const dockBadge = document.getElementById('mobile-dock-cart-badge');
  const drawerCount = document.getElementById('drawer-item-count');

  if (badge) badge.textContent = String(totalItems);
  if (dockBadge) dockBadge.textContent = String(totalItems);
  if (drawerCount) drawerCount.textContent = String(totalItems);

  const dockAccountLabel = document.getElementById('mobile-dock-account-label');
  if (dockAccountLabel) {
    dockAccountLabel.textContent = store.user
      ? store.user.role === 'admin'
        ? 'Admin'
        : store.user.name.split(' ')[0]
      : 'Sign In';
  }

  // Header auth slot (compact on mobile so header never overflows)
  const authSlot = document.getElementById('header-auth-slot');
  if (authSlot) {
    if (store.user) {
      const isAdmin = store.user.role === 'admin';
      authSlot.innerHTML = `
        ${
          isAdmin
            ? `<button type="button" class="user-pill-btn" data-nav="admin" title="Open Admin Console">
                <span class="role-chip admin">ADMIN</span>
                <span class="hide-on-mobile">Console</span>
              </button>`
            : ''
        }
        <button type="button" class="user-pill-btn ${isAdmin ? 'hide-on-mobile' : ''}" data-nav="customer-dashboard">
          <span class="role-chip">${escapeHtml(store.user.name.split(' ')[0])}</span>
        </button>
        <button type="button" class="icon-btn" id="btn-header-logout" title="Sign Out" aria-label="Sign Out">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      `;
    } else {
      authSlot.innerHTML = `
        <button type="button" class="user-pill-btn" data-nav="auth">
          <span>Sign In</span>
        </button>
      `;
    }
  }

  // Sync active category pill in header & mobile strip
  const activeCat = store.filters.category || 'all';
  document.querySelectorAll('.main-nav .nav-link, .mobile-category-strip .mobile-cat-pill').forEach((el) => {
    const elCat = el.getAttribute('data-category') || 'all';
    if (appState.currentView === 'home' && elCat === activeCat) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Sync mobile bottom dock active tab
  document.querySelectorAll('.mobile-bottom-dock .dock-item').forEach((btn) => {
    const dockTarget = btn.getAttribute('data-dock');
    const isActive =
      (dockTarget === 'home' && appState.currentView === 'home') ||
      (dockTarget === 'account' &&
        ['auth', 'customer-dashboard', 'admin'].includes(appState.currentView));
    btn.classList.toggle('active', isActive);
  });

  renderCartDrawerContents();
}

function renderCartDrawerContents() {
  const shippingBox = document.getElementById('drawer-shipping-box');
  const itemsBox = document.getElementById('cart-drawer-items');
  const footerBox = document.getElementById('cart-drawer-footer');
  if (!shippingBox || !itemsBox || !footerBox) return;

  const summary = store.cart.summary;
  const items = store.cart.items || [];

  const pct = Math.min(
    100,
    Math.round((summary.subtotal_amount / summary.free_shipping_threshold) * 100)
  );
  shippingBox.innerHTML =
    summary.amount_to_free_shipping <= 0 && summary.subtotal_amount > 0
      ? `<div style="color:var(--accent-emerald);font-weight:600;">✓ Complimentary Insured Express Courier Unlocked!</div>
         <div class="progress-track"><div class="progress-fill" style="width:100%;background:var(--accent-emerald);"></div></div>`
      : `<div>Add <strong>${formatCurrency(summary.amount_to_free_shipping)}</strong> more for <strong>Complimentary Express Courier</strong></div>
         <div class="progress-track"><div class="progress-fill" style="width:${pct}%;"></div></div>`;

  if (items.length === 0) {
    itemsBox.innerHTML = `
      <div style="text-align:center;padding:2.5rem 1rem;color:var(--text-secondary);">
        <div style="font-size:2rem;margin-bottom:0.65rem;opacity:0.4;">◆</div>
        <h3 style="margin-bottom:0.35rem;color:var(--text-primary);font-size:1.05rem;">Your Atelier Bag is Empty</h3>
        <p style="font-size:0.82rem;margin-bottom:1.15rem;">Explore our curated acoustics, horology, workspace, and apothecary objects.</p>
        <button type="button" class="btn btn-primary btn-sm" id="drawer-explore-btn">Explore Collection</button>
      </div>
    `;
    footerBox.innerHTML = '';
    document.getElementById('drawer-explore-btn')?.addEventListener('click', () => {
      closeCartDrawer();
      navigateTo('home');
    });
    return;
  }

  itemsBox.innerHTML = items
    .map((item) => {
      const fallback = getFallbackSvgDataUri(item.title);
      return `
        <div class="cart-item-card">
          <img
            src="${escapeHtml(item.image || fallback)}"
            alt="${escapeHtml(item.title)}"
            class="cart-item-thumb"
            width="64"
            height="64"
            onerror="this.onerror=null;this.src='${fallback}'"
          />
          <div style="display:flex;flex-direction:column;justify-content:space-between;min-width:0;">
            <div style="display:flex;justify-content:space-between;gap:0.4rem;">
              <div style="min-width:0;">
                <h4 style="font-size:0.86rem;font-weight:700;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.title)}</h4>
                <span class="mono-text" style="font-size:0.7rem;color:var(--text-muted);">
                  ${formatCurrency(item.unit_price)} &bull; Stock: ${item.stock_qty}
                </span>
              </div>
              <button
                type="button"
                style="color:var(--text-muted);font-size:1.1rem;line-height:1;padding:0 0.2rem;"
                data-cart-remove="${escapeHtml(item.id || item.product_id)}"
                title="Remove item"
              >&times;</button>
            </div>

            ${
              item.exceeds_stock
                ? `<div style="color:var(--accent-rose);font-size:0.72rem;margin:0.2rem 0;">Only ${item.stock_qty} unit(s) available</div>`
                : ''
            }

            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.45rem;">
              <div class="qty-stepper" style="height:32px;">
                <button type="button" style="width:28px;" data-cart-dec="${escapeHtml(item.product_id)}">&minus;</button>
                <span style="min-width:28px;font-size:0.8rem;">${item.quantity}</span>
                <button
                  type="button"
                  style="width:28px;"
                  data-cart-inc="${escapeHtml(item.product_id)}"
                  ${item.quantity >= item.stock_qty ? 'disabled' : ''}
                >+</button>
              </div>
              <strong class="mono-text" style="font-size:0.88rem;">${formatCurrency(item.line_subtotal)}</strong>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  footerBox.innerHTML = `
    ${
      summary.discount_savings > 0
        ? `<div class="summary-row" style="color:var(--accent-emerald);">
            <span>Atelier Member Savings</span>
            <span class="mono-text">-${formatCurrency(summary.discount_savings)}</span>
          </div>`
        : ''
    }
    <div class="summary-row">
      <span>Subtotal (${summary.total_items} items)</span>
      <span class="mono-text">${formatCurrency(summary.subtotal_amount)}</span>
    </div>
    <div class="summary-row">
      <span>Estimated VAT (14%)</span>
      <span class="mono-text">${formatCurrency(summary.tax_amount)}</span>
    </div>
    <div class="summary-row">
      <span>Express Insured Shipping</span>
      <span class="mono-text">${summary.shipping_fee === 0 ? 'COMPLIMENTARY' : formatCurrency(summary.shipping_fee)}</span>
    </div>
    <div class="summary-row total">
      <span>Total Estimate</span>
      <span>${formatCurrency(summary.total_amount)}</span>
    </div>

    <div style="margin-top:0.85rem;">
      <button
        type="button"
        class="btn btn-primary btn-block"
        id="btn-proceed-checkout"
        ${!summary.is_valid_for_checkout ? 'disabled' : ''}
      >
        ${store.user ? 'Proceed to Secure Checkout →' : 'Sign In to Complete Checkout →'}
      </button>
    </div>
  `;
}

export function openCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  const backdrop = document.getElementById('cart-drawer-backdrop');
  if (drawer && backdrop) {
    backdrop.hidden = false;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }
}

export function closeCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  const backdrop = document.getElementById('cart-drawer-backdrop');
  if (drawer && backdrop) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
  }
}

/* ==========================================================================
   2. Storefront View (Bento Hero, Touch Category Carousel, Collapsible Filters)
   ========================================================================== */

function renderHomeView() {
  const viewport = document.getElementById('app-viewport');
  if (!viewport) return;

  // Dynamic SEO & Schema.org ItemList for Storefront
  const activeCategoryObj = store.categories.find(
    (c) => c.slug === store.filters.category || c.id === store.filters.category
  );
  updateSeoMeta({
    title: activeCategoryObj
      ? `${activeCategoryObj.name} Collection`
      : 'Architectural Objects, Horology & Spatial Audio',
    description: activeCategoryObj
      ? activeCategoryObj.description
      : 'Curated Grade-5 titanium acoustics, mechanical horology, CNC studio workspaces, and Swiss cellular apothecary.',
    urlPath: activeCategoryObj ? `/?category=${activeCategoryObj.slug}` : '/',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: activeCategoryObj ? activeCategoryObj.name : 'AURA // ATELIER Catalog',
      numberOfItems: store.products.length,
      itemListElement: store.products.map((p, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: p.title,
        url: `${window.location.origin}/?product=${p.slug}`,
      })),
    },
  });

  const flagship =
    store.products.find((p) => p.slug.includes('sovereign')) ||
    store.products[0];
  const spotlight2 =
    store.products.find((p) => p.slug.includes('chronos')) ||
    store.products[1] ||
    flagship;

  viewport.innerHTML = `
    <!-- Asymmetric Bento Hero Section -->
    <section class="hero-section" aria-label="Featured Atelier Spotlights">
      <div class="container">
        <div class="bento-hero-grid">
          <div class="bento-card bento-main">
            <div>
              <span class="eyebrow-tag">◆ ARCHITECTURAL OBJECTS &amp; PRECISION COMMERCE</span>
              <h1 class="hero-headline">
                Engineered for <span class="hero-gradient-text">Sensory Permanence.</span>
              </h1>
              <p class="hero-lead">
                Curated Grade-5 titanium acoustics, mechanical horology, CNC-machined studio workspaces, and Swiss cellular apothecary—protected by ACID transactional stock guarantees.
              </p>
              <div class="hero-cta-row">
                <a href="#catalog-anchor" class="btn btn-primary">Explore 2026 Catalog ↓</a>
                ${
                  flagship
                    ? `<button type="button" class="btn btn-secondary" data-view-product="${escapeHtml(flagship.slug)}">
                        Inspect Flagship: ${escapeHtml(flagship.title.split(' ').slice(0, 3).join(' '))}
                      </button>`
                    : ''
                }
              </div>
            </div>

            <div class="hero-metrics-row">
              <div class="metric-item">
                <strong>100% ACID</strong>
                <span>Atomic Stock Lock</span>
              </div>
              <div class="metric-item">
                <strong>JWT + RBAC</strong>
                <span>Zero-Trust Auth</span>
              </div>
              <div class="metric-item">
                <strong>Grade 5 Ti</strong>
                <span>Certified Materials</span>
              </div>
              <div class="metric-item">
                <strong>24h Dispatch</strong>
                <span>Insured Global Courier</span>
              </div>
            </div>
          </div>

          <div class="bento-side-stack">
            ${
              flagship
                ? `
              <div class="bento-card bento-side-card" style="background:linear-gradient(135deg, rgba(99,102,241,0.16), transparent), var(--bg-card);">
                <div>
                  <span class="eyebrow-tag">FLAGSHIP ACOUSTICS</span>
                  <h2 style="font-size:1.12rem;font-weight:800;margin:0.3rem 0;">${escapeHtml(flagship.title)}</h2>
                  <p style="font-size:0.8rem;color:var(--text-secondary);">50mm Planar Magnetic &bull; Grade 5 Titanium</p>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.85rem;">
                  <span class="mono-text" style="font-size:1.15rem;font-weight:700;">${formatCurrency(flagship.effective_price)}</span>
                  <button type="button" class="btn btn-primary btn-sm" data-view-product="${escapeHtml(flagship.slug)}">Inspect →</button>
                </div>
              </div>
            `
                : ''
            }

            ${
              spotlight2
                ? `
              <div class="bento-card bento-side-card" style="background:linear-gradient(135deg, rgba(245,158,11,0.14), transparent), var(--bg-card);">
                <div>
                  <span class="eyebrow-tag">SWISS HOROLOGY</span>
                  <h2 style="font-size:1.12rem;font-weight:800;margin:0.3rem 0;">${escapeHtml(spotlight2.title)}</h2>
                  <p style="font-size:0.8rem;color:var(--text-secondary);">Calibre AU-88 Automatic &bull; Box Sapphire Crystal</p>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.85rem;">
                  <span class="mono-text" style="font-size:1.15rem;font-weight:700;">${formatCurrency(spotlight2.effective_price)}</span>
                  <button type="button" class="btn btn-gold btn-sm" data-view-product="${escapeHtml(spotlight2.slug)}">Discover →</button>
                </div>
              </div>
            `
                : ''
            }
          </div>
        </div>
      </div>
    </section>

    <!-- Swipeable Category Bento Strip -->
    <section class="category-strip-section" id="catalog-anchor" aria-label="Product Categories">
      <div class="container">
        <div class="category-bento-row">
          <button
            type="button"
            class="category-tile ${store.filters.category === 'all' ? 'active' : ''}"
            data-filter-category="all"
          >
            <div style="width:44px;height:44px;border-radius:10px;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.78rem;color:#fff;flex-shrink:0;">
              ALL
            </div>
            <div>
              <div class="category-tile-title">All Curated Objects</div>
              <div class="category-tile-count">${store.pagination.total} Active Editions</div>
            </div>
          </button>

          ${store.categories
            .filter((c) => c.is_active)
            .map((cat) => {
              const active = store.filters.category === cat.slug || store.filters.category === cat.id;
              const fallback = getFallbackSvgDataUri(cat.name);
              return `
                <button
                  type="button"
                  class="category-tile ${active ? 'active' : ''}"
                  data-filter-category="${escapeHtml(cat.slug)}"
                >
                  <img
                    src="${escapeHtml(cat.image_url || fallback)}"
                    alt="${escapeHtml(cat.name)}"
                    class="category-tile-thumb"
                    width="44"
                    height="44"
                    loading="lazy"
                    onerror="this.onerror=null;this.src='${fallback}'"
                  />
                  <div>
                    <div class="category-tile-title">${escapeHtml(cat.name)}</div>
                    <div class="category-tile-count">${cat.product_count} Objects</div>
                  </div>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    </section>

    <!-- Command Filter & Live Catalog Section -->
    <section class="catalog-section" aria-label="Product Catalog">
      <div class="container">
        <div class="filter-command-wrapper">
          <!-- Mobile Compact Search + Filter Drawer Toggle -->
          <div class="filter-top-search-row">
            <input
              type="search"
              id="filter-mobile-search-input"
              class="input-control"
              placeholder="Search Planar, Titanium, Serum..."
              value="${escapeHtml(store.filters.search)}"
              aria-label="Search products"
            />
            <button type="button" class="btn btn-secondary btn-sm" id="btn-toggle-mobile-filters">
              Filters ${appState.mobileFiltersOpen ? '▴' : '▾'}
            </button>
          </div>

          <div class="filter-command-bar ${appState.mobileFiltersOpen ? 'mobile-expanded' : ''}" id="filter-command-bar">
            <div class="filter-field filter-search-col">
              <label for="filter-search-input">Live Search (Title, SKU, Spec)</label>
              <input
                type="search"
                id="filter-search-input"
                class="input-control"
                placeholder="Search Planar, Titanium, Serum, Keyboard..."
                value="${escapeHtml(store.filters.search)}"
              />
            </div>

            <div class="filter-field">
              <label for="filter-min-price">Min Price ($)</label>
              <input
                type="number"
                id="filter-min-price"
                class="input-control"
                min="0"
                placeholder="0"
                value="${escapeHtml(store.filters.minPrice)}"
              />
            </div>

            <div class="filter-field">
              <label for="filter-max-price">Max Price ($)</label>
              <input
                type="number"
                id="filter-max-price"
                class="input-control"
                min="0"
                placeholder="3000"
                value="${escapeHtml(store.filters.maxPrice)}"
              />
            </div>

            <div class="filter-field">
              <label for="filter-min-rating">Min Rating</label>
              <select id="filter-min-rating" class="select-control">
                <option value="" ${store.filters.minRating === '' ? 'selected' : ''}>Any Rating</option>
                <option value="4.8" ${String(store.filters.minRating) === '4.8' ? 'selected' : ''}>★ 4.8 &amp; Up</option>
                <option value="4.5" ${String(store.filters.minRating) === '4.5' ? 'selected' : ''}>★ 4.5 &amp; Up</option>
                <option value="4" ${String(store.filters.minRating) === '4' ? 'selected' : ''}>★ 4.0 &amp; Up</option>
              </select>
            </div>

            <div class="filter-field">
              <label for="filter-sort-select">Sort Order</label>
              <select id="filter-sort-select" class="select-control">
                <option value="newest" ${store.filters.sort === 'newest' ? 'selected' : ''}>Featured &amp; Newest</option>
                <option value="best_selling" ${store.filters.sort === 'best_selling' ? 'selected' : ''}>Most Collected</option>
                <option value="price_asc" ${store.filters.sort === 'price_asc' ? 'selected' : ''}>Price: Low to High</option>
                <option value="price_desc" ${store.filters.sort === 'price_desc' ? 'selected' : ''}>Price: High to Low</option>
                <option value="rating" ${store.filters.sort === 'rating' ? 'selected' : ''}>Highest Rated</option>
              </select>
            </div>

            <div>
              <button type="button" class="btn btn-secondary btn-block" id="btn-reset-filters" title="Reset all filters">Reset</button>
            </div>
          </div>
        </div>

        <div class="catalog-header-bar">
          <div>
            <span class="eyebrow-tag">SHOWING ${store.products.length} OF ${store.pagination.total} OBJECTS</span>
          </div>
          <label style="display:inline-flex;align-items:center;gap:0.45rem;font-size:0.8rem;cursor:pointer;">
            <input type="checkbox" id="filter-instock-toggle" ${store.filters.inStock ? 'checked' : ''} />
            <span>In-Stock Editions Only</span>
          </label>
        </div>

        <div id="catalog-grid-container">
          ${renderCatalogGridOnly()}
        </div>
      </div>
    </section>
  `;

  bindFilterEvents();
}

function renderCatalogGridOnly() {
  if (store.products.length === 0) {
    return `
      <div class="surface-card" style="text-align:center;padding:3rem 1.25rem;">
        <h3 style="font-size:1.15rem;margin-bottom:0.4rem;">No Objects Match Your Filter Criteria</h3>
        <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:1.15rem;">Try clearing your search query or widening the price range.</p>
        <button type="button" class="btn btn-primary btn-sm" id="btn-empty-reset">Reset All Filters</button>
      </div>
    `;
  }

  const page = store.pagination.page;
  const totalPages = store.pagination.totalPages;

  return `
    <div class="products-grid">
      ${store.products.map(renderProductCard).join('')}
    </div>

    ${
      totalPages > 1
        ? `
      <div class="pagination-bar">
        <button type="button" class="btn btn-secondary btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
        <span class="mono-pill">Page ${page} of ${totalPages}</span>
        <button type="button" class="btn btn-secondary btn-sm" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next →</button>
      </div>
    `
        : ''
    }
  `;
}

function bindFilterEvents() {
  const searchInput = document.getElementById('filter-search-input');
  const mobileSearchInput = document.getElementById('filter-mobile-search-input');
  const minInput = document.getElementById('filter-min-price');
  const maxInput = document.getElementById('filter-max-price');
  const ratingSelect = document.getElementById('filter-min-rating');
  const sortSelect = document.getElementById('filter-sort-select');
  const inStockToggle = document.getElementById('filter-instock-toggle');
  const resetBtn = document.getElementById('btn-reset-filters');
  const toggleMobileFiltersBtn = document.getElementById('btn-toggle-mobile-filters');
  const filterCommandBar = document.getElementById('filter-command-bar');

  toggleMobileFiltersBtn?.addEventListener('click', () => {
    appState.mobileFiltersOpen = !appState.mobileFiltersOpen;
    filterCommandBar?.classList.toggle('mobile-expanded', appState.mobileFiltersOpen);
    toggleMobileFiltersBtn.innerHTML = `Filters ${appState.mobileFiltersOpen ? '▴' : '▾'}`;
  });

  const triggerFilterRefresh = (sourceSearchVal = null) => {
    const activeSearch =
      sourceSearchVal !== null
        ? sourceSearchVal
        : searchInput?.value || mobileSearchInput?.value || '';

    if (searchInput && searchInput.value !== activeSearch) searchInput.value = activeSearch;
    if (mobileSearchInput && mobileSearchInput.value !== activeSearch) {
      mobileSearchInput.value = activeSearch;
    }

    clearTimeout(appState.searchDebounceTimer);
    appState.searchDebounceTimer = setTimeout(async () => {
      await store.loadProducts({
        search: activeSearch,
        minPrice: minInput ? minInput.value : '',
        maxPrice: maxInput ? maxInput.value : '',
        minRating: ratingSelect ? ratingSelect.value : '',
        sort: sortSelect ? sortSelect.value : 'newest',
        inStock: inStockToggle ? inStockToggle.checked : false,
        page: 1,
      });
      const gridBox = document.getElementById('catalog-grid-container');
      if (gridBox) {
        gridBox.innerHTML = renderCatalogGridOnly();
      }
    }, 180);
  };

  searchInput?.addEventListener('input', (e) => triggerFilterRefresh(e.target.value));
  mobileSearchInput?.addEventListener('input', (e) => triggerFilterRefresh(e.target.value));
  minInput?.addEventListener('input', () => triggerFilterRefresh());
  maxInput?.addEventListener('input', () => triggerFilterRefresh());
  ratingSelect?.addEventListener('change', () => triggerFilterRefresh());
  sortSelect?.addEventListener('change', () => triggerFilterRefresh());
  inStockToggle?.addEventListener('change', () => triggerFilterRefresh());

  resetBtn?.addEventListener('click', async () => {
    await store.loadProducts({
      search: '',
      category: 'all',
      minPrice: '',
      maxPrice: '',
      minRating: '',
      inStock: false,
      sort: 'newest',
      page: 1,
    });
    renderHomeView();
  });
}

/* ==========================================================================
   3. Product Details View (FR-03: Zoom Gallery, Specs, Stock, Reviews & SEO JSON-LD)
   ========================================================================== */

async function renderProductDetailsView(slug) {
  const viewport = document.getElementById('app-viewport');
  if (!viewport) return;

  viewport.innerHTML = `<div class="container" style="padding:3rem 1.25rem;text-align:center;">Loading object telemetry...</div>`;

  try {
    const res = await apiRequest(`/products/${encodeURIComponent(slug)}`);
    const product = res.data.product;
    appState.currentProductData = product;
    appState.selectedDetailQty = 1;

    const images = product.images?.length ? product.images : [getFallbackSvgDataUri(product.title)];
    const fallback = getFallbackSvgDataUri(product.title);

    // Update page SEO & inject Rich Schema.org Product JSON-LD
    updateSeoMeta({
      title: `${product.title} (${product.sku})`,
      description: product.description,
      image: images[0],
      urlPath: `/?product=${encodeURIComponent(product.slug)}`,
      type: 'product',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.title,
        sku: product.sku,
        description: product.description,
        image: images,
        brand: { '@type': 'Brand', name: 'AURA // ATELIER' },
        offers: {
          '@type': 'Offer',
          priceCurrency: 'USD',
          price: Number(product.effective_price).toFixed(2),
          availability:
            product.stock_qty > 0
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
        },
        aggregateRating:
          product.rating_count > 0
            ? {
                '@type': 'AggregateRating',
                ratingValue: product.rating_avg,
                reviewCount: product.rating_count,
              }
            : undefined,
      },
    });

    const hasDiscount =
      product.discount_price !== null &&
      product.discount_price !== undefined &&
      product.discount_price < product.price;

    const specsEntries = Object.entries(product.specs || {});

    viewport.innerHTML = `
      <div class="container" style="padding-top:1.25rem;">
        <nav aria-label="Breadcrumb" style="display:flex;align-items:center;gap:0.45rem;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.85rem;flex-wrap:wrap;">
          <button type="button" class="link-pill" data-nav="home">← Storefront</button>
          <span>/</span>
          <span>${escapeHtml(product.category_name)}</span>
          <span>/</span>
          <span class="mono-text">${escapeHtml(product.sku)}</span>
        </nav>

        <div class="details-layout">
          <!-- Interactive Hover-Zoom Gallery -->
          <div>
            <div class="gallery-main-stage" id="gallery-zoom-stage">
              <img
                id="gallery-main-img"
                src="${escapeHtml(images[0])}"
                alt="${escapeHtml(product.title)}"
                width="800"
                height="600"
                onerror="this.onerror=null;this.src='${fallback}'"
              />
            </div>
            <div class="gallery-thumbs-row">
              ${images
                .map(
                  (imgUrl, idx) => `
                <button
                  type="button"
                  class="gallery-thumb-btn ${idx === 0 ? 'active' : ''}"
                  data-gallery-src="${escapeHtml(imgUrl)}"
                >
                  <img src="${escapeHtml(imgUrl)}" alt="Thumbnail ${idx + 1}" width="70" height="54" onerror="this.onerror=null;this.src='${fallback}'" />
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <!-- Purchase & Specification Panel -->
          <div class="purchase-panel">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.55rem;">
              <span class="eyebrow-tag">${escapeHtml(product.category_name)}</span>
              <span class="product-rating-chip">
                ★ ${Number(product.rating_avg || 0).toFixed(1)} (${product.rating_count} Verified Reviews)
              </span>
            </div>

            <h1 style="font-family:var(--font-display);font-size:clamp(1.4rem, 2.5vw, 1.85rem);line-height:1.18;margin-bottom:0.75rem;">
              ${escapeHtml(product.title)}
            </h1>

            <div class="price-stack" style="margin-bottom:1rem;align-items:center;">
              <span class="price-current" style="font-size:1.55rem;">${formatCurrency(product.effective_price)}</span>
              ${hasDiscount ? `<span class="price-old" style="font-size:0.98rem;">${formatCurrency(product.price)}</span>` : ''}
              ${
                product.stock_qty > 0
                  ? `<span class="badge-pill ${product.stock_qty <= 5 ? 'badge-stock-low' : 'badge-stock-ok'}" style="margin-left:auto;">
                      ${product.stock_qty <= 5 ? `LOW STOCK: ${product.stock_qty} LEFT` : `IN STOCK (${product.stock_qty} UNITS)`}
                    </span>`
                  : `<span class="badge-pill badge-stock-out" style="margin-left:auto;">OUT OF STOCK</span>`
              }
            </div>

            <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.15rem;">
              ${escapeHtml(product.description)}
            </p>

            ${
              specsEntries.length > 0
                ? `
              <div class="specs-grid">
                ${specsEntries
                  .map(
                    ([k, v]) => `
                  <div class="spec-box">
                    <span>${escapeHtml(k)}</span>
                    <strong>${escapeHtml(v)}</strong>
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
                : ''
            }

            <div class="detail-actions-bar">
              <div class="qty-stepper">
                <button type="button" id="detail-qty-dec" aria-label="Decrease quantity">&minus;</button>
                <span id="detail-qty-val">1</span>
                <button type="button" id="detail-qty-inc" aria-label="Increase quantity">+</button>
              </div>

              <button
                type="button"
                class="btn btn-primary"
                id="btn-detail-add-bag"
                style="flex:1;"
                ${product.stock_qty <= 0 ? 'disabled' : ''}
              >
                ${product.stock_qty <= 0 ? 'Currently Sold Out' : `Add to Bag — ${formatCurrency(product.effective_price)}`}
              </button>

              <button
                type="button"
                class="btn btn-gold"
                id="btn-detail-buy-now"
                ${product.stock_qty <= 0 ? 'disabled' : ''}
              >
                Instant Checkout →
              </button>
            </div>
          </div>
        </div>

        <!-- Customer Reviews & Verification Section -->
        <div class="checkout-grid" style="margin-top:2rem;">
          <div class="surface-card">
            <span class="eyebrow-tag">VERIFIED CLIENT TELEMETRY</span>
            <h2 style="font-family:var(--font-display);font-size:1.25rem;margin:0.3rem 0 1rem;">
              Client Reviews (${product.reviews?.length || 0})
            </h2>

            ${
              !product.reviews || product.reviews.length === 0
                ? `<p style="color:var(--text-secondary);font-size:0.88rem;">No reviews yet. Be the first collector to review this edition.</p>`
                : product.reviews
                    .map(
                      (rev) => `
                  <div style="padding:0.85rem 0;border-bottom:1px solid var(--border-subtle);">
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.3rem;">
                      <div>
                        <strong style="font-size:0.9rem;">${escapeHtml(rev.user_name)}</strong>
                        ${
                          rev.is_verified_purchase
                            ? `<span class="badge-pill badge-stock-ok" style="margin-left:0.35rem;font-size:0.62rem;">✓ VERIFIED BUYER</span>`
                            : ''
                        }
                      </div>
                      <span class="product-rating-chip">${'★'.repeat(rev.rating)}${'☆'.repeat(5 - rev.rating)}</span>
                    </div>
                    ${rev.title ? `<h4 style="font-size:0.88rem;margin-bottom:0.2rem;">${escapeHtml(rev.title)}</h4>` : ''}
                    <p style="font-size:0.84rem;color:var(--text-secondary);">${escapeHtml(rev.comment)}</p>
                  </div>
                `
                    )
                    .join('')
            }
          </div>

          <div class="surface-card">
            <span class="eyebrow-tag">SHARE YOUR EXPERIENCE</span>
            <h3 style="font-family:var(--font-display);font-size:1.15rem;margin:0.3rem 0 0.85rem;">Write a Review</h3>
            ${
              store.user
                ? `
              <form id="review-submit-form">
                <div class="form-group">
                  <label for="rev-rating">Rating</label>
                  <select id="rev-rating" class="select-control" required>
                    <option value="5">★★★★★ (5/5 — Exceptional)</option>
                    <option value="4">★★★★☆ (4/5 — Very Good)</option>
                    <option value="3">★★★☆☆ (3/5 — Satisfactory)</option>
                    <option value="2">★★☆☆☆ (2/5 — Subpar)</option>
                    <option value="1">★☆☆☆☆ (1/5 — Poor)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="rev-title">Headline</label>
                  <input type="text" id="rev-title" class="input-control" placeholder="Summarize your impression..." required />
                </div>
                <div class="form-group">
                  <label for="rev-comment">Detailed Review</label>
                  <textarea id="rev-comment" rows="3" class="textarea-control" placeholder="Build quality, acoustics, daily experience..." required></textarea>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Publish Verified Review</button>
              </form>
            `
                : `
              <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.9rem;">
                Please sign in to your client account to publish a review for this product.
              </p>
              <button type="button" class="btn btn-secondary btn-sm" data-nav="auth">Sign In to Review →</button>
            `
            }
          </div>
        </div>

        <!-- Similar Products Section -->
        ${
          product.similar_products?.length
            ? `
          <div style="margin-top:2.25rem;">
            <span class="eyebrow-tag">COMPLEMENTARY EDITIONS</span>
            <h2 style="font-family:var(--font-display);font-size:1.3rem;margin:0.3rem 0 1rem;">Similar Curated Objects</h2>
            <div class="products-grid">
              ${product.similar_products.map(renderProductCard).join('')}
            </div>
          </div>
        `
            : ''
        }
      </div>
    `;

    bindProductDetailEvents(product);
  } catch (err) {
    showToast(err.message, 'error');
    navigateTo('home');
  }
}

function bindProductDetailEvents(product) {
  const stage = document.getElementById('gallery-zoom-stage');
  const mainImg = document.getElementById('gallery-main-img');
  if (stage && mainImg) {
    stage.addEventListener('mousemove', (e) => {
      if (window.innerWidth <= 768) return; // Disable cursor zoom on touch mobile screens
      const rect = stage.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      mainImg.style.transformOrigin = `${x}% ${y}%`;
      mainImg.style.transform = 'scale(1.6)';
    });
    stage.addEventListener('mouseleave', () => {
      mainImg.style.transform = 'scale(1)';
      mainImg.style.transformOrigin = 'center center';
    });
  }

  document.querySelectorAll('[data-gallery-src]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const src = btn.getAttribute('data-gallery-src');
      if (mainImg && src) mainImg.src = src;
      document.querySelectorAll('[data-gallery-src]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const qtyValEl = document.getElementById('detail-qty-val');
  const addBagBtn = document.getElementById('btn-detail-add-bag');
  const updateQtyDisplay = () => {
    if (qtyValEl) qtyValEl.textContent = String(appState.selectedDetailQty);
    if (addBagBtn && product.stock_qty > 0) {
      addBagBtn.textContent = `Add ${appState.selectedDetailQty} to Bag — ${formatCurrency(
        product.effective_price * appState.selectedDetailQty
      )}`;
    }
  };

  document.getElementById('detail-qty-dec')?.addEventListener('click', () => {
    if (appState.selectedDetailQty > 1) {
      appState.selectedDetailQty--;
      updateQtyDisplay();
    }
  });
  document.getElementById('detail-qty-inc')?.addEventListener('click', () => {
    if (appState.selectedDetailQty < product.stock_qty) {
      appState.selectedDetailQty++;
      updateQtyDisplay();
    } else {
      showToast(`Maximum available stock is ${product.stock_qty}`, 'warning');
    }
  });

  addBagBtn?.addEventListener('click', async () => {
    try {
      await store.addToCart(product, appState.selectedDetailQty, 'increment');
      showToast(`Added ${appState.selectedDetailQty}x "${product.title}" to your bag`, 'success');
      openCartDrawer();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('btn-detail-buy-now')?.addEventListener('click', async () => {
    try {
      await store.addToCart(product, appState.selectedDetailQty, 'increment');
      navigateTo(store.user ? 'checkout' : 'auth');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('review-submit-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const rating = Number(document.getElementById('rev-rating').value);
      const title = document.getElementById('rev-title').value;
      const comment = document.getElementById('rev-comment').value;

      await apiRequest(`/products/${encodeURIComponent(product.id)}/reviews`, {
        method: 'POST',
        body: { rating, title, comment },
      });
      showToast('Your verified review has been published!', 'success');
      await store.loadProducts();
      renderProductDetailsView(product.slug);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/* ==========================================================================
   4. Guided Checkout View (FR-05: Atomic ACID Transaction & Invoice Modal)
   ========================================================================== */

function renderCheckoutView() {
  if (!store.user) {
    showToast('Please sign in to complete your order', 'warning');
    return navigateTo('auth');
  }

  updateSeoMeta({
    title: 'Secure ACID Checkout',
    description: 'Complete your AURA // ATELIER order with atomic stock reservation.',
    urlPath: '/#/checkout',
  });

  const viewport = document.getElementById('app-viewport');
  if (!viewport) return;

  const items = store.cart.items || [];
  const summary = store.cart.summary;

  if (items.length === 0) {
    viewport.innerHTML = `
      <div class="container" style="padding-top:2.5rem;text-align:center;">
        <div class="surface-card" style="max-width:500px;margin:0 auto;">
          <h2>Your Bag is Empty</h2>
          <p style="color:var(--text-secondary);margin:0.65rem 0 1.25rem;">Add objects to your bag before proceeding to checkout.</p>
          <button type="button" class="btn btn-primary" data-nav="home">Return to Storefront</button>
        </div>
      </div>
    `;
    return;
  }

  const addr = store.user.address || {};

  viewport.innerHTML = `
    <div class="container" style="padding-top:1.5rem;">
      <span class="eyebrow-tag">🔒 ACID TRANSACTIONAL CHECKOUT</span>
      <h1 style="font-family:var(--font-display);font-size:1.75rem;margin-top:0.2rem;">Complete Your Order</h1>

      <form id="checkout-order-form" class="checkout-grid">
        <div class="surface-card">
          <h2 style="font-size:1.12rem;margin-bottom:1rem;">1. Insured Courier Destination</h2>
          <div class="form-grid-2">
            <div class="form-group">
              <label for="chk-fullname">Recipient Full Name *</label>
              <input type="text" id="chk-fullname" class="input-control" required value="${escapeHtml(addr.fullName || store.user.name || '')}" />
            </div>
            <div class="form-group">
              <label for="chk-phone">Courier Contact Phone *</label>
              <input type="text" id="chk-phone" class="input-control" required value="${escapeHtml(addr.phone || store.user.phone || '+1 (555) 019-2834')}" />
            </div>
          </div>

          <div class="form-group">
            <label for="chk-street">Street Address / Suite *</label>
            <input type="text" id="chk-street" class="input-control" required value="${escapeHtml(addr.street || '450 Mercer Street, Suite 12B')}" />
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label for="chk-city">City *</label>
              <input type="text" id="chk-city" class="input-control" required value="${escapeHtml(addr.city || 'New York')}" />
            </div>
            <div class="form-group">
              <label for="chk-state">State / Province</label>
              <input type="text" id="chk-state" class="input-control" value="${escapeHtml(addr.state || 'NY')}" />
            </div>
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label for="chk-postal">Postal / ZIP Code *</label>
              <input type="text" id="chk-postal" class="input-control" required value="${escapeHtml(addr.postalCode || '10013')}" />
            </div>
            <div class="form-group">
              <label for="chk-country">Country *</label>
              <input type="text" id="chk-country" class="input-control" required value="${escapeHtml(addr.country || 'United States')}" />
            </div>
          </div>

          <h2 style="font-size:1.12rem;margin:1.25rem 0 0.65rem;">2. Settlement Method</h2>
          <div class="payment-option-grid">
            <label class="payment-radio-card selected" id="pay-card-label">
              <input type="radio" name="paymentMethod" value="Card" checked style="margin-right:0.4rem;" />
              <strong>💳 Encrypted Credit / Debit Card</strong>
              <p style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.2rem;">Instant settlement &amp; priority processing</p>
            </label>
            <label class="payment-radio-card" id="pay-cod-label">
              <input type="radio" name="paymentMethod" value="COD" style="margin-right:0.4rem;" />
              <strong>📦 Cash on Delivery (COD)</strong>
              <p style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.2rem;">Pay courier upon physical inspection</p>
            </label>
          </div>

          <div id="card-vault-box" style="padding:1rem;border-radius:var(--radius-sm);background:var(--bg-secondary);border:1px solid var(--border-subtle);margin-bottom:0.9rem;">
            <div class="form-group">
              <label for="chk-card-num">Card Number (Simulated Tokenization)</label>
              <input type="text" id="chk-card-num" class="input-control mono-text" value="4532 •••• •••• 8891" maxlength="19" />
            </div>
            <div class="form-grid-2">
              <div class="form-group" style="margin-bottom:0;">
                <label for="chk-card-exp">Expiry</label>
                <input type="text" id="chk-card-exp" class="input-control mono-text" value="09/29" maxlength="5" />
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label for="chk-card-cvc">CVC</label>
                <input type="password" id="chk-card-cvc" class="input-control mono-text" value="884" maxlength="4" />
              </div>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label for="chk-notes">Concierge Delivery Instructions (Optional)</label>
            <input type="text" id="chk-notes" class="input-control" placeholder="Gate code, signature preference..." />
          </div>
        </div>

        <!-- Order Summary Sticky Column -->
        <div>
          <div class="surface-card">
            <span class="eyebrow-tag">SERVER-VERIFIED FINANCIAL SUMMARY</span>
            <h2 style="font-size:1.15rem;margin:0.3rem 0 0.85rem;">Order Allocation (${summary.total_items} Items)</h2>

            <div style="display:flex;flex-direction:column;gap:0.65rem;margin-bottom:1.1rem;max-height:260px;overflow-y:auto;">
              ${items
                .map(
                  (item) => `
                <div style="display:flex;justify-content:space-between;gap:0.65rem;font-size:0.84rem;padding-bottom:0.55rem;border-bottom:1px solid var(--border-subtle);">
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <div class="mono-text" style="font-size:0.72rem;color:var(--text-muted);">Qty: ${item.quantity} &times; ${formatCurrency(item.unit_price)}</div>
                  </div>
                  <strong class="mono-text">${formatCurrency(item.line_subtotal)}</strong>
                </div>
              `
                )
                .join('')}
            </div>

            <div class="summary-row">
              <span>Subtotal</span>
              <span class="mono-text">${formatCurrency(summary.subtotal_amount)}</span>
            </div>
            <div class="summary-row">
              <span>VAT / Tax (14%)</span>
              <span class="mono-text">${formatCurrency(summary.tax_amount)}</span>
            </div>
            <div class="summary-row">
              <span>Insured Express Courier</span>
              <span class="mono-text">${summary.shipping_fee === 0 ? 'COMPLIMENTARY' : formatCurrency(summary.shipping_fee)}</span>
            </div>
            <div class="summary-row total">
              <span>Total Settlement</span>
              <span>${formatCurrency(summary.total_amount)}</span>
            </div>

            <button type="submit" class="btn btn-primary btn-block" id="btn-submit-order" style="margin-top:1rem;padding:0.85rem;">
              Authorize &amp; Place Order (${formatCurrency(summary.total_amount)})
            </button>
            <p style="font-size:0.72rem;color:var(--text-muted);text-align:center;margin-top:0.65rem;">
              Stock is atomically reserved inside an ACID database transaction upon confirmation.
            </p>
          </div>
        </div>
      </form>
    </div>
  `;

  const cardRadio = document.querySelector('input[name="paymentMethod"][value="Card"]');
  const codRadio = document.querySelector('input[name="paymentMethod"][value="COD"]');
  const cardVault = document.getElementById('card-vault-box');
  const cardLabel = document.getElementById('pay-card-label');
  const codLabel = document.getElementById('pay-cod-label');

  const syncPaymentMethodUI = () => {
    if (cardRadio?.checked) {
      cardLabel?.classList.add('selected');
      codLabel?.classList.remove('selected');
      if (cardVault) cardVault.style.display = 'block';
    } else {
      codLabel?.classList.add('selected');
      cardLabel?.classList.remove('selected');
      if (cardVault) cardVault.style.display = 'none';
    }
  };
  cardRadio?.addEventListener('change', syncPaymentMethodUI);
  codRadio?.addEventListener('change', syncPaymentMethodUI);

  document.getElementById('checkout-order-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-submit-order');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const paymentMethod = codRadio?.checked ? 'COD' : 'Card';
      const shippingAddress = {
        fullName: document.getElementById('chk-fullname').value.trim(),
        phone: document.getElementById('chk-phone').value.trim(),
        street: document.getElementById('chk-street').value.trim(),
        city: document.getElementById('chk-city').value.trim(),
        state: document.getElementById('chk-state').value.trim(),
        postalCode: document.getElementById('chk-postal').value.trim(),
        country: document.getElementById('chk-country').value.trim(),
      };
      const notes = document.getElementById('chk-notes').value.trim();

      const res = await apiRequest('/orders/checkout', {
        method: 'POST',
        body: { paymentMethod, shippingAddress, notes },
      });

      const order = res.data.order;
      showToast(`Order ${order.order_number} confirmed!`, 'success');

      await Promise.all([store.syncAndLoadServerCart(), store.loadProducts()]);
      navigateTo('customer-dashboard');
      openInvoiceModal(order);
    } catch (err) {
      showToast(err.message, 'error');
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

/* ==========================================================================
   5. Authentication View (FR-01: Register, Login, Demo Credentials)
   ========================================================================== */

function renderAuthView() {
  updateSeoMeta({
    title: 'Client Sign In & Registration',
    description: 'Sign in or create an AURA // ATELIER client account.',
    urlPath: '/#/auth',
  });

  const viewport = document.getElementById('app-viewport');
  if (!viewport) return;

  const isLogin = appState.authTab === 'login';

  viewport.innerHTML = `
    <div class="container" style="padding-top:2rem;max-width:480px;">
      <div class="surface-card">
        <span class="eyebrow-tag">🔒 ZERO-TRUST JWT AUTHENTICATION</span>
        <h1 style="font-family:var(--font-display);font-size:1.55rem;margin:0.3rem 0 0.9rem;">
          ${isLogin ? 'Sign In to AURA // ATELIER' : 'Create Your Client Account'}
        </h1>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.45rem;background:var(--bg-secondary);padding:0.25rem;border-radius:var(--radius-sm);margin-bottom:1.15rem;">
          <button type="button" class="btn btn-sm ${isLogin ? 'btn-primary' : ''}" id="tab-btn-login">Sign In</button>
          <button type="button" class="btn btn-sm ${!isLogin ? 'btn-primary' : ''}" id="tab-btn-register">Create Account</button>
        </div>

        ${
          isLogin
            ? `
          <form id="auth-login-form">
            <div class="form-group">
              <label for="login-email">Email Address</label>
              <input type="email" id="login-email" class="input-control" required placeholder="client@aura-atelier.com" />
            </div>
            <div class="form-group">
              <label for="login-password">Password</label>
              <input type="password" id="login-password" class="input-control" required placeholder="••••••••••••" />
            </div>
            <button type="submit" class="btn btn-primary btn-block" style="margin-top:0.35rem;">Sign In Securely →</button>
          </form>

          <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border-subtle);">
            <span class="eyebrow-tag" style="display:block;margin-bottom:0.55rem;">INSTANT ONE-CLICK DEMO ACCESS</span>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.55rem;">
              <button type="button" class="btn btn-secondary btn-sm" data-quick-demo="customer">
                👤 Client: Marcus
              </button>
              <button type="button" class="btn btn-gold btn-sm" data-quick-demo="admin">
                🛡️ Admin: Elena
              </button>
            </div>
          </div>
        `
            : `
          <form id="auth-register-form">
            <div class="form-group">
              <label for="reg-name">Full Name *</label>
              <input type="text" id="reg-name" class="input-control" required placeholder="Julian Mercer" />
            </div>
            <div class="form-group">
              <label for="reg-email">Email Address *</label>
              <input type="email" id="reg-email" class="input-control" required placeholder="julian@domain.com" />
            </div>
            <div class="form-group">
              <label for="reg-phone">Phone Number</label>
              <input type="text" id="reg-phone" class="input-control" placeholder="+1 (555) 234-5678" />
            </div>
            <div class="form-group">
              <label for="reg-password">Password (Min 8 chars, Upper, Lower &amp; Number) *</label>
              <input type="password" id="reg-password" class="input-control" required placeholder="StrongPass123" />
            </div>
            <button type="submit" class="btn btn-primary btn-block" style="margin-top:0.35rem;">Create Account &amp; Sync Bag →</button>
          </form>
        `
        }
      </div>
    </div>
  `;

  document.getElementById('tab-btn-login')?.addEventListener('click', () => {
    appState.authTab = 'login';
    renderAuthView();
  });
  document.getElementById('tab-btn-register')?.addEventListener('click', () => {
    appState.authTab = 'register';
    renderAuthView();
  });

  document.getElementById('auth-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const user = await store.login(email, password);
      showToast(`Welcome back, ${user.name}!`, 'success');
      navigateTo(user.role === 'admin' ? 'admin' : 'home');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('auth-register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const phone = document.getElementById('reg-phone').value.trim();
      const password = document.getElementById('reg-password').value;
      const user = await store.register({ name, email, phone, password });
      showToast(`Account created! Welcome to AURA, ${user.name}.`, 'success');
      navigateTo('home');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/* ==========================================================================
   6. Customer Dashboard View (Orders, Invoices, Profile & Address Manager)
   ========================================================================== */

async function renderCustomerDashboardView() {
  if (!store.user) {
    return navigateTo('auth');
  }

  updateSeoMeta({
    title: 'Client Portal & Order History',
    description: 'Track your AURA // ATELIER orders and manage your shipping profile.',
    urlPath: '/#/orders',
  });

  const viewport = document.getElementById('app-viewport');
  if (!viewport) return;

  try {
    const res = await apiRequest('/orders/my-orders');
    appState.customerOrders = res.data.orders || [];
  } catch (err) {
    showToast(err.message, 'error');
  }

  const addr = store.user.address || {};

  viewport.innerHTML = `
    <div class="container" style="padding-top:1.5rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-bottom:1.25rem;">
        <div>
          <span class="eyebrow-tag">CLIENT PORTAL &amp; TELEMETRY</span>
          <h1 style="font-family:var(--font-display);font-size:1.7rem;">Welcome, ${escapeHtml(store.user.name)}</h1>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          ${
            store.user.role === 'admin'
              ? `<button type="button" class="btn btn-gold btn-sm" data-nav="admin">Executive Admin Console →</button>`
              : ''
          }
          <button type="button" class="btn btn-secondary btn-sm" data-nav="home">Continue Shopping</button>
        </div>
      </div>

      <div class="checkout-grid">
        <!-- Order History Column -->
        <div>
          <h2 style="font-size:1.15rem;margin-bottom:0.85rem;">Order History &amp; Digital Invoices (${appState.customerOrders.length})</h2>
          ${
            appState.customerOrders.length === 0
              ? `
            <div class="surface-card" style="text-align:center;padding:2.25rem;">
              <h3>No Orders Placed Yet</h3>
              <p style="color:var(--text-secondary);margin:0.45rem 0 1.15rem;font-size:0.88rem;">Your completed orders and printable invoices will appear here.</p>
              <button type="button" class="btn btn-primary btn-sm" data-nav="home">Browse Storefront</button>
            </div>
          `
              : appState.customerOrders
                  .map(
                    (ord) => `
                <div class="surface-card" style="margin-bottom:1rem;">
                  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;padding-bottom:0.75rem;border-bottom:1px solid var(--border-subtle);">
                    <div>
                      <span class="mono-text" style="font-weight:700;font-size:0.98rem;">${escapeHtml(ord.order_number)}</span>
                      <div style="font-size:0.74rem;color:var(--text-muted);">Placed ${escapeHtml(ord.created_at)} &bull; ${escapeHtml(ord.payment_method)}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.4rem;">
                      <span class="status-badge status-${escapeHtml(ord.order_status)}">${escapeHtml(ord.order_status)}</span>
                      <span class="status-badge status-${escapeHtml(ord.payment_status)}">${escapeHtml(ord.payment_status)}</span>
                    </div>
                  </div>

                  ${renderOrderTimeline(ord.order_status)}

                  <div style="display:flex;flex-direction:column;gap:0.4rem;margin-bottom:0.85rem;font-size:0.84rem;">
                    ${(ord.items || [])
                      .map(
                        (it) => `
                      <div style="display:flex;justify-content:space-between;gap:0.5rem;">
                        <span>${it.quantity}x <strong>${escapeHtml(it.product_name_snapshot)}</strong></span>
                        <span class="mono-text">${formatCurrency(it.subtotal)}</span>
                      </div>
                    `
                      )
                      .join('')}
                  </div>

                  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;padding-top:0.75rem;border-top:1px solid var(--border-subtle);">
                    <div class="mono-text">
                      Total: <strong style="font-size:1.02rem;">${formatCurrency(ord.total_amount)}</strong>
                    </div>
                    <div style="display:flex;gap:0.45rem;">
                      ${
                        ord.order_status === 'pending'
                          ? `<button type="button" class="btn btn-danger btn-sm" data-cancel-order="${escapeHtml(ord.id)}">Cancel Order</button>`
                          : ''
                      }
                      <button type="button" class="btn btn-secondary btn-sm" data-inspect-invoice="${escapeHtml(ord.id)}">
                        🧾 View / Print Invoice
                      </button>
                    </div>
                  </div>
                </div>
              `
                  )
                  .join('')
          }
        </div>

        <!-- Profile & Default Shipping Address Column -->
        <div>
          <div class="surface-card">
            <span class="eyebrow-tag">PROFILE &amp; SHIPPING PREFERENCES</span>
            <h2 style="font-size:1.15rem;margin:0.3rem 0 0.9rem;">Account Settings</h2>
            <form id="profile-update-form">
              <div class="form-group">
                <label for="prof-name">Full Name</label>
                <input type="text" id="prof-name" class="input-control" required value="${escapeHtml(store.user.name)}" />
              </div>
              <div class="form-group">
                <label for="prof-phone">Phone</label>
                <input type="text" id="prof-phone" class="input-control" value="${escapeHtml(store.user.phone || '')}" />
              </div>
              <div class="form-group">
                <label for="prof-street">Default Street Address</label>
                <input type="text" id="prof-street" class="input-control" value="${escapeHtml(addr.street || '')}" />
              </div>
              <div class="form-grid-2">
                <div class="form-group">
                  <label for="prof-city">City</label>
                  <input type="text" id="prof-city" class="input-control" value="${escapeHtml(addr.city || '')}" />
                </div>
                <div class="form-group">
                  <label for="prof-postal">Postal Code</label>
                  <input type="text" id="prof-postal" class="input-control" value="${escapeHtml(addr.postalCode || '')}" />
                </div>
              </div>
              <div class="form-group">
                <label for="prof-country">Country</label>
                <input type="text" id="prof-country" class="input-control" value="${escapeHtml(addr.country || 'United States')}" />
              </div>
              <button type="submit" class="btn btn-primary btn-block">Save Profile &amp; Address</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('profile-update-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const name = document.getElementById('prof-name').value.trim();
      const phone = document.getElementById('prof-phone').value.trim();
      const address = {
        fullName: name,
        phone,
        street: document.getElementById('prof-street').value.trim(),
        city: document.getElementById('prof-city').value.trim(),
        postalCode: document.getElementById('prof-postal').value.trim(),
        country: document.getElementById('prof-country').value.trim(),
      };
      const res = await apiRequest('/auth/profile', {
        method: 'PUT',
        body: { name, phone, address },
      });
      store.user = res.data.user;
      store.notify();
      showToast('Profile and default shipping address updated!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.querySelectorAll('[data-inspect-invoice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ordId = btn.getAttribute('data-inspect-invoice');
      const ord = appState.customerOrders.find((o) => o.id === ordId);
      if (ord) openInvoiceModal(ord);
    });
  });

  document.querySelectorAll('[data-cancel-order]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ordId = btn.getAttribute('data-cancel-order');
      try {
        await apiRequest(`/orders/${encodeURIComponent(ordId)}/cancel`, { method: 'PATCH' });
        showToast('Order cancelled and stock returned to inventory', 'info');
        await store.loadProducts();
        renderCustomerDashboardView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

/* ==========================================================================
   7. Executive Admin Control Center (FR-06: KPIs, Low-Stock, Product CRUD, Orders)
   ========================================================================== */

async function renderAdminDashboardView() {
  if (!store.user || store.user.role !== 'admin') {
    showToast('Executive Admin privileges required', 'error');
    return navigateTo('auth');
  }

  updateSeoMeta({
    title: 'Executive Admin Control Center',
    description: 'AURA // ATELIER inventory, telemetry, and order fulfillment console.',
    urlPath: '/#/admin',
  });

  const viewport = document.getElementById('app-viewport');
  if (!viewport) return;

  try {
    const [statsRes, ordersRes] = await Promise.all([
      apiRequest('/admin/stats'),
      apiRequest('/admin/orders'),
      store.loadCategories(),
      store.loadProducts({ limit: 50, page: 1, category: 'all', search: '' }),
    ]);
    appState.adminStats = statsRes.data;
    appState.adminOrders = ordersRes.data.orders || [];
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  const kpis = appState.adminStats.kpis;
  const lowStock = appState.adminStats.low_stock_alerts || [];

  viewport.innerHTML = `
    <div class="container" style="padding-top:1.5rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-bottom:1.25rem;">
        <div>
          <span class="eyebrow-tag">🛡️ ROLE-BASED EXECUTIVE CONTROL CENTER</span>
          <h1 style="font-family:var(--font-display);font-size:1.7rem;">Atelier Operations &amp; Telemetry</h1>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary btn-sm" id="btn-admin-new-product">+ Add Product</button>
          <button type="button" class="btn btn-secondary btn-sm" data-nav="home">View Storefront</button>
        </div>
      </div>

      <!-- KPI Bento Row (2x2 on mobile, 4-col on desktop) -->
      <div class="kpi-bento-grid">
        <div class="kpi-card">
          <span class="eyebrow-tag">NET SETTLED REVENUE</span>
          <div class="kpi-value text-emerald">${formatCurrency(kpis.total_revenue)}</div>
          <span style="font-size:0.74rem;color:var(--text-muted);">Excludes cancelled</span>
        </div>
        <div class="kpi-card">
          <span class="eyebrow-tag">TOTAL ORDERS</span>
          <div class="kpi-value">${kpis.total_orders}</div>
          <span style="font-size:0.74rem;color:var(--text-muted);">
            ${appState.adminStats.status_breakdown.delivered} Delivered
          </span>
        </div>
        <div class="kpi-card">
          <span class="eyebrow-tag">ACTIVE CATALOG</span>
          <div class="kpi-value">${kpis.total_products}</div>
          <span style="font-size:0.74rem;color:var(--text-muted);">${kpis.total_categories} Collections</span>
        </div>
        <div class="kpi-card" style="border-color:${kpis.low_stock_count > 0 ? 'rgba(245,158,11,0.45)' : 'var(--border-subtle)'};">
          <span class="eyebrow-tag">LOW STOCK (&le; 5)</span>
          <div class="kpi-value ${kpis.low_stock_count > 0 ? 'text-gold' : ''}">${kpis.low_stock_count}</div>
          <span style="font-size:0.74rem;color:var(--text-muted);">Watchlist items</span>
        </div>
      </div>

      <!-- Low Stock Alert Watchlist Banner -->
      ${
        lowStock.length > 0
          ? `
        <div class="surface-card" style="margin-bottom:1.35rem;border-color:rgba(245,158,11,0.4);">
          <div style="margin-bottom:0.75rem;">
            <span class="eyebrow-tag">⚠️ CRITICAL INVENTORY WATCHLIST</span>
            <h3 style="font-size:1rem;">Editions Running Low on Stock (&le; 5 Units Remaining)</h3>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:0.65rem;">
            ${lowStock
              .map(
                (item) => `
              <div style="padding:0.7rem 0.9rem;border-radius:var(--radius-sm);background:var(--bg-secondary);border:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;gap:0.65rem;">
                <div style="min-width:0;">
                  <strong style="font-size:0.82rem;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.title)}</strong>
                  <span class="mono-text" style="font-size:0.72rem;color:var(--accent-gold);">
                    ${escapeHtml(item.sku)} &bull; Stock: ${item.stock_qty}
                  </span>
                </div>
                <button type="button" class="btn btn-gold btn-sm" data-quick-restock="${escapeHtml(item.id)}" data-current-stock="${item.stock_qty}">
                  +10 Stock
                </button>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      <!-- Admin Navigation Tabs -->
      <div style="display:flex;gap:0.45rem;margin-bottom:1rem;overflow-x:auto;padding-bottom:0.2rem;">
        <button type="button" class="btn ${appState.adminTab === 'inventory' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-admin-tab="inventory">
          📦 Inventory (${store.products.length})
        </button>
        <button type="button" class="btn ${appState.adminTab === 'orders' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-admin-tab="orders">
          🧾 Orders (${appState.adminOrders.length})
        </button>
        <button type="button" class="btn ${appState.adminTab === 'categories' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-admin-tab="categories">
          🗂️ Categories (${store.categories.length})
        </button>
      </div>

      <div class="surface-card">
        ${
          appState.adminTab === 'inventory'
            ? renderAdminInventoryTable()
            : appState.adminTab === 'orders'
            ? renderAdminOrdersTable()
            : renderAdminCategoriesPanel()
        }
      </div>
    </div>
  `;

  bindAdminEvents();
}

function renderAdminInventoryTable() {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.85rem;">
      <h2 style="font-size:1.12rem;">Product Catalog &amp; Stock Control</h2>
    </div>
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th>Object</th>
            <th>SKU</th>
            <th>Category</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Sales</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${store.products
            .map((p) => {
              const fallback = getFallbackSvgDataUri(p.title);
              return `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:0.65rem;min-width:190px;">
                      <img src="${escapeHtml(p.images?.[0] || fallback)}" alt="" width="40" height="40" style="width:40px;height:40px;border-radius:8px;object-fit:cover;flex-shrink:0;" onerror="this.onerror=null;this.src='${fallback}'" />
                      <div>
                        <strong>${escapeHtml(p.title)}</strong>
                        ${p.featured ? `<span class="badge-pill badge-featured" style="margin-left:0.3rem;font-size:0.6rem;">PICK</span>` : ''}
                      </div>
                    </div>
                  </td>
                  <td class="mono-text">${escapeHtml(p.sku)}</td>
                  <td>${escapeHtml(p.category_name || '')}</td>
                  <td class="mono-text">
                    <strong>${formatCurrency(p.effective_price)}</strong>
                    ${p.discount_price ? `<div style="font-size:0.72rem;color:var(--text-muted);text-decoration:line-through;">${formatCurrency(p.price)}</div>` : ''}
                  </td>
                  <td>
                    <span class="badge-pill ${p.stock_qty <= 0 ? 'badge-stock-out' : p.stock_qty <= 5 ? 'badge-stock-low' : 'badge-stock-ok'}">
                      ${p.stock_qty}
                    </span>
                  </td>
                  <td class="mono-text">${p.sales_count}</td>
                  <td>
                    <div style="display:flex;gap:0.35rem;">
                      <button type="button" class="btn btn-secondary btn-sm" data-admin-edit-product="${escapeHtml(p.id)}">Edit</button>
                      <button type="button" class="btn btn-danger btn-sm" data-admin-delete-product="${escapeHtml(p.id)}">Delete</button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminOrdersTable() {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.85rem;">
      <h2 style="font-size:1.12rem;">Customer Orders &amp; Status Pipeline</h2>
    </div>
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Client</th>
            <th>Date</th>
            <th>Total</th>
            <th>Payment</th>
            <th>Fulfillment Status</th>
            <th>Invoice</th>
          </tr>
        </thead>
        <tbody>
          ${appState.adminOrders
            .map(
              (ord) => `
            <tr>
              <td class="mono-text"><strong>${escapeHtml(ord.order_number)}</strong></td>
              <td>
                <strong>${escapeHtml(ord.customer_name || ord.shipping_address?.fullName || 'Client')}</strong>
                <div style="font-size:0.72rem;color:var(--text-muted);">${escapeHtml(ord.customer_email || '')}</div>
              </td>
              <td style="font-size:0.78rem;white-space:nowrap;">${escapeHtml(ord.created_at)}</td>
              <td class="mono-text"><strong>${formatCurrency(ord.total_amount)}</strong></td>
              <td>
                <span class="status-badge status-${escapeHtml(ord.payment_status)}">
                  ${escapeHtml(ord.payment_method)} &bull; ${escapeHtml(ord.payment_status)}
                </span>
              </td>
              <td>
                <select class="select-control" style="padding:0.3rem 0.5rem;font-size:0.76rem;width:auto;min-width:125px;" data-admin-order-status="${escapeHtml(ord.id)}">
                  ${['pending', 'processing', 'shipped', 'delivered', 'cancelled']
                    .map(
                      (st) => `
                    <option value="${st}" ${ord.order_status === st ? 'selected' : ''}>${st.toUpperCase()}</option>
                  `
                    )
                    .join('')}
                </select>
              </td>
              <td>
                <button type="button" class="btn btn-secondary btn-sm" data-admin-view-invoice="${escapeHtml(ord.id)}">
                  🧾 Invoice
                </button>
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminCategoriesPanel() {
  return `
    <div class="checkout-grid" style="margin-top:0;">
      <div>
        <h2 style="font-size:1.12rem;margin-bottom:0.85rem;">Existing Collections</h2>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Collection Name</th>
                <th>Slug</th>
                <th>Products</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${store.categories
                .map(
                  (c) => `
                <tr>
                  <td><strong>${escapeHtml(c.name)}</strong></td>
                  <td class="mono-text">${escapeHtml(c.slug)}</td>
                  <td class="mono-text">${c.product_count}</td>
                  <td>
                    <button type="button" class="btn btn-danger btn-sm" data-admin-delete-cat="${escapeHtml(c.id)}" ${c.product_count > 0 ? 'disabled title="Contains products"' : ''}>
                      Delete
                    </button>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 style="font-size:1.12rem;margin-bottom:0.85rem;">Create New Collection</h2>
        <form id="admin-create-category-form">
          <div class="form-group">
            <label for="cat-name">Category Name *</label>
            <input type="text" id="cat-name" class="input-control" required placeholder="e.g. Bespoke Audio Cables" />
          </div>
          <div class="form-group">
            <label for="cat-desc">Description</label>
            <textarea id="cat-desc" rows="2" class="textarea-control" placeholder="Collection overview..."></textarea>
          </div>
          <div class="form-group">
            <label for="cat-img">Cover Image URL</label>
            <input type="text" id="cat-img" class="input-control" placeholder="https://images.unsplash.com/..." />
          </div>
          <button type="submit" class="btn btn-primary btn-block">Create Category</button>
        </form>
      </div>
    </div>
  `;
}

function openProductModal(productToEdit = null) {
  const backdrop = document.getElementById('product-modal-backdrop');
  const content = document.getElementById('product-modal-content');
  if (!backdrop || !content) return;

  const isEdit = Boolean(productToEdit);
  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;padding-bottom:0.75rem;border-bottom:1px solid var(--border-subtle);">
      <div>
        <span class="eyebrow-tag">${isEdit ? 'UPDATE INVENTORY RECORD' : 'NEW ATELIER EDITION'}</span>
        <h2 id="product-modal-title" style="font-family:var(--font-display);font-size:1.25rem;">
          ${isEdit ? `Edit: ${escapeHtml(productToEdit.title)}` : 'Create New Product'}
        </h2>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" id="btn-close-product-modal">&times; Close</button>
    </div>

    <form id="admin-product-form" enctype="multipart/form-data">
      <div class="form-grid-2">
        <div class="form-group">
          <label for="prd-title">Product Title *</label>
          <input type="text" id="prd-title" name="title" class="input-control" required value="${escapeHtml(productToEdit?.title || '')}" />
        </div>
        <div class="form-group">
          <label for="prd-category">Collection / Category *</label>
          <select id="prd-category" name="category_id" class="select-control" required>
            ${store.categories
              .map(
                (c) => `
              <option value="${escapeHtml(c.id)}" ${productToEdit?.category_id === c.id ? 'selected' : ''}>
                ${escapeHtml(c.name)}
              </option>
            `
              )
              .join('')}
          </select>
        </div>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label for="prd-price">Regular Price ($) *</label>
          <input type="number" step="0.01" min="0.01" id="prd-price" name="price" class="input-control" required value="${productToEdit?.price ?? '290.00'}" />
        </div>
        <div class="form-group">
          <label for="prd-discount">Discount Price ($) (Optional)</label>
          <input type="number" step="0.01" min="0" id="prd-discount" name="discount_price" class="input-control" value="${productToEdit?.discount_price ?? ''}" />
        </div>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label for="prd-stock">Stock Quantity *</label>
          <input type="number" min="0" id="prd-stock" name="stock_qty" class="input-control" required value="${productToEdit?.stock_qty ?? 15}" />
        </div>
        <div class="form-group">
          <label for="prd-sku">SKU Code *</label>
          <input type="text" id="prd-sku" name="sku" class="input-control mono-text" required value="${escapeHtml(productToEdit?.sku || `AUR-NEW-${Math.floor(100 + Math.random() * 899)}`)}" />
        </div>
      </div>

      <div class="form-group">
        <label for="prd-desc">Detailed Description *</label>
        <textarea id="prd-desc" name="description" rows="3" class="textarea-control" required>${escapeHtml(productToEdit?.description || '')}</textarea>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label for="prd-images">Image URLs (Comma-separated)</label>
          <input type="text" id="prd-images" name="images" class="input-control" value="${escapeHtml((productToEdit?.images || []).join(', '))}" placeholder="https://images.unsplash.com/..." />
        </div>
        <div class="form-group">
          <label for="prd-files">Or Upload Local Image Files (JPEG/PNG/WebP &le; 2MB)</label>
          <input type="file" id="prd-files" name="imageFiles" class="input-control" accept="image/jpeg,image/png,image/webp" multiple />
        </div>
      </div>

      <div class="form-group">
        <label style="display:inline-flex;align-items:center;gap:0.5rem;cursor:pointer;">
          <input type="checkbox" id="prd-featured" name="featured" ${productToEdit?.featured ? 'checked' : ''} />
          <span>Highlight as "Atelier Pick" Featured Edition</span>
        </label>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:0.65rem;margin-top:0.85rem;">
        <button type="button" class="btn btn-secondary" id="btn-cancel-product-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save Product Changes' : 'Create Product'}</button>
      </div>
    </form>
  `;

  backdrop.hidden = false;

  const closeModal = () => {
    backdrop.hidden = true;
  };
  document.getElementById('btn-close-product-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-product-modal')?.addEventListener('click', closeModal);

  document.getElementById('admin-product-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('title', document.getElementById('prd-title').value.trim());
      formData.append('category_id', document.getElementById('prd-category').value);
      formData.append('price', document.getElementById('prd-price').value);
      const disc = document.getElementById('prd-discount').value;
      formData.append('discount_price', disc === '' ? '' : disc);
      formData.append('stock_qty', document.getElementById('prd-stock').value);
      formData.append('sku', document.getElementById('prd-sku').value.trim());
      formData.append('description', document.getElementById('prd-desc').value.trim());
      formData.append('images', document.getElementById('prd-images').value.trim());
      formData.append('featured', document.getElementById('prd-featured').checked ? 'true' : 'false');

      const fileInput = document.getElementById('prd-files');
      if (fileInput?.files?.length) {
        for (const f of fileInput.files) {
          formData.append('imageFiles', f);
        }
      }

      if (isEdit) {
        await apiRequest(`/products/${encodeURIComponent(productToEdit.id)}`, {
          method: 'PUT',
          body: formData,
        });
        showToast('Product updated successfully!', 'success');
      } else {
        await apiRequest('/products', {
          method: 'POST',
          body: formData,
        });
        showToast('New product added to catalog!', 'success');
      }

      closeModal();
      renderAdminDashboardView();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function bindAdminEvents() {
  document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.adminTab = btn.getAttribute('data-admin-tab');
      renderAdminDashboardView();
    });
  });

  document.getElementById('btn-admin-new-product')?.addEventListener('click', () => {
    openProductModal(null);
  });

  document.querySelectorAll('[data-admin-edit-product]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-admin-edit-product');
      const product = store.products.find((p) => p.id === id);
      if (product) openProductModal(product);
    });
  });

  document.querySelectorAll('[data-admin-delete-product]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-admin-delete-product');
      try {
        const res = await apiRequest(`/products/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        showToast(res.message || 'Product removed', 'info');
        renderAdminDashboardView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.querySelectorAll('[data-quick-restock]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-quick-restock');
      const current = Number(btn.getAttribute('data-current-stock') || 0);
      try {
        await apiRequest(`/products/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: { stock_qty: current + 10 },
        });
        showToast('Restocked +10 units to warehouse inventory!', 'success');
        renderAdminDashboardView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.querySelectorAll('[data-admin-order-status]').forEach((select) => {
    select.addEventListener('change', async () => {
      const orderId = select.getAttribute('data-admin-order-status');
      const nextStatus = select.value;
      try {
        const res = await apiRequest(`/admin/orders/${encodeURIComponent(orderId)}/status`, {
          method: 'PATCH',
          body: { order_status: nextStatus },
        });
        showToast(res.message, 'success');
        renderAdminDashboardView();
      } catch (err) {
        showToast(err.message, 'error');
        renderAdminDashboardView();
      }
    });
  });

  document.querySelectorAll('[data-admin-view-invoice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ordId = btn.getAttribute('data-admin-view-invoice');
      const ord = appState.adminOrders.find((o) => o.id === ordId);
      if (ord) openInvoiceModal(ord);
    });
  });

  document.getElementById('admin-create-category-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const name = document.getElementById('cat-name').value.trim();
      const description = document.getElementById('cat-desc').value.trim();
      const image_url = document.getElementById('cat-img').value.trim();
      await apiRequest('/categories', {
        method: 'POST',
        body: { name, description, image_url },
      });
      showToast(`Collection "${name}" created!`, 'success');
      renderAdminDashboardView();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.querySelectorAll('[data-admin-delete-cat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-admin-delete-cat');
      try {
        await apiRequest(`/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
        showToast('Category deleted', 'info');
        renderAdminDashboardView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

/* ==========================================================================
   8. Global Navigation, Event Delegation & Bootstrap
   ========================================================================== */

export async function navigateTo(view, param = null) {
  appState.currentView = view;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (view === 'home') {
    await store.loadProducts({ page: 1 });
    renderHomeView();
  } else if (view === 'product') {
    appState.currentProductSlug = param;
    await renderProductDetailsView(param);
  } else if (view === 'checkout') {
    renderCheckoutView();
  } else if (view === 'auth') {
    renderAuthView();
  } else if (view === 'customer-dashboard') {
    await renderCustomerDashboardView();
  } else if (view === 'admin') {
    await renderAdminDashboardView();
  }
  syncHeaderAndDrawer();
}

function setupGlobalEvents() {
  // Theme toggle + theme-color meta tag sync
  const savedTheme = localStorage.getItem('aura_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const themeMeta = document.getElementById('meta-theme-color');
  if (themeMeta) themeMeta.setAttribute('content', savedTheme === 'dark' ? '#08090d' : '#f7f6f2');

  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('aura_theme', next);
    if (themeMeta) themeMeta.setAttribute('content', next === 'dark' ? '#08090d' : '#f7f6f2');
  });

  // Cart drawer triggers
  document.getElementById('cart-trigger-btn')?.addEventListener('click', openCartDrawer);
  document.getElementById('mobile-dock-bag')?.addEventListener('click', openCartDrawer);
  document.getElementById('cart-drawer-close')?.addEventListener('click', closeCartDrawer);
  document.getElementById('cart-drawer-backdrop')?.addEventListener('click', closeCartDrawer);

  // Mobile bottom dock account button
  document.getElementById('mobile-dock-account')?.addEventListener('click', () => {
    if (!store.user) {
      navigateTo('auth');
    } else if (store.user.role === 'admin') {
      navigateTo('admin');
    } else {
      navigateTo('customer-dashboard');
    }
  });

  // Search focus (Ctrl+K, Header Search Button, or Mobile Dock Search)
  const focusSearch = () => {
    const focusInput = () => {
      const isMobile = window.innerWidth <= 768;
      const input = document.getElementById(
        isMobile ? 'filter-mobile-search-input' : 'filter-search-input'
      );
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus();
    };

    if (appState.currentView !== 'home') {
      navigateTo('home').then(focusInput);
    } else {
      focusInput();
    }
  };

  document.getElementById('header-search-btn')?.addEventListener('click', focusSearch);
  document.getElementById('mobile-dock-search')?.addEventListener('click', focusSearch);

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      focusSearch();
    } else if (e.key === 'Escape') {
      closeCartDrawer();
      const invModal = document.getElementById('invoice-modal-backdrop');
      const prdModal = document.getElementById('product-modal-backdrop');
      if (invModal) invModal.hidden = true;
      if (prdModal) prdModal.hidden = true;
    }
  });

  // Global delegated click handler
  document.body.addEventListener('click', async (e) => {
    const target = e.target;

    // 1. Navigation links
    const navTrigger = target.closest('[data-nav]');
    if (navTrigger) {
      e.preventDefault();
      const dest = navTrigger.getAttribute('data-nav');
      const cat = navTrigger.getAttribute('data-category');
      if (dest === 'catalog' && cat) {
        store.filters.category = cat;
        store.filters.page = 1;
        await navigateTo('home');
        document.getElementById('catalog-anchor')?.scrollIntoView({ behavior: 'smooth' });
      } else {
        if (dest === 'home') store.filters.category = 'all';
        await navigateTo(dest);
      }
      return;
    }

    // 2. Category Bento tile filter
    const catTile = target.closest('[data-filter-category]');
    if (catTile) {
      const slug = catTile.getAttribute('data-filter-category');
      await store.loadProducts({ category: slug, page: 1 });
      renderHomeView();
      syncHeaderAndDrawer();
      return;
    }

    // 3. View product details
    const viewPrd = target.closest('[data-view-product]');
    if (viewPrd) {
      const slug = viewPrd.getAttribute('data-view-product');
      await navigateTo('product', slug);
      return;
    }

    // 4. Quick Add to Cart from product card
    const addCartBtn = target.closest('[data-add-cart]');
    if (addCartBtn) {
      const productId = addCartBtn.getAttribute('data-add-cart');
      const product =
        store.products.find((p) => p.id === productId) ||
        appState.currentProductData?.similar_products?.find((p) => p.id === productId);
      if (product) {
        try {
          await store.addToCart(product, 1, 'increment');
          showToast(`Added "${product.title}" to your bag`, 'success');
          openCartDrawer();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
      return;
    }

    // 5. Cart drawer increment / decrement / remove / checkout
    const incBtn = target.closest('[data-cart-inc]');
    if (incBtn) {
      const prodId = incBtn.getAttribute('data-cart-inc');
      const item = store.cart.items.find((i) => i.product_id === prodId);
      if (item) {
        try {
          await store.updateCartItemQuantity(item, item.quantity + 1);
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
      return;
    }

    const decBtn = target.closest('[data-cart-dec]');
    if (decBtn) {
      const prodId = decBtn.getAttribute('data-cart-dec');
      const item = store.cart.items.find((i) => i.product_id === prodId);
      if (item) {
        try {
          await store.updateCartItemQuantity(item, item.quantity - 1);
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
      return;
    }

    const remBtn = target.closest('[data-cart-remove]');
    if (remBtn) {
      const id = remBtn.getAttribute('data-cart-remove');
      try {
        await store.removeFromCart(id);
        showToast('Item removed from bag', 'info');
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }

    if (target.closest('#btn-proceed-checkout')) {
      closeCartDrawer();
      navigateTo(store.user ? 'checkout' : 'auth');
      return;
    }

    // 6. Pagination buttons
    const pageBtn = target.closest('[data-page]');
    if (pageBtn && !pageBtn.disabled) {
      const nextPage = Number(pageBtn.getAttribute('data-page'));
      await store.loadProducts({ page: nextPage });
      renderHomeView();
      document.getElementById('catalog-anchor')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    // 7. Empty filter reset
    if (target.closest('#btn-empty-reset')) {
      await store.loadProducts({
        search: '',
        category: 'all',
        minPrice: '',
        maxPrice: '',
        minRating: '',
        inStock: false,
        sort: 'newest',
        page: 1,
      });
      renderHomeView();
      syncHeaderAndDrawer();
      return;
    }

    // 8. Header logout
    if (target.closest('#btn-header-logout')) {
      await store.logout();
      showToast('Signed out of your session', 'info');
      navigateTo('home');
      return;
    }

    // 9. Quick Demo Login (Customer or Admin)
    const demoBtn = target.closest('[data-quick-demo]');
    if (demoBtn) {
      const role = demoBtn.getAttribute('data-quick-demo');
      try {
        if (role === 'admin') {
          const user = await store.login('admin@aura-atelier.com', 'Admin@123456');
          showToast(`Signed in as ${user.name}`, 'success');
          navigateTo('admin');
        } else {
          const user = await store.login('customer@aura-atelier.com', 'Customer@123456');
          showToast(`Signed in as ${user.name}`, 'success');
          navigateTo('customer-dashboard');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });
}

async function bootstrap() {
  setupGlobalEvents();
  store.subscribe(() => {
    syncHeaderAndDrawer();
  });

  // Support SEO deep-link query parameters (?product=slug, ?category=slug, ?search=query)
  const params = new URLSearchParams(window.location.search);
  const deepCategory = params.get('category');
  const deepSearch = params.get('search');
  const deepProduct = params.get('product');

  if (deepCategory) store.filters.category = deepCategory;
  if (deepSearch) store.filters.search = deepSearch;

  await store.init();
  syncHeaderAndDrawer();

  if (deepProduct) {
    await navigateTo('product', deepProduct);
  } else {
    renderHomeView();
  }
}

bootstrap();
