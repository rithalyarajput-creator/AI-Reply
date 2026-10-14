import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLE_LABEL } from '../components/Layout.jsx';
import {
  Badge, Bars, Err, fmtMoney, useLoad,
} from '../components/ui.jsx';

const Stat = ({ label, value, sub }) => (
  <div className="card stat">
    <div className="muted small">{label}</div>
    <div className="big">{value ?? '...'}</div>
    {sub && <div className="muted small">{sub}</div>}
  </div>
);

function Platform() {
  const { can } = useAuth();
  const [d, , error] = useLoad(() => api('/platform/dashboard'), []);
  return (
    <>
      <Err error={error} />
      <div className="grid">
        <Stat label="Clients" value={d?.clients} />
        <Stat label="Active" value={d?.active} />
        <Stat label="On trial" value={d?.trial} />
        <Stat label="Suspended" value={d?.suspended} />
        <Stat label="Agencies" value={d?.agencies} />
        <Stat label="Connected channels" value={d?.channels_connected} />
        <Stat label="Messages (30 days)" value={d?.messages_30d} />
        <Stat label="Campaign failure %" value={d ? `${d.failed_pct}%` : null} sub={d ? `${d.campaign_messages_30d} campaign messages` : ''} />
        {can('website_leads.manage') && <Stat label="New website leads" value={d?.new_leads} />}
      </div>
      {d?.money && (
        <>
          <h3>This month</h3>
          <div className="grid">
            <Stat label="Total recharge" value={fmtMoney(d.money.recharge)} />
            <Stat label="Billed to clients" value={fmtMoney(d.money.billed)} />
            <Stat label="Meta cost" value={fmtMoney(d.money.meta_cost)} />
            <Stat label="Gross margin" value={fmtMoney(d.money.gross_margin)} />
          </div>
        </>
      )}
      <div className="cols">
        <div className="card">
          <h3>Low balance clients</h3>
          {d?.low_balance?.length ? (
            <table><tbody>
              {d.low_balance.map((c) => (
                <tr key={c.id}><td><Link to={`/clients/${c.id}`}>{c.company_name}</Link></td><td>{fmtMoney(c.wallet_balance)}</td></tr>
              ))}
            </tbody></table>
          ) : <p className="muted">No client is below its alert level.</p>}
        </div>
        <div className="card">
          <h3>Onboarding in progress</h3>
          {d?.stuck_onboarding?.length ? (
            <table><tbody>
              {d.stuck_onboarding.map((c) => (
                <tr key={c.id}><td><Link to={`/clients/${c.id}`}>{c.company_name}</Link></td><td><Badge value={c.onboarding_stage} /></td><td className="muted small">{c.days} days</td></tr>
              ))}
            </tbody></table>
          ) : <p className="muted">Nobody is waiting on onboarding.</p>}
        </div>
      </div>
    </>
  );
}

function Agency() {
  const [d, , error] = useLoad(() => api('/stats'), []);
  return (
    <>
      <Err error={error} />
      <div className="grid">
        <Stat label="Clients" value={d?.clients} />
        <Stat label="Active" value={d?.active} />
        <Stat label="On trial" value={d?.trial} />
        <Stat label="Suspended" value={d?.suspended} />
        <Stat label="Agents" value={d?.agents} />
      </div>
    </>
  );
}

function ClientPortal() {
  const { scope } = useAuth();
  const [d, , error] = useLoad(() => api('/portal/dashboard'), [scope?.id]);
  const s = d?.stats;
  const lc = d?.last_campaign;
  const steps = d ? [
    ['Create welcome message', d.setup.welcome > 0, '/automations'],
    ['Create a campaign', d.setup.campaign > 0, '/campaigns'],
    ['Set out-of-office message', d.setup.ooo > 0, '/automations'],
    ['Turn on auto assignment', d.setup.auto_assign > 0, '/automations'],
    ['Turn on opt-out handling', d.setup.opt_out > 0, '/automations'],
  ] : [];
  const done = steps.filter((x) => x[1]).length;
  return (
    <>
      <Err error={error} />
      {d?.company && <p className="muted">Company: <b>{d.company}</b></p>}
      {d?.low_balance && <div className="banner">Your wallet balance is low ({fmtMoney(d.wallet_balance)}). Recharge to keep campaigns running.</div>}
      <div className="grid">
        <Stat label="Users" value={s?.users} />
        <Stat label="Total messages" value={s?.messages} sub={s ? `${s.inbound} received` : ''} />
        <Stat label="Live chats" value={s?.live_chats} sub={s ? `${s.unreplied} unreplied` : ''} />
        <Stat label="Avg response time" value={d ? (d.avg_response_seconds === null ? '-' : `${d.avg_response_seconds}s`) : null} />
        <Stat label="Leads" value={s?.leads} />
        <Stat label="Wallet" value={d ? fmtMoney(d.wallet_balance) : null} />
      </div>
      <div className="cols">
        <div className="card">
          <h3>Last campaign{lc ? `: ${lc.name}` : ''}</h3>
          {lc ? (
            <Bars rows={[
              { label: 'Pending', value: lc.pending, color: '#94a3b8' },
              { label: 'Sent', value: lc.sent, color: '#3b82f6' },
              { label: 'Delivered', value: lc.delivered, color: '#16a34a' },
              { label: 'Seen', value: lc.seen, color: '#0ea5a4' },
              { label: 'Failed', value: lc.failed, color: '#dc2626' },
            ]} max={lc.total || undefined} />
          ) : <p className="muted">No campaign yet.</p>}
        </div>
        <div className="card">
          <h3>WhatsApp status</h3>
          {d?.channels?.length ? d.channels.map((c) => (
            <div key={c.id} className="kv">
              <b>{c.display_name}</b> <Badge value={c.status} />
              <div className="muted small">Tier {c.tier || 'N/A'} · Quality {c.quality_rating || 'N/A'}</div>
            </div>
          )) : <p className="muted">No WhatsApp number connected. Go to <Link to="/integrations">Integrations</Link> to connect one.</p>}
        </div>
        <div className="card">
          <h3>Set up your account ({done}/{steps.length})</h3>
          <div className="progress"><div style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%` }} /></div>
          <ul className="checklist">
            {steps.map(([label, ok, to]) => (
              <li key={label} className={ok ? 'done' : ''}>{ok ? '✓' : '○'} <Link to={to}>{label}</Link></li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { user, scope, isClientSide, isPlatform } = useAuth();
  return (
    <>
      <h2>{scope ? scope.name : `Welcome, ${user.name}`}</h2>
      <p className="muted">{scope ? 'Client dashboard' : ROLE_LABEL[user.role]}</p>
      {isClientSide || scope ? <ClientPortal /> : isPlatform ? <Platform /> : <Agency />}
    </>
  );
}
