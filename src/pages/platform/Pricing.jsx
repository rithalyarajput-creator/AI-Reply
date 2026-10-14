import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Empty, Err, Field, PageHead, fmtMoney, useLoad,
} from '../../components/ui.jsx';

const CATS = ['marketing', 'utility', 'authentication', 'service'];

function PlanCard({ plan, canEdit, reload }) {
  const [f, setF] = useState({ name: plan.name, monthly_fee: plan.monthly_fee, included_agents: plan.included_agents });
  const [rates, setRates] = useState(Object.fromEntries(plan.rates.map((r) => [r.category, { meta_cost: r.meta_cost, markup: r.markup }])));
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setMsg(''); setError('');
    try {
      await api(`/pricing/plans/${plan.id}`, { method: 'PATCH', body: f });
      await api(`/pricing/plans/${plan.id}/rates`, {
        method: 'PUT', body: { rates: CATS.map((c) => ({ category: c, ...rates[c] })) },
      });
      setMsg('Saved');
      reload();
    } catch (e) { setError(e.message); }
  };
  const setRate = (cat, key, v) => setRates({ ...rates, [cat]: { ...rates[cat], [key]: v } });

  return (
    <div className="card">
      <div className="form-grid">
        <Field label="Plan name"><input value={f.name} disabled={!canEdit} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Monthly fee (₹)"><input type="number" min="0" value={f.monthly_fee} disabled={!canEdit} onChange={(e) => setF({ ...f, monthly_fee: e.target.value })} /></Field>
        <Field label="Included agents"><input type="number" min="0" value={f.included_agents} disabled={!canEdit} onChange={(e) => setF({ ...f, included_agents: e.target.value })} /></Field>
      </div>
      <table>
        <thead><tr><th>Category</th><th>Meta charge (₹)</th><th>Your markup (₹)</th><th>Client rate</th></tr></thead>
        <tbody>
          {CATS.map((c) => (
            <tr key={c}>
              <td>{c}</td>
              <td><input type="number" min="0" step="0.0001" value={rates[c].meta_cost} disabled={!canEdit} onChange={(e) => setRate(c, 'meta_cost', e.target.value)} /></td>
              <td><input type="number" min="0" step="0.0001" value={rates[c].markup} disabled={!canEdit} onChange={(e) => setRate(c, 'markup', e.target.value)} /></td>
              <td>{fmtMoney(Number(rates[c].meta_cost) + Number(rates[c].markup))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Err error={error} />
      {msg && <div className="ok">{msg}</div>}
      {canEdit && <button className="btn" onClick={save}>Save plan</button>}
    </div>
  );
}

export default function Pricing() {
  const { can } = useAuth();
  const canEdit = can('plans.edit');
  const [d, load, error] = useLoad(() => api('/pricing/plans'), []);
  const [f, setF] = useState({ name: '', monthly_fee: '0', included_agents: '5' });
  const [err2, setErr2] = useState('');

  const add = async (e) => {
    e.preventDefault();
    setErr2('');
    try {
      await api('/plans', { method: 'POST', body: f });
      setF({ name: '', monthly_fee: '0', included_agents: '5' });
      load();
    } catch (er) { setErr2(er.message); }
  };

  return (
    <>
      <PageHead title="Plans and Pricing" sub="What clients pay, and your markup on top of Meta's per-message charge." />
      <Empty>
        Meta's rates change by category and country. Fill the "Meta charge" column from Meta's current official
        pricing page before you set markup. These numbers are not pre-filled on purpose.
      </Empty>
      <Err error={error} />
      {canEdit && (
        <form className="card row" onSubmit={add}>
          <Field label="New plan name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Monthly fee"><input type="number" min="0" value={f.monthly_fee} onChange={(e) => setF({ ...f, monthly_fee: e.target.value })} /></Field>
          <Field label="Included agents"><input type="number" min="0" value={f.included_agents} onChange={(e) => setF({ ...f, included_agents: e.target.value })} /></Field>
          <button className="btn">Add plan</button>
          <Err error={err2} />
        </form>
      )}
      {d?.plans.map((p) => <PlanCard key={`${p.id}-${p.rates.map((r) => r.client_rate).join('-')}`} plan={p} canEdit={canEdit} reload={load} />)}
      {d && !d.plans.length && <Empty>No plans yet.</Empty>}
    </>
  );
}
