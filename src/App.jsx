import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import ClientDetail from './pages/ClientDetail.jsx';
import Agencies from './pages/Agencies.jsx';
import Plans from './pages/Plans.jsx';
import Team from './pages/Team.jsx';
import AuditLog from './pages/AuditLog.jsx';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">Loading...</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  if (user.must_change_password) return <ChangePassword forced />;

  const r = user.role;
  const manager = ['super_admin', 'agency_admin'].includes(r);
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        {manager && <Route path="/clients" element={<Clients />} />}
        {['super_admin', 'agency_admin', 'client_admin'].includes(r) && (
          <Route path="/clients/:id" element={<ClientDetail />} />
        )}
        {r === 'super_admin' && <Route path="/agencies" element={<Agencies />} />}
        {r === 'super_admin' && <Route path="/plans" element={<Plans />} />}
        {r === 'client_admin' && <Route path="/team" element={<Team />} />}
        {['super_admin', 'agency_admin', 'client_admin'].includes(r) && (
          <Route path="/audit" element={<AuditLog />} />
        )}
        <Route path="/account" element={<ChangePassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
