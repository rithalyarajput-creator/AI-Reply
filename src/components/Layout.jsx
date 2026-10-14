import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from './Icon.jsx';

export const ROLE_LABEL = {
  super_admin: 'Super Admin',
  staff_support: 'Support',
  staff_sales: 'Sales',
  staff_billing: 'Billing / Accounts',
  staff_developer: 'Developer',
  agency_admin: 'Agency Admin',
  client_admin: 'Client Admin',
  agent_head: 'Agent Head',
  agent: 'Agent',
};

// [path, label, icon]
const CLIENT_NAV = {
  client_admin: [
    ['/', 'Dashboard', 'home'], ['/inbox', 'Team Inbox', 'chat'], ['/reports', 'Reports', 'chart'],
    ['/templates', 'Templates', 'template'], ['/campaigns', 'Campaigns', 'megaphone'],
    ['/automations', 'Automations', 'bolt'], ['/setup', 'Setup (Flows)', 'flow'],
    ['/integrations', 'Integrations', 'plug'], ['/workflows', 'Workflows', 'workflow'],
    ['/leads', 'Leads', 'users'], ['/wallet', 'Wallet', 'wallet'],
    ['/configurations', 'Configurations', 'settings'], ['/audit', 'Audit Log', 'list'],
  ],
  agent_head: [
    ['/', 'Dashboard', 'home'], ['/inbox', 'Team Inbox', 'chat'], ['/reports', 'Reports', 'chart'],
    ['/campaigns', 'Campaigns', 'megaphone'], ['/leads', 'Leads', 'users'],
  ],
  agent: [['/', 'Dashboard', 'home'], ['/inbox', 'Team Inbox', 'chat'], ['/leads', 'Leads', 'users']],
};

export function navFor(user, can, scoped) {
  if (scoped) return CLIENT_NAV.client_admin.filter(([to]) => to !== '/audit');
  if (CLIENT_NAV[user.role]) return CLIENT_NAV[user.role];
  if (user.role === 'agency_admin') {
    return [['/', 'Dashboard', 'home'], ['/clients', 'Clients', 'building'], ['/audit', 'Audit Log', 'list']];
  }
  const items = [['/', 'Dashboard', 'home']];
  if (can('clients.view')) items.push(['/clients', 'Clients', 'building']);
  if (can('channels.view')) items.push(['/channels', 'Channels', 'signal']);
  if (can('plans.view')) items.push(['/pricing', 'Plans and Pricing', 'tag']);
  if (can('wallet.view')) items.push(['/billing', 'Wallet and Billing', 'card']);
  if (can('staff.manage')) items.push(['/staff', 'Staff and Roles', 'shield']);
  if (can('website_leads.manage')) items.push(['/website-leads', 'Website Leads', 'mail']);
  if (user.role === 'super_admin') items.push(['/agencies', 'Agencies', 'briefcase']);
  if (can('audit.view')) items.push(['/audit', 'Audit Log', 'list']);
  return items;
}

const EXTRA_TITLES = { '/account': 'Change password', '/privacy': 'Privacy Policy', '/terms': 'Terms of Service' };

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

function useAlerts(user, scoped, clientSide) {
  const [alerts, setAlerts] = useState([]);
  const [company, setCompany] = useState('');
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const list = [];
        if (clientSide || scoped) {
          const d = await api('/portal/dashboard');
          if (alive) setCompany(d.company || '');
          if (d.low_balance) list.push({ text: 'Wallet balance is low', to: '/wallet', icon: 'wallet' });
          if (d.stats.unreplied > 0) list.push({ text: `${d.stats.unreplied} chat(s) waiting for a reply`, to: '/inbox', icon: 'chat' });
          if (!d.channels.some((c) => c.status === 'connected')) list.push({ text: 'Connect your WhatsApp number', to: '/integrations', icon: 'plug' });
        } else if (user.role === 'super_admin' || user.role.startsWith('staff_')) {
          const d = await api('/platform/dashboard');
          if (d.new_leads > 0) list.push({ text: `${d.new_leads} new website lead(s)`, to: '/website-leads', icon: 'mail' });
          if (d.low_balance?.length) list.push({ text: `${d.low_balance.length} client(s) low on balance`, to: '/clients', icon: 'wallet' });
          if (d.failed_pct >= 20) list.push({ text: `Campaign failure rate is ${d.failed_pct}%`, to: '/clients', icon: 'info' });
        }
        if (alive) setAlerts(list);
      } catch { if (alive) setAlerts([]); }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [user.role, scoped, clientSide]);
  return { alerts, company };
}

function Dropdown({ open, onClose, children, align = 'right' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onClose]);
  if (!open) return null;
  return <div ref={ref} className={`dropdown ${align}`}>{children}</div>;
}

export default function Layout({ children }) {
  const {
    user, logout, impersonating, exitImpersonation, scope, closeClient, can, isClientSide,
  } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(store.get('ar_collapsed') === '1');
  const [drawer, setDrawer] = useState(false);
  const [bell, setBell] = useState(false);
  const [profile, setProfile] = useState(false);
  const nav = navFor(user, can, !!scope);
  const { alerts, company } = useAlerts(user, !!scope, isClientSide);

  useEffect(() => { setDrawer(false); }, [loc.pathname]);

  const title = (nav.find(([to]) => to === loc.pathname)
    || nav.find(([to]) => to !== '/' && loc.pathname.startsWith(to)))?.[1]
    || EXTRA_TITLES[loc.pathname] || 'AI Reply';
  const toggle = () => { const v = !collapsed; setCollapsed(v); store.set('ar_collapsed', v ? '1' : '0'); };
  const fullscreen = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch { /* not supported */ }
  };
  const initials = (user.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''} ${drawer ? 'drawer-open' : ''}`}>
      <div className="scrim" onClick={() => setDrawer(false)} />
      <aside className="side">
        <div className="side-brand">
          <span className="logo-mark">AR</span>
          <span className="side-text">AI Reply</span>
        </div>
        <nav>
          {nav.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'} className="side-item" title={label}>
              <Icon name={icon} />
              <span className="side-text">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <NavLink to="/account" className="side-item" title="Change password">
            <Icon name="key" /><span className="side-text">Change password</span>
          </NavLink>
          <button className="side-item" onClick={logout} title="Logout">
            <Icon name="logout" /><span className="side-text">Logout</span>
          </button>
          <button className="side-item collapse-btn" onClick={toggle} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
            <Icon name={collapsed ? 'right' : 'left'} /><span className="side-text">Collapse</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setDrawer(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <h1>{title}</h1>
          <div className="top-right">
            <span className="top-company">{scope ? scope.name : company || user.name} <span className="muted">({ROLE_LABEL[user.role]})</span></span>
            <button className="icon-btn" onClick={fullscreen} title="Fullscreen" aria-label="Fullscreen"><Icon name="expand" /></button>
            <div className="rel">
              <button className="icon-btn" onClick={() => { setBell(!bell); setProfile(false); }} title="Notifications" aria-label="Notifications">
                <Icon name="bell" />
                {alerts.length > 0 && <span className="bell-count">{alerts.length}</span>}
              </button>
              <Dropdown open={bell} onClose={() => setBell(false)}>
                <div className="dd-title">Notifications</div>
                {alerts.length === 0 && <div className="dd-empty">You are all caught up.</div>}
                {alerts.map((a) => (
                  <Link key={a.text} to={a.to} className="dd-item" onClick={() => setBell(false)}>
                    <Icon name={a.icon} size={18} /> {a.text}
                  </Link>
                ))}
              </Dropdown>
            </div>
            <div className="rel">
              <button className="avatar" onClick={() => { setProfile(!profile); setBell(false); }} aria-label="Account menu">{initials}</button>
              <Dropdown open={profile} onClose={() => setProfile(false)}>
                <div className="dd-title">{user.name}<div className="muted small">{user.email}</div></div>
                <Link to="/account" className="dd-item" onClick={() => setProfile(false)}><Icon name="key" size={18} /> Change password</Link>
                <button className="dd-item" onClick={logout}><Icon name="logout" size={18} /> Logout</button>
              </Dropdown>
            </div>
          </div>
        </header>
        <main className="content">
          {impersonating && (
            <div className="banner">
              You are viewing this client's portal as {user.role === 'client_admin' ? 'their admin' : 'staff'} (logged in the audit log).
              <button className="btn small" onClick={exitImpersonation}>Back to my account</button>
            </div>
          )}
          {scope && (
            <div className="banner">
              Viewing client: <b>{scope.name}</b>
              <button className="btn small" onClick={() => { closeClient(); navigate('/clients'); }}>Exit client view</button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
