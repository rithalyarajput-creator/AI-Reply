// Tiny router + auth + tenant-scope helpers shared by every route module.
import {
  q, HttpError, need, isUuid, readToken, sha256,
} from './core.js';
import { can, isPlatform } from './perms.js';

export const routes = [];

// access: null = public | '*' = any logged-in user | 'apikey' | string[] of roles | (user) => boolean
export const on = (method, path, access, fn) =>
  routes.push({
    method, access, fn,
    re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$'),
  });

export const publicUser = (u) => ({
  id: u.id, role: u.role, name: u.name, email: u.email, mobile: u.mobile, status: u.status,
  must_change_password: u.must_change_password, client_id: u.client_id, agency_id: u.agency_id,
  last_login_at: u.last_login_at, created_at: u.created_at,
});

// ---- tenant scoping -------------------------------------------------------
// Returns the client row if `user` may see it. Platform staff need clients.view.
export async function clientFor(user, id) {
  need(isUuid(id), 'Client not found', 404);
  const [c] = await q('SELECT * FROM clients WHERE id = $1', [id]);
  need(c, 'Client not found', 404);
  const ok =
    (isPlatform(user.role) && can(user.role, 'clients.view')) ||
    (user.role === 'agency_admin' && c.agency_id === user.agency_id) ||
    (user.role === 'client_admin' && c.id === user.client_id);
  need(ok, 'Not allowed', 403);
  return c;
}

// For portal routes: the client the caller works inside. Client users use their own;
// platform users and agencies must pass ?client_id= (or body.client_id) and are scope-checked.
export async function portalClient(ctx) {
  const { user } = ctx;
  if (user.client_id && !isPlatform(user.role)) return { id: user.client_id, agency_id: user.agency_id };
  const id = ctx.query.client_id || ctx.body?.client_id;
  return clientFor(user, id);
}

// ---- body, auth, dispatch -------------------------------------------------
async function readBody(req) {
  let raw;
  if (typeof req.rawBody === 'string') raw = req.rawBody;
  else if (req.body !== undefined && req.body !== null) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  else {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      need(size <= 1_000_000, 'Request too large', 413);
      chunks.push(c);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!body || typeof body !== 'object') body = {};
  return { raw, body };
}

async function authUser(req) {
  const h = req.headers.authorization || '';
  need(h.startsWith('Bearer '), 'Login required', 401);
  let claims;
  try { claims = readToken(h.slice(7)); } catch { throw new HttpError(401, 'Session expired, please log in again'); }
  const [u] = await q(
    `SELECT u.*, c.status AS client_status FROM users u LEFT JOIN clients c ON c.id = u.client_id WHERE u.id = $1`,
    [claims.sub]);
  need(u && u.status === 'active', 'Login required', 401);
  need(!['suspended', 'closed'].includes(u.client_status) || claims.imp, 'This account is suspended', 403);
  return { ...u, imp: claims.imp || null };
}

async function authApiKey(req) {
  const key = String(req.headers['x-api-key'] || '').trim();
  need(key, 'X-Api-Key header is required', 401);
  const [row] = await q(
    `SELECT k.id AS key_id, c.* FROM api_keys k JOIN clients c ON c.id = k.client_id
     WHERE k.key_hash = $1 AND k.active = true`, [sha256(key)]);
  need(row, 'Invalid API key', 401);
  need(['trial', 'active'].includes(row.status), 'Account is not active', 403);
  return row;
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export async function dispatch(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = (url.searchParams.get('__p') ?? url.pathname.replace(/^\/api/, '')) || '/';
    url.searchParams.delete('__p');
    const query = Object.fromEntries(url.searchParams);

    let match = null;
    let params = {};
    let pathMatched = false;
    for (const r of routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method === req.method) { match = r; params = m.groups || {}; break; }
    }
    if (!match) return send(res, pathMatched ? 405 : 404, { error: pathMatched ? 'Method not allowed' : 'Not found' });

    let user = null;
    let apiClient = null;
    const a = match.access;
    if (a === 'apikey') apiClient = await authApiKey(req);
    else if (a) {
      user = await authUser(req);
      if (Array.isArray(a)) need(a.includes(user.role), 'Not allowed', 403);
      else if (typeof a === 'function') need(a(user), 'Not allowed', 403);
    }

    const { raw, body } = await readBody(req);
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
    const out = await match.fn({ req, res, user, apiClient, params, query, body, raw, ip, path });
    if (out === undefined || res.writableEnded) return undefined;
    return send(res, 200, out);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    return send(res, 500, { error: 'Something went wrong' });
  }
}
