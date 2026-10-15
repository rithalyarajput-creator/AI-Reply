// Thin client for the WhatsApp Business Cloud API (Meta Graph API).
import { decrypt } from './core.js';

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v21.0'}`;

export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  const cc = process.env.DEFAULT_COUNTRY_CODE || '91';
  if (d.length === 10) d = cc + d;
  return d;
}

export class MetaError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function graph(path, { token, method = 'POST', body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  let res;
  try {
    res = await fetch(`${GRAPH}${path}${qs}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new MetaError(`Could not reach WhatsApp: ${e.message}`);
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok || data.error) {
    throw new MetaError(data.error?.error_user_msg || data.error?.message || `WhatsApp API error (${res.status})`, data.error?.code);
  }
  return data;
}

const tokenOf = (channel) => {
  if (!channel?.token_enc) throw new MetaError('This channel has no access token');
  return decrypt(channel.token_enc);
};

function assertSendable(channel) {
  if (!channel || channel.type !== 'whatsapp') throw new MetaError('No WhatsApp channel connected');
  if (channel.status !== 'connected') throw new MetaError('WhatsApp channel is not connected');
  if (!channel.phone_number_id) throw new MetaError('Channel is missing the phone number ID');
}

export async function sendText(channel, to, text) {
  assertSendable(channel);
  const d = await graph(`/${channel.phone_number_id}/messages`, {
    token: tokenOf(channel),
    body: { messaging_product: 'whatsapp', to: normalizePhone(to), type: 'text', text: { body: String(text).slice(0, 4096), preview_url: true } },
  });
  return d.messages?.[0]?.id || null;
}

// options: [{ id, title }] up to 3 reply buttons
export async function sendButtons(channel, to, text, options) {
  assertSendable(channel);
  const d = await graph(`/${channel.phone_number_id}/messages`, {
    token: tokenOf(channel),
    body: {
      messaging_product: 'whatsapp', to: normalizePhone(to), type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: String(text).slice(0, 1024) },
        action: {
          buttons: options.slice(0, 3).map((o) => ({ type: 'reply', reply: { id: String(o.id).slice(0, 256), title: String(o.title).slice(0, 20) } })),
        },
      },
    },
  });
  return d.messages?.[0]?.id || null;
}

export function templateComponents(variables = []) {
  const vars = variables.filter((v) => v !== undefined && v !== null && String(v) !== '');
  if (!vars.length) return [];
  return [{ type: 'body', parameters: vars.map((v) => ({ type: 'text', text: String(v).slice(0, 1024) })) }];
}

export async function sendTemplate(channel, to, template, variables = []) {
  assertSendable(channel);
  const d = await graph(`/${channel.phone_number_id}/messages`, {
    token: tokenOf(channel),
    body: {
      messaging_product: 'whatsapp', to: normalizePhone(to), type: 'template',
      template: { name: template.name, language: { code: template.language || 'en' }, components: templateComponents(variables) },
    },
  });
  return d.messages?.[0]?.id || null;
}

function buildTemplatePayload(t) {
  const components = [];
  if (t.header_text) components.push({ type: 'HEADER', format: 'TEXT', text: t.header_text });
  const bodyComp = { type: 'BODY', text: t.body };
  const count = (t.body.match(/\{\{\d+\}\}/g) || []).length;
  if (count) bodyComp.example = { body_text: [Array.from({ length: count }, (_, i) => `Sample${i + 1}`)] };
  components.push(bodyComp);
  if (t.footer) components.push({ type: 'FOOTER', text: t.footer });
  const buttons = (t.buttons || []).map((b) =>
    b.type === 'url'
      ? { type: 'URL', text: b.text, url: b.url }
      : { type: 'QUICK_REPLY', text: b.text });
  if (buttons.length) components.push({ type: 'BUTTONS', buttons });
  return { name: t.name, language: t.language || 'en', category: String(t.category).toUpperCase(), components };
}

export async function createTemplate(channel, t) {
  if (!channel?.waba_id) throw new MetaError('Channel is missing the WhatsApp Business Account ID');
  const d = await graph(`/${channel.waba_id}/message_templates`, { token: tokenOf(channel), body: buildTemplatePayload(t) });
  return { id: d.id, status: String(d.status || 'PENDING').toLowerCase() };
}

export async function listTemplates(channel) {
  if (!channel?.waba_id) throw new MetaError('Channel is missing the WhatsApp Business Account ID');
  const d = await graph(`/${channel.waba_id}/message_templates`, {
    token: tokenOf(channel), method: 'GET', query: { limit: '200', fields: 'id,name,language,status,category,quality_score,rejected_reason' },
  });
  return d.data || [];
}

const MAX_MEDIA = 4_000_000; // Vercel responses are limited to about 4.5 MB

// Downloads a customer's media through the client's own token. Nothing is stored on our side.
export async function fetchMedia(channel, mediaId) {
  const token = tokenOf(channel);
  const info = await graph(`/${mediaId}`, { token, method: 'GET' });
  if (!info.url) throw new MetaError('This file is no longer available on WhatsApp');
  if (info.file_size && Number(info.file_size) > MAX_MEDIA) {
    throw new MetaError('This file is too large to preview here. Open it on the phone or in WhatsApp Web.');
  }
  let res;
  try {
    res = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new MetaError(`Could not download the file: ${e.message}`);
  }
  if (!res.ok) throw new MetaError(`File download failed (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_MEDIA) throw new MetaError('This file is too large to preview here.');
  return { buffer, mime: info.mime_type || res.headers.get('content-type') || 'application/octet-stream' };
}

export async function fetchPhoneInfo(channel) {
  const d = await graph(`/${channel.phone_number_id}`, {
    token: tokenOf(channel), method: 'GET',
    query: { fields: 'display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status' },
  });
  return d;
}

// Verifies a token + phone number ID before we save the channel.
export async function probeCredentials({ phoneNumberId, token }) {
  const d = await graph(`/${phoneNumberId}`, {
    token, method: 'GET',
    query: { fields: 'display_phone_number,verified_name,quality_rating,messaging_limit_tier' },
  });
  return d;
}
