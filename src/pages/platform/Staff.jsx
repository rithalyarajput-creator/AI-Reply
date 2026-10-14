import { useState } from 'react';
import { api } from '../../api.js';
import {
  Badge, Credentials, Err, Field, Modal, PageHead, fmtDate, useLoad,
} from '../../components/ui.jsx';

export default function Staff() {
  const [d, load, error] = useLoad(() => api('/staff'), []);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', email: '', mobile: '', role: 'staff_support' });
  const [creds, setCreds] = useState(null);
  const [err2, setErr2] = useState('');

  const create = async (e) => {
    e.preventDefault();
    setErr2('');
    try {
      const r = await api('/staff', { method: 'POST', body: f });
      setAdding(false);
      setF({ name: '', email: '', mobile: '', role: 'staff_support' });
      setCreds({ email: r.email, password: r.temp_password, title: 'Staff login created' });
      load();
    } catch (er) { setErr2(er.message); }
  };
  const toggle = async (u) => {
    await api(`/staff/${u.id}`, { method: 'PATCH', body: { status: u.status === 'active' ? 'disabled' : 'active' } });
    load();
  };
  const reset = async (u) => {
    if (!window.confirm(`Reset password for ${u.email}?`)) return;
    const r = await api(`/staff/${u.id}/reset-password`, { method: 'POST' });
    setCreds({ email: r.email, password: r.temp_password, title: 'New temporary password' });
  };
  const changeRole = async (u, role) => { await api(`/staff/${u.id}`, { method: 'PATCH', body: { role } }); load(); };

  const roles = d?.roles || [];
  const label = (k) => roles.find((r) => r.key === k)?.label || k;

  return (
    <>
      <PageHead title="Staff and Roles" sub="Your own team. Each person gets a separate login, and every sensitive action is audit-logged.">
        <button className="btn" onClick={() => setAdding(true)}>Add staff</button>
      </PageHead>
      <Err error={error} />
      <div className="card table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th /></tr></thead>
        <tbody>
          {d?.staff.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td><td>{u.email}</td>
              <td>
                {u.role === 'super_admin' ? label(u.role) : (
                  <select value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                    {roles.filter((r) => r.key !== 'super_admin').map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                )}
              </td>
              <td><Badge value={u.status} /></td><td>{fmtDate(u.last_login_at)}</td>
              <td className="actions">
                {u.role !== 'super_admin' && (
                  <>
                    <button className="btn ghost small" onClick={() => toggle(u)}>{u.status === 'active' ? 'Disable' : 'Enable'}</button>
                    <button className="btn ghost small" onClick={() => reset(u)}>Reset password</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody></table></div>

      <h3>What each role can do</h3>
      <div className="card table-wrap"><table>
        <thead><tr><th>Module</th>{roles.map((r) => <th key={r.key}>{r.label}</th>)}</tr></thead>
        <tbody>
          {d?.matrix.map((m) => (
            <tr key={m.key}><td>{m.label}</td>{roles.map((r) => <td key={r.key}>{m.roles[r.key] ? 'Yes' : '-'}</td>)}</tr>
          ))}
        </tbody></table></div>
      <p className="muted small">
        Two-factor login is not built yet. Until it is, use strong unique passwords, one login per person,
        and disable people the day they leave.
      </p>

      {adding && (
        <Modal title="Add staff" onClose={() => setAdding(false)}>
          <form onSubmit={create}>
            <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
            <Field label="Email (login)"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
            <Field label="Mobile"><input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
            <Field label="Role">
              <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {roles.filter((r) => r.key !== 'super_admin').map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </Field>
            <Err error={err2} />
            <div className="row">
              <button className="btn">Create login</button>
              <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
      {creds && <Credentials title={creds.title} email={creds.email} password={creds.password} onClose={() => setCreds(null)} />}
    </>
  );
}
