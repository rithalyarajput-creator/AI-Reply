// Prepaid wallet: rates, credits, debits and refunds. Amounts in the ledger are signed.
import { q } from './core.js';

const num = (v) => Number(v ?? 0);

// Client's price per message for a category: client override > plan rate card (meta_cost + markup) > 0.
export async function rateFor(clientId, category) {
  const [o] = await q('SELECT rate FROM client_rates WHERE client_id = $1 AND category = $2', [clientId, category]);
  const [rc] = await q(
    `SELECT r.meta_cost, r.markup FROM clients c JOIN rate_cards r ON r.plan_id = c.plan_id
     WHERE c.id = $1 AND r.category = $2`, [clientId, category]);
  const metaCost = rc ? num(rc.meta_cost) : 0;
  const rate = o ? num(o.rate) : rc ? num(rc.meta_cost) + num(rc.markup) : 0;
  return { rate, metaCost };
}

export async function getBalance(clientId) {
  const [r] = await q('SELECT wallet_balance FROM clients WHERE id = $1', [clientId]);
  return num(r?.wallet_balance);
}

async function ledger({ clientId, type, amount, balanceAfter, metaCost = 0, reference, note, actor }) {
  await q(
    `INSERT INTO wallet_ledger (client_id, type, amount, balance_after, meta_cost, reference, note, created_by, created_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [clientId, type, amount, balanceAfter, metaCost, reference || null, note || null,
      actor?.imp || actor?.id || null, actor?.name || 'System']);
}

// Positive money in (recharge, refund) or a signed adjustment.
export async function creditWallet({ clientId, amount, type = 'credit', reference, note, actor, metaCost = 0 }) {
  const amt = num(amount);
  const [row] = await q(
    'UPDATE clients SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance', [amt, clientId]);
  if (!row) return null;
  await ledger({ clientId, type, amount: amt, balanceAfter: num(row.wallet_balance), metaCost, reference, note, actor });
  return num(row.wallet_balance);
}

// Returns the new balance, or null when the balance is not enough (nothing is charged).
export async function debitWallet({ clientId, amount, reference, note, metaCost = 0, actor }) {
  const amt = num(amount);
  if (amt <= 0) return getBalance(clientId);
  const [row] = await q(
    `UPDATE clients SET wallet_balance = wallet_balance - $1
     WHERE id = $2 AND wallet_balance >= $1 RETURNING wallet_balance`, [amt, clientId]);
  if (!row) return null;
  await ledger({ clientId, type: 'debit', amount: -amt, balanceAfter: num(row.wallet_balance), metaCost, reference, note, actor });
  return num(row.wallet_balance);
}
