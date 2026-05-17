const PREFIX = "tg.";

export function get(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    if (v === null) return fallback;
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {}
}

export function del(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {}
}
