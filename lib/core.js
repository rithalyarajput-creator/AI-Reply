import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// ---- database -------------------------------------------------------------
let _sql;
export function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
export const q = (text, params = []) => getSql().query(text, params);

// ---- errors ---------------------------------------------------------------
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---- auth -----------------------------------------------------------------
function secret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    throw new Error('JWT_SECRET is missing or too short');
  }
  return process.env.JWT_SECRET;
}
export const hashPassword = (p) => bcrypt.hash(p, 10);
export const checkPassword = (p, h) => bcrypt.compare(p, h);
export const signToken = (claims, expiresIn = '12h') => jwt.sign(claims, secret(), { expiresIn });
export const readToken = (t) => jwt.verify(t, secret());
export const tempPassword = () => crypto.randomBytes(9).toString('base64url');

// ---- secrets at rest (channel tokens) ---------------------------------------
function encKey() {
  const base = process.env.ENCRYPTION_KEY || `${secret()}:channel-tokens`;
  return crypto.createHash('sha256').update(base).digest();
}
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function decrypt(blob) {
  const [iv, tag, enc] = String(blob).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

// ---- validation -----------------------------------------------------------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID.test(v);
export const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
export const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function need(cond, message, status = 400) {
  if (!cond) throw new HttpError(status, message);
}

// ---- audit ----------------------------------------------------------------
export async function audit(actor, action, { entity, entityId, clientId, agencyId, meta = {}, ip } = {}) {
  await q(
    `INSERT INTO audit_logs (actor_id, actor_name, actor_role, agency_id, client_id, action, entity, entity_id, meta, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      actor?.imp || actor?.id || null,
      actor?.name || null,
      actor?.imp ? `${actor.role} (via super_admin)` : actor?.role || null,
      agencyId ?? actor?.agency_id ?? null,
      clientId ?? actor?.client_id ?? null,
      action,
      entity || null,
      entityId || null,
      JSON.stringify(meta),
      ip || null,
    ],
  );
}
