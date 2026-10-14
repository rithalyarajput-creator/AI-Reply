import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Badge, Err, Field, Modal, fmtDate,
} from '../../components/ui.jsx';

const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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

export default function Inbox() {
  const { user, scope } = useAuth();
  const isAgent = user.role === 'agent';
  const [tab, setTab] = useState('live');
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);
  const [chat, setChat] = useState(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [agents, setAgents] = useState([]);
  const [tplId, setTplId] = useState('');
  const [tplVars, setTplVars] = useState('');
  const [newChat, setNewChat] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const loadList = useCallback(() => {
    api('/portal/conversations', { query: { tab, q } }).then((d) => setList(d.conversations)).catch((e) => setError(e.message));
  }, [tab, q]);
  const loadChat = useCallback((id) => {
    if (!id) return;
    api(`/portal/conversations/${id}`).then(setChat).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { loadList(); const t = setInterval(loadList, 8000); return () => clearInterval(t); }, [loadList]);
  useEffect(() => { if (sel) { loadChat(sel); const t = setInterval(() => loadChat(sel), 6000); return () => clearInterval(t); } return undefined; }, [sel, loadChat]);
  useEffect(() => {
    api('/portal/templates', { query: { status: 'approved' } }).then((d) => setTemplates(d.templates)).catch(() => {});
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
  return (
    <div className="inbox">
      <div className="inbox-list">
        <div className="row nomargin">
          <button className={`btn small ${tab === 'live' ? '' : 'ghost'}`} onClick={() => setTab('live')}>Live</button>
          <button className={`btn small ${tab === 'history' ? '' : 'ghost'}`} onClick={() => setTab('history')}>History</button>
          <button className="btn small ghost" onClick={() => setNewChat(true)}>New msg</button>
        </div>
        <input className="full" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="conv-items">
          {list.map((c) => (
            <button key={c.id} className={`conv ${sel === c.id ? 'on' : ''}`} onClick={() => { setSel(c.id); setChat(null); }}>
              <div className="conv-top">
                <b>{c.name || c.phone}</b>
                {c.unread > 0 && <span className="dot">{c.unread}</span>}
              </div>
              <div className="muted small clip">{c.last_message_preview || 'No messages'}</div>
              <div className="muted small">{c.agent_name ? `Agent: ${c.agent_name}` : 'Unassigned'} · {timeOf(c.last_message_at)}</div>
            </button>
          ))}
          {!list.length && <p className="muted pad">No {tab} chats yet. Messages from your customers will appear here.</p>}
        </div>
      </div>

      <div className="inbox-chat">
        {!sel && <div className="center muted">Select a chat</div>}
        {sel && !chat && <div className="center muted">Loading...</div>}
        {sel && chat && (
          <>
            <div className="chat-head">
              <div>
                <b>{contact.name || contact.phone}</b>
                <div className="muted small">{contact.phone}{contact.opted_out ? ' · opted out' : ''}</div>
              </div>
              <div className="row nomargin">
                {!isAgent && (
                  <select value={chat.conversation.agent_id || ''} onChange={(e) => assign(e.target.value)}>
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
                <div className="muted small">The 24-hour window is closed. Send an approved template to reopen the chat.</div>
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
                <textarea rows="2" placeholder={note ? 'Internal note (not sent to customer)' : 'Type a reply'} value={text} onChange={(e) => setText(e.target.value)} />
                <div className="row nomargin">
                  <button className="btn" disabled={sending}>{note ? 'Save note' : 'Send'}</button>
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
      <span className="sr-only">{fmtDate(new Date())}</span>
    </div>
  );
}
