import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export const ROLE_LABEL = {
  super_admin: 'Super Admin',
  agency_admin: 'Agency Admin',
  client_admin: 'Client Admin',
  agent_head: 'Agent Head',
  agent: 'Agent',
};

const NAV = {
  super_admin: [['/', 'Dashboard'], ['/clients', 'Clients'], ['/agencies', 'Agencies'], ['/plans', 'Plans'], ['/audit', 'Audit Log']],
  agency_admin: [['/', 'Dashboard'], ['/clients', 'Clients'], ['/audit', 'Audit Log']],
  client_admin: [['/', 'Dashboard'], ['/team', 'Team'], ['/audit', 'Audit Log']],
  agent_head: [['/', 'Dashboard']],
  agent: [['/', 'Dashboard']],
};

export default function Layout({ children }) {
  const { user, logout, impersonating, exitImpersonation } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">AI Reply</div>
        <nav>
          {NAV[user.role].map(([to, label]) => (
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
            You are viewing this client's portal as Super Admin (logged in the audit log).
            <button className="btn small" onClick={exitImpersonation}>Back to Super Admin</button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
