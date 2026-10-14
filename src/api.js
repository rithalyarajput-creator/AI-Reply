const KEY = 'ar_token';
const ORIG = 'ar_token_orig';

const safe = (fn) => { try { return fn(); } catch { return null; } };
export const getToken = () => safe(() => localStorage.getItem(KEY));
export const setToken = (t) => safe(() => localStorage.setItem(KEY, t));
export const clearToken = () => safe(() => { localStorage.removeItem(KEY); localStorage.removeItem(ORIG); });
export const getOrigToken = () => safe(() => localStorage.getItem(ORIG));
export const setOrigToken = (t) => safe(() => (t ? localStorage.setItem(ORIG, t) : localStorage.removeItem(ORIG)));

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString() : '';
  const res = await fetch(`/api${path}${qs}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && path !== '/auth/login') onUnauthorized();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
