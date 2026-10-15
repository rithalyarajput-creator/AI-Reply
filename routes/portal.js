// Client portal API: dashboard, leads, labels, inbox, templates, campaigns, automations,
// flows, workflows, reports, short links, integrations, API keys, channels, wallet view.
import crypto from 'node:crypto';
import {
  q, need, isUuid, str, audit, encrypt, sha256, randomToken,
} from '../lib/core.js';
import { can, isPlatform } from '../lib/perms.js';
import { on, portalClient } from '../lib/router.js';
import * as meta from '../lib/meta.js';
import { sendReply, pickAgent } from '../lib/engine.js';
import { rateFor, debitWallet, creditWallet, getBalance } from '../lib/wallet.js';

// Anyone who works inside a client account (or platform/agency users looking at one with ?client_id=).
const inClient = (u) =>
  ['client_admin', 'agent_head', 'agent'].includes(u.role) ||
  u.role === 'agency_admin' || (isPlatform(u.role) && can(u.role, 'clients.view'));
const adminOnly = (u) =>
  u.role === 'client_admin' || u.role === 'agency_admin' || u.role === 'super_admin';
const seesAll = (u) => u.role !== 'agent';
const clip = (s, n) => String(s ?? '').slice(0, n);
const intIn = (v, d, min, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : d;
};

// ---- dashboard ------------------------------------------------------------
on('GET', '/portal/dashboard', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  const { user } = ctx;
  const mine = user.role === 'agent' ? user.id : null;
  const [s] = await q(`SELECT
    (SELECT count(*) FROM users WHERE client_id = $1 AND role IN ('client_admin','agent_head','agent') AND status = 'active')::int AS users,
    (SELECT count(*) FROM users WHERE client_id = $1 AND role IN ('client_admin','agent_head','agent') AND status = 'disabled')::int AS users_disabled,
    (SELECT count(*) FROM messages WHERE client_id = $1 AND direction IN ('in','out'))::int AS messages,
    (SELECT count(*) FROM messages WHERE client_id = $1 AND direction = 'in')::int AS inbound,
    (SELECT count(*) FROM messages WHERE client_id = $1 AND direction = 'out')::int AS outbound,
    (SELECT count(*) FROM conversations WHERE client_id = $1 AND status = 'live' AND unread = 0 AND ($2::uuid IS NULL OR agent_id = $2))::int AS replied,
    (SELECT count(*) FROM conversations WHERE client_id = $1 AND status = 'live' AND ($2::uuid IS NULL OR agent_id = $2))::int AS live_chats,
    (SELECT count(*) FROM conversations WHERE client_id = $1 AND status = 'live' AND unread > 0 AND ($2::uuid IS NULL OR agent_id = $2))::int AS unreplied,
    (SELECT count(*) FROM contacts WHERE client_id = $1 AND ($2::uuid IS NULL OR agent_id = $2))::int AS leads`,
  [c.id, mine]);
  const [last] = await q(
    `SELECT c.id, c.name, c.total,
            count(*) FILTER (WHERE m.status = 'pending')::int AS pending,
            count(*) FILTER (WHERE m.status = 'sent')::int AS sent,
            count(*) FILTER (WHERE m.status = 'delivered')::int AS delivered,
            count(*) FILTER (WHERE m.status = 'read')::int AS seen,
            count(*) FILTER (WHERE m.status = 'failed')::int AS failed
     FROM campaigns c LEFT JOIN campaign_messages m ON m.campaign_id = c.id
     WHERE c.client_id = $1 GROUP BY c.id ORDER BY c.created_at DESC LIMIT 1`, [c.id]);
  const rtRows = await q(
    `SELECT o.is_bot, avg(extract(epoch FROM (o.created_at - i.created_at)))::float AS secs
     FROM messages i JOIN LATERAL (
       SELECT created_at, is_bot FROM messages o WHERE o.conversation_id = i.conversation_id AND o.direction = 'out'
         AND o.created_at > i.created_at ORDER BY o.created_at LIMIT 1) o ON true
     WHERE i.client_id = $1 AND i.direction = 'in' AND i.created_at > now() - interval '30 days'
     GROUP BY o.is_bot`, [c.id]);
  const botSecs = rtRows.find((r) => r.is_bot)?.secs ?? null;
  const humanSecs = rtRows.find((r) => !r.is_bot)?.secs ?? null;
  const allSecs = rtRows.length ? rtRows.reduce((s, r) => s + r.secs, 0) / rtRows.length : null;
  const ch = await q(
    `SELECT id, display_name, status, tier, quality_rating, verification FROM channels WHERE client_id = $1`, [c.id]);
  const [setup] = await q(`SELECT
    (SELECT count(*) FROM automations WHERE client_id = $1 AND type = 'welcome' AND enabled)::int AS welcome,
    (SELECT count(*) FROM campaigns WHERE client_id = $1)::int AS campaign,
    (SELECT count(*) FROM automations WHERE client_id = $1 AND type = 'out_of_office' AND enabled)::int AS ooo,
    (SELECT count(*) FROM automations WHERE client_id = $1 AND type = 'auto_assign' AND enabled)::int AS auto_assign,
    (SELECT count(*) FROM automations WHERE client_id = $1 AND type = 'opt_out' AND enabled)::int AS opt_out`, [c.id]);
  const [bal] = await q('SELECT wallet_balance, low_balance_alert, company_name FROM clients WHERE id = $1', [c.id]);
  return {
    company: bal.company_name, stats: s, last_campaign: last || null,
    avg_response_seconds: allSecs === null ? null : Math.round(allSecs),
    response_bot_seconds: botSecs === null ? null : Math.round(botSecs),
    response_human_seconds: humanSecs === null ? null : Math.round(humanSecs),
    channels: ch, setup, wallet_balance: Number(bal.wallet_balance),
    low_balance: Number(bal.wallet_balance) < Number(bal.low_balance_alert),
  };
});

// ---- channels / integrations ----------------------------------------------
on('GET', '/portal/channels', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  const channels = await q(
    `SELECT id, type, display_name, phone_number, waba_id, phone_number_id, status, tier, quality_rating,
            verification, webhook_ok, last_error, created_at FROM channels WHERE client_id = $1 ORDER BY created_at`, [c.id]);
  return { channels };
});

// Connect a WhatsApp number with the client's own WhatsApp Business Account credentials.
on('POST', '/portal/channels', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const { user, body, ip } = ctx;
  const phoneNumberId = str(body.phone_number_id, 40);
  const wabaId = str(body.waba_id, 40);
  const token = str(body.access_token, 1000);
  need(/^\d{5,25}$/.test(phoneNumberId), 'Phone number ID must be digits only');
  need(/^\d{5,25}$/.test(wabaId), 'WhatsApp Business Account ID must be digits only');
  need(token.length >= 20, 'Access token is required');
  const [dup] = await q('SELECT 1 FROM channels WHERE phone_number_id = $1', [phoneNumberId]);
  need(!dup, 'This phone number is already connected', 409);

  let info;
  try {
    info = await meta.probeCredentials({ phoneNumberId, token });
  } catch (e) {
    need(false, `WhatsApp rejected these details: ${e.message}`);
  }
  const [ch] = await q(
    `INSERT INTO channels (client_id, type, display_name, phone_number, waba_id, phone_number_id, token_enc, status, tier, quality_rating, verification)
     VALUES ($1,'whatsapp',$2,$3,$4,$5,$6,'connected',$7,$8,$9) RETURNING id`,
    [c.id, str(body.display_name, 80) || info.verified_name || 'WhatsApp', info.display_phone_number || null,
      wabaId, phoneNumberId, encrypt(token), info.messaging_limit_tier || null, info.quality_rating || null,
      info.code_verification_status || null]);
  await q(`UPDATE clients SET onboarding_stage = 'number_connected' WHERE id = $1 AND onboarding_stage = 'documents'`, [c.id]);
  await audit(user, 'channel_connected', { entity: 'channel', entityId: ch.id, clientId: c.id, agencyId: c.agency_id, ip });
  return { id: ch.id };
});

on('POST', '/portal/channels/:id/sync', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Channel not found', 404);
  const [ch] = await q('SELECT * FROM channels WHERE id = $1 AND client_id = $2', [ctx.params.id, c.id]);
  need(ch, 'Channel not found', 404);
  try {
    const info = await meta.fetchPhoneInfo(ch);
    await q(
      `UPDATE channels SET tier = $1, quality_rating = $2, verification = $3, phone_number = COALESCE($4, phone_number),
              status = 'connected', last_error = NULL WHERE id = $5`,
      [info.messaging_limit_tier || null, info.quality_rating || null, info.code_verification_status || null,
        info.display_phone_number || null, ch.id]);
    return { ok: true };
  } catch (e) {
    await q(`UPDATE channels SET last_error = $1 WHERE id = $2`, [clip(e.message, 300), ch.id]);
    need(false, e.message);
  }
});

on('DELETE', '/portal/channels/:id', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Channel not found', 404);
  const [ch] = await q(
    `UPDATE channels SET status = 'disconnected', token_enc = NULL WHERE id = $1 AND client_id = $2 RETURNING id`,
    [ctx.params.id, c.id]);
  need(ch, 'Channel not found', 404);
  await audit(ctx.user, 'channel_disconnected', { entity: 'channel', entityId: ch.id, clientId: c.id, agencyId: c.agency_id, ip: ctx.ip });
  return { ok: true };
});

async function connectedChannel(clientId, channelId) {
  const p = [clientId];
  let extra = '';
  if (channelId) { need(isUuid(channelId), 'Channel not found', 404); p.push(channelId); extra = ' AND id = $2'; }
  const [ch] = await q(
    `SELECT * FROM channels WHERE client_id = $1 AND type = 'whatsapp' AND status = 'connected'${extra} ORDER BY created_at LIMIT 1`, p);
  return ch || null;
}

// ---- labels ---------------------------------------------------------------
on('GET', '/portal/labels', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  return {
    labels: await q(
      `SELECT l.*, (SELECT count(*) FROM contact_labels cl WHERE cl.label_id = l.id)::int AS contacts
       FROM labels l WHERE l.client_id = $1 ORDER BY l.name`, [c.id]),
  };
});

on('POST', '/portal/labels', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const name = str(ctx.body.name, 40);
  need(name, 'Label name is required');
  const color = /^#[0-9a-fA-F]{6}$/.test(ctx.body.color || '') ? ctx.body.color : '#388087';
  const [dup] = await q('SELECT 1 FROM labels WHERE client_id = $1 AND lower(name) = lower($2)', [c.id, name]);
  need(!dup, 'A label with this name already exists', 409);
  const [l] = await q('INSERT INTO labels (client_id, name, color) VALUES ($1,$2,$3) RETURNING *', [c.id, name, color]);
  return { label: l };
});

on('PATCH', '/portal/labels/:id', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Label not found', 404);
  const sets = [];
  const p = [];
  if (ctx.body.name !== undefined) { const v = str(ctx.body.name, 40); need(v, 'Name required'); p.push(v); sets.push(`name = $${p.length}`); }
  if (ctx.body.color !== undefined) {
    need(/^#[0-9a-fA-F]{6}$/.test(ctx.body.color), 'Invalid color'); p.push(ctx.body.color); sets.push(`color = $${p.length}`);
  }
  need(sets.length, 'Nothing to update');
  p.push(ctx.params.id, c.id);
  const [l] = await q(`UPDATE labels SET ${sets.join(', ')} WHERE id = $${p.length - 1} AND client_id = $${p.length} RETURNING *`, p);
  need(l, 'Label not found', 404);
  return { label: l };
});

on('DELETE', '/portal/labels/:id', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Label not found', 404);
  await q('DELETE FROM labels WHERE id = $1 AND client_id = $2', [ctx.params.id, c.id]);
  return { ok: true };
});

// ---- leads (contacts) -----------------------------------------------------
on('GET', '/portal/leads', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  const { user, query } = ctx;
  const where = ['k.client_id = $1'];
  const p = [c.id];
  if (user.role === 'agent') { p.push(user.id); where.push(`k.agent_id = $${p.length}`); }
  else if (query.agent_id) {
    need(isUuid(query.agent_id), 'Invalid agent'); p.push(query.agent_id); where.push(`k.agent_id = $${p.length}`);
  }
  if (query.q) { p.push(`%${clip(query.q, 40)}%`); where.push(`(k.phone ILIKE $${p.length} OR k.name ILIKE $${p.length})`); }
  if (query.label_id) {
    need(isUuid(query.label_id), 'Invalid label'); p.push(query.label_id);
    where.push(`EXISTS (SELECT 1 FROM contact_labels cl WHERE cl.contact_id = k.id AND cl.label_id = $${p.length})`);
  }
  const limit = intIn(query.limit, 20, 1, 200);
  const offset = (intIn(query.page, 1, 1, 100000) - 1) * limit;
  const [{ total }] = await q(`SELECT count(*)::int AS total FROM contacts k WHERE ${where.join(' AND ')}`, p);
  const leads = await q(
    `SELECT k.id, k.phone, k.name, k.agent_id, k.opted_out, k.source, k.created_at, k.updated_at,
            u.name AS agent_name,
            COALESCE((SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
                      FROM contact_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.contact_id = k.id), '[]') AS labels
     FROM contacts k LEFT JOIN users u ON u.id = k.agent_id
     WHERE ${where.join(' AND ')} ORDER BY k.created_at DESC LIMIT ${limit} OFFSET ${offset}`, p);
  return { leads, total, page: Math.floor(offset / limit) + 1, limit };
});

on('POST', '/portal/leads', (u) => inClient(u), async (ctx) => {
  const c = await portalClient(ctx);
  const phone = meta.normalizePhone(ctx.body.phone);
  need(/^\d{8,15}$/.test(phone), 'Enter a valid mobile number with country code');
  const [row] = await q(
    `INSERT INTO contacts (client_id, phone, name, source, agent_id) VALUES ($1,$2,$3,'manual',$4)
     ON CONFLICT (client_id, phone) DO NOTHING RETURNING *`,
    [c.id, phone, str(ctx.body.name, 120) || null, ctx.user.role === 'agent' ? ctx.user.id : null]);
  need(row, 'This number is already in your leads', 409);
  return { lead: row };
});

// CSV rows already parsed in the browser: [{ phone, name }]
on('POST', '/portal/leads/import', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const rows = Array.isArray(ctx.body.rows) ? ctx.body.rows : [];
  need(rows.length > 0, 'No rows to import');
  need(rows.length <= 5000, 'Import up to 5000 rows at a time');
  let labelId = null;
  if (ctx.body.label_id) {
    need(isUuid(ctx.body.label_id), 'Invalid label');
    const [l] = await q('SELECT id FROM labels WHERE id = $1 AND client_id = $2', [ctx.body.label_id, c.id]);
    need(l, 'Label not found', 404);
    labelId = l.id;
  }
  let added = 0; let skipped = 0; let invalid = 0;
  for (const r of rows) {
    const phone = meta.normalizePhone(r.phone);
    if (!/^\d{8,15}$/.test(phone)) { invalid += 1; continue; }
    const [k] = await q(
      `INSERT INTO contacts (client_id, phone, name, source) VALUES ($1,$2,$3,'import')
       ON CONFLICT (client_id, phone) DO NOTHING RETURNING id`,
      [c.id, phone, str(r.name, 120) || null]);
    if (k) added += 1; else skipped += 1;
    if (labelId) {
      await q(
        `INSERT INTO contact_labels (contact_id, label_id)
         SELECT id, $2 FROM contacts WHERE client_id = $1 AND phone = $3 ON CONFLICT DO NOTHING`,
        [c.id, labelId, phone]);
    }
  }
  await audit(ctx.user, 'leads_imported', { entity: 'contacts', clientId: c.id, agencyId: c.agency_id, meta: { added, skipped, invalid }, ip: ctx.ip });
  return { added, skipped, invalid };
});

on('PATCH', '/portal/leads/:id', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Lead not found', 404);
  const [k] = await q('SELECT * FROM contacts WHERE id = $1 AND client_id = $2', [ctx.params.id, c.id]);
  need(k, 'Lead not found', 404);
  need(ctx.user.role !== 'agent' || k.agent_id === ctx.user.id, 'Not allowed', 403);
  const { body } = ctx;
  const sets = [];
  const p = [];
  if (body.name !== undefined) { p.push(str(body.name, 120) || null); sets.push(`name = $${p.length}`); }
  if (body.agent_id !== undefined) {
    need(ctx.user.role !== 'agent', 'Not allowed', 403);
    if (body.agent_id === null) { p.push(null); }
    else {
      need(isUuid(body.agent_id), 'Invalid agent');
      const [a] = await q('SELECT id FROM users WHERE id = $1 AND client_id = $2', [body.agent_id, c.id]);
      need(a, 'Agent not found', 404);
      p.push(a.id);
    }
    sets.push(`agent_id = $${p.length}`);
  }
  if (body.opted_out !== undefined) { p.push(!!body.opted_out); sets.push(`opted_out = $${p.length}`); }
  if (sets.length) {
    p.push(k.id);
    await q(`UPDATE contacts SET ${sets.join(', ')}, updated_at = now() WHERE id = $${p.length}`, p);
    if (body.agent_id !== undefined) {
      await q('UPDATE conversations SET agent_id = $1 WHERE contact_id = $2', [p[sets.findIndex((s) => s.startsWith('agent_id'))], k.id]);
    }
  }
  if (Array.isArray(body.label_ids)) {
    need(ctx.user.role !== 'agent' || true, 'Not allowed');
    await q('DELETE FROM contact_labels WHERE contact_id = $1', [k.id]);
    for (const lid of body.label_ids) {
      if (!isUuid(lid)) continue;
      await q(
        `INSERT INTO contact_labels (contact_id, label_id)
         SELECT $1, id FROM labels WHERE id = $2 AND client_id = $3 ON CONFLICT DO NOTHING`, [k.id, lid, c.id]);
    }
  }
  return { ok: true };
});

on('DELETE', '/portal/leads/:id', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Lead not found', 404);
  await q('DELETE FROM contacts WHERE id = $1 AND client_id = $2', [ctx.params.id, c.id]);
  return { ok: true };
});

// ---- team inbox -----------------------------------------------------------
on('GET', '/portal/conversations', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  const { user, query } = ctx;
  const where = ['v.client_id = $1'];
  const p = [c.id];
  if (user.role === 'agent') { p.push(user.id); where.push(`v.agent_id = $${p.length}`); }
  else if (query.agent_id) { need(isUuid(query.agent_id), 'Invalid agent'); p.push(query.agent_id); where.push(`v.agent_id = $${p.length}`); }
  where.push(`v.status = $${p.push(query.tab === 'history' ? 'history' : 'live')}`);
  if (query.q) { p.push(`%${clip(query.q, 40)}%`); where.push(`(k.phone ILIKE $${p.length} OR k.name ILIKE $${p.length})`); }
  const conversations = await q(
    `SELECT v.id, v.status, v.unread, v.agent_id, v.bot_active, v.last_message_at, v.last_message_preview, v.last_inbound_at,
            k.id AS contact_id, k.phone, k.name, k.opted_out, u.name AS agent_name, ch.display_name AS channel_name,
            COALESCE((SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
                      FROM contact_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.contact_id = k.id), '[]') AS labels
     FROM conversations v JOIN contacts k ON k.id = v.contact_id
     LEFT JOIN users u ON u.id = v.agent_id LEFT JOIN channels ch ON ch.id = v.channel_id
     WHERE ${where.join(' AND ')} ORDER BY v.last_message_at DESC LIMIT 200`, p);
  return { conversations };
});

async function conversationFor(ctx, id) {
  const c = await portalClient(ctx);
  need(isUuid(id), 'Conversation not found', 404);
  const [conv] = await q('SELECT * FROM conversations WHERE id = $1 AND client_id = $2', [id, c.id]);
  need(conv, 'Conversation not found', 404);
  need(ctx.user.role !== 'agent' || conv.agent_id === ctx.user.id, 'Not allowed', 403);
  const [contact] = await q('SELECT * FROM contacts WHERE id = $1', [conv.contact_id]);
  return { c, conv, contact };
}

on('GET', '/portal/conversations/:id', inClient, async (ctx) => {
  const { conv, contact } = await conversationFor(ctx, ctx.params.id);
  const messages = await q(
    `SELECT id, direction, kind, body, sender_name, is_bot, status, error, created_at,
            (media_id IS NOT NULL) AS has_media, media_mime, media_name FROM messages
     WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 300`, [conv.id]);
  await q('UPDATE conversations SET unread = 0 WHERE id = $1', [conv.id]);
  const windowOpen = !!conv.last_inbound_at && Date.now() - new Date(conv.last_inbound_at).getTime() < 24 * 3600 * 1000;
  return { conversation: { ...conv, unread: 0 }, contact, messages, window_open: windowOpen };
});

// Streams a customer's photo / file / voice note through the client's own WhatsApp token.
on('GET', '/portal/messages/:id/media', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'File not found', 404);
  const [m] = await q(
    `SELECT m.media_id, v.agent_id, v.channel_id FROM messages m JOIN conversations v ON v.id = m.conversation_id
     WHERE m.id = $1 AND m.client_id = $2`, [ctx.params.id, c.id]);
  need(m && m.media_id, 'File not found', 404);
  need(ctx.user.role !== 'agent' || m.agent_id === ctx.user.id, 'Not allowed', 403);
  const channel = await connectedChannel(c.id, m.channel_id);
  need(channel, 'Connect your WhatsApp number to open files', 409);
  let file;
  try { file = await meta.fetchMedia(channel, m.media_id); } catch (e) { need(false, e.message, 502); }
  ctx.res.statusCode = 200;
  ctx.res.setHeader('Content-Type', file.mime);
  ctx.res.setHeader('Content-Disposition', 'inline');
  ctx.res.setHeader('X-Content-Type-Options', 'nosniff');
  ctx.res.setHeader('Cache-Control', 'private, max-age=300');
  ctx.res.end(file.buffer);
  return undefined;
});

// Is the server ready to receive WhatsApp messages? Shown on Integrations.
on('GET', '/portal/webhook-status', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  const [last] = await q(
    `SELECT max(created_at) AS at FROM messages WHERE client_id = $1 AND direction = 'in'`, [c.id]);
  const [ch] = await q(
    `SELECT count(*) FILTER (WHERE status = 'connected')::int AS connected,
            count(*) FILTER (WHERE webhook_ok)::int AS receiving FROM channels WHERE client_id = $1`, [c.id]);
  return {
    verify_token_set: !!process.env.META_VERIFY_TOKEN,
    app_secret_set: !!process.env.META_APP_SECRET,
    callback_path: '/api/webhooks/whatsapp',
    channels_connected: ch.connected,
    channels_receiving: ch.receiving,
    last_inbound_at: last.at,
  };
});

on('POST', '/portal/conversations/:id/messages', inClient, async (ctx) => {
  const { c, conv, contact } = await conversationFor(ctx, ctx.params.id);
  const text = clip(ctx.body.text, 4096).trim();
  need(text, 'Type a message');
  need(!contact.opted_out, 'This contact has opted out of messages');
  const windowOpen = !!conv.last_inbound_at && Date.now() - new Date(conv.last_inbound_at).getTime() < 24 * 3600 * 1000;
  need(windowOpen, 'The 24-hour window has closed. Send an approved template instead.');
  const channel = await connectedChannel(c.id, conv.channel_id);
  need(channel, 'No connected WhatsApp channel');
  await q('UPDATE conversations SET bot_active = false WHERE id = $1', [conv.id]);
  const m = await sendReply({ channel, conv, contact, text, user: ctx.user });
  return { message: m };
});

on('POST', '/portal/conversations/:id/template', inClient, async (ctx) => {
  const { c, conv, contact } = await conversationFor(ctx, ctx.params.id);
  need(!contact.opted_out, 'This contact has opted out of messages');
  need(isUuid(ctx.body.template_id), 'Choose a template');
  const [t] = await q(`SELECT * FROM templates WHERE id = $1 AND client_id = $2 AND status = 'approved'`, [ctx.body.template_id, c.id]);
  need(t, 'Template not found or not approved', 404);
  const channel = await connectedChannel(c.id, conv.channel_id);
  need(channel, 'No connected WhatsApp channel');
  const vars = Array.isArray(ctx.body.variables) ? ctx.body.variables.map((v) => clip(v, 200)) : [];
  const { rate, metaCost } = await rateFor(c.id, t.category);
  const bal = await debitWallet({ clientId: c.id, amount: rate, metaCost, reference: `template:${t.id}`, note: `Template ${t.name}`, actor: ctx.user });
  need(bal !== null, 'Wallet balance is too low to send this template');
  let waId = null; let status = 'sent'; let error = null;
  try { waId = await meta.sendTemplate(channel, contact.phone, t, vars); }
  catch (e) {
    status = 'failed'; error = clip(e.message, 300);
    if (rate > 0) await creditWallet({ clientId: c.id, amount: rate, type: 'refund', reference: `template:${t.id}`, note: 'Send failed' });
  }
  const body = t.body.replace(/\{\{(\d+)\}\}/g, (_, i) => vars[Number(i) - 1] ?? '');
  const [m] = await q(
    `INSERT INTO messages (client_id, conversation_id, direction, kind, body, sender_user_id, sender_name, status, wa_message_id, error)
     VALUES ($1,$2,'out','template',$3,$4,$5,$6,$7,$8) RETURNING *`,
    [c.id, conv.id, body, ctx.user.id, ctx.user.name, status, waId, error]);
  await q('UPDATE conversations SET last_message_at = now(), last_message_preview = $1, bot_active = false WHERE id = $2', [clip(body, 120), conv.id]);
  return { message: m };
});

on('POST', '/portal/conversations/:id/note', inClient, async (ctx) => {
  const { c, conv } = await conversationFor(ctx, ctx.params.id);
  const text = clip(ctx.body.text, 2000).trim();
  need(text, 'Note cannot be empty');
  await q(
    `INSERT INTO messages (client_id, conversation_id, direction, kind, body, sender_user_id, sender_name, status)
     VALUES ($1,$2,'note','note',$3,$4,$5,'sent')`, [c.id, conv.id, text, ctx.user.id, ctx.user.name]);
  return { ok: true };
});

on('POST', '/portal/conversations/:id/assign', (u) => u.role !== 'agent' && inClient(u), async (ctx) => {
  const { c, conv, contact } = await conversationFor(ctx, ctx.params.id);
  let agentId = null; let agentName = 'Unassigned';
  if (ctx.body.agent_id) {
    need(isUuid(ctx.body.agent_id), 'Invalid agent');
    const [a] = await q(`SELECT id, name FROM users WHERE id = $1 AND client_id = $2 AND status = 'active'`, [ctx.body.agent_id, c.id]);
    need(a, 'Agent not found', 404);
    agentId = a.id; agentName = a.name;
  }
  await q('UPDATE conversations SET agent_id = $1 WHERE id = $2', [agentId, conv.id]);
  await q('UPDATE contacts SET agent_id = $1, updated_at = now() WHERE id = $2', [agentId, contact.id]);
  await q(
    `INSERT INTO messages (client_id, conversation_id, direction, kind, body, status)
     VALUES ($1,$2,'system','system',$3,'sent')`,
    [c.id, conv.id, `${ctx.user.name} transferred this chat to ${agentName}`]);
  return { ok: true };
});

on('POST', '/portal/conversations/:id/status', inClient, async (ctx) => {
  const { conv } = await conversationFor(ctx, ctx.params.id);
  need(['live', 'history'].includes(ctx.body.status), 'Invalid status');
  await q('UPDATE conversations SET status = $1, bot_active = $2 WHERE id = $3',
    [ctx.body.status, ctx.body.status === 'history' ? true : false, conv.id]);
  return { ok: true };
});

// Start a chat with a number using an approved template (New Msg).
on('POST', '/portal/conversations', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  const phone = meta.normalizePhone(ctx.body.phone);
  need(/^\d{8,15}$/.test(phone), 'Enter a valid mobile number with country code');
  const [existing] = await q('SELECT id FROM contacts WHERE client_id = $1 AND phone = $2', [c.id, phone]);
  let contactId = existing?.id;
  if (!contactId) {
    const [k] = await q(
      `INSERT INTO contacts (client_id, phone, name, source, agent_id) VALUES ($1,$2,$3,'manual',$4) RETURNING id`,
      [c.id, phone, str(ctx.body.name, 120) || null, ctx.user.role === 'agent' ? ctx.user.id : null]);
    contactId = k.id;
  }
  const channel = await connectedChannel(c.id);
  const [conv] = await q(
    `INSERT INTO conversations (client_id, contact_id, channel_id, agent_id)
     VALUES ($1,$2,$3,(SELECT agent_id FROM contacts WHERE id = $2))
     ON CONFLICT (client_id, contact_id) DO UPDATE SET status = 'live' RETURNING id`, [c.id, contactId, channel?.id || null]);
  return { id: conv.id };
});

// ---- templates ------------------------------------------------------------
const CATS = ['marketing', 'utility', 'authentication'];
on('GET', '/portal/templates', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  const p = [c.id];
  let where = 'client_id = $1';
  if (ctx.query.status) { p.push(ctx.query.status); where += ` AND status = $${p.length}`; }
  if (ctx.query.q) { p.push(`%${clip(ctx.query.q, 40)}%`); where += ` AND name ILIKE $${p.length}`; }
  return { templates: await q(`SELECT * FROM templates WHERE ${where} ORDER BY created_at DESC LIMIT 300`, p) };
});

on('POST', '/portal/templates', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const { body } = ctx;
  const name = str(body.name, 60).toLowerCase();
  need(/^[a-z0-9_]{1,60}$/.test(name), 'Name can only have lowercase letters, numbers and underscore');
  need(CATS.includes(body.category), 'Choose a category');
  const text = clip(body.body, 1024).trim();
  need(text, 'Message body is required');
  const buttons = (Array.isArray(body.buttons) ? body.buttons : []).slice(0, 3).map((b) => ({
    type: b.type === 'url' ? 'url' : 'quick_reply', text: clip(b.text, 25), url: b.type === 'url' ? clip(b.url, 2000) : undefined,
  })).filter((b) => b.text && (b.type !== 'url' || /^https?:\/\//.test(b.url || '')));
  const language = str(body.language, 10) || 'en';
  const [dup] = await q('SELECT 1 FROM templates WHERE client_id = $1 AND name = $2 AND language = $3', [c.id, name, language]);
  need(!dup, 'A template with this name and language already exists', 409);
  const channel = await connectedChannel(c.id, body.channel_id);
  const tpl = {
    name, category: body.category, language, header_text: str(body.header_text, 60) || null, body: text,
    footer: str(body.footer, 60) || null, buttons,
  };
  let status = 'draft'; let metaId = null; let note = null;
  if (body.submit !== false && channel?.waba_id) {
    try {
      const r = await meta.createTemplate(channel, tpl);
      status = 'in_review'; metaId = r.id;
    } catch (e) { note = clip(e.message, 300); }
  }
  const [t] = await q(
    `INSERT INTO templates (client_id, channel_id, name, category, language, header_text, body, footer, buttons, status, meta_template_id, rejection_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [c.id, channel?.id || null, name, tpl.category, language, tpl.header_text, text, tpl.footer, JSON.stringify(buttons), status, metaId, note]);
  return { template: t, submitted: status === 'in_review', warning: note };
});

on('POST', '/portal/templates/sync', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const channel = await connectedChannel(c.id);
  need(channel, 'No connected WhatsApp channel');
  let list;
  try { list = await meta.listTemplates(channel); } catch (e) { need(false, e.message); }
  const map = { APPROVED: 'approved', REJECTED: 'rejected', PENDING: 'in_review', PAUSED: 'paused', DISABLED: 'disabled' };
  let updated = 0;
  for (const m of list) {
    const st = map[String(m.status).toUpperCase()] || 'in_review';
    const r = await q(
      `UPDATE templates SET status = $1, quality = $2, rejection_reason = $3, meta_template_id = $4
       WHERE client_id = $5 AND name = $6 AND language = $7 RETURNING id`,
      [st, m.quality_score?.score ? String(m.quality_score.score).toLowerCase() : null,
        m.rejected_reason && m.rejected_reason !== 'NONE' ? m.rejected_reason : null, m.id, c.id, m.name, m.language]);
    updated += r.length;
  }
  return { updated, total: list.length };
});

on('DELETE', '/portal/templates/:id', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Template not found', 404);
  await q('DELETE FROM templates WHERE id = $1 AND client_id = $2', [ctx.params.id, c.id]);
  return { ok: true };
});

// Manual status change for drafts (used in test mode before a channel is connected).
on('PATCH', '/portal/templates/:id', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Template not found', 404);
  need(['draft', 'in_review', 'approved', 'rejected', 'paused', 'disabled'].includes(ctx.body.status), 'Invalid status');
  need(isPlatform(ctx.user.role) || ctx.body.status === 'draft', 'Only Meta approval can change this status', 403);
  const [t] = await q('UPDATE templates SET status = $1 WHERE id = $2 AND client_id = $3 RETURNING *', [ctx.body.status, ctx.params.id, c.id]);
  need(t, 'Template not found', 404);
  return { template: t };
});

// ---- campaigns ------------------------------------------------------------
async function campaignCounts(ids) {
  if (!ids.length) return {};
  const rows = await q(
    `SELECT campaign_id,
            count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'sent')::int AS sent_only,
            count(*) FILTER (WHERE status = 'delivered')::int AS delivered_only,
            count(*) FILTER (WHERE status = 'read')::int AS seen,
            count(*) FILTER (WHERE status = 'failed')::int AS failed
     FROM campaign_messages WHERE campaign_id = ANY($1) GROUP BY campaign_id`, [ids]);
  return Object.fromEntries(rows.map((r) => [r.campaign_id, r]));
}

on('GET', '/portal/campaigns', (u) => seesAll(u) && inClient(u), async (ctx) => {
  const c = await portalClient(ctx);
  const rows = await q(
    `SELECT c.*, t.name AS template_name, ch.display_name AS channel_name FROM campaigns c
     LEFT JOIN templates t ON t.id = c.template_id LEFT JOIN channels ch ON ch.id = c.channel_id
     WHERE c.client_id = $1 ORDER BY c.created_at DESC LIMIT 200`, [c.id]);
  const counts = await campaignCounts(rows.map((r) => r.id));
  return {
    campaigns: rows.map((r) => {
      const k = counts[r.id] || { pending: 0, sent_only: 0, delivered_only: 0, seen: 0, failed: 0 };
      return { ...r, pending: k.pending, sent: k.sent_only, delivered: k.delivered_only, seen: k.seen, failed: k.failed };
    }),
  };
});

on('POST', '/portal/campaigns', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const { body } = ctx;
  const name = str(body.name, 120);
  need(name, 'Campaign name is required');
  need(isUuid(body.template_id), 'Choose a template');
  const [t] = await q(`SELECT * FROM templates WHERE id = $1 AND client_id = $2`, [body.template_id, c.id]);
  need(t, 'Template not found', 404);
  need(t.status === 'approved', 'Only approved templates can be sent');
  const channel = await connectedChannel(c.id, body.channel_id);
  need(channel, 'Connect a WhatsApp channel first');

  // audience: explicit label, explicit contact ids, or all contacts
  const p = [c.id];
  let where = 'client_id = $1 AND opted_out = false';
  if (body.label_id) {
    need(isUuid(body.label_id), 'Invalid label'); p.push(body.label_id);
    where += ` AND id IN (SELECT contact_id FROM contact_labels WHERE label_id = $${p.length})`;
  }
  if (Array.isArray(body.contact_ids) && body.contact_ids.length) {
    const ids = body.contact_ids.filter(isUuid).slice(0, 5000); p.push(ids);
    where += ` AND id = ANY($${p.length})`;
  }
  const contacts = await q(`SELECT id, phone, name FROM contacts WHERE ${where} LIMIT 20000`, p);
  need(contacts.length > 0, 'No contacts match this audience (opted-out contacts are skipped)');

  const { rate } = await rateFor(c.id, t.category);
  const need$ = rate * contacts.length;
  const balance = await getBalance(c.id);
  need(balance >= need$, `Wallet balance is too low. This campaign needs about ${need$.toFixed(2)} and you have ${balance.toFixed(2)}.`);

  const id = crypto.randomUUID();
  const vars = Array.isArray(body.variables) ? body.variables.map((v) => clip(v, 200)) : [];
  await q(
    `INSERT INTO campaigns (id, client_id, channel_id, template_id, name, category, status, variables, total, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'running',$7,$8,$9)`,
    [id, c.id, channel.id, t.id, name, t.category, JSON.stringify(vars), contacts.length, ctx.user.id]);
  for (let i = 0; i < contacts.length; i += 500) {
    const chunk = contacts.slice(i, i + 500);
    const values = []; const params = [id, c.id];
    chunk.forEach((k, idx) => {
      params.push(k.id, k.phone);
      values.push(`($1, $2, $${3 + idx * 2}, $${4 + idx * 2})`);
    });
    await q(`INSERT INTO campaign_messages (campaign_id, client_id, contact_id, phone) VALUES ${values.join(',')}`, params);
  }
  await audit(ctx.user, 'campaign_created', { entity: 'campaign', entityId: id, clientId: c.id, agencyId: c.agency_id, meta: { contacts: contacts.length }, ip: ctx.ip });
  return { id, total: contacts.length };
});

// Sends one batch. The browser calls this repeatedly until remaining is 0.
on('POST', '/portal/campaigns/:id/process', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Campaign not found', 404);
  const [camp] = await q('SELECT * FROM campaigns WHERE id = $1 AND client_id = $2', [ctx.params.id, c.id]);
  need(camp, 'Campaign not found', 404);
  if (camp.status !== 'running') return { remaining: 0, status: camp.status };
  const [tpl] = await q('SELECT * FROM templates WHERE id = $1', [camp.template_id]);
  const [channel] = await q('SELECT * FROM channels WHERE id = $1', [camp.channel_id]);
  const batch = await q(
    `SELECT m.id, m.phone, k.name FROM campaign_messages m LEFT JOIN contacts k ON k.id = m.contact_id
     WHERE m.campaign_id = $1 AND m.status = 'pending' ORDER BY m.id LIMIT 20`, [camp.id]);
  const { rate, metaCost } = await rateFor(c.id, camp.category);
  let stopped = null;
  for (const m of batch) {
    const bal = await debitWallet({ clientId: c.id, amount: rate, metaCost, reference: `campaign:${camp.id}`, note: camp.name });
    if (bal === null) { stopped = 'Wallet balance finished. Recharge and resume.'; break; }
    const vars = (camp.variables || []).map((v) => String(v).replace('{{name}}', m.name || ''));
    try {
      const waId = await meta.sendTemplate(channel, m.phone, tpl, vars);
      await q(`UPDATE campaign_messages SET status = 'sent', wa_message_id = $1, cost = $2, updated_at = now() WHERE id = $3`, [waId, rate, m.id]);
    } catch (e) {
      await q(`UPDATE campaign_messages SET status = 'failed', error = $1, updated_at = now() WHERE id = $2`, [clip(e.message, 300), m.id]);
      if (rate > 0) await creditWallet({ clientId: c.id, amount: rate, type: 'refund', reference: `campaign:${camp.id}`, note: 'Message failed' });
    }
  }
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM campaign_messages WHERE campaign_id = $1 AND status = 'pending'`, [camp.id]);
  let status = camp.status;
  if (stopped) { status = 'paused'; await q(`UPDATE campaigns SET status = 'paused' WHERE id = $1`, [camp.id]); }
  else if (n === 0) { status = 'completed'; await q(`UPDATE campaigns SET status = 'completed', completed_at = now() WHERE id = $1`, [camp.id]); }
  return { remaining: n, status, message: stopped };
});

on('POST', '/portal/campaigns/:id/resume', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Campaign not found', 404);
  const [camp] = await q(`UPDATE campaigns SET status = 'running' WHERE id = $1 AND client_id = $2 AND status = 'paused' RETURNING id`, [ctx.params.id, c.id]);
  need(camp, 'Campaign is not paused', 404);
  return { ok: true };
});

on('GET', '/portal/campaigns/:id/report', (u) => seesAll(u) && inClient(u), async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Campaign not found', 404);
  const [camp] = await q('SELECT * FROM campaigns WHERE id = $1 AND client_id = $2', [ctx.params.id, c.id]);
  need(camp, 'Campaign not found', 404);
  const rows = await q(
    `SELECT phone, status, error, updated_at FROM campaign_messages WHERE campaign_id = $1 ORDER BY status, phone LIMIT 20000`, [camp.id]);
  return { campaign: camp, rows };
});

// ---- automations ----------------------------------------------------------
const AUTO_TYPES = ['keyword_reply', 'welcome', 'out_of_office', 'ai_bot', 'feedback', 'quick_reply', 'auto_assign', 'icebreaker', 'keyword_alert', 'opt_out'];
const SINGLETON = ['welcome', 'out_of_office', 'ai_bot', 'auto_assign', 'opt_out', 'feedback', 'icebreaker'];

function cleanConfig(type, cfg = {}) {
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => clip(s, 60).trim()).filter(Boolean).slice(0, 30);
  switch (type) {
    case 'keyword_reply':
      return { keywords: list(cfg.keywords), match: cfg.match === 'exact' ? 'exact' : 'contains', reply: clip(cfg.reply, 1024) };
    case 'welcome': return { message: clip(cfg.message, 1024) };
    case 'out_of_office':
      return {
        message: clip(cfg.message, 1024), start: /^\d{2}:\d{2}$/.test(cfg.start) ? cfg.start : '09:00',
        end: /^\d{2}:\d{2}$/.test(cfg.end) ? cfg.end : '18:00',
        days: (Array.isArray(cfg.days) ? cfg.days : [1, 2, 3, 4, 5, 6]).map(Number).filter((d) => d >= 0 && d <= 6),
        tz_offset_min: Number.isFinite(Number(cfg.tz_offset_min)) ? Number(cfg.tz_offset_min) : 330,
      };
    case 'ai_bot':
      return { prompt: clip(cfg.prompt, 2000), business_info: clip(cfg.business_info, 6000), handoff_message: clip(cfg.handoff_message, 500) };
    case 'auto_assign': return { mode: cfg.mode === 'percentage' ? 'percentage' : 'round_robin' };
    case 'opt_out': return { keywords: list(cfg.keywords).length ? list(cfg.keywords) : ['stop', 'unsubscribe'], reply: clip(cfg.reply, 500) };
    case 'quick_reply': return { shortcut: clip(cfg.shortcut, 30), text: clip(cfg.text, 1024) };
    case 'feedback': return { message: clip(cfg.message, 1024) };
    case 'icebreaker': return { questions: list(cfg.questions).slice(0, 4) };
    case 'keyword_alert': return { keywords: list(cfg.keywords) };
    default: return {};
  }
}

on('GET', '/portal/automations', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  return { automations: await q('SELECT * FROM automations WHERE client_id = $1 ORDER BY created_at', [c.id]) };
});

on('POST', '/portal/automations', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const { body } = ctx;
  need(AUTO_TYPES.includes(body.type), 'Unknown automation type');
  if (SINGLETON.includes(body.type)) {
    const [dup] = await q('SELECT 1 FROM automations WHERE client_id = $1 AND type = $2', [c.id, body.type]);
    need(!dup, 'This automation already exists. Edit it instead.', 409);
  }
  const [a] = await q(
    `INSERT INTO automations (client_id, type, name, config, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [c.id, body.type, str(body.name, 80) || body.type.replace('_', ' '), JSON.stringify(cleanConfig(body.type, body.config)), body.enabled !== false]);
  return { automation: a };
});

on('PATCH', '/portal/automations/:id', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Automation not found', 404);
  const [cur] = await q('SELECT * FROM automations WHERE id = $1 AND client_id = $2', [ctx.params.id, c.id]);
  need(cur, 'Automation not found', 404);
  const [a] = await q(
    `UPDATE automations SET name = $1, config = $2, enabled = $3 WHERE id = $4 RETURNING *`,
    [ctx.body.name !== undefined ? str(ctx.body.name, 80) || cur.name : cur.name,
      JSON.stringify(ctx.body.config !== undefined ? cleanConfig(cur.type, ctx.body.config) : cur.config),
      ctx.body.enabled !== undefined ? !!ctx.body.enabled : cur.enabled, cur.id]);
  return { automation: a };
});

on('DELETE', '/portal/automations/:id', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Automation not found', 404);
  await q('DELETE FROM automations WHERE id = $1 AND client_id = $2', [ctx.params.id, c.id]);
  return { ok: true };
});

// ---- flows (button menus) -------------------------------------------------
function cleanNodes(nodes) {
  need(Array.isArray(nodes) && nodes.length > 0, 'Add at least one step');
  need(nodes.length <= 30, 'A flow can have up to 30 steps');
  const ids = new Set();
  const out = nodes.map((n, i) => {
    const id = clip(n.id || `n${i + 1}`, 30).replace(/[^a-zA-Z0-9_-]/g, '');
    need(id && !ids.has(id), 'Step IDs must be unique');
    ids.add(id);
    const text = clip(n.text, 1024).trim();
    need(text, `Step ${i + 1} needs a message`);
    const options = (Array.isArray(n.options) ? n.options : []).slice(0, 3)
      .map((o) => ({ title: clip(o.title, 20).trim(), next: o.next ? clip(o.next, 30) : '' })).filter((o) => o.title);
    return { id, text, options };
  });
  for (const n of out) for (const o of n.options) need(!o.next || ids.has(o.next), `Option "${o.title}" points to a missing step`);
  return out;
}

on('GET', '/portal/flows', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  return { flows: await q('SELECT * FROM flows WHERE client_id = $1 ORDER BY created_at DESC', [c.id]) };
});

on('POST', '/portal/flows', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const name = str(ctx.body.name, 80);
  need(name, 'Flow name is required');
  const [f] = await q(
    `INSERT INTO flows (client_id, name, trigger_keyword, nodes, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [c.id, name, str(ctx.body.trigger_keyword, 60) || null, JSON.stringify(cleanNodes(ctx.body.nodes)), ctx.body.enabled !== false]);
  return { flow: f };
});

on('PATCH', '/portal/flows/:id', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Flow not found', 404);
  const [cur] = await q('SELECT * FROM flows WHERE id = $1 AND client_id = $2', [ctx.params.id, c.id]);
  need(cur, 'Flow not found', 404);
  const [f] = await q(
    `UPDATE flows SET name = $1, trigger_keyword = $2, nodes = $3, enabled = $4 WHERE id = $5 RETURNING *`,
    [ctx.body.name !== undefined ? str(ctx.body.name, 80) || cur.name : cur.name,
      ctx.body.trigger_keyword !== undefined ? str(ctx.body.trigger_keyword, 60) || null : cur.trigger_keyword,
      JSON.stringify(ctx.body.nodes !== undefined ? cleanNodes(ctx.body.nodes) : cur.nodes),
      ctx.body.enabled !== undefined ? !!ctx.body.enabled : cur.enabled, cur.id]);
  return { flow: f };
});

on('DELETE', '/portal/flows/:id', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Flow not found', 404);
  await q('DELETE FROM flows WHERE id = $1 AND client_id = $2', [ctx.params.id, c.id]);
  return { ok: true };
});

// ---- workflows ------------------------------------------------------------
function cleanActions(actions) {
  need(Array.isArray(actions) && actions.length > 0, 'Add at least one action');
  return actions.slice(0, 10).map((a) => {
    if (a.type === 'send_text') { need(clip(a.text, 1024).trim(), 'Message text is required'); return { type: 'send_text', text: clip(a.text, 1024) }; }
    if (a.type === 'add_label') { need(isUuid(a.label_id), 'Choose a label'); return { type: 'add_label', label_id: a.label_id }; }
    if (a.type === 'assign_agent') { need(isUuid(a.user_id), 'Choose an agent'); return { type: 'assign_agent', user_id: a.user_id }; }
    need(false, 'Unknown action');
    return null;
  });
}

on('GET', '/portal/workflows', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  return { workflows: await q('SELECT * FROM workflows WHERE client_id = $1 ORDER BY created_at DESC', [c.id]) };
});

on('POST', '/portal/workflows', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const { body } = ctx;
  const name = str(body.name, 80);
  need(name, 'Workflow name is required');
  need(['new_contact', 'keyword', 'inbound_message'].includes(body.trigger), 'Choose a trigger');
  need(body.trigger !== 'keyword' || str(body.trigger_value, 60), 'Enter the keyword');
  const [w] = await q(
    `INSERT INTO workflows (client_id, name, trigger, trigger_value, actions, enabled) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [c.id, name, body.trigger, str(body.trigger_value, 60) || null, JSON.stringify(cleanActions(body.actions)), body.enabled !== false]);
  return { workflow: w };
});

on('PATCH', '/portal/workflows/:id', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Workflow not found', 404);
  need(ctx.body.enabled !== undefined, 'Nothing to update');
  const [w] = await q('UPDATE workflows SET enabled = $1 WHERE id = $2 AND client_id = $3 RETURNING *', [!!ctx.body.enabled, ctx.params.id, c.id]);
  need(w, 'Workflow not found', 404);
  return { workflow: w };
});

on('DELETE', '/portal/workflows/:id', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Workflow not found', 404);
  await q('DELETE FROM workflows WHERE id = $1 AND client_id = $2', [ctx.params.id, c.id]);
  return { ok: true };
});

on('GET', '/portal/workflows/logs', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  return { logs: await q('SELECT * FROM workflow_logs WHERE client_id = $1 ORDER BY created_at DESC LIMIT 200', [c.id]) };
});

// ---- reports --------------------------------------------------------------
on('GET', '/portal/reports/analytics', (u) => seesAll(u) && inClient(u), async (ctx) => {
  const c = await portalClient(ctx);
  const days = intIn(ctx.query.days, 30, 1, 90);
  const daily = await q(
    `SELECT date_trunc('day', created_at)::date AS day,
            count(*) FILTER (WHERE direction = 'out')::int AS sent,
            count(*) FILTER (WHERE direction = 'in')::int AS received
     FROM messages WHERE client_id = $1 AND created_at > now() - ($2 || ' days')::interval
     GROUP BY 1 ORDER BY 1`, [c.id, String(days)]);
  const [f] = await q(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status IN ('sent','delivered','read'))::int AS sent,
            count(*) FILTER (WHERE status IN ('delivered','read'))::int AS delivered,
            count(*) FILTER (WHERE status = 'read')::int AS seen,
            count(*) FILTER (WHERE status = 'failed')::int AS failed
     FROM campaign_messages WHERE client_id = $1 AND updated_at > now() - ($2 || ' days')::interval`, [c.id, String(days)]);
  const agents = await q(
    `SELECT u.id, u.name, u.role,
            (SELECT count(*) FROM contacts k WHERE k.agent_id = u.id)::int AS contacts,
            (SELECT count(*) FROM messages m WHERE m.sender_user_id = u.id AND m.direction = 'out'
               AND m.created_at > now() - ($2 || ' days')::interval)::int AS replies
     FROM users u WHERE u.client_id = $1 AND u.role IN ('agent','agent_head') ORDER BY replies DESC`, [c.id, String(days)]);
  const failures = await q(
    `SELECT COALESCE(error, 'Unknown') AS reason, count(*)::int AS count FROM campaign_messages
     WHERE client_id = $1 AND status = 'failed' GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, [c.id]);
  const [opt] = await q(`SELECT count(*) FILTER (WHERE opted_out)::int AS opted_out, count(*)::int AS total FROM contacts WHERE client_id = $1`, [c.id]);
  return { days, daily, funnel: f, agents, failures, contacts: opt };
});

on('GET', '/portal/reports/bot', (u) => seesAll(u) && inClient(u), async (ctx) => {
  const c = await portalClient(ctx);
  const [s] = await q(
    `SELECT count(*) FILTER (WHERE is_bot)::int AS bot_replies,
            count(*) FILTER (WHERE direction = 'out' AND NOT is_bot AND sender_user_id IS NOT NULL)::int AS human_replies,
            count(*) FILTER (WHERE direction = 'system' AND body LIKE 'Bot handed%')::int AS handoffs
     FROM messages WHERE client_id = $1 AND created_at > now() - interval '30 days'`, [c.id]);
  const [{ convs }] = await q(`SELECT count(*)::int AS convs FROM conversations WHERE client_id = $1`, [c.id]);
  const daily = await q(
    `SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS replies
     FROM messages WHERE client_id = $1 AND is_bot AND created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`, [c.id]);
  return { ...s, conversations: convs, daily };
});

// Short links (Reports > Short URL)
on('GET', '/portal/short-links', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  return { links: await q('SELECT * FROM short_links WHERE client_id = $1 ORDER BY created_at DESC LIMIT 200', [c.id]) };
});

on('POST', '/portal/short-links', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const target = str(ctx.body.target_url, 2000);
  need(/^https?:\/\/[^\s]+$/.test(target), 'Enter a full link starting with http:// or https://');
  const code = randomToken(5).replace(/[-_]/g, 'x').slice(0, 7);
  const [l] = await q(
    `INSERT INTO short_links (client_id, code, target_url, title) VALUES ($1,$2,$3,$4) RETURNING *`,
    [c.id, code, target, str(ctx.body.title, 80) || null]);
  return { link: l };
});

on('DELETE', '/portal/short-links/:id', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  need(isUuid(ctx.params.id), 'Link not found', 404);
  await q('DELETE FROM short_links WHERE id = $1 AND client_id = $2', [ctx.params.id, c.id]);
  return { ok: true };
});

// ---- API keys and integrations --------------------------------------------
on('GET', '/portal/api-keys', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const keys = await q(
    `SELECT id, prefix, active, created_at, revoked_at FROM api_keys WHERE client_id = $1 ORDER BY created_at DESC LIMIT 50`, [c.id]);
  return { keys };
});

// Creates a new key (revoking the previous active one). The full key is shown only once.
on('POST', '/portal/api-keys', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const key = `ar_${randomToken(30)}`;
  await q(`UPDATE api_keys SET active = false, revoked_at = now() WHERE client_id = $1 AND active = true`, [c.id]);
  await q(
    `INSERT INTO api_keys (client_id, prefix, key_hash, created_by) VALUES ($1,$2,$3,$4)`,
    [c.id, key.slice(0, 8), sha256(key), ctx.user.id]);
  await audit(ctx.user, 'api_key_generated', { entity: 'api_key', clientId: c.id, agencyId: c.agency_id, ip: ctx.ip });
  return { key };
});

on('DELETE', '/portal/api-keys', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  await q(`UPDATE api_keys SET active = false, revoked_at = now() WHERE client_id = $1 AND active = true`, [c.id]);
  await audit(ctx.user, 'api_key_revoked', { entity: 'api_key', clientId: c.id, agencyId: c.agency_id, ip: ctx.ip });
  return { ok: true };
});

on('GET', '/portal/integrations', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  return { integrations: await q('SELECT id, kind, enabled, created_at, config FROM integrations WHERE client_id = $1', [c.id]) };
});

on('PUT', '/portal/integrations/:kind', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const kind = clip(ctx.params.kind, 40).toLowerCase();
  need(/^[a-z0-9_-]+$/.test(kind), 'Invalid integration');
  const cfg = {};
  if (kind === 'webhook') {
    const url = str(ctx.body.config?.url, 500);
    need(/^https:\/\/[^\s]+$/.test(url), 'Webhook URL must start with https://');
    cfg.url = url;
  } else {
    for (const [k, v] of Object.entries(ctx.body.config || {}).slice(0, 10)) cfg[clip(k, 40)] = clip(v, 500);
  }
  const [i] = await q(
    `INSERT INTO integrations (client_id, kind, config, enabled) VALUES ($1,$2,$3,$4)
     ON CONFLICT (client_id, kind) DO UPDATE SET config = EXCLUDED.config, enabled = EXCLUDED.enabled RETURNING *`,
    [c.id, kind, JSON.stringify(cfg), ctx.body.enabled !== false]);
  return { integration: i };
});

on('DELETE', '/portal/integrations/:kind', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  await q('DELETE FROM integrations WHERE client_id = $1 AND kind = $2', [c.id, clip(ctx.params.kind, 40)]);
  return { ok: true };
});

// ---- wallet (client's own view) -------------------------------------------
on('GET', '/portal/wallet', adminOnly, async (ctx) => {
  const c = await portalClient(ctx);
  const [cl] = await q('SELECT wallet_balance, low_balance_alert FROM clients WHERE id = $1', [c.id]);
  const ledger = await q('SELECT * FROM wallet_ledger WHERE client_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100', [c.id]);
  const rates = await Promise.all(['marketing', 'utility', 'authentication', 'service'].map(async (cat) => ({
    category: cat, rate: (await rateFor(c.id, cat)).rate,
  })));
  const invoices = await q('SELECT * FROM invoices WHERE client_id = $1 ORDER BY created_at DESC LIMIT 50', [c.id]);
  return { balance: Number(cl.wallet_balance), low_balance_alert: Number(cl.low_balance_alert), ledger, rates, invoices };
});

// Agents list for pickers (name only).
on('GET', '/portal/agents', inClient, async (ctx) => {
  const c = await portalClient(ctx);
  const next = await pickAgent(c.id, { mode: 'round_robin' });
  const agents = await q(
    `SELECT id, name, role, status, dist_percent FROM users WHERE client_id = $1 AND role IN ('agent','agent_head','client_admin') AND status = 'active' ORDER BY name`, [c.id]);
  return { agents, next_agent: next?.id || null };
});
