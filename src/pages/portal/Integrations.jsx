import { useState } from 'react';
import { api } from '../../api.js';
import {
  Badge, Empty, Err, Field, Modal, PageHead, Tabs, fmtDate, useLoad,
} from '../../components/ui.jsx';

const origin = typeof window !== 'undefined' ? window.location.origin : '';

function Connect({ onClose, onDone }) {
  const [f, setF] = useState({ display_name: '', phone_number_id: '', waba_id: '', access_token: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api('/portal/channels', { method: 'POST', body: f }); onDone(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Connect WhatsApp number" onClose={onClose}>
      <p className="muted small">
        Find these in Meta's WhatsApp Manager / developer dashboard for the number. The number must not be
        running on the normal WhatsApp app. The token is stored encrypted and never shown again.
      </p>
      <form onSubmit={go}>
        <Field label="Display name"><input value={f.display_name} onChange={set('display_name')} /></Field>
        <Field label="Phone Number ID"><input value={f.phone_number_id} onChange={set('phone_number_id')} required inputMode="numeric" /></Field>
        <Field label="WhatsApp Business Account ID"><input value={f.waba_id} onChange={set('waba_id')} required inputMode="numeric" /></Field>
        <Field label="Permanent access token"><input type="password" value={f.access_token} onChange={set('access_token')} required autoComplete="off" /></Field>
        <Err error={error} />
        <div className="row">
          <button className="btn" disabled={busy}>{busy ? 'Checking with WhatsApp...' : 'Connect'}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function YourChannel() {
  const [d, load, error] = useLoad(() => api('/portal/channels'), []);
  const [connecting, setConnecting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err2, setErr2] = useState('');
  const sync = async (c) => {
    setErr2(''); setMsg('');
    try { await api(`/portal/channels/${c.id}/sync`, { method: 'POST' }); setMsg('Status refreshed from WhatsApp.'); load(); }
    catch (e) { setErr2(e.message); load(); }
  };
  const disconnect = async (c) => {
    if (!window.confirm(`Disconnect ${c.display_name}? Sending will stop and the saved token is deleted.`)) return;
    await api(`/portal/channels/${c.id}`, { method: 'DELETE' });
    load();
  };
  return (
    <>
      <div className="row"><button className="btn" onClick={() => setConnecting(true)}>Connect WhatsApp number</button></div>
      <Err error={error || err2} />
      {msg && <div className="ok">{msg}</div>}
      <div className="grid cards">
        {d?.channels.map((c) => (
          <div className="card" key={c.id}>
            <h3>{c.display_name}</h3>
            <Badge value={c.status} />
            <div className="kv muted small">
              <div>Number: {c.phone_number || '-'}</div>
              <div>Message limit tier: {c.tier || 'N/A'}</div>
              <div>Quality rating: {c.quality_rating || 'N/A'}</div>
              <div>Webhook: {c.webhook_ok ? 'receiving events' : 'no events received yet'}</div>
              {c.last_error && <div className="error-text">{c.last_error}</div>}
            </div>
            <div className="row">
              <button className="btn ghost small" onClick={() => sync(c)}>Refresh status</button>
              {c.status === 'connected' && <button className="btn ghost small" onClick={() => disconnect(c)}>Disconnect</button>}
            </div>
          </div>
        ))}
      </div>
      {d && !d.channels.length && <Empty>No WhatsApp number connected yet.</Empty>}
      <div className="card">
        <h3>Webhook setup</h3>
        <p className="muted small">In your Meta app (WhatsApp, Configuration), set:</p>
        <table><tbody>
          <tr><td>Callback URL</td><td><code>{origin}/api/webhooks/whatsapp</code></td></tr>
          <tr><td>Verify token</td><td>The value of <code>META_VERIFY_TOKEN</code> set by your platform administrator</td></tr>
          <tr><td>Subscribe to</td><td><code>messages</code></td></tr>
        </tbody></table>
      </div>
      {connecting && <Connect onClose={() => setConnecting(false)} onDone={() => { setConnecting(false); load(); }} />}
    </>
  );
}

const MARKET = [
  ['WhatsApp', 'Official Business API', true],
  ['Facebook', 'Messenger', false],
  ['Instagram', 'Direct Messages', false],
  ['SMS', 'Text messages (DLT needed in India)', false],
  ['RCS', 'Rich Communication', false],
];
const TOOLS = ['Google Sheets', 'HubSpot', 'LeadSquared', 'Calendly', 'Freshchat', 'Zoho', 'Shopify', 'Razorpay'];

function Marketplace({ goChannel }) {
  return (
    <>
      <h3>Channels</h3>
      <div className="grid cards">
        {MARKET.map(([name, sub, live]) => (
          <div className="card" key={name}>
            <h3>{name}</h3>
            <p className="muted small">{sub}</p>
            {live ? <button className="btn small" onClick={goChannel}>Connect</button> : <span className="badge">Coming soon</span>}
          </div>
        ))}
      </div>
      <h3>Business integrations</h3>
      <p className="muted small">Use the API key and the Custom webhook today to connect any of these through your own tools.</p>
      <div className="grid cards">
        {TOOLS.map((t) => <div className="card" key={t}><b>{t}</b><div><span className="badge">Coming soon</span></div></div>)}
      </div>
    </>
  );
}

function ApiKey() {
  const [d, load, error] = useLoad(() => api('/portal/api-keys'), []);
  const [fresh, setFresh] = useState('');
  const [copied, setCopied] = useState(false);
  const [err2, setErr2] = useState('');
  const active = d?.keys.find((k) => k.active);
  const gen = async () => {
    if (active && !window.confirm('This replaces your current key. Anything using the old key will stop working. Continue?')) return;
    setErr2('');
    try { const r = await api('/portal/api-keys', { method: 'POST' }); setFresh(r.key); setCopied(false); load(); }
    catch (e) { setErr2(e.message); }
  };
  const revoke = async () => {
    if (!window.confirm('Delete the active key?')) return;
    await api('/portal/api-keys', { method: 'DELETE' });
    setFresh('');
    load();
  };
  const copy = async () => { try { await navigator.clipboard.writeText(fresh); setCopied(true); } catch { /* ignore */ } };
  return (
    <>
      <Err error={error || err2} />
      <div className="card">
        <h3>API key</h3>
        <p className="muted small">Lets your website or CRM talk to AI Reply. Send it in the <code>X-Api-Key</code> header. Never share it. If it leaks, generate a new one.</p>
        {fresh ? (
          <>
            <pre className="creds">{fresh}</pre>
            <p className="small">Copy it now. For safety it is shown only once.</p>
            <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy key'}</button>
          </>
        ) : active ? <p>Active key: <code>{active.prefix}••••••••••••</code> (created {fmtDate(active.created_at)})</p> : <p className="muted">No active key.</p>}
        <div className="row">
          <button className="btn" onClick={gen}>{active ? 'Regenerate' : 'Generate key'}</button>
          {active && <button className="btn danger ghost" onClick={revoke}>Delete key</button>}
        </div>
      </div>
      <div className="card table-wrap"><h3 className="pad">Key history</h3><table>
        <thead><tr><th>Key</th><th>Created</th><th>Status</th><th>Revoked</th></tr></thead>
        <tbody>
          {d?.keys.map((k) => <tr key={k.id}><td><code>{k.prefix}…</code></td><td>{fmtDate(k.created_at)}</td><td><Badge value={k.active ? 'active' : 'disabled'} /></td><td>{fmtDate(k.revoked_at)}</td></tr>)}
          {d && !d.keys.length && <tr><td colSpan="4" className="muted">No keys yet.</td></tr>}
        </tbody></table></div>
    </>
  );
}

function ApiDocs() {
  const rows = [
    ['GET', '/api/v1/templates', 'List your templates'],
    ['POST', '/api/v1/send-template', 'Send one approved template to one number'],
    ['GET', '/api/v1/contacts?page=1&limit=100', 'List contacts (optional from, to dates)'],
    ['POST', '/api/v1/contact-exists', 'Check whether a number is already a contact'],
    ['GET', '/api/v1/campaigns', 'List campaigns'],
    ['GET', '/api/v1/campaigns/{id}', 'One campaign with delivery counts'],
  ];
  return (
    <>
      <div className="card table-wrap"><table>
        <thead><tr><th>Method</th><th>Path</th><th>What it does</th></tr></thead>
        <tbody>{rows.map(([m, p, w]) => <tr key={p}><td><Badge value={m} /></td><td><code>{p}</code></td><td>{w}</td></tr>)}</tbody>
      </table></div>
      <div className="card">
        <h3>Example: send a template</h3>
        <pre className="creds">{`curl -X POST ${origin}/api/v1/send-template \\
  -H "X-Api-Key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"919876543210","template_name":"order_update","variables":["Sam","#1042"]}'`}</pre>
        <p className="muted small">The wallet is charged at your rate for the template's category. Opted-out numbers are refused.</p>
      </div>
    </>
  );
}

function Custom() {
  const [d, load, error] = useLoad(() => api('/portal/integrations'), []);
  const hook = d?.integrations.find((i) => i.kind === 'webhook');
  const [url, setUrl] = useState('');
  const [err2, setErr2] = useState('');
  const [msg, setMsg] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setErr2(''); setMsg('');
    try { await api('/portal/integrations/webhook', { method: 'PUT', body: { config: { url: url || hook?.config?.url } } }); setMsg('Saved'); load(); }
    catch (er) { setErr2(er.message); }
  };
  const remove = async () => { await api('/portal/integrations/webhook', { method: 'DELETE' }); load(); };
  return (
    <div className="card">
      <h3>Incoming message webhook</h3>
      <p className="muted small">We send each new customer message to this HTTPS address as JSON: <code>{'{"event":"message","from":"91...","text":"...","id":"..."}'}</code></p>
      <Err error={error || err2} />
      {msg && <div className="ok">{msg}</div>}
      <form onSubmit={save}>
        <Field label="Webhook URL (https only)">
          <input defaultValue={hook?.config?.url || ''} key={hook?.id || 'new'} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-site.com/hook" />
        </Field>
        <div className="row">
          <button className="btn">Save</button>
          {hook && <button type="button" className="btn ghost" onClick={remove}>Remove</button>}
        </div>
      </form>
    </div>
  );
}

export default function Integrations() {
  const [tab, setTab] = useState('channel');
  return (
    <>
      <PageHead title="Integrations" />
      <Tabs
        tabs={[['channel', 'Your Channel'], ['market', 'Marketplace'], ['key', 'API Key'], ['docs', 'API Docs'], ['custom', 'Custom']]}
        value={tab} onChange={setTab}
      />
      {tab === 'channel' && <YourChannel />}
      {tab === 'market' && <Marketplace goChannel={() => setTab('channel')} />}
      {tab === 'key' && <ApiKey />}
      {tab === 'docs' && <ApiDocs />}
      {tab === 'custom' && <Custom />}
    </>
  );
}
