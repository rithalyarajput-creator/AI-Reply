import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Field } from '../components/ui.jsx';

export default function Plans() {
  const [plans, setPlans] = useState(null);
  const [f, setF] = useState({ name: '', monthly_fee: '0', included_agents: '5' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const load = useCallback(() => {
    api('/plans').then((d) => setPlans(d.plans)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/plans', { method: 'POST', body: f });
      setF({ name: '', monthly_fee: '0', included_agents: '5' });
      load();
    } catch (err) { setError(err.message); }
  };

  return (
    <>
      <h2>Plans</h2>
      <form className="card row" onSubmit={submit}>
        <Field label="Plan name"><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Monthly fee"><input type="number" min="0" step="0.01" value={f.monthly_fee} onChange={set('monthly_fee')} /></Field>
        <Field label="Included agents"><input type="number" min="0" value={f.included_agents} onChange={set('included_agents')} /></Field>
        <button className="btn">Add plan</button>
      </form>
      {error && <div className="error">{error}</div>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Plan</th><th>Monthly fee</th><th>Included agents</th></tr></thead>
          <tbody>
            {plans?.map((p) => (
              <tr key={p.id}><td>{p.name}</td><td>{Number(p.monthly_fee).toFixed(2)}</td><td>{p.included_agents}</td></tr>
            ))}
            {plans && !plans.length && <tr><td colSpan="3" className="muted">No plans yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
