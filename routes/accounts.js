// Auth, dashboard stats, plans, agencies, clients, users, audit log.
import crypto from 'node:crypto';
import {
  q, getSql, need, isUuid, isEmail, str, audit,
  hashPassword, checkPassword, signToken, tempPassword,
} from '../lib/core.js';
import { can, isPlatform, PERMISSIONS } from '../lib/perms.js';
import { on, clientFor, publicUser } from '../lib/router.js';

const CLIENT_STATUSES = ['trial', 'active', 'suspended', 'closed'];
const CREATABLE = ['client_admin', 'agent_head', 'agent'];
const PUBLIC_USER = `u.id, u.role, u.name, u.email, u.mobile, u.status, u.must_change_password,
  u.last_login_at, u.created_at, u.client_id, u.agency_id, u.dist_percent`;

// who may create/manage client-side users, and which roles
const creatableRoles = (u) => {
  if (u.role === 'super_admin' || can(u.role, 'clients.edit') || u.role === 'agency_admin') return CREATABLE;
  if (u.role === 'client_admin') return ['agent_head', 'agent'];
  return [];
};

const seesClients = (u) =>
  u.role === 'agency_admin' || (isPlatform(u.role) && can(u.role, 'clients.view'));
const editsClients = (u) =>
  u.role === 'agency_admin' || (isPlatform(u.role) && can(u.role, 'clients.edit'));

function canManage(actor, target) {
  if (target.id === actor.id) return false;
  if (isPlatform(target.role)) return false;
  if (actor.role === 'super_admin' || can(actor.role, 'clients.edit')) return true;
  if (actor.role === 'agency_admin')
    return CREATABLE.includes(target.role) && target.agency_id === actor.agency_id;
  if (actor.role === 'client_admin')
    return ['agent_head', 'agent'].includes(target.role) && target.client_id === actor.client_id;
  return false;
}

async function userFor(actor, id) {
  need(isUuid(id), 'User not found', 404);
  const [t] = await q('SELECT * FROM users WHERE id = $1', [id]);
  need(t && canManage(actor, t), 'User not found', 404);
  return t;
}

function checkNewPassword(p) {
  need(typeof p === 'string' && p.length >= 8 && p.length <= 100, 'Password must be 8 to 100 characters');
}

// ---- auth -----------------------------------------------------------------
on('POST', '/auth/login', null, async ({ body, ip }) => {
  const email = str(body.email, 254).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  need(email && password, 'Email and password are required');
  const [u] = await q(
    `SELECT u.*, c.status AS client_status FROM users u LEFT JOIN clients c ON c.id = u.client_id
     WHERE lower(u.email) = $1`, [email]);
  const ok = u ? await checkPassword(password, u.password_hash) : (await hashPassword(password), false);
  need(ok && u.status === 'active', 'Invalid email or password', 401);
  need(!['suspended', 'closed'].includes(u.client_status), 'This account is suspended. Contact support.', 403);
  await q('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  await audit(u, 'login', { entity: 'user', entityId: u.id, ip });
  return { token: signToken({ sub: u.id }), user: publicUser(u) };
});

on('GET', '/auth/me', '*', async ({ user }) => ({
  user: publicUser(user),
  impersonating: !!user.imp,
  permissions: Object.keys(PERMISSIONS).filter((k) => can(user.role, k)),
}));

on('POST', '/auth/change-password', '*', async ({ user, body, ip }) => {
  need(!user.imp, 'Not available while viewing as a client', 403);
  need(await checkPassword(String(body.current || ''), user.password_hash), 'Current password is wrong', 400);
  checkNewPassword(body.next);
  need(body.next !== body.current, 'New password must be different');
  await q('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
    [await hashPassword(body.next), user.id]);
  await audit(user, 'password_changed', { entity: 'user', entityId: user.id, ip });
  return { ok: true };
});

on('PATCH', '/auth/profile', '*', async ({ user, body }) => {
  need(!user.imp, 'Not available while viewing as a client', 403);
  const sets = [];
  const p = [];
  if (body.name !== undefined) { const v = str(body.name, 120); need(v, 'Name cannot be empty'); p.push(v); sets.push(`name = $${p.length}`); }
  if (body.mobile !== undefined) { p.push(str(body.mobile, 20)); sets.push(`mobile = $${p.length}`); }
  if (body.prefs !== undefined && typeof body.prefs === 'object') {
    const allowed = ['new_message', 'campaign_done', 'low_balance'];
    const prefs = Object.fromEntries(allowed.map((k) => [k, !!body.prefs[k]]));
    p.push(JSON.stringify(prefs)); sets.push(`prefs = $${p.length}::jsonb`);
  }
  need(sets.length, 'Nothing to update');
  p.push(user.id);
  const [row] = await q(`UPDATE users SET ${sets.join(', ')} WHERE id = $${p.length} RETURNING *`, p);
  return { user: { ...publicUser(row), prefs: row.prefs } };
});

on('GET', '/auth/prefs', '*', async ({ user }) => ({ prefs: user.prefs || {} }));

// ---- dashboard (account-level) --------------------------------------------
on('GET', '/stats', '*', async ({ user }) => {
  if (user.role === 'super_admin' || (isPlatform(user.role) && can(user.role, 'clients.view'))) {
    const [r] = await q(`SELECT
      (SELECT count(*) FROM clients)::int AS clients,
      (SELECT count(*) FROM clients WHERE status = 'active')::int AS active,
      (SELECT count(*) FROM clients WHERE status = 'trial')::int AS trial,
      (SELECT count(*) FROM clients WHERE status = 'suspended')::int AS suspended,
      (SELECT count(*) FROM agencies)::int AS agencies,
      (SELECT count(*) FROM users WHERE role IN ('agent','agent_head'))::int AS agents`);
    return r;
  }
  if (user.role === 'agency_admin') {
    const [r] = await q(`SELECT
      (SELECT count(*) FROM clients WHERE agency_id = $1)::int AS clients,
      (SELECT count(*) FROM clients WHERE agency_id = $1 AND status = 'active')::int AS active,
      (SELECT count(*) FROM clients WHERE agency_id = $1 AND status = 'trial')::int AS trial,
      (SELECT count(*) FROM clients WHERE agency_id = $1 AND status = 'suspended')::int AS suspended,
      (SELECT count(*) FROM users WHERE agency_id = $1 AND role IN ('agent','agent_head'))::int AS agents`,
    [user.agency_id]);
    return r;
  }
  const [r] = await q(`SELECT
    (SELECT count(*) FROM users WHERE client_id = $1 AND role = 'agent_head')::int AS agent_heads,
    (SELECT count(*) FROM users WHERE client_id = $1 AND role = 'agent')::int AS agents,
    (SELECT count(*) FROM users WHERE client_id = $1 AND status = 'active')::int AS active_users`,
  [user.client_id || null]);
  return r;
});

// ---- plans ----------------------------------------------------------------
on('GET', '/plans', (u) => u.role === 'super_admin' || u.role === 'agency_admin' || can(u.role, 'plans.view'),
  async () => ({ plans: await q(`SELECT * FROM plans WHERE status = 'active' ORDER BY monthly_fee`) }));

on('POST', '/plans', ['super_admin'], async ({ user, body, ip }) => {
  const name = str(body.name, 80);
  need(name, 'Plan name is required');
  const fee = Number(body.monthly_fee ?? 0);
  const agents = Number.parseInt(body.included_agents ?? 5, 10);
  need(Number.isFinite(fee) && fee >= 0, 'Monthly fee is invalid');
  need(Number.isInteger(agents) && agents >= 0, 'Included agents is invalid');
  const [plan] = await q(
    'INSERT INTO plans (name, monthly_fee, included_agents) VALUES ($1,$2,$3) RETURNING *', [name, fee, agents]);
  await audit(user, 'plan_created', { entity: 'plan', entityId: plan.id, ip });
  return { plan };
});

// ---- agencies -------------------------------------------------------------
on('GET', '/agencies', ['super_admin'], async () => ({
  agencies: await q(`SELECT a.*, (SELECT count(*) FROM clients c WHERE c.agency_id = a.id)::int AS clients
                     FROM agencies a ORDER BY a.created_at DESC`),
}));

on('POST', '/agencies', ['super_admin'], async ({ user, body, ip }) => {
  const name = str(body.name, 120);
  const adminName = str(body.admin_name, 120);
  const adminEmail = str(body.admin_email, 254).toLowerCase();
  need(name && adminName, 'Agency name and admin name are required');
  need(isEmail(adminEmail), 'Valid admin email is required');
  const [dup] = await q('SELECT 1 FROM users WHERE lower(email) = $1', [adminEmail]);
  need(!dup, 'This email is already used by another user', 409);

  const pwd = tempPassword();
  const agencyId = crypto.randomUUID();
  const s = getSql();
  await s.transaction([
    s`INSERT INTO agencies (id, name, contact_name, email, mobile) VALUES (${agencyId}, ${name}, ${adminName}, ${adminEmail}, ${str(body.admin_mobile, 20)})`,
    s`INSERT INTO users (role, name, email, mobile, password_hash, agency_id, created_by)
      VALUES ('agency_admin', ${adminName}, ${adminEmail}, ${str(body.admin_mobile, 20)}, ${await hashPassword(pwd)}, ${agencyId}, ${user.id})`,
  ]);
  await audit(user, 'agency_created', { entity: 'agency', entityId: agencyId, agencyId, meta: { name }, ip });
  return { agency_id: agencyId, admin: { email: adminEmail, temp_password: pwd } };
});

on('PATCH', '/agencies/:id', ['super_admin'], async ({ user, params, body, ip }) => {
  need(isUuid(params.id), 'Agency not found', 404);
  need(['active', 'suspended'].includes(body.status), 'Invalid status');
  const [a] = await q('UPDATE agencies SET status = $1 WHERE id = $2 RETURNING *', [body.status, params.id]);
  need(a, 'Agency not found', 404);
  await audit(user, `agency_${body.status}`, { entity: 'agency', entityId: a.id, agencyId: a.id, ip });
  return { agency: a };
});

// ---- clients --------------------------------------------------------------
on('GET', '/clients', seesClients, async ({ user, query }) => {
  const where = [];
  const p = [];
  if (user.role === 'agency_admin') { p.push(user.agency_id); where.push(`c.agency_id = $${p.length}`); }
  if (CLIENT_STATUSES.includes(query.status)) { p.push(query.status); where.push(`c.status = $${p.length}`); }
  if (query.q) { p.push(`%${str(query.q, 60)}%`); where.push(`(c.company_name ILIKE $${p.length} OR c.legal_name ILIKE $${p.length})`); }
  const rows = await q(
    `SELECT c.id, c.company_name, c.status, c.onboarding_stage, c.wallet_balance, c.created_at, c.agency_id,
            c.low_balance_alert, p.name AS plan_name, a.name AS agency_name,
            (SELECT count(*) FROM users u WHERE u.client_id = c.id AND u.role IN ('agent','agent_head'))::int AS agents,
            (SELECT count(*) FROM messages m WHERE m.client_id = c.id AND m.direction = 'out'
               AND m.created_at > now() - interval '30 days')::int AS messages_30d,
            (SELECT u.email FROM users u WHERE u.client_id = c.id AND u.role = 'client_admin' ORDER BY u.created_at LIMIT 1) AS admin_email
     FROM clients c LEFT JOIN plans p ON p.id = c.plan_id LEFT JOIN agencies a ON a.id = c.agency_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY c.created_at DESC LIMIT 500`, p);
  return { clients: rows };
});

on('POST', '/clients', editsClients, async ({ user, body, ip }) => {
  const company = str(body.company_name, 160);
  const adminName = str(body.admin_name, 120);
  const adminEmail = str(body.admin_email, 254).toLowerCase();
  need(company, 'Company name is required');
  need(adminName, 'Admin name is required');
  need(isEmail(adminEmail), 'Valid admin email is required');
  const [dup] = await q('SELECT 1 FROM users WHERE lower(email) = $1', [adminEmail]);
  need(!dup, 'This email is already used by another user', 409);

  const agencyId = user.role === 'agency_admin' ? user.agency_id : body.agency_id || null;
  if (agencyId) {
    need(isUuid(agencyId), 'Invalid agency');
    const [a] = await q('SELECT 1 FROM agencies WHERE id = $1', [agencyId]);
    need(a, 'Agency not found', 404);
  }
  const planId = body.plan_id || null;
  if (planId) {
    need(isUuid(planId), 'Invalid plan');
    const [pl] = await q('SELECT 1 FROM plans WHERE id = $1', [planId]);
    need(pl, 'Plan not found', 404);
  }
  const status = body.status === 'active' ? 'active' : 'trial';

  const pwd = tempPassword();
  const clientId = crypto.randomUUID();
  const s = getSql();
  await s.transaction([
    s`INSERT INTO clients (id, agency_id, plan_id, company_name, legal_name, business_type, website, gst_number, pan, address, state, source, status)
      VALUES (${clientId}, ${agencyId}, ${planId}, ${company}, ${str(body.legal_name, 160)}, ${str(body.business_type, 80)},
              ${str(body.website, 200)}, ${str(body.gst_number, 20)}, ${str(body.pan, 12)}, ${str(body.address, 400)},
              ${str(body.state, 60)}, ${str(body.source, 80)}, ${status})`,
    s`INSERT INTO users (role, name, email, mobile, password_hash, agency_id, client_id, created_by)
      VALUES ('client_admin', ${adminName}, ${adminEmail}, ${str(body.admin_mobile, 20)}, ${await hashPassword(pwd)},
              ${agencyId}, ${clientId}, ${user.id})`,
  ]);
  const initial = Number(body.initial_balance || 0);
  if (initial > 0 && user.role === 'super_admin') {
    const { creditWallet } = await import('../lib/wallet.js');
    await creditWallet({ clientId, amount: initial, type: 'credit', reference: 'initial', note: 'Initial balance', actor: user });
  }
  await audit(user, 'client_created', { entity: 'client', entityId: clientId, clientId, agencyId, meta: { company }, ip });
  return { client_id: clientId, admin: { email: adminEmail, temp_password: pwd } };
});

on('GET', '/clients/:id', (u) => seesClients(u) || u.role === 'client_admin', async ({ user, params }) => {
  const client = await clientFor(user, params.id);
  const [plan] = client.plan_id ? await q('SELECT * FROM plans WHERE id = $1', [client.plan_id]) : [null];
  const users = await q(`SELECT ${PUBLIC_USER} FROM users u WHERE u.client_id = $1 ORDER BY u.created_at`, [client.id]);
  const activity = await q('SELECT * FROM audit_logs WHERE client_id = $1 ORDER BY created_at DESC LIMIT 50', [client.id]);
  return { client, plan, users, activity };
});

const CLIENT_EDITABLE = {
  company_name: 160, legal_name: 160, business_type: 80, website: 200, gst_number: 20,
  pan: 12, address: 400, state: 60, source: 80, onboarding_stage: 40,
};
on('PATCH', '/clients/:id', editsClients, async ({ user, params, body, ip }) => {
  const client = await clientFor(user, params.id);
  const sets = [];
  const p = [];
  for (const [field, max] of Object.entries(CLIENT_EDITABLE)) {
    if (body[field] === undefined) continue;
    const v = str(body[field], max);
    need(field !== 'company_name' || v, 'Company name cannot be empty');
    p.push(v); sets.push(`${field} = $${p.length}`);
  }
  if (body.plan_id !== undefined) {
    need(body.plan_id === null || isUuid(body.plan_id), 'Invalid plan');
    p.push(body.plan_id); sets.push(`plan_id = $${p.length}`);
  }
  if (body.low_balance_alert !== undefined) {
    const v = Number(body.low_balance_alert);
    need(Number.isFinite(v) && v >= 0, 'Low balance alert is invalid');
    p.push(v); sets.push(`low_balance_alert = $${p.length}`);
  }
  need(sets.length, 'Nothing to update');
  p.push(client.id);
  const [row] = await q(`UPDATE clients SET ${sets.join(', ')}, updated_at = now() WHERE id = $${p.length} RETURNING *`, p);
  await audit(user, 'client_updated', { entity: 'client', entityId: client.id, clientId: client.id, agencyId: client.agency_id, ip });
  return { client: row };
});

on('POST', '/clients/:id/status', editsClients, async ({ user, params, body, ip }) => {
  const client = await clientFor(user, params.id);
  need(CLIENT_STATUSES.includes(body.status), 'Invalid status');
  const reason = str(body.reason, 300);
  need(!['suspended', 'closed'].includes(body.status) || reason, 'A reason is required to suspend or close');
  need(body.status !== 'closed' || user.role === 'super_admin', 'Only Super Admin can close an account', 403);
  const [row] = await q(
    `UPDATE clients SET status = $1, suspend_reason = $2, updated_at = now() WHERE id = $3 RETURNING *`,
    [body.status, ['suspended', 'closed'].includes(body.status) ? reason : null, client.id]);
  await audit(user, `client_${body.status}`, {
    entity: 'client', entityId: client.id, clientId: client.id, agencyId: client.agency_id, meta: { reason }, ip });
  return { client: row };
});

// Opens a client's portal for support. Always audit-logged, 30 minute token.
on('POST', '/clients/:id/impersonate', (u) => isPlatform(u.role) && can(u.role, 'clients.login_as'),
  async ({ user, params, ip }) => {
    const client = await clientFor(user, params.id);
    const [target] = await q(
      `SELECT * FROM users WHERE client_id = $1 AND role = 'client_admin' AND status = 'active' ORDER BY created_at LIMIT 1`,
      [client.id]);
    need(target, 'This client has no active admin user', 404);
    await audit(user, 'login_as_client', {
      entity: 'client', entityId: client.id, clientId: client.id, agencyId: client.agency_id, ip });
    return { token: signToken({ sub: target.id, imp: user.id }, '30m'), user: publicUser(target) };
  });

// ---- users ----------------------------------------------------------------
const usersAccess = (u) => seesClients(u) || u.role === 'client_admin' || u.role === 'agent_head';
on('GET', '/users', usersAccess, async ({ user, query }) => {
  const where = [`u.role IN ('client_admin','agent_head','agent','agency_admin')`];
  const p = [];
  if (user.role === 'client_admin' || user.role === 'agent_head') { p.push(user.client_id); where.push(`u.client_id = $${p.length}`); }
  if (user.role === 'agency_admin') { p.push(user.agency_id); where.push(`u.agency_id = $${p.length}`); }
  if (query.client_id) {
    need(isUuid(query.client_id), 'Invalid client');
    p.push(query.client_id); where.push(`u.client_id = $${p.length}`);
  }
  const users = await q(
    `SELECT ${PUBLIC_USER}, c.company_name,
            (SELECT count(*) FROM contacts k WHERE k.agent_id = u.id)::int AS total_contacts
     FROM users u LEFT JOIN clients c ON c.id = u.client_id
     WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT 500`, p);
  return { users };
});

on('POST', '/users', (u) => creatableRoles(u).length > 0, async ({ user, body, ip }) => {
  const name = str(body.name, 120);
  const email = str(body.email, 254).toLowerCase();
  need(name, 'Name is required');
  need(isEmail(email), 'Valid email is required');
  need(creatableRoles(user).includes(body.role), 'You cannot create this role', 403);
  const client = await clientFor(user, user.role === 'client_admin' ? user.client_id : body.client_id);
  need(['trial', 'active'].includes(client.status), 'Client account is not active');
  const [dup] = await q('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
  need(!dup, 'This email is already used by another user', 409);

  const pwd = tempPassword();
  const [created] = await q(
    `INSERT INTO users (role, name, email, mobile, password_hash, agency_id, client_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [body.role, name, email, str(body.mobile, 20), await hashPassword(pwd), client.agency_id, client.id, user.id]);
  await audit(user, 'user_created', {
    entity: 'user', entityId: created.id, clientId: client.id, agencyId: client.agency_id, meta: { role: body.role, email }, ip });
  return { id: created.id, email, temp_password: pwd };
});

on('PATCH', '/users/:id', (u) => creatableRoles(u).length > 0, async ({ user, params, body, ip }) => {
  const target = await userFor(user, params.id);
  const sets = [];
  const p = [];
  if (body.name !== undefined) { const v = str(body.name, 120); need(v, 'Name cannot be empty'); p.push(v); sets.push(`name = $${p.length}`); }
  if (body.mobile !== undefined) { p.push(str(body.mobile, 20)); sets.push(`mobile = $${p.length}`); }
  if (body.status !== undefined) {
    need(['active', 'disabled'].includes(body.status), 'Invalid status');
    p.push(body.status); sets.push(`status = $${p.length}`);
  }
  if (body.role !== undefined) {
    need(creatableRoles(user).includes(body.role), 'You cannot assign this role', 403);
    p.push(body.role); sets.push(`role = $${p.length}`);
  }
  if (body.dist_percent !== undefined) {
    const v = Number.parseInt(body.dist_percent, 10);
    need(Number.isInteger(v) && v >= 0 && v <= 100, 'Distribution must be 0 to 100');
    p.push(v); sets.push(`dist_percent = $${p.length}`);
  }
  need(sets.length, 'Nothing to update');
  p.push(target.id);
  await q(`UPDATE users SET ${sets.join(', ')} WHERE id = $${p.length}`, p);
  await audit(user, 'user_updated', {
    entity: 'user', entityId: target.id, clientId: target.client_id, agencyId: target.agency_id,
    meta: { fields: Object.keys(body) }, ip });
  return { ok: true };
});

on('POST', '/users/:id/reset-password', (u) => creatableRoles(u).length > 0, async ({ user, params, ip }) => {
  const target = await userFor(user, params.id);
  const pwd = tempPassword();
  await q('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2',
    [await hashPassword(pwd), target.id]);
  await audit(user, 'password_reset', {
    entity: 'user', entityId: target.id, clientId: target.client_id, agencyId: target.agency_id, ip });
  return { email: target.email, temp_password: pwd };
});

// Move all contacts from one agent to another (Configurations > Agents > Transfer).
on('POST', '/users/:id/transfer', (u) => creatableRoles(u).length > 0, async ({ user, params, body, ip }) => {
  const from = await userFor(user, params.id);
  need(isUuid(body.to_user_id), 'Choose an agent to transfer to');
  const [to] = await q('SELECT * FROM users WHERE id = $1 AND client_id = $2 AND status = $3',
    [body.to_user_id, from.client_id, 'active']);
  need(to && to.id !== from.id, 'Target agent not found', 404);
  const moved = await q(
    'UPDATE contacts SET agent_id = $1, updated_at = now() WHERE client_id = $2 AND agent_id = $3 RETURNING id',
    [to.id, from.client_id, from.id]);
  await q('UPDATE conversations SET agent_id = $1 WHERE client_id = $2 AND agent_id = $3', [to.id, from.client_id, from.id]);
  await audit(user, 'contacts_transferred', {
    entity: 'user', entityId: from.id, clientId: from.client_id, agencyId: from.agency_id,
    meta: { to: to.email, count: moved.length }, ip });
  return { moved: moved.length };
});

// ---- audit log ------------------------------------------------------------
const auditAccess = (u) =>
  u.role === 'agency_admin' || u.role === 'client_admin' || (isPlatform(u.role) && can(u.role, 'audit.view'));
on('GET', '/audit', auditAccess, async ({ user, query }) => {
  const where = [];
  const p = [];
  if (user.role === 'client_admin') { p.push(user.client_id); where.push(`client_id = $${p.length}`); }
  if (user.role === 'agency_admin') { p.push(user.agency_id); where.push(`agency_id = $${p.length}`); }
  if (query.client_id) {
    need(isUuid(query.client_id), 'Invalid client');
    p.push(query.client_id); where.push(`client_id = $${p.length}`);
  }
  const logs = await q(
    `SELECT * FROM audit_logs ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY created_at DESC LIMIT 200`, p);
  return { logs };
});
