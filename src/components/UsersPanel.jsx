import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLE_LABEL } from './Layout.jsx';
import {
  Badge, Credentials, Err, Field, Modal, fmtDate,
} from './ui.jsx';

const FULL = ['client_admin', 'agent_head', 'agent'];
const MANAGEABLE = {
  super_admin: FULL,
  staff_sales: FULL,
  agency_admin: FULL,
  client_admin: ['agent_head', 'agent'],
};

function AddUser({ clientId, roles, onClose, onCreated }) {
  const [f, setF] = useState({ name: '', email: '', mobile: '', role: roles.includes('agent') ? 'agent' : roles[0] });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const d = await api('/users', { method: 'POST', body: { ...f, client_id: clientId } });
      onCreated({ email: d.email, password: d.temp_password });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name"><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Email (login)"><input type="email" value={f.email} onChange={set('email')} required /></Field>
        <Field label="Mobile"><input value={f.mobile} onChange={set('mobile')} /></Field>
        <Field label="Role">
          <select value={f.role} onChange={set('role')}>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
        <Err error={error} />
        <div className="row">
          <button className="btn">Create user</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// Users of one client. Platform staff and agencies pass clientId (or view a client through scope);
// a Client Admin always sees only their own company.
export default function UsersPanel({ clientId }) {
  const { user: me, scope } = useAuth();
  const effective = clientId || scope?.id;
  const roles = MANAGEABLE[me.role] || [];
  const [users, setUsers] = useState(null);
  const [adding, setAdding] = useState(false);
  const [creds, setCreds] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/users', { query: { client_id: effective } })
      .then((d) => setUsers(d.users.filter((u) => u.role !== 'agency_admin')))
      .catch((e) => setError(e.message));
  }, [effective]);
  useEffect(load, [load]);

  const canManage = (u) => u.id !== me.id && roles.includes(u.role);

  const toggle = async (u) => {
    setError('');
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: { status: u.status === 'active' ? 'disabled' : 'active' } });
      load();
    } catch (e) { setError(e.message); }
  };
  const reset = async (u) => {
    if (!window.confirm(`Reset password for ${u.email}?`)) return;
    setError('');
    try {
      const d = await api(`/users/${u.id}/reset-password`, { method: 'POST' });
      setCreds({ email: d.email, password: d.temp_password, title: 'New temporary password' });
    } catch (e) { setError(e.message); }
  };

  return (
    <>
      <div className="head">
        <h3>Users</h3>
        {roles.length > 0 && <button className="btn" onClick={() => setAdding(true)}>Add user</button>}
      </div>
      <Err error={error} />
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Login email</th><th>Role</th><th>Status</th><th>Contacts</th><th>Last login</th><th /></tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td><Badge value={u.status} /></td>
                <td>{u.total_contacts ?? 0}</td>
                <td>{fmtDate(u.last_login_at)}</td>
                <td className="actions">
                  {canManage(u) && (
                    <>
                      <button className="btn ghost small" onClick={() => toggle(u)}>{u.status === 'active' ? 'Disable' : 'Enable'}</button>
                      <button className="btn ghost small" onClick={() => reset(u)}>Reset password</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {users && !users.length && <tr><td colSpan="7" className="muted">No users yet.</td></tr>}
            {!users && <tr><td colSpan="7" className="muted">Loading...</td></tr>}
          </tbody>
        </table>
      </div>
      {adding && (
        <AddUser
          clientId={effective}
          roles={roles}
          onClose={() => setAdding(false)}
          onCreated={(c) => { setAdding(false); setCreds({ ...c, title: 'User login created' }); load(); }}
        />
      )}
      {creds && <Credentials title={creds.title} email={creds.email} password={creds.password} onClose={() => setCreds(null)} />}
    </>
  );
}
