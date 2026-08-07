/**
 * Local Storage Caching Utility for Magnus CI
 * Provides SWR (Stale-While-Revalidate) local client caching with optional TTL
 * to guarantee instant UI render upon page reload without waiting for API roundtrips.
 */

const CACHE_PREFIX = "magnus_cache_";

export const getCachedData = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return fallback;

    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object") return fallback;

    // Check optional TTL expiration
    if (payload.expiry && Date.now() > payload.expiry) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return fallback;
    }

    return payload.data ?? fallback;
  } catch (err) {
    console.warn(`[LocalCache] Failed reading key "${key}":`, err);
    return fallback;
  }
};

export const setCachedData = (key, data, ttlMs = 0) => {
  try {
    const payload = {
      data,
      timestamp: Date.now(),
      expiry: ttlMs > 0 ? Date.now() + ttlMs : null,
    };
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(payload));
  } catch (err) {
    console.warn(`[LocalCache] Failed writing key "${key}":`, err);
  }
};

export const removeCachedData = (key) => {
  try {
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
  } catch (err) {
    console.warn(`[LocalCache] Failed removing key "${key}":`, err);
  }
};

export const clearAllLocalCache = () => {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn("[LocalCache] Failed clearing cache:", err);
  }
};
