// Public website form, public pricing, short-link redirect, WhatsApp webhook, and the X-Api-Key API (/v1).
import crypto from 'node:crypto';
import {
  q, need, isUuid, isEmail, str,
} from '../lib/core.js';
import { on } from '../lib/router.js';
import * as meta from '../lib/meta.js';
import { processInbound, applyStatus } from '../lib/engine.js';
import { rateFor, debitWallet, creditWallet } from '../lib/wallet.js';

const clip = (s, n) => String(s ?? '').slice(0, n);

// ---- website --------------------------------------------------------------
on('POST', '/public/lead', null, async ({ body }) => {
  need(!body.website, 'Thanks!'); // honeypot field: bots fill it, people do not see it
  const name = str(body.name, 120);
  const email = str(body.email, 254).toLowerCase();
  const phone = str(body.phone, 25);
  need(name, 'Please tell us your name');
  need(isEmail(email) || /^[0-9+\s-]{8,20}$/.test(phone), 'Enter a valid email or phone number');
  const [recent] = await q(
    `SELECT count(*)::int AS n FROM website_leads WHERE created_at > now() - interval '1 minute'`);
  need(recent.n < 20, 'Too many requests, please try again in a minute', 429);
  const [dup] = await q(
    `SELECT 1 FROM website_leads WHERE (lower(email) = $1 OR phone = $2) AND created_at > now() - interval '1 hour'`,
    [email || '-', phone || '-']);
  if (!dup) {
    await q(
      `INSERT INTO website_leads (name, email, phone, company, message) VALUES ($1,$2,$3,$4,$5)`,
      [name, email || null, phone || null, str(body.company, 160) || null, str(body.message, 1500) || null]);
  }
  return { ok: true };
});

on('GET', '/public/plans', null, async () => {
  const plans = await q(
    `SELECT id, name, monthly_fee, included_agents FROM plans WHERE status = 'active' ORDER BY monthly_fee`);
  return { plans };
});

on('GET', '/r/:code', null, async ({ params, res }) => {
  const [l] = await q(
    `UPDATE short_links SET clicks = clicks + 1 WHERE code = $1 RETURNING target_url`, [clip(params.code, 20)]);
  if (!l) { res.statusCode = 404; res.end('Link not found'); return undefined; }
  res.statusCode = 302;
  res.setHeader('Location', l.target_url);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
  return undefined;
});

// ---- WhatsApp webhook -----------------------------------------------------
on('GET', '/webhooks/whatsapp', null, async ({ query, res }) => {
  const expected = process.env.META_VERIFY_TOKEN;
  if (expected && query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === expected) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end(String(query['hub.challenge'] || ''));
    return undefined;
  }
  res.statusCode = 403;
  res.end('Forbidden');
  return undefined;
});

function validSignature(raw, header) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function extractInbound(m) {
  if (m.type === 'text') return { kind: 'text', text: m.text?.body };
  if (m.type === 'interactive') {
    const r = m.interactive?.button_reply || m.interactive?.list_reply;
    return { kind: 'text', text: r?.title, buttonId: r?.id };
  }
  if (m.type === 'button') return { kind: 'text', text: m.button?.text, buttonId: m.button?.payload };
  return { kind: m.type || 'message', text: m[m.type]?.caption || `[${m.type}]` };
}

async function notifyWebhook(clientId, payload) {
  const [i] = await q(`SELECT config FROM integrations WHERE client_id = $1 AND kind = 'webhook' AND enabled = true`, [clientId]);
  const url = i?.config?.url;
  if (!url || !/^https:\/\//.test(url)) return;
  try {
    await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(5000),
    });
  } catch { /* customer endpoint down: ignore */ }
}

on('POST', '/webhooks/whatsapp', null, async ({ raw, req, body, res }) => {
  if (!process.env.META_APP_SECRET) { res.statusCode = 503; res.end('Webhook is not configured'); return undefined; }
  if (!validSignature(raw, req.headers['x-hub-signature-256'])) { res.statusCode = 401; res.end('Bad signature'); return undefined; }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const phoneId = v.metadata?.phone_number_id;
      if (!phoneId) continue;
      const [channel] = await q(`SELECT * FROM channels WHERE phone_number_id = $1 AND status = 'connected'`, [phoneId]);
      if (!channel) continue;
      await q('UPDATE channels SET webhook_ok = true WHERE id = $1', [channel.id]);
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of v.messages || []) {
        try {
          const inb = extractInbound(m);
          await processInbound(channel, { from: m.from, name: names[m.from], waId: m.id, ...inb });
          await notifyWebhook(channel.client_id, { event: 'message', from: m.from, text: inb.text, id: m.id });
        } catch (e) { console.error('inbound error', e.message); }
      }
      for (const s of v.statuses || []) {
        try { await applyStatus(s.id, s.status, s.errors?.[0]?.title || s.errors?.[0]?.message); }
        catch (e) { console.error('status error', e.message); }
      }
    }
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end('{"ok":true}');
  return undefined;
});

// ---- public API (X-Api-Key) -----------------------------------------------
on('GET', '/v1/templates', 'apikey', async ({ apiClient }) => ({
  templates: await q(
    `SELECT id, name, category, language, status, body FROM templates WHERE client_id = $1 ORDER BY created_at DESC`, [apiClient.id]),
}));

on('GET', '/v1/contacts', 'apikey', async ({ apiClient, query }) => {
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 100, 1), 500);
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const p = [apiClient.id];
  let where = 'client_id = $1';
  if (query.from) { p.push(query.from); where += ` AND created_at >= $${p.length}::timestamptz`; }
  if (query.to) { p.push(query.to); where += ` AND created_at < $${p.length}::timestamptz`; }
  const contacts = await q(
    `SELECT phone, name, opted_out, created_at FROM contacts WHERE ${where}
     ORDER BY created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, p);
  return { contacts, page, limit };
});

on('POST', '/v1/contact-exists', 'apikey', async ({ apiClient, body }) => {
  const phone = meta.normalizePhone(body.phone);
  const [k] = await q('SELECT id FROM contacts WHERE client_id = $1 AND phone = $2', [apiClient.id, phone]);
  return { exists: !!k };
});

on('GET', '/v1/campaigns', 'apikey', async ({ apiClient }) => ({
  campaigns: await q(
    `SELECT id, name, status, category, total, created_at, completed_at FROM campaigns
     WHERE client_id = $1 ORDER BY created_at DESC LIMIT 100`, [apiClient.id]),
}));

on('GET', '/v1/campaigns/:id', 'apikey', async ({ apiClient, params }) => {
  need(isUuid(params.id), 'Campaign not found', 404);
  const [c] = await q('SELECT id, name, status, category, total, created_at FROM campaigns WHERE id = $1 AND client_id = $2', [params.id, apiClient.id]);
  need(c, 'Campaign not found', 404);
  const [s] = await q(
    `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'sent')::int AS sent,
            count(*) FILTER (WHERE status = 'delivered')::int AS delivered,
            count(*) FILTER (WHERE status = 'read')::int AS seen,
            count(*) FILTER (WHERE status = 'failed')::int AS failed
     FROM campaign_messages WHERE campaign_id = $1`, [c.id]);
  return { campaign: c, stats: s };
});

on('POST', '/v1/send-template', 'apikey', async ({ apiClient, body }) => {
  const phone = meta.normalizePhone(body.to);
  need(/^\d{8,15}$/.test(phone), 'Field "to" must be a mobile number with country code');
  const p = [apiClient.id];
  let where = `client_id = $1 AND status = 'approved'`;
  if (body.template_id) { need(isUuid(body.template_id), 'Invalid template_id'); p.push(body.template_id); where += ` AND id = $2`; }
  else { need(body.template_name, 'Send template_id or template_name'); p.push(String(body.template_name)); where += ` AND name = $2`; }
  const [t] = await q(`SELECT * FROM templates WHERE ${where} LIMIT 1`, p);
  need(t, 'Approved template not found', 404);
  const [channel] = await q(`SELECT * FROM channels WHERE client_id = $1 AND type = 'whatsapp' AND status = 'connected' LIMIT 1`, [apiClient.id]);
  need(channel, 'No connected WhatsApp channel');
  const [contact] = await q(
    `INSERT INTO contacts (client_id, channel_id, phone, name, source) VALUES ($1,$2,$3,$4,'api')
     ON CONFLICT (client_id, phone) DO UPDATE SET updated_at = now() RETURNING *`,
    [apiClient.id, channel.id, phone, str(body.name, 120) || null]);
  need(!contact.opted_out, 'This contact has opted out of messages', 409);
  const [conv] = await q(
    `INSERT INTO conversations (client_id, contact_id, channel_id, agent_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (client_id, contact_id) DO UPDATE SET last_message_at = now() RETURNING *`,
    [apiClient.id, contact.id, channel.id, contact.agent_id]);
  const { rate, metaCost } = await rateFor(apiClient.id, t.category);
  const bal = await debitWallet({ clientId: apiClient.id, amount: rate, metaCost, reference: `api:${t.id}`, note: `API: ${t.name}` });
  need(bal !== null, 'Wallet balance is too low', 402);
  const vars = Array.isArray(body.variables) ? body.variables.map((v) => clip(v, 200)) : [];
  let waId = null; let status = 'sent'; let error = null;
  try { waId = await meta.sendTemplate(channel, phone, t, vars); }
  catch (e) {
    status = 'failed'; error = clip(e.message, 300);
    if (rate > 0) await creditWallet({ clientId: apiClient.id, amount: rate, type: 'refund', reference: `api:${t.id}`, note: 'Send failed' });
  }
  await q(
    `INSERT INTO messages (client_id, conversation_id, direction, kind, body, sender_name, status, wa_message_id, error)
     VALUES ($1,$2,'out','template',$3,'API',$4,$5,$6)`,
    [apiClient.id, conv.id, t.body.replace(/\{\{(\d+)\}\}/g, (_, i) => vars[Number(i) - 1] ?? ''), status, waId, error]);
  await q('UPDATE conversations SET last_message_at = now(), last_message_preview = $1 WHERE id = $2', [clip(t.body, 120), conv.id]);
  need(status === 'sent', error || 'Could not send', 502);
  return { ok: true, message_id: waId };
});
