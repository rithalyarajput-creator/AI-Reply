import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import {
  Badge, Empty, Err, Field, Modal, PageHead, Tabs, fmtDate, useLoad,
} from '../../components/ui.jsx';

const TRIGGERS = [
  ['new_contact', 'A new contact messages you'],
  ['keyword', 'A message contains a keyword'],
  ['inbound_message', 'Any message is received'],
];
const ACTIONS = [
  ['send_text', 'Send a text reply'],
  ['add_label', 'Add a label'],
  ['assign_agent', 'Assign to an agent'],
];

function Create({ onClose, onSaved }) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('new_contact');
  const [value, setValue] = useState('');
  const [actions, setActions] = useState([{ type: 'send_text', text: '' }]);
  const [labels, setLabels] = useState([]);
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/portal/labels').then((d) => setLabels(d.labels)).catch(() => {});
    api('/portal/agents').then((d) => setAgents(d.agents)).catch(() => {});
  }, []);
  const upd = (i, patch) => setActions(actions.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/portal/workflows', { method: 'POST', body: { name, trigger, trigger_value: value, actions } });
      onSaved();
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal title="Create workflow" onClose={onClose} wide>
      <form onSubmit={save}>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="When">
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
            {TRIGGERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        {trigger === 'keyword' && <Field label="Keyword"><input value={value} onChange={(e) => setValue(e.target.value)} required /></Field>}
        <b>Then do</b>
        {actions.map((a, i) => (
          <div className="row" key={i}>
            <select value={a.type} onChange={(e) => upd(i, { type: e.target.value, text: '', label_id: '', user_id: '' })}>
              {ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {a.type === 'send_text' && <input placeholder="Message" value={a.text || ''} onChange={(e) => upd(i, { text: e.target.value })} />}
            {a.type === 'add_label' && (
              <select value={a.label_id || ''} onChange={(e) => upd(i, { label_id: e.target.value })}>
                <option value="">Choose label</option>
                {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            {a.type === 'assign_agent' && (
              <select value={a.user_id || ''} onChange={(e) => upd(i, { user_id: e.target.value })}>
                <option value="">Choose agent</option>
                {agents.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
            {actions.length > 1 && <button type="button" className="btn ghost small" onClick={() => setActions(actions.filter((_, j) => j !== i))}>x</button>}
          </div>
        ))}
        {actions.length < 5 && <button type="button" className="btn ghost small" onClick={() => setActions([...actions, { type: 'send_text', text: '' }])}>+ Action</button>}
        <Err error={error} />
        <div className="row">
          <button className="btn">Create workflow</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Workflows() {
  const [tab, setTab] = useState('mine');
  const [d, load, error] = useLoad(() => api('/portal/workflows'), []);
  const [logs, loadLogs] = useLoad(() => api('/portal/workflows/logs'), []);
  const [creating, setCreating] = useState(false);
  const toggle = async (w) => { await api(`/portal/workflows/${w.id}`, { method: 'PATCH', body: { enabled: !w.enabled } }); load(); };
  const del = async (w) => { if (window.confirm(`Delete "${w.name}"?`)) { await api(`/portal/workflows/${w.id}`, { method: 'DELETE' }); load(); } };

  return (
    <>
      <PageHead title="Workflows" sub="If this happens, do that. Runs in the background when messages arrive.">
        <button className="btn" onClick={() => setCreating(true)}>Create workflow</button>
      </PageHead>
      <Tabs tabs={[['mine', 'My Workflows'], ['logs', 'Execution Logs']]} value={tab} onChange={(t) => { setTab(t); if (t === 'logs') loadLogs(); }} />
      <Err error={error} />
      {tab === 'mine' && (
        <>
          {d && !d.workflows.length && <Empty>No workflows yet.</Empty>}
          <div className="grid cards">
            {d?.workflows.map((w) => (
              <div className="card" key={w.id}>
                <h3>{w.name}</h3>
                <p className="muted small">
                  When: {TRIGGERS.find(([k]) => k === w.trigger)?.[1]}{w.trigger_value ? ` "${w.trigger_value}"` : ''}
                </p>
                <ul className="small">{w.actions.map((a, i) => <li key={i}>{ACTIONS.find(([k]) => k === a.type)?.[1]}</li>)}</ul>
                <Badge value={w.enabled ? 'active' : 'disabled'} />
                <div className="row">
                  <button className="btn ghost small" onClick={() => toggle(w)}>{w.enabled ? 'Turn off' : 'Turn on'}</button>
                  <button className="btn ghost small" onClick={() => del(w)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'logs' && (
        <div className="card table-wrap"><table>
          <thead><tr><th>When</th><th>Workflow</th><th>Contact</th><th>Result</th><th>Detail</th></tr></thead>
          <tbody>
            {logs?.logs.map((l) => (
              <tr key={l.id}><td>{fmtDate(l.created_at)}</td><td>{l.workflow_name}</td><td>{l.contact_phone}</td><td><Badge value={l.result === 'ok' ? 'active' : 'suspended'} /></td><td>{l.detail}</td></tr>
            ))}
            {logs && !logs.logs.length && <tr><td colSpan="5" className="muted">Nothing has run yet.</td></tr>}
          </tbody></table></div>
      )}
      {creating && <Create onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </>
  );
}
