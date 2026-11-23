const STORAGE_TOKEN_KEY = 'aura_access_token';
const STORAGE_REFRESH_KEY = 'aura_refresh_token';

export function getStoredToken() {
  return localStorage.getItem(STORAGE_TOKEN_KEY);
}

export function setStoredTokens(accessToken, refreshToken) {
  if (accessToken) {
    localStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
  } else {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
  }
  if (refreshToken) {
    localStorage.setItem(STORAGE_REFRESH_KEY, refreshToken);
  } else if (refreshToken === null) {
    localStorage.removeItem(STORAGE_REFRESH_KEY);
  }
}

export function clearStoredTokens() {
  localStorage.removeItem(STORAGE_TOKEN_KEY);
  localStorage.removeItem(STORAGE_REFRESH_KEY);
}

async function tryRefreshToken() {
  const refreshToken = localStorage.getItem(STORAGE_REFRESH_KEY);
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    const newAccess = payload?.data?.accessToken || payload?.token;
    const newRefresh = payload?.data?.refreshToken;
    if (newAccess) {
      setStoredTokens(newAccess, newRefresh);
      return newAccess;
    }
    return null;
  } catch {
    return null;
  }
}

export async function apiRequest(endpoint, options = {}, isRetry = false) {
  const url = endpoint.startsWith('/api') ? endpoint : `/api/v1${endpoint}`;
  const token = getStoredToken();
  const headers = { ...(options.headers || {}) };

  const isFormData = options.body instanceof FormData;
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method: options.method || 'GET',
    headers,
    credentials: 'include',
  };

  if (options.body !== undefined) {
    config.body = isFormData
      ? options.body
      : typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body);
  }

  const response = await fetch(url, config);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.status === 401 && !isRetry && !url.includes('/auth/login') && !url.includes('/auth/refresh')) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return apiRequest(endpoint, options, true);
    }
  }

  if (!response.ok) {
    const errorMsg =
      data?.errors?.[0]?.message ||
      data?.message ||
      `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.code = data?.code;
    err.details = data?.errors;
    throw err;
  }

  return data;
}
