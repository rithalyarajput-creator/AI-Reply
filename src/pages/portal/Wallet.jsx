import { api } from '../../api.js';
import {
  Badge, Err, PageHead, fmtDate, fmtMoney, useLoad,
} from '../../components/ui.jsx';

export default function Wallet() {
  const [d, , error] = useLoad(() => api('/portal/wallet'), []);
  return (
    <>
      <PageHead title="Wallet" sub="Prepaid balance. Each message is charged at your rate when it is sent; failed messages are refunded." />
      <Err error={error} />
      {d && (
        <>
          <div className="grid">
            <div className="card stat"><div className="muted small">Balance</div><div className="big">{fmtMoney(d.balance)}</div></div>
            <div className="card stat"><div className="muted small">Low balance alert</div><div className="big">{fmtMoney(d.low_balance_alert)}</div></div>
            {d.rates.map((r) => (
              <div className="card stat" key={r.category}><div className="muted small">{r.category} rate</div><div className="big">{fmtMoney(r.rate)}</div></div>
            ))}
          </div>
          <p className="muted">To add money, contact your account manager. Your balance is updated as soon as the payment is recorded.</p>
          <div className="card table-wrap"><h3 className="pad">Transactions</h3><table>
            <thead><tr><th>When</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Note</th></tr></thead>
            <tbody>
              {d.ledger.map((l) => (
                <tr key={l.id}><td>{fmtDate(l.created_at)}</td><td><Badge value={l.type} /></td>
                  <td className={Number(l.amount) < 0 ? 'neg' : 'pos'}>{fmtMoney(l.amount)}</td><td>{fmtMoney(l.balance_after)}</td><td>{l.note || l.reference || ''}</td></tr>
              ))}
              {!d.ledger.length && <tr><td colSpan="5" className="muted">No transactions yet.</td></tr>}
            </tbody></table></div>
          <div className="card table-wrap"><h3 className="pad">Invoices</h3><table>
            <thead><tr><th>Number</th><th>Period</th><th>Amount</th><th>GST</th><th>Status</th></tr></thead>
            <tbody>
              {d.invoices.map((i) => <tr key={i.id}><td>{i.number}</td><td>{i.period}</td><td>{fmtMoney(i.amount)}</td><td>{fmtMoney(i.gst_amount)}</td><td><Badge value={i.status} /></td></tr>)}
              {!d.invoices.length && <tr><td colSpan="5" className="muted">No invoices yet.</td></tr>}
            </tbody></table></div>
        </>
      )}
    </>
  );
}
