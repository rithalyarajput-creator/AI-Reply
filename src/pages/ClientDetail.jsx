import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import UsersPanel from '../components/UsersPanel.jsx';
import {
  Badge, Columns, Err, Field, Tabs, fmtDate, fmtMoney,
} from '../components/ui.jsx';

const PROFILE_FIELDS = [
  ['company_name', 'Company name'], ['legal_name', 'Legal name'], ['business_type', 'Business type'],
  ['website', 'Website'], ['gst_number', 'GST number'], ['pan', 'PAN'], ['state', 'State'],
  ['address', 'Address'], ['source', 'Source / partner'],
];
const STAGES = ['documents', 'meta_verification', 'number_connected', 'template_approved', 'test_passed', 'live'];
const CATEGORIES = ['marketing', 'utility', 'authentication', 'service'];

function Profile({ client, canEdit, onSaved }) {
  const [f, setF] = useState(client);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setMsg(''); setError('');
    try {
      const body = Object.fromEntries(PROFILE_FIELDS.map(([k]) => [k, f[k] || '']));
      body.onboarding_stage = f.onboarding_stage;
      body.low_balance_alert = f.low_balance_alert;
      await api(`/clients/${client.id}`, { method: 'PATCH', body });
      setMsg('Saved');
      onSaved();
    } catch (err) { setError(err.message); }
  };
  return (
    <form className="card form-grid" onSubmit={save}>
      {PROFILE_FIELDS.map(([k, label]) => (
        <Field key={k} label={label}>
          <input value={f[k] || ''} disabled={!canEdit} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        </Field>
      ))}
      <Field label="Onboarding stage">
        <select value={f.onboarding_stage} disabled={!canEdit} onChange={(e) => setF({ ...f, onboarding_stage: e.target.value })}>
          {[...new Set([f.onboarding_stage, ...STAGES])].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </Field>
      <Field label="Low balance alert (₹)">
        <input type="number" min="0" value={f.low_balance_alert} disabled={!canEdit} onChange={(e) => setF({ ...f, low_balance_alert: e.target.value })} />
      </Field>
      {error && <div className="error span">{error}</div>}
      {msg && <div className="ok span">{msg}</div>}
      {canEdit && <div className="span"><button className="btn">Save changes</button></div>}
    </form>
  );
}

function CustomRates({ clientId }) {
  const [rates, setRates] = useState({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const { can } = useAuth();
  useEffect(() => {
    api(`/clients/${clientId}/rates`).then((d) => setRates(Object.fromEntries(d.rates.map((r) => [r.category, r.rate])))).catch((e) => setError(e.message));
  }, [clientId]);
  const save = async () => {
    setError(''); setMsg('');
    try {
      await api(`/clients/${clientId}/rates`, { method: 'PUT', body: { rates: CATEGORIES.map((c) => ({ category: c, rate: rates[c] === '' ? null : rates[c] })) } });
      setMsg('Saved');
    } catch (e) { setError(e.message); }
  };
  return (
    <div className="card">
      <h3>Custom rates (override the plan)</h3>
      <p className="muted">Leave empty to use the plan rate. Amounts are per message in rupees.</p>
      <div className="form-grid">
        {CATEGORIES.map((c) => (
          <Field key={c} label={c}>
            <input type="number" min="0" step="0.0001" value={rates[c] ?? ''} disabled={!can('plans.edit')}
              onChange={(e) => setRates({ ...rates, [c]: e.target.value })} />
          </Field>
        ))}
      </div>
      <Err error={error} />
      {msg && <div className="ok">{msg}</div>}
      {can('plans.edit') && <button className="btn" onClick={save}>Save rates</button>}
    </div>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loginAsClient, openClient, can } = useAuth();
  const [data, setData] = useState(null);
  const [extra, setExtra] = useState(null);
  const [tab, setTab] = useState('overview');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/clients/${id}`).then(setData).catch((e) => setError(e.message));
    api(`/clients/${id}/details`).then(setExtra).catch(() => setExtra(null));
  }, [id]);
  useEffect(load, [load]);

  const setStatus = async (status) => {
    let reason = '';
    if (['suspended', 'closed'].includes(status)) {
      reason = window.prompt(`Reason to ${status === 'closed' ? 'close' : 'suspend'} this client (required):`) || '';
      if (!reason.trim()) return;
    }
    setError('');
    try {
      await api(`/clients/${id}/status`, { method: 'POST', body: { status, reason } });
      load();
    } catch (e) { setError(e.message); }
  };

  const viewAs = async () => {
    setError('');
    try { await loginAsClient(id); navigate('/'); } catch (e) { setError(e.message); }
  };
  const openPortal = () => { openClient(data.client); navigate('/'); };
  const addNote = async () => {
    if (!note.trim()) return;
    try { await api(`/clients/${id}/notes`, { method: 'POST', body: { body: note } }); setNote(''); load(); }
    catch (e) { setError(e.message); }
  };

  if (error && !data) return <Err error={error} />;
  if (!data) return <p className="muted">Loading...</p>;

  const { client, plan, users, activity } = data;
  const isManager = user.role === 'agency_admin' || can('clients.edit');
  const tabs = [['overview', 'Overview'], ['profile', 'Profile'], ['users', 'Users']];
  if (extra) tabs.push(['channels', 'Channels'], ['templates', 'Templates'], ['campaigns', 'Campaigns'], ['usage', 'Usage']);
  if (extra?.ledger) tabs.push(['billing', 'Billing']);
  if (can('plans.view')) tabs.push(['pricing', 'Pricing']);
  if (extra) tabs.push(['api', 'API'], ['notes', 'Notes']);
  tabs.push(['activity', 'Activity']);

  return (
    <>
      <div className="head">
        <div>
          <h2>{client.company_name}</h2>
          <Badge value={client.status} /> {client.suspend_reason && <span className="muted small">Reason: {client.suspend_reason}</span>}
        </div>
        <div className="row nomargin">
          {extra && <button className="btn ghost" onClick={openPortal}>Open portal data</button>}
          {can('clients.login_as') && <button className="btn ghost" onClick={viewAs}>Login as client</button>}
          {isManager && (client.status === 'suspended' || client.status === 'closed'
            ? <button className="btn" onClick={() => setStatus('active')}>Activate</button>
            : <button className="btn danger" onClick={() => setStatus('suspended')}>Suspend</button>)}
          {user.role === 'super_admin' && client.status !== 'closed' && (
            <button className="btn danger ghost" onClick={() => setStatus('closed')}>Close account</button>
          )}
        </div>
      </div>
      <Err error={error} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <>
          <div className="grid">
            <div className="card stat"><div className="muted small">Plan</div><div className="big">{plan?.name || '-'}</div></div>
            <div className="card stat"><div className="muted small">Wallet balance</div><div className="big">{fmtMoney(client.wallet_balance)}</div></div>
            <div className="card stat"><div className="muted small">Onboarding</div><div className="big small-big">{client.onboarding_stage.replace(/_/g, ' ')}</div></div>
            <div className="card stat"><div className="muted small">Users</div><div className="big">{users.length}</div></div>
            {extra && <div className="card stat"><div className="muted small">Channels connected</div><div className="big">{extra.channels.filter((c) => c.status === 'connected').length}</div></div>}
            {extra && (() => {
              const t = extra.campaigns.reduce((s, c) => s + c.total, 0);
              const f = extra.campaigns.reduce((s, c) => s + c.failed, 0);
              return <div className="card stat"><div className="muted small">Failed %</div><div className="big">{t ? `${Math.round((f / t) * 1000) / 10}%` : '0%'}</div></div>;
            })()}
          </div>
          {extra?.failure_reasons?.length > 0 && (
            <div className="card">
              <h3>Top failure reasons</h3>
              <table><tbody>{extra.failure_reasons.map((f) => <tr key={f.reason}><td>{f.reason}</td><td>{f.count}</td></tr>)}</tbody></table>
            </div>
          )}
          <div className="card">
            <h3>Onboarding</h3>
            <div className="steps">
              {STAGES.map((s, i) => (
                <div key={s} className={`step ${STAGES.indexOf(client.onboarding_stage) >= i ? 'done' : ''}`}>{s.replace(/_/g, ' ')}</div>
              ))}
            </div>
          </div>
        </>
      )}
      {tab === 'profile' && <Profile client={client} canEdit={isManager} onSaved={load} />}
      {tab === 'users' && <UsersPanel clientId={client.id} />}
      {tab === 'channels' && extra && (
        <div className="card table-wrap"><table>
          <thead><tr><th>Name</th><th>Type</th><th>Number</th><th>Status</th><th>Tier</th><th>Quality</th><th>Webhook</th></tr></thead>
          <tbody>
            {extra.channels.map((c) => (
              <tr key={c.id}><td>{c.display_name}</td><td>{c.type}</td><td>{c.phone_number || '-'}</td><td><Badge value={c.status} /></td>
                <td>{c.tier || '-'}</td><td>{c.quality_rating || '-'}</td><td>{c.webhook_ok ? 'OK' : 'Not received'}</td></tr>
            ))}
            {!extra.channels.length && <tr><td colSpan="7" className="muted">No channels connected.</td></tr>}
          </tbody></table></div>
      )}
      {tab === 'templates' && extra && (
        <div className="card table-wrap"><table>
          <thead><tr><th>Name</th><th>Category</th><th>Language</th><th>Status</th><th>Quality</th></tr></thead>
          <tbody>
            {extra.templates.map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.category}</td><td>{t.language}</td><td><Badge value={t.status} /></td><td>{t.quality || '-'}</td></tr>)}
            {!extra.templates.length && <tr><td colSpan="5" className="muted">No templates.</td></tr>}
          </tbody></table></div>
      )}
      {tab === 'campaigns' && extra && (
        <div className="card table-wrap"><table>
          <thead><tr><th>Campaign</th><th>Status</th><th>Contacts</th><th>Sent</th><th>Delivered</th><th>Seen</th><th>Failed</th><th>Created</th></tr></thead>
          <tbody>
            {extra.campaigns.map((c) => (
              <tr key={c.id}><td>{c.name}</td><td><Badge value={c.status} /></td><td>{c.total}</td><td>{c.sent}</td><td>{c.delivered}</td><td>{c.seen}</td><td>{c.failed}</td><td>{fmtDate(c.created_at)}</td></tr>
            ))}
            {!extra.campaigns.length && <tr><td colSpan="8" className="muted">No campaigns.</td></tr>}
          </tbody></table></div>
      )}
      {tab === 'usage' && extra && (
        <div className="card"><h3>Messages sent, last 30 days</h3>
          <Columns data={extra.usage.map((u) => ({ day: u.day, messages: u.messages }))} keys={[{ key: 'messages', label: 'Messages', color: '#388087' }]} />
        </div>
      )}
      {tab === 'billing' && extra?.ledger && (
        <>
          <div className="card table-wrap"><table>
            <thead><tr><th>When</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Reference</th><th>By</th></tr></thead>
            <tbody>
              {extra.ledger.map((l) => (
                <tr key={l.id}><td>{fmtDate(l.created_at)}</td><td><Badge value={l.type} /></td><td>{fmtMoney(l.amount)}</td><td>{fmtMoney(l.balance_after)}</td><td>{l.note || l.reference || ''}</td><td>{l.created_by_name}</td></tr>
              ))}
              {!extra.ledger.length && <tr><td colSpan="6" className="muted">No wallet entries.</td></tr>}
            </tbody></table></div>
          <div className="card table-wrap"><h3 className="pad">Invoices</h3><table>
            <thead><tr><th>Number</th><th>Period</th><th>Amount</th><th>GST</th><th>Status</th></tr></thead>
            <tbody>
              {extra.invoices.map((i) => <tr key={i.id}><td>{i.number}</td><td>{i.period}</td><td>{fmtMoney(i.amount)}</td><td>{fmtMoney(i.gst_amount)}</td><td><Badge value={i.status} /></td></tr>)}
              {!extra.invoices.length && <tr><td colSpan="5" className="muted">No invoices.</td></tr>}
            </tbody></table></div>
        </>
      )}
      {tab === 'pricing' && <CustomRates clientId={client.id} />}
      {tab === 'api' && extra && (
        <div className="card">
          <p>{extra.api ? <>API key active: <code>{extra.api.prefix}…</code> created {fmtDate(extra.api.created_at)}</> : 'No active API key.'}</p>
          <p className="muted">The key itself is never shown to staff.</p>
        </div>
      )}
      {tab === 'notes' && extra && (
        <>
          <div className="card">
            <Field label="Internal note (visible to your team only)">
              <textarea rows="3" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <button className="btn" onClick={addNote}>Add note</button>
          </div>
          {extra.notes.map((n) => (
            <div key={n.id} className="card"><div className="muted small">{n.author_name} · {fmtDate(n.created_at)}</div><p className="pre">{n.body}</p></div>
          ))}
        </>
      )}
      {tab === 'activity' && (
        <div className="card table-wrap"><table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th></tr></thead>
          <tbody>
            {activity.map((a) => <tr key={a.id}><td>{fmtDate(a.created_at)}</td><td>{a.actor_name} <span className="muted small">({a.actor_role})</span></td><td>{a.action}</td></tr>)}
            {!activity.length && <tr><td colSpan="3" className="muted">No activity yet.</td></tr>}
          </tbody></table></div>
      )}
    </>
  );
}
