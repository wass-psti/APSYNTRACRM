/** Nonproduction combined snapshot adapter. Production transport remains unchanged. */
import { projectOrders } from './order-intake-projections.js';
import { ORDER_INTAKE_STATUSES } from './order-intake-native.js';

const legacy = row => row.record_kind === 'legacy';
const visible = row => row.archived !== true;

export function createUnifiedOrderIntakeReader({workspaceId,nativeRows,legacyRows}) {
  const rows = [...nativeRows, ...legacyRows].filter(visible);
  const ids = new Set(), keys = new Set();
  for (const row of rows) {
    if (row.workspace_id !== workspaceId || !row.id || ids.has(row.id)) throw new Error('Invalid unified order identity');
    ids.add(row.id);
    if (legacy(row)) {
      if (!row.source_key || keys.has(row.source_key)) throw new Error('Duplicate legacy source identity');
      keys.add(row.source_key);
    }
  }
  rows.sort((a,b) => String(b.date_received || '').localeCompare(String(a.date_received || '')) || b.id.localeCompare(a.id));
  const byId = new Map(rows.map(row => [row.id,row]));
  return {
    async list({offset=0,limit=100}={}) {
      if (!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100) throw new Error('Invalid order page');
      return {items:rows.slice(offset,offset+limit),hasMore:offset+limit<rows.length};
    },
    async detail(id) { return byId.get(id) || null; }
  };
}

// Exact decimal addition, including historical amounts with more than two places.
export function addExact(left,right) {
  const parts = value => /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  const a=parts(left), b=parts(right);
  if (!a||!b) throw new Error('Invalid source decimal');
  const scale=Math.max(a[3]?.length||0,b[3]?.length||0);
  const units=m=>BigInt(m[1]+m[2]+(m[3]||'').padEnd(scale,'0'));
  const sum=units(a)+units(b), absolute=(sum<0n?-sum:sum).toString().padStart(scale+1,'0');
  return (sum<0n?'-':'')+(scale?absolute.slice(0,-scale)+'.'+absolute.slice(-scale):absolute);
}

export function projectUnifiedOrders(rows) {
  const active=rows.filter(visible);
  const ids=new Set();
  const stages=new Map(ORDER_INTAKE_STATUSES.map(status=>[status,[]]));
  const history=[],native=[];
  for (const row of active) {
    if (!row.id||ids.has(row.id)) throw new Error('Duplicate or missing order identity');
    ids.add(row.id);
    const status=row.status||'Unknown status';
    if (!stages.has(status)) stages.set(status,[]);
    stages.get(status).push(row);
    (legacy(row)?history:native).push(row);
  }
  const totals=new Map();
  let unknownCurrency=0;
  for (const row of history) {
    if (!/^[A-Z]{3}$/.test(row.currency||'')) {unknownCurrency++;continue;}
    if (!totals.has(row.currency)) totals.set(row.currency,{currency:row.currency,rows:0,amountCount:0,amount:null});
    const total=totals.get(row.currency);
    total.rows++;
    if (row.po_amount!==null&&row.po_amount!==undefined&&/^-?\d+(?:\.\d+)?$/.test(String(row.po_amount))) {
      total.amount=addExact(total.amount??'0',row.po_amount);
      total.amountCount++;
    }
  }
  return {totalOrders:active.length,workflow:Array.from(stages,([status,orders])=>({status,orders})),
    currencyTotals:projectOrders(native).currencyTotals,
    legacyCount:history.length,legacyUnknownCurrency:unknownCurrency,
    legacyUnknownArchive:history.filter(row=>row.archived==null).length,
    legacyTotals:[...totals.values()]};
}
