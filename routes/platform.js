// Super Admin / staff side: dashboard, channels, pricing, wallet and billing, staff, website leads.
import {
  q, need, isUuid, isEmail, str, audit, hashPassword, tempPassword,
} from '../lib/core.js';
import {
  can, isPlatform, STAFF_ROLES, ROLE_LABELS, PERMISSIONS, MATRIX_MODULES, PLATFORM_ROLES,
} from '../lib/perms.js';
import { on, clientFor } from '../lib/router.js';
import { creditWallet, debitWallet } from '../lib/wallet.js';

const perm = (p) => (u) => isPlatform(u.role) && can(u.role, p);
const CATEGORIES = ['marketing', 'utility', 'authentication', 'service'];
const num = (v) => Number(v ?? 0);

// ---- dashboard ------------------------------------------------------------
on('GET', '/platform/dashboard', perm('clients.view'), async ({ user }) => {
  const [c] = await q(`SELECT
    (SELECT count(*) FROM clients)::int AS clients,
    (SELECT count(*) FROM clients WHERE status = 'active')::int AS active,
    (SELECT count(*) FROM clients WHERE status = 'trial')::int AS trial,
    (SELECT count(*) FROM clients WHERE status = 'suspended')::int AS suspended,
    (SELECT count(*) FROM agencies)::int AS agencies,
    (SELECT count(*) FROM channels WHERE status = 'connected')::int AS channels_connected,
    (SELECT count(*) FROM website_leads WHERE status = 'new')::int AS new_leads,
    (SELECT count(*) FROM messages WHERE direction = 'out' AND created_at > now() - interval '30 days')::int AS messages_30d`);
  const [f] = await q(`SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM campaign_messages WHERE updated_at > now() - interval '30 days'`);
  let money = null;
  if (can(user.role, 'wallet.view')) {
    const [m] = await q(`SELECT
      COALESCE(sum(amount) FILTER (WHERE type = 'credit'), 0) AS recharge,
      COALESCE(-sum(amount) FILTER (WHERE type IN ('debit','refund') ), 0) AS billed,
      COALESCE(sum(meta_cost) FILTER (WHERE type = 'debit'), 0) AS meta_cost
      FROM wallet_ledger WHERE created_at >= date_trunc('month', now())`);
    money = {
      recharge: num(m.recharge), billed: num(m.billed), meta_cost: num(m.meta_cost),
      gross_margin: num(m.billed) - num(m.meta_cost),
    };
  }
  const lowBalance = await q(
    `SELECT id, company_name, wallet_balance, low_balance_alert FROM clients
     WHERE status IN ('trial','active') AND wallet_balance < low_balance_alert ORDER BY wallet_balance LIMIT 10`);
  const stuck = await q(
    `SELECT id, company_name, onboarding_stage, (now()::date - created_at::date)::int AS days
     FROM clients WHERE status = 'trial' AND onboarding_stage <> 'live' ORDER BY created_at LIMIT 10`);
  return {
    ...c,
    failed_pct: f.total ? Math.round((f.failed / f.total) * 1000) / 10 : 0,
    campaign_messages_30d: f.total,
    money, low_balance: lowBalance, stuck_onboarding: stuck,
  };
});

// ---- channels (all clients) -----------------------------------------------
on('GET', '/platform/channels', perm('channels.view'), async ({ query }) => {
  const p = [];
  let where = '';
  if (query.status) { p.push(query.status); where = `WHERE ch.status = $1`; }
  const channels = await q(
    `SELECT ch.id, ch.client_id, ch.type, ch.display_name, ch.phone_number, ch.status, ch.tier, ch.quality_rating,
            ch.verification, ch.webhook_ok, ch.last_error, ch.created_at, c.company_name, c.onboarding_stage
     FROM channels ch JOIN clients c ON c.id = ch.client_id ${where} ORDER BY ch.created_at DESC LIMIT 500`, p);
  const masked = channels.map((c) => ({
    ...c, phone_number: c.phone_number ? c.phone_number.replace(/.(?=.{4})/g, '*') : null,
  }));
  return { channels: masked };
});

// ---- plans, rate cards, custom rates --------------------------------------
on('GET', '/pricing/plans', perm('plans.view'), async () => {
  const plans = await q('SELECT * FROM plans ORDER BY monthly_fee');
  const rates = await q('SELECT * FROM rate_cards');
  return {
    plans: plans.map((p) => ({
      ...p,
      rates: CATEGORIES.map((cat) => {
        const r = rates.find((x) => x.plan_id === p.id && x.category === cat);
        const meta = num(r?.meta_cost);
        const markup = num(r?.markup);
        return { category: cat, meta_cost: meta, markup, client_rate: meta + markup };
      }),
    })),
  };
});

on('PATCH', '/pricing/plans/:id', ['super_admin'], async ({ user, params, body, ip }) => {
  need(isUuid(params.id), 'Plan not found', 404);
  const sets = [];
  const p = [];
  if (body.name !== undefined) { const v = str(body.name, 80); need(v, 'Name required'); p.push(v); sets.push(`name = $${p.length}`); }
  if (body.monthly_fee !== undefined) {
    const v = Number(body.monthly_fee); need(Number.isFinite(v) && v >= 0, 'Fee is invalid'); p.push(v); sets.push(`monthly_fee = $${p.length}`);
  }
  if (body.included_agents !== undefined) {
    const v = Number.parseInt(body.included_agents, 10); need(Number.isInteger(v) && v >= 0, 'Agents is invalid'); p.push(v); sets.push(`included_agents = $${p.length}`);
  }
  if (body.status !== undefined) {
    need(['active', 'hidden'].includes(body.status), 'Invalid status'); p.push(body.status); sets.push(`status = $${p.length}`);
  }
  need(sets.length, 'Nothing to update');
  p.push(params.id);
  const [plan] = await q(`UPDATE plans SET ${sets.join(', ')} WHERE id = $${p.length} RETURNING *`, p);
  need(plan, 'Plan not found', 404);
  await audit(user, 'plan_updated', { entity: 'plan', entityId: plan.id, ip });
  return { plan };
});

on('PUT', '/pricing/plans/:id/rates', ['super_admin'], async ({ user, params, body, ip }) => {
  need(isUuid(params.id), 'Plan not found', 404);
  const [plan] = await q('SELECT id FROM plans WHERE id = $1', [params.id]);
  need(plan, 'Plan not found', 404);
  need(Array.isArray(body.rates), 'rates must be a list');
  for (const r of body.rates) {
    need(CATEGORIES.includes(r.category), 'Invalid category');
    const meta = Number(r.meta_cost ?? 0);
    const markup = Number(r.markup ?? 0);
    need(Number.isFinite(meta) && meta >= 0 && Number.isFinite(markup) && markup >= 0, 'Rates must be zero or more');
    await q(
      `INSERT INTO rate_cards (plan_id, category, meta_cost, markup) VALUES ($1,$2,$3,$4)
       ON CONFLICT (plan_id, category) DO UPDATE SET meta_cost = EXCLUDED.meta_cost, markup = EXCLUDED.markup`,
      [params.id, r.category, meta, markup]);
  }
  await audit(user, 'plan_rates_updated', { entity: 'plan', entityId: params.id, ip });
  return { ok: true };
});

on('GET', '/clients/:id/rates', perm('plans.view'), async ({ user, params }) => {
  const client = await clientFor(user, params.id);
  const rates = await q('SELECT category, rate FROM client_rates WHERE client_id = $1', [client.id]);
  return { rates };
});

on('PUT', '/clients/:id/rates', ['super_admin'], async ({ user, params, body, ip }) => {
  const client = await clientFor(user, params.id);
  need(Array.isArray(body.rates), 'rates must be a list');
  for (const r of body.rates) {
    need(CATEGORIES.includes(r.category), 'Invalid category');
    if (r.rate === null || r.rate === '' || r.rate === undefined) {
      await q('DELETE FROM client_rates WHERE client_id = $1 AND category = $2', [client.id, r.category]);
      continue;
    }
    const v = Number(r.rate);
    need(Number.isFinite(v) && v >= 0, 'Rate must be zero or more');
    await q(
      `INSERT INTO client_rates (client_id, category, rate) VALUES ($1,$2,$3)
       ON CONFLICT (client_id, category) DO UPDATE SET rate = EXCLUDED.rate`, [client.id, r.category, v]);
  }
  await audit(user, 'client_rates_updated', { entity: 'client', entityId: client.id, clientId: client.id, agencyId: client.agency_id, ip });
  return { ok: true };
});

// ---- wallet and billing ---------------------------------------------------
on('GET', '/wallet/summary', perm('wallet.view'), async () => {
  const [m] = await q(`SELECT
    COALESCE(sum(amount) FILTER (WHERE type = 'credit'), 0) AS recharge,
    COALESCE(-sum(amount) FILTER (WHERE type IN ('debit','refund')), 0) AS billed,
    COALESCE(sum(meta_cost) FILTER (WHERE type = 'debit'), 0) AS meta_cost
    FROM wallet_ledger WHERE created_at >= date_trunc('month', now())`);
  const clients = await q(
    `SELECT id, company_name, status, wallet_balance, low_balance_alert FROM clients
     ORDER BY wallet_balance ASC LIMIT 200`);
  return {
    recharge: num(m.recharge), billed: num(m.billed), meta_cost: num(m.meta_cost),
    gross_margin: num(m.billed) - num(m.meta_cost),
    clients,
    outstanding: clients.filter((c) => num(c.wallet_balance) < num(c.low_balance_alert)),
  };
});

on('GET', '/wallet/ledger', perm('wallet.view'), async ({ query }) => {
  const p = [];
  let where = '';
  if (query.client_id) { need(isUuid(query.client_id), 'Invalid client'); p.push(query.client_id); where = 'WHERE l.client_id = $1'; }
  const rows = await q(
    `SELECT l.*, c.company_name FROM wallet_ledger l JOIN clients c ON c.id = l.client_id
     ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT 300`, p);
  return { ledger: rows };
});

on('POST', '/wallet/adjust', perm('wallet.edit'), async ({ user, body, ip }) => {
  need(isUuid(body.client_id), 'Choose a client');
  need(['credit', 'debit'].includes(body.direction), 'Choose credit or debit');
  const amount = Number(body.amount);
  need(Number.isFinite(amount) && amount > 0 && amount <= 10000000, 'Amount is invalid');
  const reason = str(body.reason, 300);
  need(reason, 'A reason is required for manual wallet changes');
  const [client] = await q('SELECT id, agency_id FROM clients WHERE id = $1', [body.client_id]);
  need(client, 'Client not found', 404);
  let balance;
  if (body.direction === 'credit') {
    balance = await creditWallet({
      clientId: client.id, amount, type: body.kind === 'refund' ? 'refund' : 'credit',
      reference: str(body.reference, 100) || 'manual', note: reason, actor: user });
  } else {
    balance = await debitWallet({ clientId: client.id, amount, reference: str(body.reference, 100) || 'manual', note: reason, actor: user });
    need(balance !== null, 'Client balance is lower than this amount');
  }
  await audit(user, `wallet_${body.direction}`, {
    entity: 'client', entityId: client.id, clientId: client.id, agencyId: client.agency_id,
    meta: { amount, reason }, ip });
  return { balance };
});

on('GET', '/invoices', perm('wallet.view'), async ({ query }) => {
  const p = [];
  let where = '';
  if (query.client_id) { need(isUuid(query.client_id), 'Invalid client'); p.push(query.client_id); where = 'WHERE i.client_id = $1'; }
  const invoices = await q(
    `SELECT i.*, c.company_name FROM invoices i JOIN clients c ON c.id = i.client_id
     ${where} ORDER BY i.created_at DESC LIMIT 200`, p);
  return { invoices };
});

on('POST', '/invoices', perm('wallet.edit'), async ({ user, body, ip }) => {
  need(isUuid(body.client_id), 'Choose a client');
  const period = str(body.period, 20);
  need(/^\d{4}-\d{2}$/.test(period), 'Period must look like 2026-10');
  const amount = Number(body.amount);
  const gst = Number(body.gst_amount ?? 0);
  need(Number.isFinite(amount) && amount >= 0 && Number.isFinite(gst) && gst >= 0, 'Amounts are invalid');
  const [client] = await q('SELECT id, agency_id FROM clients WHERE id = $1', [body.client_id]);
  need(client, 'Client not found', 404);
  const [{ n }] = await q('SELECT count(*)::int AS n FROM invoices WHERE client_id = $1', [client.id]);
  const number = `INV-${period.replace('-', '')}-${String(n + 1).padStart(4, '0')}-${client.id.slice(0, 4).toUpperCase()}`;
  const [inv] = await q(
    `INSERT INTO invoices (client_id, number, period, amount, gst_amount, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [client.id, number, period, amount, gst, str(body.note, 300), user.id]);
  await audit(user, 'invoice_created', { entity: 'invoice', entityId: inv.id, clientId: client.id, agencyId: client.agency_id, ip });
  return { invoice: inv };
});

on('PATCH', '/invoices/:id', perm('wallet.edit'), async ({ user, params, body, ip }) => {
  need(isUuid(params.id), 'Invoice not found', 404);
  need(['due', 'paid', 'void'].includes(body.status), 'Invalid status');
  const [inv] = await q('UPDATE invoices SET status = $1 WHERE id = $2 RETURNING *', [body.status, params.id]);
  need(inv, 'Invoice not found', 404);
  await audit(user, `invoice_${body.status}`, { entity: 'invoice', entityId: inv.id, clientId: inv.client_id, ip });
  return { invoice: inv };
});

// ---- client detail extras (platform + agency view) ------------------------
on('GET', '/clients/:id/details', (u) => isPlatform(u.role) ? can(u.role, 'clients.view') : u.role === 'agency_admin',
  async ({ user, params }) => {
    const client = await clientFor(user, params.id);
    const channels = await q(
      `SELECT id, type, display_name, phone_number, status, tier, quality_rating, verification, webhook_ok, last_error
       FROM channels WHERE client_id = $1 ORDER BY created_at`, [client.id]);
    const templates = await q(
      `SELECT id, name, category, language, status, quality FROM templates WHERE client_id = $1 ORDER BY created_at DESC LIMIT 100`, [client.id]);
    const campaigns = await q(
      `SELECT c.id, c.name, c.status, c.category, c.total, c.created_at,
              count(*) FILTER (WHERE m.status IN ('sent','delivered','read'))::int AS sent,
              count(*) FILTER (WHERE m.status IN ('delivered','read'))::int AS delivered,
              count(*) FILTER (WHERE m.status = 'read')::int AS seen,
              count(*) FILTER (WHERE m.status = 'failed')::int AS failed
       FROM campaigns c LEFT JOIN campaign_messages m ON m.campaign_id = c.id
       WHERE c.client_id = $1 GROUP BY c.id ORDER BY c.created_at DESC LIMIT 50`, [client.id]);
    const usage = await q(
      `SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS messages
       FROM messages WHERE client_id = $1 AND direction = 'out' AND created_at > now() - interval '30 days'
       GROUP BY 1 ORDER BY 1`, [client.id]);
    const failureReasons = await q(
      `SELECT COALESCE(error, 'Unknown') AS reason, count(*)::int AS count
       FROM campaign_messages WHERE client_id = $1 AND status = 'failed'
       GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, [client.id]);
    const [api] = await q(
      `SELECT prefix, created_at, active FROM api_keys WHERE client_id = $1 AND active = true ORDER BY created_at DESC LIMIT 1`, [client.id]);
    const notes = await q('SELECT * FROM client_notes WHERE client_id = $1 ORDER BY created_at DESC LIMIT 50', [client.id]);
    const out = { channels, templates, campaigns, usage, failure_reasons: failureReasons, api: api || null, notes };
    if (isPlatform(user.role) ? can(user.role, 'wallet.view') : false) {
      out.ledger = await q('SELECT * FROM wallet_ledger WHERE client_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100', [client.id]);
      out.invoices = await q('SELECT * FROM invoices WHERE client_id = $1 ORDER BY created_at DESC LIMIT 50', [client.id]);
    }
    return out;
  });

on('POST', '/clients/:id/notes', (u) => isPlatform(u.role) && can(u.role, 'clients.view'), async ({ user, params, body, ip }) => {
  const client = await clientFor(user, params.id);
  const text = str(body.body, 2000);
  need(text, 'Note cannot be empty');
  const [n] = await q(
    `INSERT INTO client_notes (client_id, author_id, author_name, body) VALUES ($1,$2,$3,$4) RETURNING *`,
    [client.id, user.id, user.name, text]);
  await audit(user, 'note_added', { entity: 'client', entityId: client.id, clientId: client.id, agencyId: client.agency_id, ip });
  return { note: n };
});

// ---- staff and roles ------------------------------------------------------
on('GET', '/staff', ['super_admin'], async () => {
  const staff = await q(
    `SELECT id, name, email, mobile, role, status, last_login_at, created_at FROM users
     WHERE role = ANY($1) ORDER BY created_at`, [PLATFORM_ROLES]);
  const matrix = MATRIX_MODULES.map(([label, key]) => ({
    label, key,
    roles: Object.fromEntries(PLATFORM_ROLES.map((r) => [r, can(r, key)])),
  }));
  return { staff, matrix, roles: PLATFORM_ROLES.map((r) => ({ key: r, label: ROLE_LABELS[r] })) };
});

on('POST', '/staff', ['super_admin'], async ({ user, body, ip }) => {
  const name = str(body.name, 120);
  const email = str(body.email, 254).toLowerCase();
  need(name, 'Name is required');
  need(isEmail(email), 'Valid email is required');
  need(STAFF_ROLES.includes(body.role), 'Choose a staff role');
  const [dup] = await q('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
  need(!dup, 'This email is already used by another user', 409);
  const pwd = tempPassword();
  const [u] = await q(
    `INSERT INTO users (role, name, email, mobile, password_hash, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [body.role, name, email, str(body.mobile, 20), await hashPassword(pwd), user.id]);
  await audit(user, 'staff_created', { entity: 'user', entityId: u.id, meta: { role: body.role, email }, ip });
  return { id: u.id, email, temp_password: pwd };
});

async function staffTarget(id) {
  need(isUuid(id), 'Staff not found', 404);
  const [t] = await q('SELECT * FROM users WHERE id = $1 AND role = ANY($2)', [id, STAFF_ROLES]);
  need(t, 'Staff not found', 404);
  return t;
}

on('PATCH', '/staff/:id', ['super_admin'], async ({ user, params, body, ip }) => {
  const t = await staffTarget(params.id);
  const sets = [];
  const p = [];
  if (body.name !== undefined) { const v = str(body.name, 120); need(v, 'Name required'); p.push(v); sets.push(`name = $${p.length}`); }
  if (body.mobile !== undefined) { p.push(str(body.mobile, 20)); sets.push(`mobile = $${p.length}`); }
  if (body.role !== undefined) { need(STAFF_ROLES.includes(body.role), 'Invalid role'); p.push(body.role); sets.push(`role = $${p.length}`); }
  if (body.status !== undefined) { need(['active', 'disabled'].includes(body.status), 'Invalid status'); p.push(body.status); sets.push(`status = $${p.length}`); }
  need(sets.length, 'Nothing to update');
  p.push(t.id);
  await q(`UPDATE users SET ${sets.join(', ')} WHERE id = $${p.length}`, p);
  await audit(user, 'staff_updated', { entity: 'user', entityId: t.id, meta: { fields: Object.keys(body) }, ip });
  return { ok: true };
});

on('POST', '/staff/:id/reset-password', ['super_admin'], async ({ user, params, ip }) => {
  const t = await staffTarget(params.id);
  const pwd = tempPassword();
  await q('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2', [await hashPassword(pwd), t.id]);
  await audit(user, 'staff_password_reset', { entity: 'user', entityId: t.id, ip });
  return { email: t.email, temp_password: pwd };
});

// ---- website leads --------------------------------------------------------
on('GET', '/website-leads', perm('website_leads.manage'), async () => ({
  leads: await q('SELECT * FROM website_leads ORDER BY created_at DESC LIMIT 300'),
}));

on('PATCH', '/website-leads/:id', perm('website_leads.manage'), async ({ params, body }) => {
  need(isUuid(params.id), 'Lead not found', 404);
  need(['new', 'contacted', 'won', 'lost'].includes(body.status), 'Invalid status');
  const [l] = await q('UPDATE website_leads SET status = $1 WHERE id = $2 RETURNING *', [body.status, params.id]);
  need(l, 'Lead not found', 404);
  return { lead: l };
});

export { PERMISSIONS };
