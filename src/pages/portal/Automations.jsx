import { useState } from 'react';
import { api } from '../../api.js';
import {
  Err, Field, Modal, PageHead, useLoad,
} from '../../components/ui.jsx';

const CARDS = [
  { type: 'keyword_reply', title: 'Keyword Auto Reply', text: 'Reply automatically when a message has a keyword. Good for FAQs.', multi: true },
  { type: 'welcome', title: 'Welcome Message', text: 'Greet a customer the first time they message you.' },
  { type: 'out_of_office', title: 'Out of Office Message', text: 'Reply outside your working hours.' },
  { type: 'ai_bot', title: 'AI Bot', text: 'An AI assistant answers using your business information and hands over to a person when it cannot help.' },
  { type: 'auto_assign', title: 'Auto Assign', text: 'New chats go to an agent automatically (round robin, or by the % you set in Configurations, Agents).' },
  { type: 'opt_out', title: 'Opt Out Setup', text: 'STOP-style keywords unsubscribe a contact so they get no more messages. Keep this on for campaigns.' },
  { type: 'quick_reply', title: 'Quick Reply', text: 'Saved answers your agents can reuse.', multi: true },
  { type: 'feedback', title: 'Feedback', text: 'A saved message to ask customers for feedback.' },
  { type: 'icebreaker', title: 'Icebreaker', text: 'Up to 4 starter questions shown when a customer opens a chat.' },
  { type: 'keyword_alert', title: 'Keyword Alerts', text: 'Words you want to be warned about in agent messages.', multi: true },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ConfigForm({ card, item, onClose, onSaved }) {
  const [cfg, setCfg] = useState(() => ({ ...(item?.config || {}) }));
  const [name, setName] = useState(item?.name || card.title);
  const [enabled, setEnabled] = useState(item ? item.enabled : true);
  const [error, setError] = useState('');
  const set = (k, v) => setCfg({ ...cfg, [k]: v });
  const list = (v) => (Array.isArray(v) ? v.join(', ') : v || '');

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (item) await api(`/portal/automations/${item.id}`, { method: 'PATCH', body: { name, config: cfg, enabled } });
      else await api('/portal/automations', { method: 'POST', body: { type: card.type, name, config: cfg, enabled } });
      onSaved();
    } catch (err) { setError(err.message); }
  };

  const t = card.type;
  return (
    <Modal title={card.title} onClose={onClose}>
      <form onSubmit={save}>
        {card.multi && <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>}
        {t === 'keyword_reply' && (
          <>
            <Field label="Keywords (comma separated)"><input value={list(cfg.keywords)} onChange={(e) => set('keywords', e.target.value)} /></Field>
            <Field label="Match">
              <select value={cfg.match || 'contains'} onChange={(e) => set('match', e.target.value)}>
                <option value="contains">Message contains keyword</option>
                <option value="exact">Message is exactly the keyword</option>
              </select>
            </Field>
            <Field label="Reply"><textarea rows="4" value={cfg.reply || ''} onChange={(e) => set('reply', e.target.value)} required /></Field>
          </>
        )}
        {(t === 'welcome' || t === 'feedback') && (
          <Field label="Message"><textarea rows="4" value={cfg.message || ''} onChange={(e) => set('message', e.target.value)} required /></Field>
        )}
        {t === 'out_of_office' && (
          <>
            <Field label="Message"><textarea rows="3" value={cfg.message || ''} onChange={(e) => set('message', e.target.value)} required /></Field>
            <div className="row">
              <Field label="Opens"><input type="time" value={cfg.start || '09:00'} onChange={(e) => set('start', e.target.value)} /></Field>
              <Field label="Closes"><input type="time" value={cfg.end || '18:00'} onChange={(e) => set('end', e.target.value)} /></Field>
            </div>
            <div className="row">
              {DAYS.map((d, i) => {
                const days = cfg.days || [1, 2, 3, 4, 5, 6];
                return (
                  <label key={d} className="check">
                    <input type="checkbox" checked={days.includes(i)}
                      onChange={(e) => set('days', e.target.checked ? [...days, i] : days.filter((x) => x !== i))} /> {d}
                  </label>
                );
              })}
            </div>
            <p className="muted small">Times use India time (UTC+5:30). Customers outside your hours get this once every 12 hours.</p>
          </>
        )}
        {t === 'ai_bot' && (
          <>
            <Field label="How should the bot behave?" hint="Tone, language, what to avoid"><textarea rows="3" value={cfg.prompt || ''} onChange={(e) => set('prompt', e.target.value)} /></Field>
            <Field label="Business information the bot may use" hint="Timings, prices, address, policies. The bot will not invent facts outside this.">
              <textarea rows="6" value={cfg.business_info || ''} onChange={(e) => set('business_info', e.target.value)} />
            </Field>
            <Field label="Message when handing over to a person (optional)"><input value={cfg.handoff_message || ''} onChange={(e) => set('handoff_message', e.target.value)} /></Field>
            <p className="muted small">Needs the platform's AI key to be set by your administrator. A human reply in the chat turns the bot off for that chat.</p>
          </>
        )}
        {t === 'auto_assign' && (
          <Field label="Mode">
            <select value={cfg.mode || 'round_robin'} onChange={(e) => set('mode', e.target.value)}>
              <option value="round_robin">Round robin (fewest chats first)</option>
              <option value="percentage">Use agent percentages</option>
            </select>
          </Field>
        )}
        {t === 'opt_out' && (
          <>
            <Field label="Opt-out keywords (comma separated)"><input value={list(cfg.keywords) || 'stop, unsubscribe'} onChange={(e) => set('keywords', e.target.value)} /></Field>
            <Field label="Confirmation reply"><input value={cfg.reply || ''} onChange={(e) => set('reply', e.target.value)} placeholder="You have been unsubscribed." /></Field>
          </>
        )}
        {t === 'quick_reply' && (
          <>
            <Field label="Shortcut"><input value={cfg.shortcut || ''} onChange={(e) => set('shortcut', e.target.value)} /></Field>
            <Field label="Text"><textarea rows="4" value={cfg.text || ''} onChange={(e) => set('text', e.target.value)} required /></Field>
          </>
        )}
        {t === 'icebreaker' && (
          <Field label="Questions (comma separated, max 4)"><input value={list(cfg.questions)} onChange={(e) => set('questions', e.target.value)} /></Field>
        )}
        {t === 'keyword_alert' && (
          <Field label="Keywords (comma separated)"><input value={list(cfg.keywords)} onChange={(e) => set('keywords', e.target.value)} /></Field>
        )}
        <label className="check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled</label>
        <Err error={error} />
        <div className="row">
          <button className="btn">Save</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Automations() {
  const [d, load, error] = useLoad(() => api('/portal/automations'), []);
  const [edit, setEdit] = useState(null);
  const items = d?.automations || [];

  const toggle = async (a) => { await api(`/portal/automations/${a.id}`, { method: 'PATCH', body: { enabled: !a.enabled } }); load(); };
  const del = async (a) => { if (window.confirm('Delete this automation?')) { await api(`/portal/automations/${a.id}`, { method: 'DELETE' }); load(); } };

  return (
    <>
      <PageHead title="Automations" sub="Automatic messages and routing. Turn on Opt Out before you run bulk campaigns." />
      <Err error={error} />
      <div className="grid cards">
        {CARDS.map((card) => {
          const mine = items.filter((a) => a.type === card.type);
          return (
            <div className="card" key={card.type}>
              <h3>{card.title}</h3>
              <p className="muted small">{card.text}</p>
              {mine.map((a) => (
                <div key={a.id} className="auto-item">
                  <span>{a.name}</span>
                  <span>
                    <label className="check"><input type="checkbox" checked={a.enabled} onChange={() => toggle(a)} /> On</label>
                    <button className="btn ghost small" onClick={() => setEdit({ card, item: a })}>Edit</button>
                    {card.multi && <button className="btn ghost small" onClick={() => del(a)}>Delete</button>}
                  </span>
                </div>
              ))}
              {(card.multi || !mine.length) && (
                <button className="btn small" onClick={() => setEdit({ card, item: null })}>{mine.length ? 'Add another' : 'Configure'}</button>
              )}
            </div>
          );
        })}
      </div>
      {edit && <ConfigForm card={edit.card} item={edit.item} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </>
  );
}
