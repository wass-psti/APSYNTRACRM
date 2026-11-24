import pdfMake from './vendor/frt-pdf-engine.js';

export function confirmationDefinition(doc,logo){
 const money=value=>doc.currency+' '+value;
 const cell=(text,alignment='left')=>({text:String(text),alignment,margin:[2,3,2,3]});
 const e=doc.entity;
 const headings=['#','Description','Qty','Unit','Unit price','Amount'];
 return {pageSize:'A4',pageMargins:[40,42,40,48],defaultStyle:{fontSize:10,lineHeight:1.15},
  info:{title:'Purchase Order Confirmation '+doc.poNumber,author:e.name,subject:'PO '+doc.poNumber},
  footer:(page,pages)=>({margin:[40,10,40,0],columns:[{text:'PO '+doc.poNumber+' · Revision '+doc.revision,fontSize:8,color:'#475569'},{text:page+' / '+pages,alignment:'right',fontSize:8,color:'#475569'}]}),
  content:[
   {columns:[...(logo?[{image:logo,fit:[74,60],width:84}]:[]),{stack:[{text:e.name,bold:true,fontSize:15,color:e.accent},{text:e.address,fontSize:9},{text:'TIN: '+e.tin+'  |  '+e.phone,fontSize:9},{text:e.email+'  |  '+e.website,fontSize:9}]}],columnGap:8,margin:[0,0,0,20]},
   {text:'PURCHASE ORDER CONFIRMATION',fontSize:18,bold:true,color:e.accent,margin:[0,0,0,12]},
   {table:{widths:[100,'*',92,'*'],body:[
    ['PO number',doc.poNumber,'PO date',doc.poDate],
    ['Client',doc.client,'Delivery date',doc.deliveryDate],
    ['Quotation reference',doc.quotation||'—','Currency',doc.currency]
   ]},layout:'lightHorizontalLines',margin:[0,0,0,14]},
   {text:'We confirm receipt of the purchase order listed above, subject to the item details and commercial terms below.',margin:[0,0,0,10]},
   {table:{headerRows:1,keepWithHeaderRows:1,widths:[18,'*',44,44,88,88],body:[
    headings.map(h=>({text:h,bold:true,fillColor:e.accent,color:'#ffffff',fontSize:9,margin:[2,4,2,4]})),
    ...doc.items.map((item,i)=>[cell(i+1),cell(item.description),cell(item.quantity,'right'),cell(item.unit),cell(item.unitPrice,'right'),cell(item.amount,'right')])
   ]},layout:'lightHorizontalLines',margin:[0,0,0,10]},
   {table:{widths:['*',150],body:[
    [{text:'VAT-exclusive amount',alignment:'right'},{text:money(doc.vatExclusiveAmount),alignment:'right'}],
    [{text:'VAT ('+doc.vatRate+'%)',alignment:'right'},{text:money(doc.vatAmount),alignment:'right'}],
    [{text:'TOTAL (VAT-inclusive)',bold:true,alignment:'right'},{text:money(doc.total),bold:true,alignment:'right',color:e.accent}]
   ]},layout:'lightHorizontalLines',margin:[0,0,0,15]},
   {text:'Payment terms',bold:true,color:e.accent},{text:doc.payment,margin:[0,3,0,10]},
   {text:'Warranty terms',bold:true,color:e.accent},{text:doc.warranty,margin:[0,3,0,14]},
   {stack:[{text:'For and on behalf of '+e.name,fontSize:9},{text:' ',margin:[0,0,0,12]},{text:doc.signatory,bold:true},{text:'Designated signatory — signature not applied',fontSize:8,color:'#475569'}],unbreakable:true}
  ]};
}
export async function createConfirmationPdf(doc,logo){
 return pdfMake.createPdf(confirmationDefinition(doc,logo)).getBlob();
}
export const confirmationFilename=doc=>'PO-Confirmation-'+doc.poNumber.replace(/[^A-Za-z0-9_-]/g,'-').slice(0,100)+'.pdf';
export async function loadConfirmationLogo(entity){
 const url=new URL('./assets/tradelink/'+entity.logoAsset,import.meta.url);
 const res=await fetch(url);if(!res.ok)throw Error('Company logo could not be loaded.');
 const blob=await res.blob();
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Company logo could not be read.'));reader.readAsDataURL(blob);});
}
export async function confirmationDigest(blob){
 const bytes=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
 return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
