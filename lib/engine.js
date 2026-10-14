// Conversation engine: stores inbound messages and runs automations
// (opt-out, auto-assign, welcome, flows, keyword reply, out-of-office, AI bot, workflows).
import { q } from './core.js';
import * as meta from './meta.js';
import { rateFor, debitWallet, creditWallet } from './wallet.js';

const clip = (s, n = 200) => String(s ?? '').slice(0, n);

// ---- outbound -------------------------------------------------------------
// Sends free text (or reply buttons) inside an open conversation and records it.
export async function sendReply({ channel, conv, contact, text, buttons, user, isBot = false, kind = 'text' }) {
  let waId = null;
  let status = 'sent';
  let error = null;
  try {
    waId = buttons?.length
      ? await meta.sendButtons(channel, contact.phone, text, buttons)
      : await meta.sendText(channel, contact.phone, text);
  } catch (e) {
    status = 'failed';
    error = clip(e.message, 300);
  }
  const [m] = await q(
    `INSERT INTO messages (client_id, conversation_id, direction, kind, body, sender_user_id, sender_name, is_bot, status, wa_message_id, error)
     VALUES ($1,$2,'out',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [conv.client_id, conv.id, kind, text, user?.id || null, isBot ? 'Bot' : user?.name || 'System', isBot, status, waId, error]);
  await q(
    `UPDATE conversations SET last_message_at = now(), last_message_preview = $1 WHERE id = $2`,
    [clip(text, 120), conv.id]);
  if (status === 'sent') {
    const { rate, metaCost } = await rateFor(conv.client_id, 'service');
    if (rate > 0) await debitWallet({ clientId: conv.client_id, amount: rate, metaCost, reference: `msg:${m.id}`, note: 'Service message' });
  }
  return m;
}

async function systemNote(conv, text) {
  await q(
    `INSERT INTO messages (client_id, conversation_id, direction, kind, body, status) VALUES ($1,$2,'system','system',$3,'sent')`,
    [conv.client_id, conv.id, text]);
}

// ---- assignment -----------------------------------------------------------
export async function pickAgent(clientId, { mode } = {}) {
  const agents = await q(
    `SELECT u.id, u.name, u.dist_percent,
            (SELECT count(*) FROM contacts c WHERE c.client_id = u.client_id AND c.agent_id = u.id)::int AS assigned
     FROM users u WHERE u.client_id = $1 AND u.status = 'active' AND u.role IN ('agent','agent_head')`, [clientId]);
  if (!agents.length) return null;
  const weighted = agents.filter((a) => a.dist_percent > 0);
  if (weighted.length) {
    const total = weighted.reduce((s, a) => s + a.assigned, 0) + 1;
    weighted.sort((a, b) => (b.dist_percent / 100 - b.assigned / total) - (a.dist_percent / 100 - a.assigned / total));
    return weighted[0];
  }
  if (mode === 'round_robin') {
    agents.sort((a, b) => a.assigned - b.assigned);
    return agents[0];
  }
  return null;
}

async function autoAssign(conv, contact, autos) {
  if (conv.agent_id) return;
  const rule = autos.find((a) => a.type === 'auto_assign' && a.enabled);
  const agent = await pickAgent(conv.client_id, { mode: rule ? rule.config?.mode || 'round_robin' : undefined });
  if (!agent) return;
  await q('UPDATE contacts SET agent_id = $1, updated_at = now() WHERE id = $2', [agent.id, contact.id]);
  await q('UPDATE conversations SET agent_id = $1 WHERE id = $2', [agent.id, conv.id]);
  conv.agent_id = agent.id;
  await systemNote(conv, `Auto assigned to ${agent.name}`);
}

// ---- automation helpers ---------------------------------------------------
function keywordMatch(text, keywords, mode = 'contains') {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  return (keywords || []).some((k) => {
    const kw = String(k).trim().toLowerCase();
    if (!kw) return false;
    return mode === 'exact' ? t === kw : t.includes(kw);
  });
}

export function withinBusinessHours(cfg = {}, now = new Date()) {
  const offset = Number.isFinite(cfg.tz_offset_min) ? cfg.tz_offset_min : 330;
  const local = new Date(now.getTime() + offset * 60000);
  const day = local.getUTCDay();
  const days = cfg.days?.length ? cfg.days : [1, 2, 3, 4, 5, 6];
  if (!days.includes(day)) return false;
  const [sh, sm] = String(cfg.start || '09:00').split(':').map(Number);
  const [eh, em] = String(cfg.end || '18:00').split(':').map(Number);
  const mins = local.getUTCHours() * 60 + local.getUTCMinutes();
  return mins >= sh * 60 + (sm || 0) && mins < eh * 60 + (em || 0);
}

async function sendFlowNode(ctx, flow, node) {
  if (!node) return false;
  const options = (node.options || []).slice(0, 3).map((o) => ({
    id: `flow:${flow.id}:${o.next || 'end'}`, title: o.title,
  }));
  await sendReply({ ...ctx, text: node.text, buttons: options.length ? options : undefined, isBot: true });
  return true;
}

async function runFlows(ctx, msg, flows) {
  if (msg.buttonId?.startsWith('flow:')) {
    const [, flowId, nodeId] = msg.buttonId.split(':');
    const flow = flows.find((f) => f.id === flowId);
    if (!flow || nodeId === 'end') return !!flow;
    return sendFlowNode(ctx, flow, (flow.nodes || []).find((n) => n.id === nodeId));
  }
  const flow = flows.find((f) => f.trigger_keyword && keywordMatch(msg.text, [f.trigger_keyword], 'contains'));
  if (!flow) return false;
  return sendFlowNode(ctx, flow, (flow.nodes || [])[0]);
}

async function aiReply(ctx, cfg, clientName) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const rows = await q(
    `SELECT direction, body FROM messages WHERE conversation_id = $1 AND direction IN ('in','out') AND body IS NOT NULL
     ORDER BY created_at DESC LIMIT 12`, [ctx.conv.id]);
  const history = [];
  for (const r of rows.reverse()) {
    const role = r.direction === 'in' ? 'user' : 'assistant';
    if (history.length && history[history.length - 1].role === role) history[history.length - 1].content += `\n${r.body}`;
    else history.push({ role, content: r.body });
  }
  while (history.length && history[0].role !== 'user') history.shift();
  if (!history.length || history[history.length - 1].role !== 'user') return null;

  const system = [
    `You are the WhatsApp customer support assistant for ${clientName}.`,
    cfg.prompt || '',
    cfg.business_info ? `Business information:\n${cfg.business_info}` : '',
    'Reply briefly and in the customer\'s language. Never invent prices, policies or facts that are not in the information above.',
    'If you cannot help, or the customer asks for a person, reply with exactly: [HANDOFF]',
  ].filter(Boolean).join('\n\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model || process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      max_tokens: 400, system, messages: history,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return String(data.content?.[0]?.text || '').trim() || null;
}

async function runWorkflows(ctx, msg, isNew, workflows) {
  for (const wf of workflows) {
    const hit =
      wf.trigger === 'inbound_message' ||
      (wf.trigger === 'new_contact' && isNew) ||
      (wf.trigger === 'keyword' && keywordMatch(msg.text, [wf.trigger_value], 'contains'));
    if (!hit) continue;
    for (const act of wf.actions || []) {
      let result = 'ok';
      let detail = act.type;
      try {
        if (act.type === 'send_text' && act.text) {
          await sendReply({ ...ctx, text: act.text, isBot: true });
        } else if (act.type === 'add_label' && act.label_id) {
          await q(
            `INSERT INTO contact_labels (contact_id, label_id)
             SELECT $1, id FROM labels WHERE id = $2 AND client_id = $3 ON CONFLICT DO NOTHING`,
            [ctx.contact.id, act.label_id, ctx.conv.client_id]);
        } else if (act.type === 'assign_agent' && act.user_id) {
          const [u] = await q('SELECT id FROM users WHERE id = $1 AND client_id = $2 AND status = $3',
            [act.user_id, ctx.conv.client_id, 'active']);
          if (u) {
            await q('UPDATE contacts SET agent_id = $1 WHERE id = $2', [u.id, ctx.contact.id]);
            await q('UPDATE conversations SET agent_id = $1 WHERE id = $2', [u.id, ctx.conv.id]);
          } else { result = 'skipped'; detail = 'agent not found'; }
        } else { result = 'skipped'; detail = `unknown action ${act.type}`; }
      } catch (e) { result = 'error'; detail = clip(e.message, 200); }
      await q(
        `INSERT INTO workflow_logs (client_id, workflow_id, workflow_name, contact_phone, result, detail)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [ctx.conv.client_id, wf.id, wf.name, ctx.contact.phone, result, detail]);
    }
  }
}

// ---- inbound --------------------------------------------------------------
export async function processInbound(channel, msg) {
  const clientId = channel.client_id;
  const phone = meta.normalizePhone(msg.from);
  if (msg.waId) {
    const [dup] = await q('SELECT 1 FROM messages WHERE client_id = $1 AND wa_message_id = $2', [clientId, msg.waId]);
    if (dup) return { duplicate: true };
  }

  let [contact] = await q('SELECT * FROM contacts WHERE client_id = $1 AND phone = $2', [clientId, phone]);
  const isNew = !contact;
  if (!contact) {
    [contact] = await q(
      `INSERT INTO contacts (client_id, channel_id, phone, name, source) VALUES ($1,$2,$3,$4,'whatsapp') RETURNING *`,
      [clientId, channel.id, phone, msg.name || null]);
  } else if (msg.name && !contact.name) {
    await q('UPDATE contacts SET name = $1, updated_at = now() WHERE id = $2', [msg.name, contact.id]);
    contact.name = msg.name;
  }

  let [conv] = await q('SELECT * FROM conversations WHERE client_id = $1 AND contact_id = $2', [clientId, contact.id]);
  if (!conv) {
    [conv] = await q(
      `INSERT INTO conversations (client_id, contact_id, channel_id, agent_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [clientId, contact.id, channel.id, contact.agent_id]);
  }
  await q(
    `INSERT INTO messages (client_id, conversation_id, direction, kind, body, sender_name, status, wa_message_id)
     VALUES ($1,$2,'in',$3,$4,$5,'received',$6)`,
    [clientId, conv.id, msg.kind || 'text', clip(msg.text || `[${msg.kind || 'message'}]`, 4096), contact.name || phone, msg.waId || null]);
  await q(
    `UPDATE conversations SET status = 'live', unread = unread + 1, last_inbound_at = now(),
            last_message_at = now(), last_message_preview = $1 WHERE id = $2`,
    [clip(msg.text || `[${msg.kind || 'message'}]`, 120), conv.id]);

  const autos = await q('SELECT * FROM automations WHERE client_id = $1 AND enabled = true', [clientId]);
  const ctx = { channel, conv, contact };

  // opt-out always wins
  const optOut = autos.find((a) => a.type === 'opt_out');
  const optKeywords = optOut?.config?.keywords?.length ? optOut.config.keywords : ['stop', 'unsubscribe'];
  if (keywordMatch(msg.text, optKeywords, 'exact')) {
    await q('UPDATE contacts SET opted_out = true, updated_at = now() WHERE id = $1', [contact.id]);
    await systemNote(conv, 'Customer opted out of messages');
    const reply = optOut?.config?.reply || 'You have been unsubscribed and will not receive further messages.';
    await sendReply({ ...ctx, text: reply, isBot: true });
    return { optedOut: true };
  }

  await autoAssign(conv, contact, autos);

  let replied = false;
  try {
    const flows = await q('SELECT * FROM flows WHERE client_id = $1 AND enabled = true', [clientId]);
    replied = await runFlows(ctx, msg, flows);
  } catch (e) { console.error('flow error', e.message); }

  if (!replied) {
    for (const a of autos.filter((x) => x.type === 'keyword_reply')) {
      if (keywordMatch(msg.text, a.config?.keywords, a.config?.match) && a.config?.reply) {
        await sendReply({ ...ctx, text: a.config.reply, isBot: true });
        replied = true;
        break;
      }
    }
  }

  // Outside business hours the out-of-office message replaces the welcome message.
  const ooo = autos.find((a) => a.type === 'out_of_office');
  const closed = !!ooo?.config?.message && !withinBusinessHours(ooo.config);
  if (!replied && closed) {
    const [recent] = await q(
      `SELECT 1 FROM messages WHERE conversation_id = $1 AND kind = 'ooo' AND created_at > now() - interval '12 hours'`, [conv.id]);
    if (!recent) {
      await sendReply({ ...ctx, text: ooo.config.message, isBot: true, kind: 'ooo' });
      replied = true;
    }
  }

  const welcome = autos.find((a) => a.type === 'welcome');
  if (!replied && !closed && isNew && welcome?.config?.message) {
    await sendReply({ ...ctx, text: welcome.config.message, isBot: true });
    replied = true;
  }

  const bot = autos.find((a) => a.type === 'ai_bot');
  if (!replied && bot && conv.bot_active && msg.text) {
    try {
      const [client] = await q('SELECT company_name FROM clients WHERE id = $1', [clientId]);
      const answer = await aiReply(ctx, bot.config || {}, client?.company_name || 'the business');
      if (answer && answer.includes('[HANDOFF]')) {
        await q('UPDATE conversations SET bot_active = false WHERE id = $1', [conv.id]);
        await systemNote(conv, 'Bot handed this chat to a human agent');
        if (bot.config?.handoff_message) await sendReply({ ...ctx, text: bot.config.handoff_message, isBot: true });
      } else if (answer) {
        await sendReply({ ...ctx, text: answer, isBot: true });
      }
    } catch (e) { console.error('bot error', e.message); }
  }

  try {
    const workflows = await q('SELECT * FROM workflows WHERE client_id = $1 AND enabled = true', [clientId]);
    await runWorkflows(ctx, msg, isNew, workflows);
  } catch (e) { console.error('workflow error', e.message); }

  return { ok: true, isNew };
}

// ---- delivery status updates ----------------------------------------------
const RANK = { pending: 0, sent: 1, delivered: 2, read: 3 };

export async function applyStatus(waId, status, errorText) {
  if (!waId) return;
  const st = ['sent', 'delivered', 'read', 'failed'].includes(status) ? status : null;
  if (!st) return;
  await q(
    `UPDATE messages SET status = $1, error = COALESCE($2, error) WHERE wa_message_id = $3
       AND (status NOT IN ('read','failed') OR $1 = 'failed')`, [st, errorText || null, waId]);
  const [cm] = await q('SELECT * FROM campaign_messages WHERE wa_message_id = $1', [waId]);
  if (!cm) return;
  if (st === 'failed') {
    if (cm.status !== 'failed') {
      await q(`UPDATE campaign_messages SET status = 'failed', error = $1, updated_at = now() WHERE id = $2`,
        [errorText || 'Failed', cm.id]);
      if (Number(cm.cost) > 0) {
        await creditWallet({ clientId: cm.client_id, amount: cm.cost, type: 'refund', reference: `campaign:${cm.campaign_id}`, note: 'Message failed' });
        await q('UPDATE campaign_messages SET cost = 0 WHERE id = $1', [cm.id]);
      }
    }
    return;
  }
  if ((RANK[st] ?? 0) > (RANK[cm.status] ?? 0)) {
    await q('UPDATE campaign_messages SET status = $1, updated_at = now() WHERE id = $2', [st, cm.id]);
  }
}
