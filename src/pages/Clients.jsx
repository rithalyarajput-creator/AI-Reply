import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Credentials, Field, Modal, fmtDate } from '../components/ui.jsx';

const EMPTY = {
  company_name: '', legal_name: '', business_type: '', website: '', gst_number: '', pan: '', address: '', state: '',
  source: '', plan_id: '', agency_id: '', admin_name: '', admin_email: '', admin_mobile: '',
};

function AddClient({ onClose, onCreated }) {
  const { user } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [plans, setPlans] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    api('/plans').then((d) => setPlans(d.plans)).catch(() => {});
    if (user.role === 'super_admin') api('/agencies').then((d) => setAgencies(d.agencies)).catch(() => {});
  }, [user.role]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/clients', { method: 'POST', body: { ...f, plan_id: f.plan_id || null, agency_id: f.agency_id || null } });
      onCreated(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add client" onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <Field label="Company name *"><input value={f.company_name} onChange={set('company_name')} required /></Field>
        <Field label="Legal name"><input value={f.legal_name} onChange={set('legal_name')} /></Field>
        <Field label="Business type"><input value={f.business_type} onChange={set('business_type')} /></Field>
        <Field label="Website"><input value={f.website} onChange={set('website')} /></Field>
        <Field label="GST number"><input value={f.gst_number} onChange={set('gst_number')} /></Field>
        <Field label="PAN"><input value={f.pan} onChange={set('pan')} /></Field>
        <Field label="State"><input value={f.state} onChange={set('state')} /></Field>
        <Field label="Source / partner"><input value={f.source} onChange={set('source')} /></Field>
        <Field label="Address"><input value={f.address} onChange={set('address')} /></Field>
        <Field label="Plan">
          <select value={f.plan_id} onChange={set('plan_id')}>
            <option value="">No plan yet</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        {user.role === 'super_admin' && (
          <Field label="Agency (optional)">
            <select value={f.agency_id} onChange={set('agency_id')}>
              <option value="">Direct client</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Admin name *"><input value={f.admin_name} onChange={set('admin_name')} required /></Field>
        <Field label="Admin email * (login)"><input type="email" value={f.admin_email} onChange={set('admin_email')} required /></Field>
        <Field label="Admin mobile"><input value={f.admin_mobile} onChange={set('admin_mobile')} /></Field>
        {error && <div className="error span">{error}</div>}
        <div className="row span">
          <button className="btn" disabled={busy}>{busy ? 'Creating...' : 'Create client'}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Clients() {
  const { user } = useAuth();
  const [clients, setClients] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/clients', { query: { q: search, status } })
      .then((d) => setClients(d.clients))
      .catch((e) => setError(e.message));
  }, [search, status]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <>
      <div className="head">
        <h2>Clients</h2>
        <button className="btn" onClick={() => setAdding(true)}>Add client</button>
      </div>
      <div className="row">
        <input placeholder="Search company" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['trial', 'active', 'suspended', 'closed'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Company</th><th>Admin login</th>{user.role === 'super_admin' && <th>Agency</th>}
              <th>Plan</th><th>Status</th><th>Agents</th><th>Wallet</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {clients?.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/clients/${c.id}`}>{c.company_name}</Link></td>
                <td>{c.admin_email || '-'}</td>
                {user.role === 'super_admin' && <td>{c.agency_name || 'Direct'}</td>}
                <td>{c.plan_name || '-'}</td>
                <td><Badge value={c.status} /></td>
                <td>{c.agents}</td>
                <td>{Number(c.wallet_balance).toFixed(2)}</td>
                <td>{fmtDate(c.created_at)}</td>
              </tr>
            ))}
            {clients && !clients.length && <tr><td colSpan="8" className="muted">No clients found.</td></tr>}
            {!clients && <tr><td colSpan="8" className="muted">Loading...</td></tr>}
          </tbody>
        </table>
      </div>
      {adding && (
        <AddClient
          onClose={() => setAdding(false)}
          onCreated={(d) => { setAdding(false); setCreated(d.admin); load(); }}
        />
      )}
      {created && (
        <Credentials title="Client admin login" email={created.email} password={created.temp_password} onClose={() => setCreated(null)} />
      )}
    </>
  );
}
