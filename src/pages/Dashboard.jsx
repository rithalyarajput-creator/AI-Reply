import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLE_LABEL } from '../components/Layout.jsx';

const CARDS = {
  super_admin: [['clients', 'Clients'], ['active', 'Active'], ['trial', 'On trial'], ['suspended', 'Suspended'], ['agencies', 'Agencies'], ['agents', 'Agents (all clients)']],
  agency_admin: [['clients', 'Clients'], ['active', 'Active'], ['trial', 'On trial'], ['suspended', 'Suspended'], ['agents', 'Agents']],
  client_admin: [['agent_heads', 'Agent heads'], ['agents', 'Agents'], ['active_users', 'Active users']],
};

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/stats').then(setStats).catch((e) => setError(e.message));
  }, []);

  const cards = CARDS[user.role];
  return (
    <>
      <h2>Welcome, {user.name}</h2>
      <p className="muted">{ROLE_LABEL[user.role]}</p>
      {error && <div className="error">{error}</div>}
      {cards ? (
        <div className="grid">
          {cards.map(([key, label]) => (
            <div className="card stat" key={key}>
              <div className="muted small">{label}</div>
              <div className="big">{stats ? stats[key] : '...'}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <p>Team Inbox, templates and campaigns are coming in the next phase.</p>
        </div>
      )}
    </>
  );
}
