import {renderFRTAccountingEditor} from './frt-accounting.js';
/** Safe HTML rendering for persisted FRT voucher documents. */
const e=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const cents=value=>{
 const raw=String(value??'0');
 if(!/^\d{1,15}(?:\.\d{1,2})?$/.test(raw))throw new TypeError('Invalid voucher amount');
 const [whole,fraction='']=raw.split('.');
 return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
};
const moneyCents=value=>{
 const whole=value/100n,fraction=String(value%100n).padStart(2,'0');
 return '₱'+Number(whole).toLocaleString('en-PH',{maximumFractionDigits:0})+'.'+fraction;
};
const money=value=>moneyCents(cents(value));
const categoryGroups=items=>{
 const groups=new Map();
 for(const item of items){
  const group=groups.get(item.category)||{category:item.category,items:[],total:0n};
  group.items.push(item);group.total+=cents(item.amount);groups.set(item.category,group);
 }
 return [...groups.values()];
};
const date=value=>{
 if(!value)return 'Not recorded';
 const parsed=new Date(value);
 return Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat('en-PH',{
  dateStyle:'medium',timeZone:'Asia/Manila'
 }).format(parsed):'Not recorded';
};
const dateTime=value=>{
 if(!value)return 'Not recorded';
 const parsed=new Date(value);
 return Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat('en-PH',{
  dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'
 }).format(parsed):'Not recorded';
};
const field=(label,value)=>'<div class="frt-voucher-field"><span>'+e(label)+'</span><strong>'+e(value||'Not recorded')+'</strong></div>';
const approval=(title,record,nameLabel,timeLabel,reference='')=>{
 const exists=!!record?.[timeLabel];
 return '<section class="frt-voucher-approval"><h3>'+e(title)+'</h3>'+
  field(nameLabel,exists?(record[nameLabel]||'Name unavailable'):'Not recorded')+
  field('Recorded at',exists?dateTime(record[timeLabel]):'Not recorded')+
  (reference&&record?.[reference]?field('Reference',record[reference]):'')+'</section>';
};
export function renderFRTVoucherDocument(voucher,{previewUrl=''}={}){
 if(!voucher||!Array.isArray(voucher.items))return '<p role="alert">Voucher data is unavailable.</p>';
 const company=voucher.company||{};
 const profileConfigured=!!(company.address||company.phone||company.email||company.logoDataUrl);
 const accounting=voucher.accounting||{lines:[],balanced:false,debitTotal:'0.00',creditTotal:'0.00'};
 const accountingRows=(accounting.lines||[]).map(line=>'<tr><td>'+line.lineNumber+'</td><td>'+e(line.accountCode)+'</td><td><strong>'+e(line.accountName)+'</strong></td><td>'+e(line.description||'')+'</td><td class="frt-voucher-amount">'+money(line.debit)+'</td><td class="frt-voucher-amount">'+money(line.credit)+'</td></tr>').join('');
 const logo=typeof company.logoDataUrl==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(company.logoDataUrl)?
  '<img class="frt-voucher-logo" src="'+e(company.logoDataUrl)+'" alt="'+e(company.name)+' logo">':'';
 const references=[voucher.requestReference?.orderIntakeNo?
  field('Order / Project reference',voucher.requestReference.orderIntakeNo):'',
  voucher.requestReference?.checkNo?field('Check number',voucher.requestReference.checkNo):''].join('');
 let lineNumber=0;
 const items=categoryGroups(voucher.items).map(group=>{
  const rows=group.items.map(item=>'<tr><td>'+String(++lineNumber)+'</td><td><strong>'+
   e(item.category)+'</strong>'+(item.description?'<p>'+e(item.description)+'</p>':'')+
   '</td><td class="frt-voucher-amount">'+money(item.amount)+'</td></tr>').join('');
  return rows+'<tr class="frt-voucher-subtotal"><th colspan="2">Subtotal · '+e(group.category)+'</th>'+
   '<th>'+moneyCents(group.total)+'</th></tr>';
 }).join('');
 const bank=voucher.bankExecution?.recorded?
  '<section class="frt-voucher-approval"><h3>Bank execution evidence</h3>'+
  field('Execution date',dateTime(voucher.bankExecution.executedAt))+
  field('Bank',voucher.bankExecution.bankName)+
  field('Transaction reference',voucher.bankExecution.transactionReference)+
  field('Evidence recorded at',dateTime(voucher.bankExecution.recordedAt))+
  '<p class="frt-voucher-note">Staff-recorded bank execution evidence; not independently verified by the bank.</p></section>':
  '<section class="frt-voucher-approval"><h3>Bank execution</h3><p>'+
  e(voucher.bankExecutionError||'No bank execution has been recorded.')+'</p></section>';
 return '<div class="frt-voucher-document" data-frt-voucher-document>'+
  '<div class="frt-voucher-toolbar" aria-label="Voucher document actions">'+
  '<button type="button" class="secondary" data-frt-voucher-preview '+(accounting.balanced?'':'disabled title="Save balanced accounting entries first"')+'>Preview PDF</button>'+
  '<button type="button" class="secondary" data-frt-voucher-download '+(accounting.balanced?'':'disabled title="Save balanced accounting entries first"')+'>Download PDF</button>'+
  '<button type="button" class="primary" data-frt-voucher-print '+(accounting.balanced?'':'disabled title="Save balanced accounting entries first"')+'>Print Voucher</button>'+
  '<button type="button" class="secondary" data-frt-voucher-reprint '+(accounting.balanced?'':'disabled title="Save balanced accounting entries first"')+'>Reprint Voucher</button></div>'+
  '<p class="frt-voucher-status" role="status" aria-live="polite" data-frt-voucher-status>'+
  (accounting.balanced?'Persisted voucher, company profile and balanced accounting data are ready for PDF output.':'Save balanced debit and credit entries before previewing, downloading, printing or reprinting this voucher.')+'</p>'+
  renderFRTAccountingEditor(accounting,voucher.totalAmount,{workspaceId:voucher.workspaceId,companyCode:company.code})+
  '<div class="frt-voucher-pdf-preview" data-frt-voucher-pdf-preview>'+
  (previewUrl?'<iframe data-frt-voucher-pdf-frame title="PDF preview of '+e(voucher.voucherNumber)+'" src="'+e(previewUrl)+'"></iframe>':'')+
  '</div><article class="frt-voucher-paper">'+
  '<header class="frt-voucher-header">'+logo+'<div><h2>'+e(company.name)+'</h2><p>Company code: '+e(company.code)+'</p>'+
  (company.address?'<p>Company address: '+e(company.address)+'</p>':'')+
  (company.phone?'<p>Telephone: '+e(company.phone)+'</p>':'')+
  (company.email?'<p>Email: '+e(company.email)+'</p>':'')+
  (company.taxIdNumber?'<p>TIN: '+e(company.taxIdNumber)+'</p>':'')+
  (!profileConfigured?'<p class="frt-voucher-unconfigured">Company address, logo and contact details are not configured in Fund Release Tracker.</p>':'')+
  '</div><div class="frt-voucher-title"><h1>DISBURSEMENT VOUCHER</h1>'+
  '<strong>'+e(voucher.voucherNumber)+'</strong><span>Voucher date: '+date(voucher.voucherDate)+'</span></div></header>'+
  '<section class="frt-voucher-section"><h3>Request and payment details</h3><div class="frt-voucher-grid">'+
  field('Fund request',voucher.title)+field('Request reference',voucher.requestReference?.orderIntakeNo||voucher.requestId)+
  field('Payee / Supplier',voucher.payee||'Not recorded')+field('Payee bank',voucher.payeeBank||'Not recorded')+
  field('Department',voucher.department)+field('Fund source',voucher.fundSource)+
  field('Date needed',date(voucher.dateNeeded))+field('Request status',voucher.requestStatus)+
  field('Liquidation status',voucher.liquidationStatus)+references+'</div>'+
  '<p class="frt-voucher-description">'+e(voucher.description)+'</p></section>'+
  '<section class="frt-voucher-section"><h3>Expense and accounting breakdown</h3>'+
  '<table class="frt-voucher-items"><thead><tr><th>#</th><th>Expense category / description</th><th>Amount (PHP)</th></tr></thead>'+
  '<tbody>'+items+'</tbody><tfoot><tr><th colspan="2">Grand total requested</th><th>'+money(voucher.totalAmount)+'</th></tr></tfoot></table>'+
  '<p class="frt-voucher-note">Expense line total: '+money(voucher.reconciliation?.itemsTotal||voucher.totalAmount)+
  ' · Reconciled to request total.</p></section>'+
  '<section class="frt-voucher-section"><h3>Manual double-entry accounting</h3>'+
  '<table class="frt-voucher-items frt-voucher-accounting"><thead><tr><th>#</th><th>Account code</th><th>Account name</th><th>Description</th><th>Debit (PHP)</th><th>Credit (PHP)</th></tr></thead>'+
  '<tbody>'+(accountingRows||'<tr><td colspan="6">No accounting entries have been saved.</td></tr>')+'</tbody>'+
  '<tfoot><tr><th colspan="4">Balanced totals</th><th>'+money(accounting.debitTotal||'0.00')+'</th><th>'+money(accounting.creditTotal||'0.00')+'</th></tr></tfoot></table>'+
  '<p class="frt-voucher-note">'+(accounting.balanced?'Debit, credit and approved request totals are balanced.':'Accounting entries are not yet balanced. Complete and save the accounting editor before generating this voucher.')+' Account codes and names are manually entered; FRT does not infer a chart-of-accounts mapping.</p></section>'+
  '<section class="frt-voucher-section"><h3>Preparation and workflow records</h3><div class="frt-voucher-approval-grid">'+
  approval('Prepared by',{preparedBy:voucher.preparedBy,preparedAt:voucher.preparedAt},'preparedBy','preparedAt')+
  approval('Finance approval',voucher.financeApproval,'approvedBy','approvedAt')+
  approval('General Manager verification',voucher.gmVerification,'verifiedBy','verifiedAt','reference')+
  '</div></section>'+bank+
  '<footer class="frt-voucher-footer"><span>'+e(voucher.voucherNumber)+'</span>'+
  '<span>Generated from persisted FRT request data · No approval or payment action performed</span></footer>'+
  '</article></div>';
}
export {money as formatFRTVoucherMoney,date as formatFRTVoucherDate,dateTime as formatFRTVoucherDateTime};
