/** Real A4 PDF generation for FRT vouchers. Loaded only when a user requests output. */
import pdfMake from './vendor/frt-pdf-engine.js';

const cents=value=>{
 const raw=String(value??'0');
 if(!/^\d{1,15}(?:\.\d{1,2})?$/.test(raw))throw new TypeError('Invalid voucher amount');
 const [whole,fraction='']=raw.split('.');
 return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
};
const moneyCents=total=>{
 const whole=total/100n,fraction=String(total%100n).padStart(2,'0');
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
 const parsed=new Date(value);
 return Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat('en-PH',{
  dateStyle:'medium',timeZone:'Asia/Manila'
 }).format(parsed):'Not recorded';
};
const dateTime=value=>{
 const parsed=new Date(value);
 return Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat('en-PH',{
  dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'
 }).format(parsed):'Not recorded';
};
const cell=(text,style)=>({text:String(text??'—'),style:style||'tableCell',margin:[5,5,5,5]});
const labelValue=(label,value)=>[
 {text:label,style:'metaLabel',margin:[0,0,0,3]},
 {text:String(value||'Not recorded'),style:'metaValue',margin:[0,0,8,0]}
];
const sectionTitle=text=>({text,style:'sectionTitle',margin:[0,14,0,7],keepWithNext:true});
const approvalBlock=(title,actor,timestamp,reference='')=>({
 stack:[
  {text:title,style:'approvalTitle',margin:[0,0,0,5]},
  ...labelValue('Recorded by',timestamp?(actor||'Name unavailable'):'Not recorded'),
  ...labelValue('Recorded at',timestamp?dateTime(timestamp):'Not recorded'),
  ...(reference?[...labelValue('Reference',reference)]:[])
 ],
 margin:[0,0,10,0]
});
export function buildFRTVoucherDefinition(voucher){
 if(!voucher||!Array.isArray(voucher.items)||!voucher.items.length||
  voucher.reconciliation?.balanced!==true||
  cents(voucher.totalAmount)!==voucher.items.reduce((sum,item)=>sum+cents(item.amount),0n))
  throw new TypeError('Voucher expense totals are not reconciled');
 const company=voucher.company||{};
 const accounting=voucher.accounting;
 if(!accounting||accounting.balanced!==true||!Array.isArray(accounting.lines)||accounting.lines.length<2)
  throw new TypeError('Voucher accounting entries must be balanced before PDF generation');
 const accountingDebit=accounting.lines.reduce((sum,line)=>sum+cents(line.debit),0n);
 const accountingCredit=accounting.lines.reduce((sum,line)=>sum+cents(line.credit),0n);
 if(accountingDebit!==accountingCredit||accountingDebit!==cents(voucher.totalAmount))
  throw new TypeError('Voucher debit, credit and request totals do not reconcile');
 let lineNumber=0;
 const itemRows=categoryGroups(voucher.items).flatMap(group=>[
  ...group.items.map(item=>[
   cell(String(++lineNumber),'tableCellCenter'),
   cell(item.category),
   cell(item.description||'—'),
   {...cell(money(item.amount)),alignment:'right'}
  ]),
  [
   {text:'Subtotal · '+group.category,colSpan:3,style:'subtotalCell',alignment:'right',margin:[5,5,5,5]},
   {},{},
   {...cell(moneyCents(group.total),'subtotalCell'),alignment:'right'}
  ]
 ]);
 const accountingRows=accounting.lines.map((line,index)=>[
  cell(String(index+1),'tableCellCenter'),cell(line.accountCode),cell(line.accountName),
  cell(line.description||'—'),{...cell(money(line.debit)),alignment:'right'},
  {...cell(money(line.credit)),alignment:'right'}
 ]);
 accountingRows.push([
  {text:'TOTAL',colSpan:4,style:'subtotalCell',alignment:'right',margin:[5,5,5,5]},
  {},{}, {},{...cell(moneyCents(accountingDebit),'subtotalCell'),alignment:'right'},
  {...cell(moneyCents(accountingCredit),'subtotalCell'),alignment:'right'}
 ]);
 const header=(currentPage,pageCount)=>({
  margin:[40,18,40,0],
  stack:[
   {columns:[
    {text:company.name||'Fund Release Tracker',style:'runningCompany'},
    {text:voucher.voucherNumber,style:'runningVoucher',alignment:'right'}
   ]},
   {canvas:[{type:'line',x1:0,y1:5,x2:515,y2:5,lineWidth:0.7,lineColor:'#A8B4C7'}]}
  ]
 });
 const footer=(currentPage,pageCount)=>({
  margin:[40,0,40,18],
  columns:[
   {text:voucher.voucherNumber,style:'footerText'},
   {text:'Page '+currentPage+' of '+pageCount,alignment:'right',style:'footerText'}
  ]
 });
 const content=[
  {text:'DISBURSEMENT VOUCHER',style:'documentTitle',margin:[0,8,0,4]},
  {columns:[
   ...(typeof company.logoDataUrl==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(company.logoDataUrl)?
    [{image:company.logoDataUrl,width:54,height:54,fit:[54,54]}]:[]),
   {width:'*',stack:[
    {text:company.name||'Company name unavailable',style:'companyName'},
    {text:'Company code: '+(company.code||'—'),style:'muted'},
    ...(company.address?[{text:'Company address: '+company.address,style:'muted'}]:[]),
    ...(company.phone?[{text:'Telephone: '+company.phone,style:'muted'}]:[]),
    ...(company.email?[{text:'Email: '+company.email,style:'muted'}]:[])
   ]},
   {width:190,stack:[
    {text:'VOUCHER NUMBER',style:'metaLabel',alignment:'right'},
    {text:voucher.voucherNumber,style:'voucherNumber',alignment:'right'},
    {text:'Voucher date: '+date(voucher.voucherDate),style:'metaValue',alignment:'right'}
   ]}
  ],columnGap:12,margin:[0,0,0,14]},
  ...(company.address||company.phone||company.email||company.logoDataUrl?[]:[
   {text:'Company address, logo and contact details are not configured in Fund Release Tracker.',style:'unconfigured',margin:[0,0,12,0]}
  ]),
  sectionTitle('REQUEST AND PAYMENT DETAILS'),
  {table:{widths:['*','*'],body:[
   [labelValue('Fund request',voucher.title),labelValue('Request reference',voucher.requestReference?.orderIntakeNo||voucher.requestId)],
   [labelValue('Payee / Supplier',voucher.payee||'Not recorded'),labelValue('Payee bank',voucher.payeeBank||'Not recorded')],
   [labelValue('Department',voucher.department),labelValue('Fund source',voucher.fundSource)],
   [labelValue('Date needed',date(voucher.dateNeeded)),labelValue('Request status',voucher.requestStatus)],
   [labelValue('Liquidation status',voucher.liquidationStatus),labelValue('Check number',voucher.requestReference?.checkNo||'Not recorded')]
  ]},layout:'noBorders'},
  {text:voucher.description||'No request description recorded.',style:'bodyText',margin:[0,4,0,2]},
  sectionTitle('EXPENSE AND ACCOUNTING BREAKDOWN'),
  {table:{
   headerRows:1,keepWithHeaderRows:1,dontBreakRows:true,
   widths:[24,118,'*',90],
   body:[
    [{text:'#',style:'tableHeader'},{text:'Expense category',style:'tableHeader'},
     {text:'Description',style:'tableHeader'},{text:'Amount (PHP)',style:'tableHeader',alignment:'right'}],
    ...itemRows
   ]
  },layout:{
   hLineWidth:(index,node)=>index===0||index===node.table.body.length?0.8:0.4,
   vLineWidth:()=>0.4,hLineColor:()=>'#CBD5E1',vLineColor:()=>'#CBD5E1',
   paddingLeft:()=>5,paddingRight:()=>5,paddingTop:()=>5,paddingBottom:()=>5
  }},
  {columns:[
   {text:'GRAND TOTAL REQUESTED',style:'totalLabel',alignment:'right'},
   {text:money(voucher.totalAmount),style:'totalAmount',alignment:'right',width:120}
  ],margin:[0,9,0,0]},
  {text:'Expense line total: '+money(voucher.reconciliation.itemsTotal)+' · Reconciled to request total.',
   style:'muted',margin:[0,5,0,2]},
  sectionTitle('MANUAL DOUBLE-ENTRY ACCOUNTING'),
  {table:{headerRows:1,keepWithHeaderRows:1,dontBreakRows:true,
   widths:[22,68,92,'*',70,70],body:[
    [{text:'#',style:'tableHeader'}, {text:'Account code',style:'tableHeader'},
     {text:'Account name',style:'tableHeader'}, {text:'Description',style:'tableHeader'},
     {text:'Debit (PHP)',style:'tableHeader',alignment:'right'},
     {text:'Credit (PHP)',style:'tableHeader',alignment:'right'}],
    ...accountingRows
   ]},layout:{
    hLineWidth:(index,node)=>index===0||index===node.table.body.length?0.8:0.4,
    vLineWidth:()=>0.4,hLineColor:()=>'#CBD5E1',vLineColor:()=>'#CBD5E1',
    paddingLeft:()=>4,paddingRight:()=>4,paddingTop:()=>5,paddingBottom:()=>5
   }},
  {text:'Debit total: '+moneyCents(accountingDebit)+' · Credit total: '+moneyCents(accountingCredit)+' · Both totals equal the approved request amount.',
   style:'muted',margin:[0,5,0,2]},
  {text:'Account codes and names are manually entered for this request. No chart-of-accounts mapping is inferred.',
   style:'unconfigured',margin:[0,0,0,6]},
  sectionTitle('PREPARATION AND WORKFLOW RECORDS'),
  {columns:[
   approvalBlock('PREPARED BY',voucher.preparedBy,voucher.preparedAt),
   approvalBlock('FINANCE APPROVAL',voucher.financeApproval?.approvedBy,voucher.financeApproval?.approvedAt),
   approvalBlock('GENERAL MANAGER VERIFICATION',voucher.gmVerification?.verifiedBy,
    voucher.gmVerification?.verifiedAt,voucher.gmVerification?.reference)
  ],columnGap:12},
  sectionTitle('BANK EXECUTION'),
  ...(voucher.bankExecution?.recorded?[
   {table:{widths:['*','*'],body:[
    [labelValue('Execution date',dateTime(voucher.bankExecution.executedAt)),
     labelValue('Bank',voucher.bankExecution.bankName)],
    [labelValue('Transaction reference',voucher.bankExecution.transactionReference),
     labelValue('Evidence recorded at',dateTime(voucher.bankExecution.recordedAt))]
   ]},layout:'noBorders'},
   {text:'Staff-recorded bank execution evidence; not independently verified by the bank.',
    style:'unconfigured',margin:[0,2,0,4]}
  ]:[
   {text:voucher.bankExecutionError||'No bank execution has been recorded.',style:'bodyText'}
  ]),
  {text:'Generated from persisted FRT request data. This document generation does not create an approval, initiate a transfer, or change request status.',
   style:'muted',margin:[0,14,0,0]}
 ];
 return {
  pageSize:'A4',pageMargins:[40,64,40,52],header,footer,content,
  info:{title:'Disbursement Voucher '+voucher.voucherNumber,
   author:'APSYNTRA CRM · Fund Release Tracker',
   subject:'Persisted fund request voucher',
   keywords:'APSYNTRA,FRT,Disbursement Voucher'},
  defaultStyle:{font:'Roboto',fontSize:9,color:'#172033',lineHeight:1.2},
  styles:{
   runningCompany:{fontSize:8,bold:true,color:'#34445E'},
   runningVoucher:{fontSize:8,bold:true,color:'#34445E'},
   footerText:{fontSize:7,color:'#64748B'},
   documentTitle:{fontSize:17,bold:true,color:'#14213D',characterSpacing:0.4},
   companyName:{fontSize:12,bold:true,color:'#14213D'},
   voucherNumber:{fontSize:12,bold:true,color:'#1D4ED8'},
   metaLabel:{fontSize:7,bold:true,color:'#64748B',characterSpacing:0.25},
   metaValue:{fontSize:9,color:'#172033'},
   muted:{fontSize:8,color:'#64748B'},
   unconfigured:{fontSize:8,color:'#8A5A12',italics:true},
   sectionTitle:{fontSize:10,bold:true,color:'#1E3A5F',characterSpacing:0.35},
   bodyText:{fontSize:9,lineHeight:1.25},
   approvalTitle:{fontSize:8,bold:true,color:'#1E3A5F'},
   tableHeader:{fontSize:8,bold:true,color:'#FFFFFF',fillColor:'#243B5A',margin:[5,6,5,6]},
   tableCell:{fontSize:8},
   tableCellCenter:{fontSize:8,alignment:'center'},
   subtotalCell:{fontSize:8,bold:true,color:'#1E3A5F',fillColor:'#F1F5F9'},
   totalLabel:{fontSize:9,bold:true,color:'#1E3A5F'},
   totalAmount:{fontSize:12,bold:true,color:'#1D4ED8'}
  }
 };
}
const filename=voucher=>'Disbursement-Voucher-'+String(voucher.voucherNumber||'FRT').replace(/[^A-Za-z0-9_-]/g,'-')+'.pdf';
export async function createFRTVoucherPdfBlob(voucher){
 return pdfMake.createPdf(buildFRTVoucherDefinition(voucher)).getBlob();
}
export async function createFRTVoucherPdfBuffer(voucher){
 return pdfMake.createPdf(buildFRTVoucherDefinition(voucher)).getBuffer();
}
export async function downloadFRTVoucherPdf(voucher){
 return pdfMake.createPdf(buildFRTVoucherDefinition(voucher)).download(filename(voucher));
}
export async function printFRTVoucherPdf(voucher,printWindow){
 if(!printWindow||printWindow.closed)throw new Error('Print window is unavailable. Allow pop-ups and try again.');
 return pdfMake.createPdf(buildFRTVoucherDefinition(voucher)).print(printWindow);
}
export {money as formatFRTVoucherPdfMoney};
