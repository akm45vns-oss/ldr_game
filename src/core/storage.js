// Safe LocalStorage helpers with graceful fallback
export function safeStorageGet(key, fallback = null) {
  try {
    const val = window.localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch (_) {
    return fallback;
  }
}

export function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_) {}
}

export function safeStorageRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (_) {}
}
