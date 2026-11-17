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
 const logo=typeof company.logoDataUrl==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(company.logoDataUrl)?
  '<img class="frt-voucher-logo" width="68" height="68" src="'+e(company.logoDataUrl)+'" alt="'+e(company.name)+' logo">':'';
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
  '<button type="button" class="secondary" data-frt-voucher-preview>Preview PDF</button>'+
  '<button type="button" class="secondary" data-frt-voucher-download>Download PDF</button>'+
  '<button type="button" class="primary" data-frt-voucher-print>Print Voucher</button>'+
  '<button type="button" class="secondary" data-frt-voucher-reprint>Reprint Voucher</button></div>'+
  '<p class="frt-voucher-status" role="status" aria-live="polite" data-frt-voucher-status>'+
  'Voucher data retrieved from the existing persisted FRT request. No voucher number was allocated.</p>'+
  '<div class="frt-voucher-pdf-preview" data-frt-voucher-pdf-preview>'+
  (previewUrl?'<iframe data-frt-voucher-pdf-frame title="PDF preview of '+e(voucher.voucherNumber)+'" src="'+e(previewUrl)+'"></iframe>':'')+
  '</div><article class="frt-voucher-paper">'+
  '<header class="frt-voucher-header">'+logo+'<div><h2>'+e(company.name)+'</h2><p>Company code: '+e(company.code)+'</p>'+
  (company.address?'<p>Registered address: '+e(company.address)+'</p>':'')+
  (company.phone?'<p>Telephone: '+e(company.phone)+'</p>':'')+
  (company.email?'<p>Email: '+e(company.email)+'</p>':'')+
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
  ' · Reconciled to request total. Chart-of-accounts mappings are not configured in FRT; categories are shown as persisted and no account codes are inferred.</p></section>'+
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
