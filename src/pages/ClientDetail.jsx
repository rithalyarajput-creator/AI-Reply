import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import UsersPanel from '../components/UsersPanel.jsx';
import { Badge, Field, fmtDate } from '../components/ui.jsx';

const PROFILE_FIELDS = [
  ['company_name', 'Company name'], ['legal_name', 'Legal name'], ['business_type', 'Business type'],
  ['website', 'Website'], ['gst_number', 'GST number'], ['pan', 'PAN'], ['state', 'State'],
  ['address', 'Address'], ['source', 'Source / partner'],
];

function Profile({ client, canEdit, onSaved }) {
  const [f, setF] = useState(client);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setMsg(''); setError('');
    try {
      const body = Object.fromEntries(PROFILE_FIELDS.map(([k]) => [k, f[k] || '']));
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
      {error && <div className="error span">{error}</div>}
      {msg && <div className="ok span">{msg}</div>}
      {canEdit && <div className="span"><button className="btn">Save changes</button></div>}
    </form>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loginAsClient } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/clients/${id}`).then(setData).catch((e) => setError(e.message));
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
    try {
      await loginAsClient(id);
      navigate('/');
    } catch (e) { setError(e.message); }
  };

  if (error && !data) return <div className="error">{error}</div>;
  if (!data) return <p className="muted">Loading...</p>;

  const { client, plan, users, activity } = data;
  const isManager = ['super_admin', 'agency_admin'].includes(user.role);
  const tabs = [['overview', 'Overview'], ['profile', 'Profile'], ['users', 'Users'], ['activity', 'Activity']];

  return (
    <>
      <div className="head">
        <div>
          <h2>{client.company_name}</h2>
          <Badge value={client.status} /> {client.suspend_reason && <span className="muted small">Reason: {client.suspend_reason}</span>}
        </div>
        {isManager && (
          <div className="row">
            {user.role === 'super_admin' && <button className="btn ghost" onClick={viewAs}>Login as client</button>}
            {client.status === 'suspended' || client.status === 'closed'
              ? <button className="btn" onClick={() => setStatus('active')}>Activate</button>
              : <button className="btn danger" onClick={() => setStatus('suspended')}>Suspend</button>}
            {user.role === 'super_admin' && client.status !== 'closed' && (
              <button className="btn danger ghost" onClick={() => setStatus('closed')}>Close account</button>
            )}
          </div>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid">
          <div className="card stat"><div className="muted small">Plan</div><div className="big">{plan?.name || '-'}</div></div>
          <div className="card stat"><div className="muted small">Wallet balance</div><div className="big">{Number(client.wallet_balance).toFixed(2)}</div></div>
          <div className="card stat"><div className="muted small">Onboarding</div><div className="big">{client.onboarding_stage}</div></div>
          <div className="card stat"><div className="muted small">Users</div><div className="big">{users.length}</div></div>
          <div className="card stat"><div className="muted small">Created</div><div className="small">{fmtDate(client.created_at)}</div></div>
        </div>
      )}
      {tab === 'profile' && <Profile client={client} canEdit={isManager} onSaved={load} />}
      {tab === 'users' && <UsersPanel clientId={client.id} />}
      {tab === 'activity' && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>Action</th></tr></thead>
            <tbody>
              {activity.map((a) => (
                <tr key={a.id}><td>{fmtDate(a.created_at)}</td><td>{a.actor_name} <span className="muted small">({a.actor_role})</span></td><td>{a.action}</td></tr>
              ))}
              {!activity.length && <tr><td colSpan="3" className="muted">No activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
