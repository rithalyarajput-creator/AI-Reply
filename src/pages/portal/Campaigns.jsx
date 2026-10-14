import { useRef, useState } from 'react';
import { api, downloadCsv } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Badge, Err, Field, Modal, PageHead, fmtDate, useLoad,
} from '../../components/ui.jsx';

function Create({ onClose, onCreated }) {
  const [f, setF] = useState({ name: '', template_id: '', label_id: '', variables: '' });
  const [templates, setTemplates] = useState([]);
  const [labels, setLabels] = useState([]);
  const [error, setError] = useState('');
  const loaded = useRef(false);
  if (!loaded.current) {
    loaded.current = true;
    api('/portal/templates', { query: { status: 'approved' } }).then((d) => setTemplates(d.templates)).catch(() => {});
    api('/portal/labels').then((d) => setLabels(d.labels)).catch(() => {});
  }
  const tpl = templates.find((t) => t.id === f.template_id);
  const varCount = tpl ? new Set(tpl.body.match(/\{\{\d+\}\}/g) || []).size : 0;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const variables = f.variables.split('|').map((v) => v.trim()).filter(Boolean);
      const d = await api('/portal/campaigns', {
        method: 'POST',
        body: { name: f.name, template_id: f.template_id, label_id: f.label_id || undefined, variables },
      });
      onCreated(d.id);
    } catch (err) { setError(err.message); }
  };

  return (
    <Modal title="New campaign" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Campaign name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Template (approved only)">
          <select value={f.template_id} onChange={(e) => setF({ ...f, template_id: e.target.value })} required>
            <option value="">Choose template</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
          </select>
        </Field>
        {tpl && <div className="phone-preview"><div className="pre">{tpl.body}</div></div>}
        {varCount > 0 && (
          <Field label={`Variables for ${varCount} placeholder(s), separate with |`} hint="Use {{name}} to insert each contact's name. Example: {{name}} | 20%">
            <input value={f.variables} onChange={(e) => setF({ ...f, variables: e.target.value })} />
          </Field>
        )}
        <Field label="Audience" hint="Contacts who opted out are always skipped">
          <select value={f.label_id} onChange={(e) => setF({ ...f, label_id: e.target.value })}>
            <option value="">All contacts</option>
            {labels.map((l) => <option key={l.id} value={l.id}>Label: {l.name} ({l.contacts})</option>)}
          </select>
        </Field>
        <Err error={error} />
        <div className="row">
          <button className="btn">Create and start</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Campaigns() {
  const { user } = useAuth();
  const admin = user.role === 'client_admin' || user.role === 'super_admin' || user.role === 'agency_admin' || true;
  const [d, load, error] = useLoad(() => api('/portal/campaigns'), []);
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState(null);
  const [runMsg, setRunMsg] = useState('');
  const stop = useRef(false);

  const run = async (id) => {
    stop.current = false;
    setRunning(id); setRunMsg('');
    try {
      for (let i = 0; i < 2000 && !stop.current; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const r = await api(`/portal/campaigns/${id}/process`, { method: 'POST' });
        if (r.message) setRunMsg(r.message);
        // eslint-disable-next-line no-await-in-loop
        await load();
        if (r.remaining === 0 || r.status !== 'running') break;
      }
    } catch (e) { setRunMsg(e.message); } finally { setRunning(null); load(); }
  };
  const resume = async (id) => { await api(`/portal/campaigns/${id}/resume`, { method: 'POST' }); run(id); };
  const report = async (c) => {
    const r = await api(`/portal/campaigns/${c.id}/report`);
    downloadCsv(`${c.name}-report.csv`, [['Phone', 'Status', 'Error', 'Updated'], ...r.rows.map((x) => [x.phone, x.status, x.error, x.updated_at])]);
  };

  return (
    <>
      <PageHead title="Campaigns" sub="Send one approved template to many contacts.">
        {admin && <button className="btn" onClick={() => setCreating(true)}>Add campaign</button>}
      </PageHead>
      <Err error={error} />
      {runMsg && <div className="banner">{runMsg}</div>}
      {running && <div className="banner">Sending... keep this page open until it finishes. <button className="btn small" onClick={() => { stop.current = true; }}>Pause</button></div>}
      <div className="card table-wrap"><table>
        <thead><tr><th>Campaign</th><th>Channel</th><th>Category</th><th>Contacts</th><th>Status</th><th>Pending</th><th>Sent</th><th>Delivered</th><th>Seen</th><th>Failed</th><th>Created</th><th /></tr></thead>
        <tbody>
          {d?.campaigns.map((c) => (
            <tr key={c.id}>
              <td>{c.name}<div className="muted small">{c.template_name}</div></td>
              <td>{c.channel_name || '-'}</td><td>{c.category}</td><td>{c.total}</td>
              <td><Badge value={c.status} /></td>
              <td>{c.pending}</td><td>{c.sent}</td><td>{c.delivered}</td><td>{c.seen}</td>
              <td className={c.failed ? 'neg' : ''}>{c.failed}</td>
              <td>{fmtDate(c.created_at)}</td>
              <td className="actions">
                {c.status === 'running' && !running && <button className="btn small" onClick={() => run(c.id)}>Send now</button>}
                {c.status === 'paused' && !running && <button className="btn small" onClick={() => resume(c.id)}>Resume</button>}
                <button className="btn ghost small" onClick={() => report(c)}>Report</button>
              </td>
            </tr>
          ))}
          {d && !d.campaigns.length && <tr><td colSpan="12" className="muted">No campaigns yet.</td></tr>}
        </tbody></table></div>
      <p className="muted small">
        Each contact is counted once: Pending, Sent, Delivered, Seen or Failed. Failed messages are refunded to your wallet.
        If most messages fail, check the number's quality rating and tier in Integrations.
      </p>
      {creating && <Create onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); load().then(() => run(id)); }} />}
    </>
  );
}
