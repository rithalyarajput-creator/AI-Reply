import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Bars, Columns, Err, Field, PageHead, Tabs, fmtDate, useLoad,
} from '../../components/ui.jsx';

const origin = typeof window !== 'undefined' ? window.location.origin : '';

function Analytics() {
  const [days, setDays] = useState(30);
  const [d, , error] = useLoad(() => api('/portal/reports/analytics', { query: { days } }), [days]);
  const f = d?.funnel;
  return (
    <>
      <div className="row">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90].map((n) => <option key={n} value={n}>Last {n} days</option>)}
        </select>
      </div>
      <Err error={error} />
      {d && (
        <>
          <div className="cols">
            <div className="card">
              <h3>Campaign delivery</h3>
              <Bars max={f.total || 1} rows={[
                { label: 'Total', value: f.total, color: '#94a3b8' },
                { label: 'Sent', value: f.sent, color: '#6FB3B8' },
                { label: 'Delivered', value: f.delivered, color: '#388087' },
                { label: 'Seen', value: f.seen, color: '#2a5f66' },
                { label: 'Failed', value: f.failed, color: '#dc2626' },
              ]} />
            </div>
            <div className="card">
              <h3>Top failure reasons</h3>
              {d.failures.length ? (
                <table><tbody>{d.failures.map((x) => <tr key={x.reason}><td>{x.reason}</td><td>{x.count}</td></tr>)}</tbody></table>
              ) : <p className="muted">No failed messages.</p>}
              <p className="muted small">Opted out: {d.contacts.opted_out} of {d.contacts.total} contacts. A rising opt-out rate hurts your number quality.</p>
            </div>
          </div>
          <div className="card">
            <h3>Messages per day</h3>
            <Columns data={d.daily} keys={[{ key: 'sent', label: 'Sent', color: '#388087' }, { key: 'received', label: 'Received', color: '#6FB3B8' }]} />
          </div>
          <div className="card table-wrap"><h3 className="pad">Agents</h3><table>
            <thead><tr><th>Agent</th><th>Role</th><th>Contacts</th><th>Replies</th></tr></thead>
            <tbody>
              {d.agents.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.role.replace('_', ' ')}</td><td>{a.contacts}</td><td>{a.replies}</td></tr>)}
              {!d.agents.length && <tr><td colSpan="4" className="muted">No agents yet.</td></tr>}
            </tbody></table></div>
        </>
      )}
    </>
  );
}

function ShortUrl() {
  const { user } = useAuth();
  const [d, load, error] = useLoad(() => api('/portal/short-links'), []);
  const [f, setF] = useState({ target_url: '', title: '' });
  const [err2, setErr2] = useState('');
  const add = async (e) => {
    e.preventDefault();
    setErr2('');
    try { await api('/portal/short-links', { method: 'POST', body: f }); setF({ target_url: '', title: '' }); load(); }
    catch (er) { setErr2(er.message); }
  };
  const del = async (l) => { await api(`/portal/short-links/${l.id}`, { method: 'DELETE' }); load(); };
  const canAdd = user.role !== 'agent_head' && user.role !== 'agent';
  return (
    <>
      {canAdd && (
        <form className="card row" onSubmit={add}>
          <Field label="Long link"><input value={f.target_url} onChange={(e) => setF({ ...f, target_url: e.target.value })} placeholder="https://" required /></Field>
          <Field label="Title (optional)"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <button className="btn">Shorten</button>
        </form>
      )}
      <Err error={error || err2} />
      <div className="card table-wrap"><table>
        <thead><tr><th>Short link</th><th>Goes to</th><th>Clicks</th><th>Created</th><th /></tr></thead>
        <tbody>
          {d?.links.map((l) => (
            <tr key={l.id}>
              <td><code>{origin}/r/{l.code}</code>{l.title && <div className="muted small">{l.title}</div>}</td>
              <td className="clip-cell">{l.target_url}</td><td>{l.clicks}</td><td>{fmtDate(l.created_at)}</td>
              <td className="actions">{canAdd && <button className="btn ghost small" onClick={() => del(l)}>Delete</button>}</td>
            </tr>
          ))}
          {d && !d.links.length && <tr><td colSpan="5" className="muted">No short links yet.</td></tr>}
        </tbody></table></div>
    </>
  );
}

function BotReport() {
  const [d, , error] = useLoad(() => api('/portal/reports/bot'), []);
  return (
    <>
      <Err error={error} />
      {d && (
        <>
          <div className="grid">
            <div className="card stat"><div className="muted small">Bot replies (30 days)</div><div className="big">{d.bot_replies}</div></div>
            <div className="card stat"><div className="muted small">Human replies (30 days)</div><div className="big">{d.human_replies}</div></div>
            <div className="card stat"><div className="muted small">Handed to a person</div><div className="big">{d.handoffs}</div></div>
            <div className="card stat"><div className="muted small">Conversations</div><div className="big">{d.conversations}</div></div>
          </div>
          <div className="card"><h3>Bot replies per day</h3>
            <Columns data={d.daily.map((x) => ({ day: x.day, replies: x.replies }))} keys={[{ key: 'replies', label: 'Replies', color: '#2a5f66' }]} />
          </div>
        </>
      )}
    </>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('analytics');
  return (
    <>
      <PageHead title="Reports" />
      <Tabs tabs={[['analytics', 'Analytics'], ['short', 'Short URL'], ['bot', 'Bot Report']]} value={tab} onChange={setTab} />
      {tab === 'analytics' && <Analytics />}
      {tab === 'short' && <ShortUrl />}
      {tab === 'bot' && <BotReport />}
    </>
  );
}
