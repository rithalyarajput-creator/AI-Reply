import { useState } from 'react';
import { api, downloadCsv } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Badge, Err, Field, Modal, PageHead, Tabs, fmtDate, fmtMoney, useLoad,
} from '../../components/ui.jsx';

function Adjust({ clients, onClose, onDone }) {
  const [f, setF] = useState({ client_id: '', direction: 'credit', amount: '', reason: '', reference: '' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/wallet/adjust', { method: 'POST', body: { ...f, amount: Number(f.amount) } });
      onDone();
    } catch (err) { setError(err.message); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Manual wallet entry" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Client">
          <select value={f.client_id} onChange={set('client_id')} required>
            <option value="">Choose client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name} ({fmtMoney(c.wallet_balance)})</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={f.direction} onChange={set('direction')}>
            <option value="credit">Add money (recharge)</option>
            <option value="debit">Deduct money</option>
          </select>
        </Field>
        <Field label="Amount (₹)"><input type="number" min="0.01" step="0.01" value={f.amount} onChange={set('amount')} required /></Field>
        <Field label="Reason (required, goes to audit log)"><input value={f.reason} onChange={set('reason')} required /></Field>
        <Field label="Reference (payment ID, optional)"><input value={f.reference} onChange={set('reference')} /></Field>
        <Err error={error} />
        <div className="row">
          <button className="btn">Save entry</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function Invoices({ clients, canEdit }) {
  const [d, load, error] = useLoad(() => api('/invoices'), []);
  const [f, setF] = useState({ client_id: '', period: new Date().toISOString().slice(0, 7), amount: '', gst_amount: '0' });
  const [err2, setErr2] = useState('');
  const create = async (e) => {
    e.preventDefault();
    setErr2('');
    try {
      await api('/invoices', { method: 'POST', body: { ...f, amount: Number(f.amount), gst_amount: Number(f.gst_amount) } });
      load();
    } catch (er) { setErr2(er.message); }
  };
  const mark = async (id, status) => { await api(`/invoices/${id}`, { method: 'PATCH', body: { status } }); load(); };
  return (
    <>
      {canEdit && (
        <form className="card row" onSubmit={create}>
          <Field label="Client">
            <select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} required>
              <option value="">Choose client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </Field>
          <Field label="Period (YYYY-MM)"><input value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} required /></Field>
          <Field label="Amount"><input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
          <Field label="GST amount"><input type="number" min="0" step="0.01" value={f.gst_amount} onChange={(e) => setF({ ...f, gst_amount: e.target.value })} /></Field>
          <button className="btn">Create invoice</button>
          <Err error={err2} />
        </form>
      )}
      <Err error={error} />
      <p className="muted small">GST, TDS and invoice format rules: confirm with your accountant before sending invoices to clients.</p>
      <div className="card table-wrap"><table>
        <thead><tr><th>Number</th><th>Client</th><th>Period</th><th>Amount</th><th>GST</th><th>Status</th><th /></tr></thead>
        <tbody>
          {d?.invoices.map((i) => (
            <tr key={i.id}><td>{i.number}</td><td>{i.company_name}</td><td>{i.period}</td><td>{fmtMoney(i.amount)}</td><td>{fmtMoney(i.gst_amount)}</td>
              <td><Badge value={i.status} /></td>
              <td className="actions">{canEdit && i.status === 'due' && (
                <>
                  <button className="btn ghost small" onClick={() => mark(i.id, 'paid')}>Mark paid</button>
                  <button className="btn ghost small" onClick={() => mark(i.id, 'void')}>Void</button>
                </>
              )}</td>
            </tr>
          ))}
          {d && !d.invoices.length && <tr><td colSpan="7" className="muted">No invoices yet.</td></tr>}
        </tbody></table></div>
    </>
  );
}

export default function Billing() {
  const { can } = useAuth();
  const canEdit = can('wallet.edit');
  const [tab, setTab] = useState('overview');
  const [s, reload, error] = useLoad(() => api('/wallet/summary'), []);
  const [ledger, loadLedger] = useLoad(() => api('/wallet/ledger'), []);
  const [adding, setAdding] = useState(false);

  const exportLedger = () => downloadCsv('wallet-ledger.csv', [
    ['When', 'Client', 'Type', 'Amount', 'Balance after', 'Meta cost', 'Reference', 'Note', 'By'],
    ...(ledger?.ledger || []).map((l) => [l.created_at, l.company_name, l.type, l.amount, l.balance_after, l.meta_cost, l.reference, l.note, l.created_by_name]),
  ]);

  return (
    <>
      <PageHead title="Wallet and Billing" sub="Prepaid balances, ledger, manual entries and invoices.">
        {canEdit && <button className="btn" onClick={() => setAdding(true)}>Manual entry</button>}
      </PageHead>
      <Err error={error} />
      <Tabs tabs={[['overview', 'Overview'], ['ledger', 'Ledger'], ['invoices', 'Invoices']]} value={tab} onChange={setTab} />
      {tab === 'overview' && s && (
        <>
          <div className="grid">
            <div className="card stat"><div className="muted small">Recharge this month</div><div className="big">{fmtMoney(s.recharge)}</div></div>
            <div className="card stat"><div className="muted small">Billed to clients</div><div className="big">{fmtMoney(s.billed)}</div></div>
            <div className="card stat"><div className="muted small">Meta cost</div><div className="big">{fmtMoney(s.meta_cost)}</div></div>
            <div className="card stat"><div className="muted small">Gross margin</div><div className="big">{fmtMoney(s.gross_margin)}</div></div>
          </div>
          <h3>Client balances</h3>
          <div className="card table-wrap"><table>
            <thead><tr><th>Client</th><th>Status</th><th>Balance</th><th>Alert below</th><th /></tr></thead>
            <tbody>
              {s.clients.map((c) => (
                <tr key={c.id}><td>{c.company_name}</td><td><Badge value={c.status} /></td><td>{fmtMoney(c.wallet_balance)}</td><td>{fmtMoney(c.low_balance_alert)}</td>
                  <td>{Number(c.wallet_balance) < Number(c.low_balance_alert) && <Badge value="suspended" />}</td></tr>
              ))}
              {!s.clients.length && <tr><td colSpan="5" className="muted">No clients yet.</td></tr>}
            </tbody></table></div>
        </>
      )}
      {tab === 'ledger' && (
        <>
          <div className="row"><button className="btn ghost" onClick={exportLedger}>Download CSV</button></div>
          <div className="card table-wrap"><table>
            <thead><tr><th>When</th><th>Client</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Reference</th><th>By</th></tr></thead>
            <tbody>
              {ledger?.ledger.map((l) => (
                <tr key={l.id}><td>{fmtDate(l.created_at)}</td><td>{l.company_name}</td><td><Badge value={l.type} /></td>
                  <td className={Number(l.amount) < 0 ? 'neg' : 'pos'}>{fmtMoney(l.amount)}</td><td>{fmtMoney(l.balance_after)}</td>
                  <td>{l.note || l.reference || ''}</td><td>{l.created_by_name}</td></tr>
              ))}
              {ledger && !ledger.ledger.length && <tr><td colSpan="7" className="muted">No entries yet.</td></tr>}
            </tbody></table></div>
        </>
      )}
      {tab === 'invoices' && s && <Invoices clients={s.clients} canEdit={canEdit} />}
      {adding && s && (
        <Adjust clients={s.clients} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); loadLedger(); }} />
      )}
    </>
  );
}
