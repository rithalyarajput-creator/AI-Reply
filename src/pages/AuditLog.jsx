import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDate } from '../components/ui.jsx';

export default function AuditLog() {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/audit').then((d) => setLogs(d.logs)).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h2>Audit log</h2>
      <p className="muted">Latest 200 actions: logins, user changes, suspensions, and support access.</p>
      {error && <div className="error">{error}</div>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>
            {logs?.map((l) => (
              <tr key={l.id}>
                <td>{fmtDate(l.created_at)}</td>
                <td>{l.actor_name} <span className="muted small">({l.actor_role})</span></td>
                <td>{l.action}</td>
                <td className="small">{Object.keys(l.meta || {}).length ? JSON.stringify(l.meta) : ''}</td>
                <td className="small">{l.ip}</td>
              </tr>
            ))}
            {logs && !logs.length && <tr><td colSpan="5" className="muted">Nothing logged yet.</td></tr>}
            {!logs && <tr><td colSpan="5" className="muted">Loading...</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
