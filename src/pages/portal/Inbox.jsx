import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import Icon from '../../components/Icon.jsx';
import {
  Badge, Err, Field, Modal,
} from '../../components/ui.jsx';

const timeOf = (d) => {
  const dt = new Date(d);
  const today = new Date();
  return dt.toDateString() === today.toDateString()
    ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : dt.toLocaleDateString([], { day: '2-digit', month: 'short' });
};
const initialsOf = (s) => (s || '?').replace(/[^a-zA-Z0-9 ]/g, '').split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '#';

function NewChat({ templates, onClose, onOpen }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [tpl, setTpl] = useState('');
  const [vars, setVars] = useState('');
  const [error, setError] = useState('');
  const go = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const c = await api('/portal/conversations', { method: 'POST', body: { phone, name } });
      if (tpl) {
        await api(`/portal/conversations/${c.id}/template`, {
          method: 'POST', body: { template_id: tpl, variables: vars.split('|').map((v) => v.trim()).filter(Boolean) },
        });
      }
      onOpen(c.id);
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal title="New message" onClose={onClose}>
      <form onSubmit={go}>
        <Field label="Mobile number (with country code)"><input value={phone} onChange={(e) => setPhone(e.target.value)} required /></Field>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Opening template (needed to start a new chat)">
          <select value={tpl} onChange={(e) => setTpl(e.target.value)}>
            <option value="">Do not send now</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        {tpl && <Field label="Template variables (separate with |)"><input value={vars} onChange={(e) => setVars(e.target.value)} /></Field>}
        <Err error={error} />
        <div className="row">
          <button className="btn">Start chat</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function ChatIllustration() {
  return (
    <svg viewBox="0 0 220 180" width="220" height="180" aria-hidden="true">
      <circle cx="110" cy="90" r="78" fill="#E6F3F4" />
      <rect x="70" y="40" width="80" height="100" rx="14" fill="#fff" stroke="#6FB3B8" strokeWidth="3" />
      <rect x="80" y="56" width="46" height="12" rx="6" fill="#BADFE7" />
      <rect x="94" y="76" width="46" height="12" rx="6" fill="#C2EDCE" />
      <rect x="80" y="96" width="38" height="12" rx="6" fill="#BADFE7" />
      <circle cx="140" cy="128" r="16" fill="#388087" />
      <path d="M133 128l5 5 9-10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Inbox() {
  const { user, scope } = useAuth();
  const isAgent = user.role === 'agent';
  const [tab, setTab] = useState('live');
  const [q, setQ] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [list, setList] = useState([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [sel, setSel] = useState(null);
  const [chat, setChat] = useState(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [quick, setQuick] = useState([]);
  const [agents, setAgents] = useState([]);
  const [tplId, setTplId] = useState('');
  const [tplVars, setTplVars] = useState('');
  const [newChat, setNewChat] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const loadList = useCallback(() => {
    api('/portal/conversations', { query: { tab, q } }).then((d) => setList(d.conversations)).catch((e) => setError(e.message));
    api('/portal/conversations', { query: { tab: 'history' } }).then((d) => setHistoryCount(d.conversations.length)).catch(() => {});
  }, [tab, q]);
  const loadChat = useCallback((id) => {
    if (!id) return;
    api(`/portal/conversations/${id}`).then(setChat).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { loadList(); const t = setInterval(loadList, 8000); return () => clearInterval(t); }, [loadList]);
  useEffect(() => {
    if (!sel) return undefined;
    loadChat(sel);
    const t = setInterval(() => loadChat(sel), 6000);
    return () => clearInterval(t);
  }, [sel, loadChat]);
  useEffect(() => {
    api('/portal/templates', { query: { status: 'approved' } }).then((d) => setTemplates(d.templates)).catch(() => {});
    api('/portal/automations').then((d) => setQuick(d.automations.filter((a) => a.type === 'quick_reply' && a.enabled))).catch(() => {});
    if (!isAgent) api('/portal/agents').then((d) => setAgents(d.agents)).catch(() => {});
  }, [isAgent, scope]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [chat?.messages?.length]);

  const sendText = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true); setError('');
    try {
      await api(`/portal/conversations/${sel}/${note ? 'note' : 'messages'}`, { method: 'POST', body: { text } });
      setText('');
      loadChat(sel); loadList();
    } catch (err) { setError(err.message); } finally { setSending(false); }
  };
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) sendText(e); };
  const sendTemplate = async () => {
    setError('');
    try {
      await api(`/portal/conversations/${sel}/template`, {
        method: 'POST', body: { template_id: tplId, variables: tplVars.split('|').map((v) => v.trim()).filter(Boolean) },
      });
      setTplId(''); setTplVars('');
      loadChat(sel); loadList();
    } catch (err) { setError(err.message); }
  };
  const assign = async (agentId) => {
    try { await api(`/portal/conversations/${sel}/assign`, { method: 'POST', body: { agent_id: agentId || null } }); loadChat(sel); loadList(); }
    catch (err) { setError(err.message); }
  };
  const setStatus = async (status) => {
    await api(`/portal/conversations/${sel}/status`, { method: 'POST', body: { status } });
    setSel(null); setChat(null); loadList();
  };

  const contact = chat?.contact;
  const totalUnread = list.reduce((s, c) => s + (c.unread || 0), 0);
  return (
    <div className="inbox">
      <div className="inbox-list">
        <div className="inbox-tabs">
          <button className={`itab ${tab === 'live' ? 'on' : ''}`} onClick={() => setTab('live')}>
            <Icon name="clock" /><span>Live</span>{totalUnread > 0 && <em>{totalUnread}</em>}
          </button>
          <button className={`itab ${tab === 'history' ? 'on' : ''}`} onClick={() => setTab('history')}>
            <Icon name="history" /><span>History</span>{historyCount > 0 && <em>{historyCount > 99 ? '99+' : historyCount}</em>}
          </button>
          <button className={`itab ${showSearch ? 'on' : ''}`} onClick={() => setShowSearch(!showSearch)}>
            <Icon name="search" /><span>Search</span>
          </button>
          <button className="itab" onClick={() => setNewChat(true)}>
            <Icon name="plus" /><span>New Msg</span>
          </button>
        </div>
        {showSearch && (
          <input className="full" autoFocus placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        )}
        <div className="chips">
          <span className="chip-btn on"><Icon name="check" size={14} /> All</span>
          <span className="chip-btn wa">WhatsApp</span>
          <span className="chip-btn off" title="Coming soon">Facebook</span>
          <span className="chip-btn off" title="Coming soon">Instagram</span>
        </div>
        <div className="conv-items">
          {list.map((c) => (
            <button key={c.id} className={`conv ${sel === c.id ? 'on' : ''}`} onClick={() => { setSel(c.id); setChat(null); }}>
              <span className="avatar sm">{initialsOf(c.name || c.phone)}</span>
              <span className="conv-body">
                <span className="conv-top">
                  <b>{c.name || c.phone}</b>
                  <span className="muted small">{timeOf(c.last_message_at)}</span>
                </span>
                <span className="muted small clip">{c.last_message_preview || 'No messages yet'}</span>
                <span className="conv-meta">
                  <span className="muted small">{c.agent_name ? c.agent_name : 'Unassigned'}</span>
                  {c.labels.slice(0, 2).map((l) => <span key={l.id} className="chip" style={{ background: l.color }}>{l.name}</span>)}
                  {c.unread > 0 && <span className="dot">{c.unread}</span>}
                </span>
              </span>
            </button>
          ))}
          {!list.length && (
            <div className="empty-state">
              <Icon name="chat" size={34} />
              <b>No contact found</b>
              <p className="muted small">{tab === 'live' ? 'New customer messages will show up here.' : 'Closed chats will be kept here.'}</p>
            </div>
          )}
        </div>
      </div>

      <div className="inbox-chat">
        {!sel && (
          <div className="chat-empty">
            <ChatIllustration />
            <h3>Select a chat to start replying</h3>
            <p className="muted">Customers who message your WhatsApp number appear on the left.</p>
          </div>
        )}
        {sel && !chat && <div className="chat-empty muted">Loading...</div>}
        {sel && chat && (
          <>
            <div className="chat-head">
              <div className="chat-who">
                <span className="avatar">{initialsOf(contact.name || contact.phone)}</span>
                <div>
                  <b>{contact.name || contact.phone}</b>
                  <div className="muted small">{contact.phone}{contact.opted_out ? ' · opted out' : ''}{chat.conversation.bot_active ? ' · bot on' : ''}</div>
                </div>
              </div>
              <div className="row nomargin">
                {!isAgent && (
                  <select value={chat.conversation.agent_id || ''} onChange={(e) => assign(e.target.value)} aria-label="Assign to agent">
                    <option value="">Unassigned</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
                <button className="btn ghost small" onClick={() => setStatus(chat.conversation.status === 'live' ? 'history' : 'live')}>
                  {chat.conversation.status === 'live' ? 'Close chat' : 'Reopen'}
                </button>
              </div>
            </div>
            <div className="messages">
              {chat.messages.map((m) => (
                <div key={m.id} className={`bubble ${m.direction}`}>
                  {m.direction === 'system' ? <span>{m.body}</span> : (
                    <>
                      <div className="pre">{m.body}</div>
                      <div className="meta">
                        {m.direction === 'note' && 'Internal note · '}
                        {m.direction === 'out' && (m.is_bot ? 'Bot' : m.sender_name) + ' · '}
                        {timeOf(m.created_at)}
                        {m.direction === 'out' && <> · <Badge value={m.status} /></>}
                      </div>
                      {m.error && <div className="error-text small">{m.error}</div>}
                    </>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <Err error={error} />
            {!chat.window_open && !note ? (
              <div className="composer">
                <div className="window-warn"><Icon name="clock" size={16} /> The 24-hour window is closed. Send an approved template to reopen this chat.</div>
                <div className="row nomargin">
                  <select value={tplId} onChange={(e) => setTplId(e.target.value)}>
                    <option value="">Choose template</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <input placeholder="Variables (a | b)" value={tplVars} onChange={(e) => setTplVars(e.target.value)} />
                  <button className="btn" disabled={!tplId} onClick={sendTemplate}>Send template</button>
                  <button className="btn ghost" onClick={() => setNote(true)}>Add note</button>
                </div>
              </div>
            ) : (
              <form className="composer" onSubmit={sendText}>
                {quick.length > 0 && !note && (
                  <div className="quick">
                    {quick.map((qr) => (
                      <button type="button" key={qr.id} className="chip-btn" onClick={() => setText(qr.config.text || '')} title={qr.config.text}>
                        {qr.config.shortcut || qr.name}
                      </button>
                    ))}
                  </div>
                )}
                <textarea rows="2" placeholder={note ? 'Internal note (not sent to the customer)' : 'Type a reply. Enter to send, Shift+Enter for a new line'}
                  value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
                <div className="row nomargin">
                  <button className="btn" disabled={sending}><Icon name={note ? 'note' : 'send'} size={16} /> {note ? 'Save note' : 'Send'}</button>
                  <label className="check"><input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} /> Internal note</label>
                </div>
              </form>
            )}
          </>
        )}
      </div>
      {newChat && (
        <NewChat templates={templates} onClose={() => setNewChat(false)}
          onOpen={(id) => { setNewChat(false); setTab('live'); setSel(id); loadList(); }} />
      )}
    </div>
  );
}
