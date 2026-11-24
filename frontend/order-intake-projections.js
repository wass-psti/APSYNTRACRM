/** Deterministic projections over the same order collection, not independent stores. */
import { ORDER_INTAKE_STATUSES } from './order-intake-native.js';

function minorUnits(value) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match || (typeof value === 'number' && Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)) {
    throw new TypeError('Invalid monetary precision');
  }
  const amount = BigInt(match[2]) * 100n + BigInt((match[3] || '').padEnd(2, '0'));
  return match[1] ? -amount : amount;
}

function decimal(value) {
  const absolute = value < 0n ? -value : value;
  return (value < 0n ? '-' : '') + absolute / 100n + '.' + String(absolute % 100n).padStart(2, '0');
}

/** Preview the same rounded VAT and profit calculation as the existing RPC. */
export function previewOrderFinancials({ amount, vatRate, expenses }) {
  const gross = minorUnits(amount);
  const cost = minorUnits(expenses);
  const rate = /^(\d+)(?:\.(\d{1,4}))?$/.exec(String(vatRate));
  if (!rate || gross <= 0n || cost < 0n) throw new TypeError('Invalid financial input');
  const scaledRate = BigInt(rate[1]) * 10000n + BigInt((rate[2] || '').padEnd(4, '0'));
  if (scaledRate > 99990000n) throw new TypeError('Invalid VAT rate');
  const divisor = 1000000n + scaledRate;
  const exclusive = (gross * 1000000n + divisor / 2n) / divisor;
  return {
    vatExclusiveAmount: decimal(exclusive),
    vatAmount: decimal(gross - exclusive),
    grossProfit: decimal(exclusive - cost)
  };
}

/** Call with a complete, consistent collection, never a single paginated slice. */
export function projectOrders(rows) {
  const active = rows.filter(row => !row.archived);
  const buckets = new Map(ORDER_INTAKE_STATUSES.map(status => [status, []]));
  const totals = new Map();
  const seen = new Set();
  for (const row of active) {
    if (!row.id || seen.has(row.id)) throw new Error('Duplicate or missing order identity');
    seen.add(row.id);
    if (!buckets.has(row.status)) buckets.set(row.status, []);
    buckets.get(row.status).push(row);
    if (!row.currency) throw new Error('Missing order currency');
    if (!totals.has(row.currency)) totals.set(row.currency, { amount: 0n, expenses: 0n, profit: 0n });
    const total = totals.get(row.currency);
    total.amount += minorUnits(row.po_amount);
    total.expenses += minorUnits(row.procurement_expenses);
    total.profit += minorUnits(row.gross_profit);
  }
  return {
    totalOrders: active.length,
    workflow: Array.from(buckets, ([status, orders]) => ({ status, orders })),
    currencyTotals: Array.from(totals, ([currency, total]) => ({
      currency, amount: decimal(total.amount), expenses: decimal(total.expenses), grossProfit: decimal(total.profit)
    }))
  };
}
