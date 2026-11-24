// Exact comparison of source decimals, including historical fractional precision.
export function decimalParts(value){
 const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value??''));
 if(!m)return null;
 const fraction=m[3]||'';
 return {units:BigInt(m[1]+m[2]+fraction),scale:fraction.length};
}
export function compareOrderDecimals(a,b){
 const x=decimalParts(a),y=decimalParts(b);
 if(!x||!y)return null;
 const scale=Math.max(x.scale,y.scale);
 const left=x.units*10n**BigInt(scale-x.scale),right=y.units*10n**BigInt(scale-y.scale);
 return left===right?0:left>right?1:-1;
}
export function matchesAmount(row,filters){
 if(!filters.minAmount&&!filters.maxAmount)return true;
 if(!decimalParts(row.po_amount))return false;
 return (!filters.minAmount||compareOrderDecimals(row.po_amount,filters.minAmount)>=0)&&
  (!filters.maxAmount||compareOrderDecimals(row.po_amount,filters.maxAmount)<=0);
}
export function sortOrderRows(rows,sort){
 if(!sort||sort==='received-desc')return rows;
 return [...rows].sort((a,b)=>{
  let result=0;
  if(sort==='po-asc')result=String(a.po_number??'').localeCompare(String(b.po_number??''),undefined,{numeric:true});
  if(sort==='received-asc'){
   if(!a.date_received||!b.date_received)result=Number(!a.date_received)-Number(!b.date_received);
   else result=a.date_received.localeCompare(b.date_received);
  }
  if(sort==='amount-desc'){
   result=String(a.currency??'').localeCompare(String(b.currency??''));
   if(!result){
    const x=decimalParts(a.po_amount),y=decimalParts(b.po_amount);
    result=x&&y?-compareOrderDecimals(a.po_amount,b.po_amount):Number(!x)-Number(!y);
   }
  }
  return result||String(a.id).localeCompare(String(b.id));
 });
}
export function orderTablePage(rows,page=0,size=25){
 const pages=Math.max(1,Math.ceil(rows.length/size));
 const index=Math.max(0,Math.min(Number.isInteger(page)?page:0,pages-1));
 return {rows:rows.slice(index*size,(index+1)*size),page:index,pages,total:rows.length};
}
const exportFields=['id','record_kind','source_key','po_number','client_name','historical_client_name','currency','status','source_status','archived','source_archive_state','po_amount','procurement_expenses','gross_profit','financial_basis','company','industry','account_manager','date_received','delivery_date','revision'];
function csvCell(value){
 let s=String(value??'');
 // Formula injection prevention for spreadsheet consumers. Negative decimal values remain numeric.
 if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)&&!/^-[0-9]+(?:\.[0-9]+)?$/.test(s))s="'"+s;
 if(/^[\t\r\n]/.test(s))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
}
export function orderExportCsv(rows){
 return '\uFEFF'+[exportFields.join(','),...rows.map(row=>exportFields.map(key=>csvCell(row[key])).join(','))].join('\r\n')+'\r\n';
}
