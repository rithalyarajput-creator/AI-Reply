import { useState } from 'react';
import { api } from '../../api.js';
import {
  Badge, Err, Field, Modal, PageHead, fmtDate, useLoad,
} from '../../components/ui.jsx';

function Create({ onClose, onDone }) {
  const [f, setF] = useState({ name: '', category: 'utility', language: 'en', header_text: '', body: '', footer: '' });
  const [buttons, setButtons] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const d = await api('/portal/templates', { method: 'POST', body: { ...f, buttons } });
      onDone(d);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const addBtn = (type) => setButtons([...buttons, { type, text: '', url: '' }].slice(0, 3));
  const upd = (i, k, v) => setButtons(buttons.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const preview = f.body.replace(/\{\{(\d+)\}\}/g, (_, n) => `[var ${n}]`);

  return (
    <Modal title="Create template" onClose={onClose} wide>
      <form onSubmit={submit} className="form-grid">
        <Field label="Template name" hint="lowercase letters, numbers and underscore">
          <input value={f.name} onChange={set('name')} required />
        </Field>
        <Field label="Category">
          <select value={f.category} onChange={set('category')}>
            <option value="utility">Utility</option>
            <option value="marketing">Marketing</option>
            <option value="authentication">Authentication</option>
          </select>
        </Field>
        <Field label="Language code"><input value={f.language} onChange={set('language')} /></Field>
        <Field label="Header text (optional)"><input value={f.header_text} onChange={set('header_text')} maxLength={60} /></Field>
        <div className="span">
          <Field label="Message body" hint="Use {{1}}, {{2}} for variables like name or amount">
            <textarea rows="5" value={f.body} onChange={set('body')} maxLength={1024} required />
          </Field>
        </div>
        <Field label="Footer (optional)"><input value={f.footer} onChange={set('footer')} maxLength={60} /></Field>
        <div className="span">
          <b>Buttons (optional, up to 3)</b>
          {buttons.map((b, i) => (
            <div className="row" key={i}>
              <span className="badge">{b.type === 'url' ? 'Link' : 'Quick reply'}</span>
              <input placeholder="Button text" value={b.text} maxLength={25} onChange={(e) => upd(i, 'text', e.target.value)} />
              {b.type === 'url' && <input placeholder="https://..." value={b.url} onChange={(e) => upd(i, 'url', e.target.value)} />}
              <button type="button" className="btn ghost small" onClick={() => setButtons(buttons.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <div className="row">
            <button type="button" className="btn ghost small" onClick={() => addBtn('quick_reply')}>+ Quick reply</button>
            <button type="button" className="btn ghost small" onClick={() => addBtn('url')}>+ Link button</button>
          </div>
        </div>
        <div className="span">
          <div className="phone-preview">
            {f.header_text && <b>{f.header_text}</b>}
            <div className="pre">{preview || 'Your message preview'}</div>
            {f.footer && <div className="muted small">{f.footer}</div>}
            {buttons.map((b, i) => <div key={i} className="pv-btn">{b.text || 'Button'}</div>)}
          </div>
        </div>
        <Err error={error} />
        <div className="row span">
          <button className="btn" disabled={busy}>{busy ? 'Submitting...' : 'Save and submit to Meta'}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Templates() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [d, load, error] = useLoad(() => api('/portal/templates', { query: { status, q } }), [status, q]);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');
  const [err2, setErr2] = useState('');

  const sync = async () => {
    setErr2(''); setMsg('');
    try { const r = await api('/portal/templates/sync', { method: 'POST' }); setMsg(`Synced ${r.updated} of ${r.total} templates from Meta.`); load(); }
    catch (e) { setErr2(e.message); }
  };
  const del = async (t) => {
    if (!window.confirm(`Delete template ${t.name}? It stays in Meta until removed there.`)) return;
    await api(`/portal/templates/${t.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <>
      <PageHead title="Templates" sub="WhatsApp message formats. Meta must approve a template before you can send it.">
        <button className="btn ghost" onClick={sync}>Sync from Meta</button>
        <button className="btn" onClick={() => setCreating(true)}>Create template</button>
      </PageHead>
      <div className="row">
        <input placeholder="Search template name" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['draft', 'in_review', 'approved', 'rejected', 'paused', 'disabled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>
      <Err error={error || err2} />
      {msg && <div className="ok">{msg}</div>}
      <div className="card table-wrap"><table>
        <thead><tr><th>Name</th><th>Category</th><th>Preview</th><th>Status</th><th>Quality</th><th>Created</th><th /></tr></thead>
        <tbody>
          {d?.templates.map((t) => (
            <tr key={t.id}>
              <td>{t.name}<div className="muted small">{t.language}</div></td>
              <td>{t.category}</td>
              <td className="pre small">{t.body}</td>
              <td><Badge value={t.status} />{t.rejection_reason && <div className="error-text small">{t.rejection_reason}</div>}</td>
              <td>{t.quality || '-'}</td>
              <td>{fmtDate(t.created_at)}</td>
              <td className="actions"><button className="btn ghost small" onClick={() => del(t)}>Delete</button></td>
            </tr>
          ))}
          {d && !d.templates.length && <tr><td colSpan="7" className="muted">No templates yet.</td></tr>}
        </tbody></table></div>
      <p className="muted small">
        A Utility template with promotional content may be re-classified by Meta as Marketing, which costs more.
        A template saved before a WhatsApp number is connected stays a draft.
      </p>
      {creating && <Create onClose={() => setCreating(false)} onDone={(r) => { setCreating(false); setMsg(r.warning ? `Saved as draft. Meta said: ${r.warning}` : r.submitted ? 'Submitted to Meta for review.' : 'Saved as draft. Connect a WhatsApp number to submit it.'); load(); }} />}
    </>
  );
}
