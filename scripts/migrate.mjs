// Creates tables and the first Super Admin.
// Usage: node --env-file=.env scripts/migrate.mjs
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const sql = neon(url);

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const statements = schema
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
  .filter(Boolean);

for (const stmt of statements) {
  await sql.query(stmt);
}
console.log(`Schema applied (${statements.length} statements).`);

const existing = await sql.query(`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`);
if (existing.length) {
  console.log('Super Admin already exists, skipping seed.');
  process.exit(0);
}

const email = process.env.SUPER_ADMIN_EMAIL;
const password = process.env.SUPER_ADMIN_PASSWORD;
const name = process.env.SUPER_ADMIN_NAME || 'Super Admin';
if (!email || !password || password.length < 10) {
  console.error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (min 10 chars) to create the first Super Admin.');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
await sql.query(
  `INSERT INTO users (role, name, email, password_hash, must_change_password) VALUES ('super_admin', $1, $2, $3, false)`,
  [name, email.toLowerCase(), hash],
);
console.log(`Super Admin created: ${email}`);
