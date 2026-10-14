import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icon.jsx';
import { ROLE_LABEL } from '../components/Layout.jsx';
import {
  Badge, Err, fmtMoney, useLoad,
} from '../components/ui.jsx';

const Stat = ({ label, value, sub }) => (
  <div className="card stat">
    <div className="muted small">{label}</div>
    <div className="big">{value ?? '...'}</div>
    {sub && <div className="muted small">{sub}</div>}
  </div>
);

// ---- platform (Super Admin / staff) -----------------------------------------
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

// ---- client portal ----------------------------------------------------------
const mins = (s) => (s === null || s === undefined ? '-' : s < 60 ? `${s}s` : `${(s / 60).toFixed(1)} min`);

function StatCard({ title, value, unit, hint, foot }) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <div className="kpi-title">{title}{hint && <span title={hint}><Icon name="info" size={15} /></span>}</div>
        <div className="kpi-value">{value ?? '...'}</div>
        <div className="kpi-unit">{unit}</div>
      </div>
      <div className="kpi-foot">
        {foot.map(([l, v]) => <span key={l}>{l} <b>{v ?? '-'}</b></span>)}
      </div>
    </div>
  );
}

function Pie({ slices }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!total) {
    return (
      <div className="pie-empty">
        <svg viewBox="0 0 120 120" width="150" height="150" aria-hidden="true"><circle cx="60" cy="60" r="50" fill="none" stroke="#dbe5e4" strokeWidth="18" /></svg>
        <p className="muted small">No messages sent yet</p>
      </div>
    );
  }
  let acc = 0;
  const arcs = slices.filter((s) => s.value > 0).map((s) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += s.value;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a) => `${60 + 54 * Math.cos(a)} ${60 + 54 * Math.sin(a)}`;
    const full = s.value === total;
    return { ...s, d: full ? null : `M60 60 L${p(a0)} A54 54 0 ${large} 1 ${p(a1)} Z` };
  });
  return (
    <svg viewBox="0 0 120 120" width="190" height="190" role="img" aria-label="Last campaign delivery">
      {arcs.map((a) => (a.d
        ? <path key={a.label} d={a.d} fill={a.color}><title>{`${a.label}: ${a.value}`}</title></path>
        : <circle key={a.label} cx="60" cy="60" r="54" fill={a.color}><title>{`${a.label}: ${a.value}`}</title></circle>))}
    </svg>
  );
}

function Stepper({ title, steps, active, valueLabel }) {
  return (
    <div className="stepper">
      <div className="stepper-head"><span>{title}</span><b>{valueLabel}</b></div>
      <div className="stepper-track">
        {steps.map((s, i) => (
          <div key={s} className={`st ${i <= active ? 'on' : ''} ${i === active ? 'cur' : ''}`}>
            <i>{i <= active ? <Icon name="check" size={12} /> : null}</i>
            <span>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TIERS = ['N/A', '250', '1K', '10K', '100K', '∞'];
const tierIndex = (t) => {
  const s = String(t || '').toUpperCase();
  if (s.includes('UNLIMITED')) return 5;
  if (s.includes('100K')) return 4;
  if (s.includes('10K')) return 3;
  if (s.includes('1K')) return 2;
  if (s.includes('250') || s.includes('50')) return 1;
  return 0;
};
const RATINGS = ['NA', 'Low', 'Med', 'High'];
const ratingIndex = (r) => ({ RED: 1, YELLOW: 2, GREEN: 3 }[String(r || '').toUpperCase()] || 0);
const VERIFY = ['Not Verified', 'Basic Verified', 'Display Approved', 'Official Business'];
const verifyIndex = (v) => {
  const s = String(v || '').toUpperCase();
  if (s.includes('OFFICIAL')) return 3;
  if (s.includes('DISPLAY')) return 2;
  if (s.includes('VERIFIED') || s.includes('BASIC')) return 1;
  return 0;
};

function ClientPortal() {
  const { scope } = useAuth();
  const [d, , error] = useLoad(() => api('/portal/dashboard'), [scope?.id]);
  const s = d?.stats;
  const lc = d?.last_campaign;
  const ch = d?.channels?.find((c) => c.status === 'connected') || d?.channels?.[0];

  const steps = d ? [
    { key: 'welcome', done: d.setup.welcome > 0, title: 'Setup welcome message', text: 'Greet customers automatically when they message you for the first time.', cta: 'Create welcome message', to: '/automations' },
    { key: 'campaign', done: d.setup.campaign > 0, title: 'Start a new campaign', text: 'Reach many customers at once with an approved template.', cta: 'Create campaign', to: '/campaigns' },
    { key: 'ooo', done: d.setup.ooo > 0, title: 'Enable out-of-office message', text: 'Reply automatically when you are closed.', cta: 'Out office message', to: '/automations' },
    { key: 'assign', done: d.setup.auto_assign > 0, title: 'Turn on auto assignment', text: 'New chats reach the right team member without manual work.', cta: 'Auto assignment', to: '/automations' },
    { key: 'optout', done: d.setup.opt_out > 0, title: 'Turn on opt-out handling', text: 'Let people stop messages. This protects your number quality.', cta: 'Opt out setup', to: '/automations' },
  ] : [];
  const done = steps.filter((x) => x.done).length;
  const todo = steps.filter((x) => !x.done);

  return (
    <>
      <Err error={error} />
      {d?.low_balance && (
        <div className="banner">Your wallet balance is low ({fmtMoney(d.wallet_balance)}). Recharge to keep campaigns running. <Link to="/wallet" className="btn small">Open wallet</Link></div>
      )}
      <div className="kpi-row">
        <StatCard title="Admin and Agents" value={s ? s.users : null} unit="Total" hint="Active logins in your company"
          foot={[['Active', s?.users], ['Disabled', s?.users_disabled]]} />
        <StatCard title="Messages" value={s ? s.messages : null} unit="Total" hint="Sent and received"
          foot={[['Sent', s?.outbound], ['Received', s?.inbound]]} />
        <StatCard title="Active Sessions" value={s ? s.live_chats : null} unit="Total" hint="Chats that are live right now"
          foot={[['Replied', s?.replied], ['Unreplied', s?.unreplied]]} />
        <StatCard title="Response Time" value={d ? mins(d.avg_response_seconds) : null} unit="Average" hint="Time to first reply, last 30 days"
          foot={[['Bot', mins(d?.response_bot_seconds)], ['Human', mins(d?.response_human_seconds)]]} />
      </div>

      <div className="dash-grid">
        <div className="card">
          <h3 className="center-h">Last Campaign Analysis{lc ? `: ${lc.name}` : ''}</h3>
          <div className="pie-wrap">
            <Pie slices={lc ? [
              { label: 'Pending', value: lc.pending, color: '#BADFE7' },
              { label: 'Sent', value: lc.sent, color: '#6FB3B8' },
              { label: 'Delivered', value: lc.delivered, color: '#388087' },
              { label: 'Seen', value: lc.seen, color: '#2a5f66' },
              { label: 'Failed', value: lc.failed, color: '#ef4444' },
            ] : []} />
            <ul className="pie-legend">
              {[['Pending', '#BADFE7', lc?.pending], ['Sent', '#6FB3B8', lc?.sent], ['Delivered', '#388087', lc?.delivered],
                ['Seen', '#2a5f66', lc?.seen], ['Failed', '#ef4444', lc?.failed]].map(([l, c, v]) => (
                <li key={l}><i style={{ background: c }} />{l}<b>{v ?? 0}</b></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card">
          <div className="meta-head">
            <h3>Meta Status</h3>
            <span className="chip-ghost">{ch ? ch.display_name : 'No number connected'}</span>
          </div>
          {ch ? (
            <>
              <Stepper title="TIER" steps={TIERS} active={tierIndex(ch.tier)} valueLabel={TIERS[tierIndex(ch.tier)]} />
              <Stepper title="RATING" steps={RATINGS} active={ratingIndex(ch.quality_rating)} valueLabel={RATINGS[ratingIndex(ch.quality_rating)]} />
              <Stepper title="VERIFICATION" steps={VERIFY} active={verifyIndex(ch.verification)} valueLabel={VERIFY[verifyIndex(ch.verification)]} />
            </>
          ) : (
            <div className="empty-state">
              <Icon name="plug" size={36} />
              <p>Connect a WhatsApp number to see your tier, quality rating and verification.</p>
              <Link to="/integrations" className="btn small">Connect WhatsApp</Link>
            </div>
          )}
        </div>

        <div className="side-col">
          <div className="card">
            <div className="setup-head">
              <b>Setup your account</b>
              <span className="muted small">{done}/{steps.length}</span>
            </div>
            <div className="progress"><div style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%` }} /></div>
            {todo.slice(0, 2).map((x) => (
              <div className="todo" key={x.key}>
                <b>{x.title}</b>
                <p className="muted small">{x.text}</p>
                <Link to={x.to} className="btn small">{x.cta}</Link>
              </div>
            ))}
            {steps.length > 0 && !todo.length && <p className="muted">All set. Nice work.</p>}
          </div>
          {todo.length > 2 && (
            <div className="card">
              <b>Recommendations</b>
              {todo.slice(2).map((x) => (
                <div className="todo" key={x.key}>
                  <b>{x.title}</b>
                  <p className="muted small">{x.text}</p>
                  <Link to={x.to} className="btn small">{x.cta}</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { user, scope, isClientSide, isPlatform } = useAuth();
  const company = isClientSide || scope;
  return (
    <>
      {!company && <p className="muted">Signed in as {user.name} ({ROLE_LABEL[user.role]})</p>}
      {company ? <ClientPortal /> : isPlatform ? <Platform /> : <Agency />}
    </>
  );
}
