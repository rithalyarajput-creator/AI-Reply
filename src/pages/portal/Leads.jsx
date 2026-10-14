import { useCallback, useEffect, useState } from 'react';
import { api, downloadCsv, parseCsv } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Err, Field, Modal, PageHead, fmtDate,
} from '../../components/ui.jsx';

function ImportModal({ labels, onClose, onDone }) {
  const [rows, setRows] = useState([]);
  const [labelId, setLabelId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const parsed = parseCsv(await file.text());
    const header = parsed[0].map((h) => h.trim().toLowerCase());
    const hasHeader = header.some((h) => ['phone', 'mobile', 'number', 'name'].includes(h));
    const pi = hasHeader ? Math.max(header.findIndex((h) => ['phone', 'mobile', 'number'].includes(h)), 0) : 0;
    const ni = hasHeader ? header.findIndex((h) => h === 'name') : 1;
    setRows((hasHeader ? parsed.slice(1) : parsed).map((r) => ({ phone: r[pi], name: ni >= 0 ? r[ni] : '' })));
  };
  const go = async () => {
    setError('');
    try { setResult(await api('/portal/leads/import', { method: 'POST', body: { rows, label_id: labelId || undefined } })); }
    catch (e) { setError(e.message); }
  };
  return (
    <Modal title="Import leads from CSV" onClose={onClose}>
      <p className="muted">CSV with columns <b>phone</b> and <b>name</b>. Include country code (91…). Only import people who agreed to hear from you.</p>
      <input type="file" accept=".csv,text/csv" onChange={onFile} />
      {rows.length > 0 && <p>{rows.length} rows ready.</p>}
      <Field label="Add label to all imported leads (optional)">
        <select value={labelId} onChange={(e) => setLabelId(e.target.value)}>
          <option value="">No label</option>
          {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Field>
      <Err error={error} />
      {result && <div className="ok">Added {result.added}, already existed {result.skipped}, invalid {result.invalid}.</div>}
      <div className="row">
        {!result && <button className="btn" disabled={!rows.length} onClick={go}>Import</button>}
        <button className="btn ghost" onClick={() => { if (result) onDone(); onClose(); }}>{result ? 'Done' : 'Cancel'}</button>
      </div>
    </Modal>
  );
}

export default function Leads() {
  const { user, scope } = useAuth();
  const admin = user.role !== 'agent' && user.role !== 'agent_head';
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [labelId, setLabelId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [data, setData] = useState(null);
  const [labels, setLabels] = useState([]);
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [f, setF] = useState({ phone: '', name: '' });

  const load = useCallback(() => {
    api('/portal/leads', { query: { page, q, label_id: labelId, agent_id: agentId } })
      .then(setData).catch((e) => setError(e.message));
  }, [page, q, labelId, agentId]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    api('/portal/labels').then((d) => setLabels(d.labels)).catch(() => {});
    if (user.role !== 'agent') api('/portal/agents').then((d) => setAgents(d.agents)).catch(() => {});
  }, [user.role, scope]);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    try { await api('/portal/leads', { method: 'POST', body: f }); setAdding(false); setF({ phone: '', name: '' }); load(); }
    catch (err) { setError(err.message); }
  };
  const assign = async (id, agent_id) => { await api(`/portal/leads/${id}`, { method: 'PATCH', body: { agent_id: agent_id || null } }); load(); };
  const del = async (l) => {
    if (!window.confirm(`Delete ${l.phone}?`)) return;
    await api(`/portal/leads/${l.id}`, { method: 'DELETE' });
    load();
  };
  const exportAll = async () => {
    const d = await api('/portal/leads', { query: { limit: 200, page: 1, q, label_id: labelId, agent_id: agentId } });
    downloadCsv('leads.csv', [
      ['Phone', 'Name', 'Agent', 'Labels', 'Opted out', 'Created'],
      ...d.leads.map((l) => [l.phone, l.name, l.agent_name, l.labels.map((x) => x.name).join(';'), l.opted_out ? 'yes' : '', l.created_at]),
    ]);
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  return (
    <>
      <PageHead title="Leads" sub={data ? `${data.total} contacts` : ''}>
        <button className="btn" onClick={() => setAdding(true)}>+ Lead</button>
        {admin && <button className="btn ghost" onClick={() => setImporting(true)}>Import CSV</button>}
        <button className="btn ghost" onClick={exportAll}>Download</button>
      </PageHead>
      <div className="row">
        <input placeholder="Search number or name" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={labelId} onChange={(e) => { setLabelId(e.target.value); setPage(1); }}>
          <option value="">All labels</option>
          {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {user.role !== 'agent' && (
          <select value={agentId} onChange={(e) => { setAgentId(e.target.value); setPage(1); }}>
            <option value="">All agents</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>
      <Err error={error} />
      <div className="card table-wrap"><table>
        <thead><tr><th>Number</th><th>Name</th><th>Agent</th><th>Labels</th><th>Created</th><th /></tr></thead>
        <tbody>
          {data?.leads.map((l) => (
            <tr key={l.id}>
              <td>{l.phone}{l.opted_out && <span className="badge suspended">opted out</span>}</td>
              <td>{l.name || '-'}</td>
              <td>
                {user.role === 'agent' ? (l.agent_name || '-') : (
                  <select value={l.agent_id || ''} onChange={(e) => assign(l.id, e.target.value)}>
                    <option value="">Unassigned</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
              </td>
              <td>{l.labels.map((x) => <span key={x.id} className="chip" style={{ background: x.color }}>{x.name}</span>)}</td>
              <td>{fmtDate(l.created_at)}</td>
              <td className="actions">{admin && <button className="btn ghost small" onClick={() => del(l)}>Delete</button>}</td>
            </tr>
          ))}
          {data && !data.leads.length && <tr><td colSpan="6" className="muted">No leads yet.</td></tr>}
          {!data && <tr><td colSpan="6" className="muted">Loading...</td></tr>}
        </tbody></table></div>
      <div className="row">
        <button className="btn ghost small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="muted">Page {page} of {pages}</span>
        <button className="btn ghost small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>

      {adding && (
        <Modal title="Add lead" onClose={() => setAdding(false)}>
          <form onSubmit={add}>
            <Field label="Mobile number (with country code)"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required /></Field>
            <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Err error={error} />
            <div className="row"><button className="btn">Add</button><button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button></div>
          </form>
        </Modal>
      )}
      {importing && <ImportModal labels={labels} onClose={() => setImporting(false)} onDone={load} />}
    </>
  );
}
