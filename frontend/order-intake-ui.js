import {orderTablePage} from './order-intake-search.js';
import {bulkToolbar,bulkResults} from './order-intake-bulk-ui.js';
import { ORDER_INTAKE_SECTIONS, orderIntakeHref } from './order-intake-route.js';
import { ORDER_INTAKE_STATUSES } from './order-intake-native.js';
import { filterOrderIntakeRows } from './order-intake-read-state.js';
import { renderSalesDashboard } from './order-intake-dashboard.js';
import { lifecycleActions,lifecycleControls,renderOrderActivity } from './order-intake-lifecycle.js';
import { nativeEditable } from './order-intake-editor.js';
import { projectUnifiedOrders } from './order-intake-unified-read.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const show = value => esc(value === null || value === undefined || value === '' ? '—' : value);
const labels = ['Dashboard', 'Workflow', 'Search', 'All Orders', 'Archived'];
const money = (value, currency) => (currency ? show(currency) : 'Unknown currency') + ' ' + show(value);
const history = row => row.record_kind === 'legacy';
const origin = row => history(row) ? ' <small>Historical</small>' : '';
const options = (values, selected) => [''].concat([...new Set(values.filter(Boolean))]).map(value =>
  '<option value="' + esc(value) + '"' + (String(value) === selected ? ' selected' : '') + '>' + esc(value || 'All') + '</option>').join('');
const field = (label, name, content) => '<label>' + esc(label) + content + '</label>';
function filterForm(rows, route) {
  const f = route.filters;
  const select = (label, name, values) => field(label, name, '<select name="' + name + '">' + options(values, f[name]) + '</select>');
  const input = (label, name, type = 'search') => field(label, name, '<input name="' + name + '" type="' + type + '" value="' + esc(f[name]) + '">');
  const values = key => rows.map(row => row[key]);
  return '<form id="oi-filter-form" class="oi-filters">' +
    input('PO number, client or account manager', 'q') +
    select('Fiscal year', 'year', values('fiscal_year').filter(v=>v!=null).map(String).concat(f.year).sort().reverse()) +
    (['search','dashboard','all-orders','archived'].includes(route.section) ? select('Status', 'status', [...ORDER_INTAKE_STATUSES, ...values('status'), f.status]) +
      input('Received from', 'from', 'date') + input('Received to', 'to', 'date') +
      select('Company', 'company', [...values('company'), f.company]) +
      select('Industry', 'industry', [...values('industry'), f.industry]) +
      select('Currency', 'currency', [...values('currency'), ...(rows.some(row=>history(row)&&!row.currency)?['Unknown currency']:[]), f.currency])+
      select('Account manager','manager',[...values('account_manager'),f.manager])+
      select('Record type','kind',['native','legacy'])+
      input('Minimum PO amount','minAmount','text')+input('Maximum PO amount','maxAmount','text')+
      select('Sort','sort',['received-desc','received-asc','po-asc','amount-desc'])+
      '<small>Amount range uses reported numeric values in each record currency; no currency conversion. Amount sorting groups by currency.</small>' :
      ['status','from','to','company','industry','currency','manager','kind','minAmount','maxAmount','sort'].map(key => '<input type="hidden" name="'+key+'" value="'+esc(f[key])+'">').join('')) +
    '<button type="submit" class="secondary">Apply filters</button><a href="' + orderIntakeHref(route.section) + '">Clear</a></form>';
}
function orderTable(rows, route, selection=null, disabled=false) {
  if (!rows.length) return '<p class="oi-empty">No matching orders in the loaded records.</p>';
  return '<div class="oi-table-scroll" tabindex="0" aria-label="Purchase orders"><table><thead><tr>' +
    (selection?'<th scope="col">Select</th>':'')+['PO Number','Client','Currency','Status','PO Amount','Gross Profit','Industry','Company','Account Manager','Date Received','Delivery Date'].map(v => '<th scope="col">'+v+'</th>').join('') +
    '</tr></thead><tbody>' + rows.map(row => '<tr>'+(selection?'<td><input type="checkbox" name="order-selection" data-oi-select="'+esc(row.id)+'" aria-label="Select '+esc(row.po_number)+'"'+(selection.has(row.id)?' checked':'')+(disabled?' disabled':'')+'></td>':'')+'<td><a href="' + esc(orderIntakeHref(route.section==='archived'?'archived':'all-orders',route.filters,row.id)) + '">' + show(row.po_number) + '</a>'+origin(row)+'</td>' +
      [row.client_name,row.currency,row.status,row.po_amount,row.gross_profit,row.industry,row.company,row.account_manager,row.date_received,row.delivery_date].map((v,i) => '<td>'+show(v)+(history(row)&&i===4?' <small>Source</small>':history(row)&&i===5?' <small>Reported</small>':'')+'</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}
function workflow(rows, route) {
  return '<div class="oi-workflow" tabindex="0" aria-label="Order workflow">' + projectUnifiedOrders(rows).workflow.map(stage =>
    '<section class="oi-stage" data-oi-stage="'+esc(stage.status)+'"><h2>'+show(stage.status)+' <span>'+stage.orders.length+'</span></h2>' +
    (stage.orders.map(row => '<article'+(lifecycleActions(row).status?' draggable="true" data-oi-drag="'+esc(row.id)+'"':'')+'><a href="'+esc(orderIntakeHref(route.section==='archived'?'archived':'all-orders',route.filters,row.id))+'">'+show(row.po_number)+'</a>'+origin(row)+'<p>'+show(row.company)+'</p><strong>'+money(row.po_amount,row.currency)+'</strong><p>'+show(row.account_manager)+'</p>'+lifecycleControls(row,{card:true})+'</article>').join('') || '<p class="oi-empty">No orders</p>') + '</section>').join('') + '</div>';
}
function detail(record, route) {
  if (!route.recordId) return '';
  return '<section class="oi-panel"><h2>Purchase order details</h2><a href="'+esc(orderIntakeHref(route.section==='archived'?'archived':'all-orders',route.filters))+'">Close details</a>' +
    (record?.busy ? '<p role="status">Loading order…</p>' : record?.error ? '<p role="alert">'+esc(record.error)+'</p>' :
      record?.row ? '<button type="button" class="secondary" data-oi-action="confirmation">Generate PO confirmation PDF</button>'+(nativeEditable(record.row)?'<button type="button" class="secondary" data-oi-action="edit">Edit purchase order</button>':'')+(history(record.row)?'<p>Historical record — original reported financial values; original source status and archive state are retained separately; VAT and archive state may be unknown. Historical client evidence is not a verified current client.</p>':'')+'<dl class="oi-detail">'+Object.entries(record.row).filter(([key])=>!['id','workspace_id'].includes(key)&&(key!=='archived'||history(record.row))).map(([key,value])=>'<div><dt>'+esc(key.replaceAll('_',' '))+'</dt><dd>'+show(value)+'</dd></div>').join('')+'</dl>'+lifecycleControls(record.row)+(Number.isSafeInteger(record.row.revision)?'<button type="button" class="secondary" data-oi-action="recipient" data-oi-id="'+esc(record.row.id)+'">Notification recipient</button>':'')+renderOrderActivity(record.activity) : '<p>Order unavailable.</p>') + '</section>';
}
export function renderOrderIntake({ route, snapshot, record = null, tableState = null }) {
  const rows = snapshot?.rows || [];
  const filtered = filterOrderIntakeRows(rows, route.filters);
  const partial = !snapshot || snapshot.hasMore || snapshot.busy || Boolean(snapshot.error);
  let content = '';
  const table=tableState&&['search','all-orders','archived'].includes(route.section)?orderTablePage(filtered,tableState.page):null;
  const ready=!partial&&!tableState?.busy;
  try {
    if (snapshot && !snapshot.busy || rows.length) content = route.section === 'dashboard' ? renderSalesDashboard(filtered,{recentOrders:orderTable(filtered.slice(0,10),route),complete:!partial}) :
      route.section === 'workflow' ? workflow(filtered,route) : table?bulkToolbar({selected:tableState.selected.size,total:filtered.length,page:table.page,pages:table.pages,ready,busy:tableState.busy,archived:route.section==='archived'})+orderTable(table.rows,route,tableState.selected,!ready):orderTable(filtered,route);
  } catch (error) { content = '<p role="alert">'+esc(error.message)+'</p>'; }
  return '<section class="oi-app" aria-label="Order Intake"><header class="oi-header"><div><h1>Order Intake</h1><p>Sales Operations Intelligence</p></div><div class="oi-header-actions"><button class="secondary" type="button" data-oi-action="inbox">Notifications</button><button class="primary" type="button" data-oi-action="create">New purchase order</button><button class="secondary" type="button" data-oi-action="refresh"'+(snapshot?.busy?' disabled':'')+'>Refresh</button></div></header>' +
    '<nav class="oi-tabs" aria-label="Order Intake views">'+ORDER_INTAKE_SECTIONS.map((section,i)=>'<a href="'+esc(orderIntakeHref(section,route.filters))+'"'+(section===route.section?' aria-current="page"':'')+'>'+labels[i]+'</a>').join('')+'</nav>' +
    filterForm(rows,route) + detail(record,route) + (tableState?bulkResults(tableState.results):'') +
    '<p class="oi-count" role="status">'+(snapshot?.busy?'Loading orders… ': '')+filtered.length+' matching of '+rows.length+' loaded orders. '+(partial?'Partial or unconfirmed results; counts and totals cover loaded records only.':'All available pages loaded; refresh for current records.')+'</p>' +
    (snapshot?.error?'<p role="alert">'+esc(snapshot.error)+'</p>':'') + content +
    (snapshot?.hasMore && !snapshot.busy && !snapshot.error?'<button type="button" class="secondary" data-oi-action="more">Load more orders</button>':'')+'</section>';
}
