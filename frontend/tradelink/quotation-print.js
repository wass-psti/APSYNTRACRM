// Reference quotation layouts: print-only presentation of an already verified revision.
import {calculateTradeLinkAmounts,formatTradeLinkAmount} from '../tradelink-finance.js';
import {GM_SALES_EXEMPT_POLICY,GM_CREATOR_APPROVAL_FREE_POLICY} from './approval-policy.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const display=value=>value==null||value===''?'—':escape(value);
const money=(n,currency)=>currency==='PHP'?'₱'+formatTradeLinkAmount(n):formatTradeLinkAmount(n)+' '+escape(currency);
const label=(name,value)=>'<p><b>'+escape(name)+':</b> '+display(value)+'</p>';
const stamp=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-US',{
 timeZone:'Asia/Manila',month:'2-digit',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true
}).format(new Date(value)):'';
const date=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-US',{
 timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'
}).format(new Date(value)):display(value);
const profiles={
 'watchdog-sales':{phone:'+63 917 7073079',logo:'watchdog-sales-quotation.png'},
 'watchdog-opc':{phone:'+63 917 7073079',logo:'watchdog-opc-quotation.png'},
 'plc-systems':{phone:'+639171118818',logo:'plc-systems-quotation.png'}
};
const vatLabels={'12':'12%',zero:'0% - Zero Rated',exempt:'0% - Tax Exempt','15_tkm':'15% TKM','15_ksa':'15% KSA'};

function itemTable(items,currency){
 let n=0;
 return '<section class="tl-official-items"><table><colgroup><col class="tl-quote-col-number"><col class="tl-quote-col-description"><col class="tl-quote-col-quantity"><col class="tl-quote-col-price"><col class="tl-quote-col-price"></colgroup><thead><tr><th>#</th><th>MATERIAL DESCRIPTION</th><th>QTY</th><th>UNIT PRICE</th><th>TOTAL</th></tr></thead><tbody>'+
 items.map(item=>item.kind==='note'?'<tr class="tl-official-note-row"><td></td><td colspan="4">'+display(item.description)+'</td></tr>':
 '<tr><td class="tl-official-number">'+(++n)+'</td><td>'+display(item.description)+'</td><td class="tl-official-number">'+display(item.quantity)+'</td><td class="tl-official-money">'+money(item.unitPrice,currency)+'</td><td class="tl-official-money">'+money(item.quantity*item.unitPrice,currency)+'</td></tr>').join('')+'</tbody></table></section>';
}
function totals(data,currency){
 const t=calculateTradeLinkAmounts(data);
 const pair=(name,n,c=currency)=>'<div><dt>'+escape(name)+':</dt><dd>'+money(n,c)+'</dd></div>';
 return '<section class="tl-official-totals"><dl>'+pair('Subtotal',t.subtotal)+
 (t.discount>0?pair(data.discountType==='percentage'?'Discount ('+data.discountValue+'%)':'Discount',-t.discount)+pair('After discount',t.taxable):'')+
 pair('VAT ('+(vatLabels[data.vatType]||data.vatType||'—')+')',t.vat)+
 '<div class="tl-official-grand"><dt>TOTAL:</dt><dd>'+money(t.total,currency)+'</dd></div>'+
 (currency!=='PHP'&&data.exchangeRate>0?pair('PHP equivalent · saved exchange rate',t.phpEquivalent,'PHP'):'')+'</dl></section>';
}
function approval(row,data,creatorName){
 const approved=row.workflow_state==='approved';
 const exempt=row.approval_policy===GM_SALES_EXEMPT_POLICY;
 const approvalFree=row.approval_policy===GM_CREATOR_APPROVAL_FREE_POLICY;
 const stage=(title,identity,at)=>'<div><h3>'+title+'</h3><strong>'+display(identity)+'</strong><p class="'+(stamp(at)?'tl-quote-reviewed':'')+'">'+(stamp(at)?'Recorded validation on '+escape(stamp(at)):'No recorded validation')+'</p></div>';
 return '<section class="tl-quote-approval" aria-label="Workflow assignments / recorded responsibility">'+
 '<div><h3>CREATED BY:</h3><strong>'+display(creatorName||'Recorded creator (name unavailable)')+'</strong><p>'+display(stamp(row.created_at))+'</p></div>'+
 (approvalFree?'<div><h3>REVIEWED BY:</h3><strong>Not Applicable</strong></div>':exempt?'<div><h3>REVIEWED BY:</h3><strong>Not Applicable</strong><p>Sales Supervisor approval — Exempted</p></div>':
 stage('REVIEWED BY:',data.verifiedByEmail||data.verifiedBy,row.primary_reviewed_at))+
 (approvalFree?'<div><h3>APPROVED BY:</h3><strong>Not Applicable</strong></div>':stage('APPROVED BY:',data.approvedByEmail||data.approvedBy,row.secondary_reviewed_at))+
 '<p class="tl-quote-print-proof"><b class="tl-official-approval-stamp '+(approved?'is-approved':'is-not-approved')+'">'+(approved?'APPROVED':'NOT APPROVED')+'</b> · '+(approved?'WORKFLOW APPROVED · PDF NOT ISSUED · Approved revision '+escape(row.revision):'This print view does not approve the document')+
 '. Electronic PDF approval and issuance have NOT been verified.</p></section>';
}
function termsBlock(terms,company){
 const lines=String(terms||'').replace(/\r/g,'').split('\n');
 const heading=lines.find(x=>x.trim());
 const body=lines.filter(x=>x.trim()&&!(x===heading&&/^(QUOTATION TERMS AND CONDITIONS|Standard Terms & Conditions of Sale)$/i.test(x.trim()))).map(line=>/^\d+\.\s+/.test(line.trim())||/^[A-Z &]+$/.test(line.trim())?
 '<h3>'+escape(line)+'</h3>':'<p>'+escape(line)+'</p>').join('');
 return (body?'<section class="tl-quote-terms"><h2>Standard Terms &amp; Conditions of Sale</h2>'+body+'</section>':'')+
 '<section class="tl-quote-acceptance"><div><b>Accepted by: (Client)</b><div class="tl-quote-sign-line"></div><span>(Printed Name &amp; Signature)</span></div><div><b>Date:</b><div class="tl-quote-sign-line"></div></div></section>'+
 '<footer class="tl-official-footer">Thank you for considering '+escape(company.name)+'. We are excited to bring this solution to life.</footer>';
}
export function renderTradeLinkQuotationPrint({row,company,template,currency,terms,legacyDefaulted,creatorName}){
 const d=row.content;
 const logo=new URL('../assets/tradelink/'+profiles[company.id].logo,import.meta.url).href;
 return '<article class="tl-print-paper tl-official-paper tl-quote-paper tl-official-profile-'+escape(company.id)+'" data-tradelink-signed-output data-tradelink-template-version="'+escape(template.version)+'" data-tradelink-template-id="'+escape(template.id)+'" data-tradelink-company-profile="'+escape(company.id)+'" data-tradelink-legacy-company-default="'+legacyDefaulted+'">'+
 '<header class="tl-quote-letterhead"><img class="tl-quote-logo" src="'+escape(logo)+'" alt="'+escape(company.name)+' logo"><div class="tl-quote-company"><h1>'+escape(company.name)+'</h1><p>'+escape(company.address)+'</p><p>Tel: '+escape(profiles[company.id].phone)+'</p><p>Email: '+escape(company.email)+'</p><p>Website: http://'+escape(company.website)+'</p><p>TIN: '+escape(company.tin)+'</p></div><div class="tl-quote-meta"><h2>QUOTATION</h2>'+label('No',row.document_number)+label('Rev',row.revision)+label('Date',date(d.date||row.created_at))+'</div></header>'+
 '<section class="tl-quote-parties"><div><h3>CLIENT:</h3><strong>'+display(d.customerName)+'</strong><p>'+display(d.customerAddress)+'</p>'+label('Contact Person',d.customerContact)+label('Email',d.customerEmail)+label('Phone',d.customerPhone)+(d.customerTin?label('TIN',d.customerTin):'')+'</div><div>'+label('Reference',d.referenceNumber)+label('Payment Terms',d.paymentTerms)+label('Validity',d.validity)+label('Delivery',d.deliveryCommitment)+(d.quoteStatus?label('Commercial status',d.quoteStatus):'')+'</div></section>'+
 itemTable(d.items||[],currency)+totals(d,currency)+(d.remarks?'<section class="tl-quote-remarks"><h3>Additional notes</h3><p>'+display(d.remarks)+'</p></section>':'')+
 approval(row,d,creatorName)+termsBlock(terms,company)+'</article>';
}
