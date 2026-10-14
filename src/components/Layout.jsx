import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

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

const CLIENT_NAV = {
  client_admin: [
    ['/', 'Dashboard'], ['/inbox', 'Team Inbox'], ['/reports', 'Reports'], ['/templates', 'Templates'],
    ['/campaigns', 'Campaigns'], ['/automations', 'Automations'], ['/setup', 'Setup (Flows)'],
    ['/integrations', 'Integrations'], ['/workflows', 'Workflows'], ['/leads', 'Leads'],
    ['/wallet', 'Wallet'], ['/configurations', 'Configurations'], ['/audit', 'Audit Log'],
  ],
  agent_head: [['/', 'Dashboard'], ['/inbox', 'Team Inbox'], ['/reports', 'Reports'], ['/campaigns', 'Campaigns'], ['/leads', 'Leads']],
  agent: [['/', 'Dashboard'], ['/inbox', 'Team Inbox'], ['/leads', 'Leads']],
};

export function navFor(user, can, scoped) {
  if (scoped) return CLIENT_NAV.client_admin.filter(([to]) => to !== '/audit');
  if (CLIENT_NAV[user.role]) return CLIENT_NAV[user.role];
  if (user.role === 'agency_admin') return [['/', 'Dashboard'], ['/clients', 'Clients'], ['/audit', 'Audit Log']];
  const items = [['/', 'Dashboard']];
  if (can('clients.view')) items.push(['/clients', 'Clients']);
  if (can('channels.view')) items.push(['/channels', 'Channels']);
  if (can('plans.view')) items.push(['/pricing', 'Plans and Pricing']);
  if (can('wallet.view')) items.push(['/billing', 'Wallet and Billing']);
  if (can('staff.manage')) items.push(['/staff', 'Staff and Roles']);
  if (can('website_leads.manage')) items.push(['/website-leads', 'Website Leads']);
  if (user.role === 'super_admin') items.push(['/agencies', 'Agencies']);
  if (can('audit.view')) items.push(['/audit', 'Audit Log']);
  return items;
}

export default function Layout({ children }) {
  const {
    user, logout, impersonating, exitImpersonation, scope, closeClient, can,
  } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const nav = navFor(user, can, !!scope);

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand-row">
          <div className="brand">AI Reply</div>
          <button className="btn ghost small menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">Menu</button>
        </div>
        <nav onClick={() => setOpen(false)}>
          {nav.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className="nav-item">{label}</NavLink>
          ))}
          <NavLink to="/account" className="nav-item">Change password</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="who">{user.name}</div>
          <div className="muted small">{ROLE_LABEL[user.role]}</div>
          <button className="btn ghost" onClick={logout}>Logout</button>
        </div>
      </aside>
      <main className="content">
        {impersonating && (
          <div className="banner">
            You are viewing this client's portal as {ROLE_LABEL[user.role] === 'Client Admin' ? 'their admin' : 'staff'} (logged in the audit log).
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
  );
}
