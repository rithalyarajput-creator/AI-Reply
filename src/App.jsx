import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/public/Home.jsx';
import { Privacy, Terms } from './pages/public/Legal.jsx';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Dashboard from './pages/Dashboard.jsx';
// platform + agency
import Clients from './pages/Clients.jsx';
import ClientDetail from './pages/ClientDetail.jsx';
import Agencies from './pages/Agencies.jsx';
import Channels from './pages/platform/Channels.jsx';
import Pricing from './pages/platform/Pricing.jsx';
import Billing from './pages/platform/Billing.jsx';
import Staff from './pages/platform/Staff.jsx';
import WebsiteLeads from './pages/platform/WebsiteLeads.jsx';
// client portal
import Inbox from './pages/portal/Inbox.jsx';
import Reports from './pages/portal/Reports.jsx';
import Templates from './pages/portal/Templates.jsx';
import Campaigns from './pages/portal/Campaigns.jsx';
import Automations from './pages/portal/Automations.jsx';
import Setup from './pages/portal/Setup.jsx';
import Integrations from './pages/portal/Integrations.jsx';
import Workflows from './pages/portal/Workflows.jsx';
import Leads from './pages/portal/Leads.jsx';
import Wallet from './pages/portal/Wallet.jsx';
import Configurations from './pages/portal/Configurations.jsx';

export default function App() {
  const { user, loading, scope, can } = useAuth();
  if (loading) return <div className="center muted">Loading...</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  if (user.must_change_password) return <ChangePassword forced />;

  const r = user.role;
  const clientSide = ['client_admin', 'agent_head', 'agent'].includes(r);
  const portal = clientSide || !!scope;
  const agencyOrPlatform = !clientSide;

  return (
    <Layout>
      <Routes>
        <Route path="/privacy" element={<Privacy inApp />} />
        <Route path="/terms" element={<Terms inApp />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/account" element={<ChangePassword />} />
        <Route path="/" element={<Dashboard />} />

        {portal && (
          <>
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/leads" element={<Leads />} />
            {r !== 'agent' && <Route path="/reports" element={<Reports />} />}
            {r !== 'agent' && <Route path="/campaigns" element={<Campaigns />} />}
            {(r === 'client_admin' || scope) && (
              <>
                <Route path="/templates" element={<Templates />} />
                <Route path="/automations" element={<Automations />} />
                <Route path="/setup" element={<Setup />} />
                <Route path="/integrations" element={<Integrations />} />
                <Route path="/workflows" element={<Workflows />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/configurations" element={<Configurations />} />
              </>
            )}
          </>
        )}

        {!scope && agencyOrPlatform && (can('clients.view') || r === 'agency_admin') && (
          <>
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/:id" element={<ClientDetail />} />
          </>
        )}
        {!scope && r === 'client_admin' && <Route path="/audit" element={<AuditLog />} />}
        {!scope && agencyOrPlatform && (r === 'agency_admin' || can('audit.view')) && <Route path="/audit" element={<AuditLog />} />}
        {!scope && can('channels.view') && <Route path="/channels" element={<Channels />} />}
        {!scope && can('plans.view') && <Route path="/pricing" element={<Pricing />} />}
        {!scope && can('wallet.view') && <Route path="/billing" element={<Billing />} />}
        {!scope && can('staff.manage') && <Route path="/staff" element={<Staff />} />}
        {!scope && can('website_leads.manage') && <Route path="/website-leads" element={<WebsiteLeads />} />}
        {!scope && r === 'super_admin' && <Route path="/agencies" element={<Agencies />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
