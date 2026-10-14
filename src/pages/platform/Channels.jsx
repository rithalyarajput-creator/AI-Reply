import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import {
  Badge, Empty, Err, PageHead, fmtDate, useLoad,
} from '../../components/ui.jsx';

const STEPS = ['documents', 'meta_verification', 'number_connected', 'template_approved', 'test_passed', 'live'];

export default function Channels() {
  const [status, setStatus] = useState('');
  const [d, , error] = useLoad(() => api('/platform/channels', { query: { status } }), [status]);
  return (
    <>
      <PageHead title="Channels" sub="Every connected WhatsApp number and its Meta status. Numbers are masked.">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['pending', 'connected', 'disconnected', 'banned', 'restricted'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </PageHead>
      <Err error={error} />
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Client</th><th>Channel</th><th>Name / number</th><th>Status</th><th>Tier</th><th>Quality</th><th>Verification</th><th>Webhook</th><th>Onboarding</th><th>Connected</th></tr>
          </thead>
          <tbody>
            {d?.channels.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/clients/${c.client_id}`}>{c.company_name}</Link></td>
                <td>{c.type}</td>
                <td>{c.display_name}<div className="muted small">{c.phone_number || '-'}</div></td>
                <td><Badge value={c.status} />{c.last_error && <div className="small error-text">{c.last_error}</div>}</td>
                <td>{c.tier || '-'}</td>
                <td>{c.quality_rating || '-'}</td>
                <td>{c.verification || '-'}</td>
                <td>{c.webhook_ok ? 'OK' : 'No events yet'}</td>
                <td>
                  <div className="mini-steps">
                    {STEPS.map((s, i) => <i key={s} className={STEPS.indexOf(c.onboarding_stage) >= i ? 'on' : ''} title={s.replace(/_/g, ' ')} />)}
                  </div>
                </td>
                <td>{fmtDate(c.created_at)}</td>
              </tr>
            ))}
            {d && !d.channels.length && <tr><td colSpan="10" className="muted">No channels found.</td></tr>}
            {!d && <tr><td colSpan="10" className="muted">Loading...</td></tr>}
          </tbody>
        </table>
      </div>
      <Empty>
        <b>How a number gets connected</b>
        <ol>
          <li>Client gives business details and Meta Business Manager access</li>
          <li>Make sure the number is not running on the normal WhatsApp app</li>
          <li>Client connects it in Integrations with their Phone Number ID, WABA ID and access token</li>
          <li>Set the webhook URL in the Meta app, then send the first template for approval</li>
          <li>Send a test message and mark the client Live</li>
        </ol>
      </Empty>
    </>
  );
}
