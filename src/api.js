const KEY = 'ar_token';
const ORIG = 'ar_token_orig';
const SCOPE = 'ar_scope';

const safe = (fn) => { try { return fn(); } catch { return null; } };
export const getToken = () => safe(() => localStorage.getItem(KEY));
export const setToken = (t) => safe(() => localStorage.setItem(KEY, t));
export const clearToken = () => safe(() => {
  localStorage.removeItem(KEY); localStorage.removeItem(ORIG); sessionStorage.removeItem(SCOPE);
});
export const getOrigToken = () => safe(() => localStorage.getItem(ORIG));
export const setOrigToken = (t) => safe(() => (t ? localStorage.setItem(ORIG, t) : localStorage.removeItem(ORIG)));

// Platform staff and agencies can open a client's portal data by passing client_id.
export const getScope = () => {
  const v = safe(() => sessionStorage.getItem(SCOPE));
  return v ? JSON.parse(v) : null;
};
export const setScope = (s) => safe(() => (s ? sessionStorage.setItem(SCOPE, JSON.stringify(s)) : sessionStorage.removeItem(SCOPE)));

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body, query } = {}) {
  const params = { ...(query || {}) };
  const scope = getScope();
  if (scope && path.startsWith('/portal') && !params.client_id) params.client_id = scope.id;
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  const qs = entries.length ? '?' + new URLSearchParams(entries).toString() : '';
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

export function downloadCsv(filename, rows) {
  const esc = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function parseCsv(text) {
  const rows = [];
  let row = []; let cell = ''; let inQ = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
