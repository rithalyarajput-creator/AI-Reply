import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import UsersPanel from '../../components/UsersPanel.jsx';
import { ROLE_LABEL } from '../../components/Layout.jsx';
import {
  Err, Field, PageHead, Tabs, useLoad,
} from '../../components/ui.jsx';

function Personal() {
  const { user, setUser, impersonating } = useAuth();
  const [f, setF] = useState({ name: user.name, mobile: user.mobile || '' });
  const [prefs, setPrefs] = useState({ new_message: true, campaign_done: true, low_balance: true });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api('/auth/prefs').then((d) => setPrefs((p) => ({ ...p, ...d.prefs }))).catch(() => {});
  }, []);
  const save = async (e) => {
    e.preventDefault();
    setMsg(''); setError('');
    try {
      const r = await api('/auth/profile', { method: 'PATCH', body: { ...f, prefs } });
      setUser({ ...user, name: r.user.name, mobile: r.user.mobile });
      setMsg('Saved');
    } catch (er) { setError(er.message); }
  };
  const P = ({ k, label }) => (
    <label className="check"><input type="checkbox" checked={!!prefs[k]} onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })} /> {label}</label>
  );
  return (
    <form className="card" onSubmit={save}>
      <h3>Profile</h3>
      <div className="form-grid">
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Mobile"><input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
        <Field label="Email (login)"><input value={user.email} disabled /></Field>
        <Field label="Role"><input value={ROLE_LABEL[user.role]} disabled /></Field>
      </div>
      <h3>Notification preferences</h3>
      <P k="new_message" label="New customer message" />
      <P k="campaign_done" label="Campaign finished" />
      <P k="low_balance" label="Low wallet balance" />
      <p className="muted small">Change your password from the "Change password" link in the menu.</p>
      <Err error={error} />
      {msg && <div className="ok">{msg}</div>}
      <button className="btn" disabled={impersonating}>Save</button>
    </form>
  );
}

function Agents() {
  const { user, scope } = useAuth();
  const [d, load, error] = useLoad(() => api('/users', { query: { client_id: scope?.id } }), [scope?.id]);
  const [msg, setMsg] = useState('');
  const [err2, setErr2] = useState('');
  const [dist, setDist] = useState({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const agents = (d?.users || []).filter((u) => ['agent', 'agent_head'].includes(u.role) && u.status === 'active');
  const total = agents.reduce((s, a) => s + Number(dist[a.id] ?? a.dist_percent), 0);

  const saveDist = async () => {
    setErr2(''); setMsg('');
    try {
      for (const a of agents) {
        if (dist[a.id] !== undefined && Number(dist[a.id]) !== a.dist_percent) {
          // eslint-disable-next-line no-await-in-loop
          await api(`/users/${a.id}`, { method: 'PATCH', body: { dist_percent: Number(dist[a.id]) } });
        }
      }
      setMsg('Distribution saved'); setDist({}); load();
    } catch (e) { setErr2(e.message); }
  };
  const transfer = async () => {
    setErr2(''); setMsg('');
    try {
      const r = await api(`/users/${from}/transfer`, { method: 'POST', body: { to_user_id: to } });
      setMsg(`Moved ${r.moved} contacts.`); load();
    } catch (e) { setErr2(e.message); }
  };

  return (
    <>
      <UsersPanel />
      <div className="card">
        <h3>Percentage distribution</h3>
        <p className="muted small">New chats are shared between agents by these percentages (turn on Auto Assign in Automations, mode "Use agent percentages"). They should add up to 100.</p>
        <table><tbody>
          {agents.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td><td className="muted small">{a.total_contacts} contacts</td>
              <td><input type="number" min="0" max="100" value={dist[a.id] ?? a.dist_percent} onChange={(e) => setDist({ ...dist, [a.id]: e.target.value })} /> %</td>
            </tr>
          ))}
          {!agents.length && <tr><td className="muted">No agents yet.</td></tr>}
        </tbody></table>
        <p className={total === 100 || total === 0 ? 'muted' : 'error-text'}>Total: {total}%</p>
        <button className="btn" onClick={saveDist} disabled={!agents.length}>Save distribution</button>
      </div>
      {user.role !== 'agent' && (
        <div className="card">
          <h3>Transfer contacts</h3>
          <div className="row">
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">From agent</option>
              {(d?.users || []).filter((u) => ['agent', 'agent_head'].includes(u.role)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">To agent</option>
              {agents.filter((a) => a.id !== from).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button className="btn" disabled={!from || !to} onClick={transfer}>Transfer all contacts</button>
          </div>
        </div>
      )}
      <Err error={error || err2} />
      {msg && <div className="ok">{msg}</div>}
    </>
  );
}

function Labels() {
  const [d, load, error] = useLoad(() => api('/portal/labels'), []);
  const [f, setF] = useState({ name: '', color: '#16a34a' });
  const [q, setQ] = useState('');
  const [err2, setErr2] = useState('');
  const add = async (e) => {
    e.preventDefault();
    setErr2('');
    try { await api('/portal/labels', { method: 'POST', body: f }); setF({ name: '', color: f.color }); load(); }
    catch (er) { setErr2(er.message); }
  };
  const del = async (l) => { if (window.confirm(`Delete label "${l.name}"?`)) { await api(`/portal/labels/${l.id}`, { method: 'DELETE' }); load(); } };
  const rename = async (l) => {
    const name = window.prompt('New name', l.name);
    if (name && name.trim()) { try { await api(`/portal/labels/${l.id}`, { method: 'PATCH', body: { name } }); load(); } catch (e) { setErr2(e.message); } }
  };
  const list = (d?.labels || []).filter((l) => l.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <form className="card row" onSubmit={add}>
        <Field label="New label"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Color"><input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>
        <button className="btn">Add label</button>
      </form>
      <input placeholder="Search label" value={q} onChange={(e) => setQ(e.target.value)} />
      <Err error={error || err2} />
      <div className="grid cards">
        {list.map((l) => (
          <div className="card" key={l.id}>
            <span className="chip" style={{ background: l.color }}>{l.name}</span>
            <div className="muted small">{l.contacts} contacts</div>
            <div className="row">
              <button className="btn ghost small" onClick={() => rename(l)}>Rename</button>
              <button className="btn ghost small" onClick={() => del(l)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {d && !list.length && <p className="muted">No labels yet.</p>}
    </>
  );
}

export default function Configurations() {
  const [tab, setTab] = useState('personal');
  return (
    <>
      <PageHead title="Configurations" />
      <Tabs tabs={[['personal', 'Personal'], ['agents', 'Agents'], ['labels', 'Labels']]} value={tab} onChange={setTab} />
      {tab === 'personal' && <Personal />}
      {tab === 'agents' && <Agents />}
      {tab === 'labels' && <Labels />}
    </>
  );
}
