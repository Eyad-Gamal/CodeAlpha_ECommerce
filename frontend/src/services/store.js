import { apiRequest, getStoredToken, setStoredTokens, clearStoredTokens } from './api.js';

const GUEST_CART_KEY = 'aura_guest_cart_v1';
const USER_CACHE_KEY = 'aura_user_profile_v1';
const TAX_RATE = 0.14;
const FREE_SHIPPING_THRESHOLD = 250.0;
const STANDARD_SHIPPING_FEE = 18.0;

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export const store = {
  user: null,
  categories: [],
  products: [],
  pagination: { page: 1, limit: 12, total: 0, totalPages: 1 },
  filters: {
    search: '',
    category: 'all',
    minPrice: '',
    maxPrice: '',
    minRating: '',
    inStock: false,
    sort: 'newest',
    page: 1,
  },
  cart: {
    items: [],
    summary: {
      total_items: 0,
      original_subtotal: 0,
      discount_savings: 0,
      subtotal_amount: 0,
      tax_rate: TAX_RATE,
      tax_amount: 0,
      shipping_fee: 0,
      free_shipping_threshold: FREE_SHIPPING_THRESHOLD,
      amount_to_free_shipping: FREE_SHIPPING_THRESHOLD,
      total_amount: 0,
      is_valid_for_checkout: false,
      stock_warnings: [],
    },
  },
  listeners: new Set(),

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  notify() {
    for (const fn of this.listeners) {
      fn(this);
    }
  },

  async init() {
    const cachedUser = localStorage.getItem(USER_CACHE_KEY);
    if (cachedUser) {
      try {
        this.user = JSON.parse(cachedUser);
      } catch {
        this.user = null;
      }
    }

    await Promise.all([this.loadCategories(), this.loadProducts()]);

    if (getStoredToken()) {
      try {
        const res = await apiRequest('/auth/me');
        this.user = res.data.user;
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(this.user));
        await this.syncAndLoadServerCart();
      } catch {
        this.user = null;
        clearStoredTokens();
        localStorage.removeItem(USER_CACHE_KEY);
        this.loadGuestCart();
      }
    } else {
      this.loadGuestCart();
    }

    this.notify();
  },

  async loadCategories() {
    const res = await apiRequest('/categories?all=true');
    this.categories = res.data.categories || [];
  },

  async loadProducts(customFilters = {}) {
    this.filters = { ...this.filters, ...customFilters };
    const params = new URLSearchParams();
    params.set('page', String(this.filters.page || 1));
    params.set('limit', '12');

    if (this.filters.category && this.filters.category !== 'all') {
      params.set('category', this.filters.category);
    }
    if (this.filters.search && this.filters.search.trim() !== '') {
      params.set('search', this.filters.search.trim());
    }
    if (this.filters.minPrice !== '') {
      params.set('minPrice', String(this.filters.minPrice));
    }
    if (this.filters.maxPrice !== '') {
      params.set('maxPrice', String(this.filters.maxPrice));
    }
    if (this.filters.minRating !== '') {
      params.set('minRating', String(this.filters.minRating));
    }
    if (this.filters.inStock) {
      params.set('inStock', 'true');
    }
    if (this.filters.sort) {
      params.set('sort', this.filters.sort);
    }

    const res = await apiRequest(`/products?${params.toString()}`);
    this.products = res.data.products || [];
    this.pagination = res.data.pagination || { page: 1, limit: 12, total: 0, totalPages: 1 };
    this.notify();
    return this.products;
  },

  loadGuestCart() {
    let rawItems = [];
    try {
      rawItems = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
    } catch {
      rawItems = [];
    }

    let subtotal = 0;
    let originalSubtotal = 0;
    let totalItems = 0;
    const stockWarnings = [];

    const hydrated = rawItems
      .map((entry) => {
        const liveProduct = this.products.find((p) => p.id === entry.product_id);
        const stockQty = liveProduct ? liveProduct.stock_qty : entry.stock_qty ?? 10;
        const regularPrice = liveProduct ? liveProduct.price : entry.regular_price;
        const discountPrice = liveProduct ? liveProduct.discount_price : entry.discount_price;
        const unitPrice =
          discountPrice !== null && discountPrice !== undefined && discountPrice < regularPrice
            ? Number(discountPrice)
            : Number(regularPrice);

        const quantity = Math.max(1, Number(entry.quantity || 1));
        const lineSubtotal = round2(unitPrice * quantity);
        const lineOriginal = round2(regularPrice * quantity);

        subtotal = round2(subtotal + lineSubtotal);
        originalSubtotal = round2(originalSubtotal + lineOriginal);
        totalItems += quantity;

        if (quantity > stockQty) {
          stockWarnings.push({
            productId: entry.product_id,
            title: entry.title,
            requested: quantity,
            available: stockQty,
          });
        }

        return {
          id: entry.product_id,
          product_id: entry.product_id,
          title: liveProduct?.title || entry.title,
          slug: liveProduct?.slug || entry.slug,
          sku: liveProduct?.sku || entry.sku,
          category_name: liveProduct?.category_name || entry.category_name || '',
          image: liveProduct?.images?.[0] || entry.image || '',
          regular_price: Number(regularPrice),
          discount_price: discountPrice !== null && discountPrice !== undefined ? Number(discountPrice) : null,
          unit_price: unitPrice,
          quantity,
          stock_qty: stockQty,
          exceeds_stock: quantity > stockQty,
          line_subtotal: lineSubtotal,
        };
      })
      .filter(Boolean);

    const discountSavings = round2(Math.max(0, originalSubtotal - subtotal));
    const taxAmount = round2(subtotal * TAX_RATE);
    const shippingFee =
      subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
    const totalAmount = round2(subtotal + taxAmount + shippingFee);
    const amountToFreeShipping = round2(Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal));

    this.cart = {
      items: hydrated,
      summary: {
        total_items: totalItems,
        original_subtotal: originalSubtotal,
        discount_savings: discountSavings,
        subtotal_amount: subtotal,
        tax_rate: TAX_RATE,
        tax_amount: taxAmount,
        shipping_fee: shippingFee,
        free_shipping_threshold: FREE_SHIPPING_THRESHOLD,
        amount_to_free_shipping: amountToFreeShipping,
        total_amount: totalAmount,
        is_valid_for_checkout: hydrated.length > 0 && stockWarnings.length === 0,
        stock_warnings: stockWarnings,
      },
    };
    this.notify();
  },

  async syncAndLoadServerCart() {
    let guestItems = [];
    try {
      guestItems = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
    } catch {
      guestItems = [];
    }

    if (guestItems.length > 0) {
      const payloadItems = guestItems.map((g) => ({
        productId: g.product_id,
        quantity: Number(g.quantity || 1),
      }));
      const res = await apiRequest('/cart/sync', {
        method: 'POST',
        body: { items: payloadItems },
      });
      localStorage.removeItem(GUEST_CART_KEY);
      this.cart = res.data.cart;
    } else {
      const res = await apiRequest('/cart');
      this.cart = res.data.cart;
    }
    this.notify();
  },

  async addToCart(product, quantity = 1, mode = 'increment') {
    if (this.user) {
      const res = await apiRequest('/cart/items', {
        method: 'POST',
        body: {
          productId: product.id,
          quantity: Number(quantity),
          mode,
        },
      });
      this.cart = res.data.cart;
      this.notify();
      return this.cart;
    }

    // Guest Cart (LocalStorage) with real-time Stock Validation
    let rawItems = [];
    try {
      rawItems = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
    } catch {
      rawItems = [];
    }

    const idx = rawItems.findIndex((i) => i.product_id === product.id);
    const existingQty = idx >= 0 ? Number(rawItems[idx].quantity) : 0;
    const nextQty = mode === 'increment' ? existingQty + Number(quantity) : Number(quantity);

    if (product.stock_qty <= 0) {
      throw new Error(`"${product.title}" is currently out of stock`);
    }
    if (nextQty > product.stock_qty) {
      throw new Error(`Only ${product.stock_qty} unit(s) of "${product.title}" available in stock`);
    }

    const snapshot = {
      product_id: product.id,
      title: product.title,
      slug: product.slug,
      sku: product.sku,
      category_name: product.category_name || '',
      image: product.images?.[0] || product.image || '',
      regular_price: product.price ?? product.regular_price,
      discount_price: product.discount_price,
      stock_qty: product.stock_qty,
      quantity: nextQty,
    };

    if (idx >= 0) {
      rawItems[idx] = snapshot;
    } else {
      rawItems.push(snapshot);
    }

    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(rawItems));
    this.loadGuestCart();
    return this.cart;
  },

  async updateCartItemQuantity(item, nextQty) {
    if (nextQty <= 0) {
      return this.removeFromCart(item.id || item.product_id);
    }
    if (this.user) {
      const res = await apiRequest('/cart/items', {
        method: 'POST',
        body: {
          productId: item.product_id,
          quantity: Number(nextQty),
          mode: 'set',
        },
      });
      this.cart = res.data.cart;
      this.notify();
      return this.cart;
    }

    return this.addToCart(
      {
        id: item.product_id,
        title: item.title,
        slug: item.slug,
        sku: item.sku,
        category_name: item.category_name,
        image: item.image,
        price: item.regular_price,
        discount_price: item.discount_price,
        stock_qty: item.stock_qty,
      },
      nextQty,
      'set'
    );
  },

  async removeFromCart(itemIdOrProductId) {
    if (this.user) {
      const res = await apiRequest(`/cart/items/${encodeURIComponent(itemIdOrProductId)}`, {
        method: 'DELETE',
      });
      this.cart = res.data.cart;
      this.notify();
      return this.cart;
    }

    let rawItems = [];
    try {
      rawItems = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
    } catch {
      rawItems = [];
    }
    rawItems = rawItems.filter((i) => i.product_id !== itemIdOrProductId);
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(rawItems));
    this.loadGuestCart();
    return this.cart;
  },

  async login(email, password) {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    this.user = res.data.user;
    setStoredTokens(res.data.accessToken, res.data.refreshToken);
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(this.user));
    await this.syncAndLoadServerCart();
    this.notify();
    return this.user;
  },

  async register(payload) {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: payload,
    });
    this.user = res.data.user;
    setStoredTokens(res.data.accessToken, res.data.refreshToken);
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(this.user));
    await this.syncAndLoadServerCart();
    this.notify();
    return this.user;
  },

  async logout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore network error on logout
    }
    this.user = null;
    clearStoredTokens();
    localStorage.removeItem(USER_CACHE_KEY);
    this.loadGuestCart();
    this.notify();
  },
};
