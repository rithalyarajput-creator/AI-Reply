import { api } from '../../api.js';
import {
  Badge, Err, PageHead, fmtDate, useLoad,
} from '../../components/ui.jsx';

export default function WebsiteLeads() {
  const [d, load, error] = useLoad(() => api('/website-leads'), []);
  const set = async (id, status) => { await api(`/website-leads/${id}`, { method: 'PATCH', body: { status } }); load(); };
  return (
    <>
      <PageHead title="Website Leads" sub="People who filled the contact form on your public website." />
      <Err error={error} />
      <div className="card table-wrap"><table>
        <thead><tr><th>When</th><th>Name</th><th>Contact</th><th>Company</th><th>Message</th><th>Status</th></tr></thead>
        <tbody>
          {d?.leads.map((l) => (
            <tr key={l.id}>
              <td>{fmtDate(l.created_at)}</td><td>{l.name}</td>
              <td>{l.email}<div className="muted small">{l.phone}</div></td>
              <td>{l.company}</td><td className="pre small">{l.message}</td>
              <td>
                <Badge value={l.status} />{' '}
                <select value={l.status} onChange={(e) => set(l.id, e.target.value)}>
                  {['new', 'contacted', 'won', 'lost'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
          {d && !d.leads.length && <tr><td colSpan="6" className="muted">No website leads yet.</td></tr>}
        </tbody></table></div>
    </>
  );
}
