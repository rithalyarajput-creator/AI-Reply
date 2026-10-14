import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field } from '../components/ui.jsx';

export default function ChangePassword({ forced = false }) {
  const { user, setUser, logout, impersonating, exitImpersonation } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setDone(false);
    if (next !== again) return setError('New passwords do not match');
    try {
      await api('/auth/change-password', { method: 'POST', body: { current, next } });
      setUser({ ...user, must_change_password: false });
      setCurrent(''); setNext(''); setAgain('');
      setDone(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const form = (
    <form className="card login" onSubmit={submit}>
      <h2>{forced ? 'Set a new password' : 'Change password'}</h2>
      {forced && <p className="muted">You are using a temporary password. Choose your own to continue.</p>}
      {impersonating && <div className="error">Not available while viewing as a client.</div>}
      <Field label="Current password">
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </Field>
      <Field label="New password (min 8 characters)">
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Repeat new password">
        <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" minLength={8} required />
      </Field>
      {error && <div className="error">{error}</div>}
      {done && <div className="ok">Password updated.</div>}
      <button className="btn" disabled={impersonating}>Update password</button>
      {forced && <button type="button" className="btn ghost" onClick={logout}>Logout</button>}
      {impersonating && <button type="button" className="btn ghost" onClick={exitImpersonation}>Back to my account</button>}
    </form>
  );
  return forced ? <div className="center">{form}</div> : form;
}
