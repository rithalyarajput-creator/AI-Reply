import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Credentials, Field, Modal, fmtDate } from '../components/ui.jsx';

export default function Agencies() {
  const [agencies, setAgencies] = useState(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', admin_name: '', admin_email: '', admin_mobile: '' });
  const [creds, setCreds] = useState(null);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const load = useCallback(() => {
    api('/agencies').then((d) => setAgencies(d.agencies)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const d = await api('/agencies', { method: 'POST', body: f });
      setAdding(false);
      setF({ name: '', admin_name: '', admin_email: '', admin_mobile: '' });
      setCreds(d.admin);
      load();
    } catch (err) { setError(err.message); }
  };

  const toggle = async (a) => {
    try {
      await api(`/agencies/${a.id}`, { method: 'PATCH', body: { status: a.status === 'active' ? 'suspended' : 'active' } });
      load();
    } catch (err) { setError(err.message); }
  };

  return (
    <>
      <div className="head">
        <h2>Agencies</h2>
        <button className="btn" onClick={() => setAdding(true)}>Add agency</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Agency</th><th>Admin</th><th>Clients</th><th>Status</th><th>Created</th><th /></tr></thead>
          <tbody>
            {agencies?.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.contact_name} <span className="muted small">{a.email}</span></td>
                <td>{a.clients}</td>
                <td><Badge value={a.status} /></td>
                <td>{fmtDate(a.created_at)}</td>
                <td><button className="btn ghost small" onClick={() => toggle(a)}>{a.status === 'active' ? 'Suspend' : 'Activate'}</button></td>
              </tr>
            ))}
            {agencies && !agencies.length && <tr><td colSpan="6" className="muted">No agencies yet.</td></tr>}
            {!agencies && <tr><td colSpan="6" className="muted">Loading...</td></tr>}
          </tbody>
        </table>
      </div>
      {adding && (
        <Modal title="Add agency" onClose={() => setAdding(false)}>
          <form onSubmit={submit}>
            <Field label="Agency name"><input value={f.name} onChange={set('name')} required /></Field>
            <Field label="Admin name"><input value={f.admin_name} onChange={set('admin_name')} required /></Field>
            <Field label="Admin email (login)"><input type="email" value={f.admin_email} onChange={set('admin_email')} required /></Field>
            <Field label="Admin mobile"><input value={f.admin_mobile} onChange={set('admin_mobile')} /></Field>
            {error && <div className="error">{error}</div>}
            <div className="row">
              <button className="btn">Create agency</button>
              <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
      {creds && <Credentials title="Agency admin login" email={creds.email} password={creds.temp_password} onClose={() => setCreds(null)} />}
    </>
  );
}
