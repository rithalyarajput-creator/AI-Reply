import UsersPanel from '../components/UsersPanel.jsx';

export default function Team() {
  return (
    <>
      <h2>Team</h2>
      <p className="muted">Create logins for your agent heads and agents. Each person gets their own email and password.</p>
      <UsersPanel />
    </>
  );
}
