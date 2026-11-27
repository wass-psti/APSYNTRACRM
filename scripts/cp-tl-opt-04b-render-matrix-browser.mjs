import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {renderTradeLinkSavedDocumentOutput} from '../frontend/tradelink-saved-document-output.js';
import {calculateTradeLinkAmounts,formatTradeLinkAmount} from '../frontend/tradelink-finance.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const documentId='99999999-9999-4999-8999-999999999992';
const boardId='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
const boardItemId='99999999-9999-4999-8999-999999999991';
const createdAt='2026-11-27T12:24:28.621039+00:00';
const stylesheetAssets=[
 'templates/tradelink-application-v1.42.0-fc3a9e2dd3626a4b7657ea72c105b042d8128287.css',
 'templates/tradelink-quotation-redesign-v1.42.0-866f644ed2f9a5fa569e799351feac19a90325fa.css'
];
const stylesheetGitBlobShas=[
 'fc3a9e2dd3626a4b7657ea72c105b042d8128287',
 '866f644ed2f9a5fa569e799351feac19a90325fa'
];
const profiles=[
 {
  id:'watchdog-sales',name:'Watchdog Automation Sales & Services',
  address:'Bldg.2 Paseo de Amores Sergio Osmena St.\nGun-ob, Lapu-lapu City 6015',
  phone:'+63 917 7073079',quotationPhone:'+63 917 7073079',
  email:'info@watchdogautomation.com.ph',website:'www.watchdogautomation.com.ph',
  tin:'211-258-356-00000',templateId:'watchdog-sales-reference-v1',
  logoAsset:'profiles/v1/watchdog-sales-ac1c97ed05b379a20caaccdbc3e3f02be8aebf89.png',
  logoGitBlobSha:'ac1c97ed05b379a20caaccdbc3e3f02be8aebf89',
  quotationLogoAsset:'profiles/v1/watchdog-sales-quotation-ee2cb021cacdffd5c0240d8ede81ee58892db4b9.png',
  quotationLogoGitBlobSha:'ee2cb021cacdffd5c0240d8ede81ee58892db4b9',
  accent:'#ef4155',quotationAccent:'#ff3d57',tableBackground:'#fce5e7',tableText:'#1644a3',
  ruleColor:'#2d65d5',termsMode:'new-page'
 },
 {
  id:'watchdog-opc',name:'Watchdog Automation OPC',
  address:'Bldg.2 Paseo de Amores Sergio Osmena St.\nGun-ob, Lapu-lapu City 6015',
  phone:'+63 917 7073079',quotationPhone:'+63 917 7073079',
  email:'info@watchdogautomation.com.ph',website:'www.watchdogautomation.com.ph',
  tin:'010-737-641-000',templateId:'watchdog-opc-reference-v1',
  logoAsset:'profiles/v1/watchdog-opc-f55506ddd9b2569658f2eecac7f081cc08ba3a19.png',
  logoGitBlobSha:'f55506ddd9b2569658f2eecac7f081cc08ba3a19',
  quotationLogoAsset:'profiles/v1/watchdog-opc-quotation-6d43decfa6a476219c2cae149311c84bd7109c57.png',
  quotationLogoGitBlobSha:'6d43decfa6a476219c2cae149311c84bd7109c57',
  accent:'#14b866',quotationAccent:'#00d748',tableBackground:'#e3f7e9',tableText:'#244f78',
  ruleColor:'#2f68c4',termsMode:'flow'
 },
 {
  id:'plc-systems',name:'PLC Systems Technik, Inc.',
  address:'Bldg.2 Paseo de Amores Sergio Osmena St.\nGun-ob, Lapu-lapu City 6015',
  phone:'+63 917 1118818',quotationPhone:'+639171118818',
  email:'sales@plcsystems.com.ph',website:'www.plcsystems.com.ph',
  tin:'463-678-854-000',templateId:'plc-systems-reference-v1',
  logoAsset:'profiles/v1/plc-systems-5636a6eafb8cb98994546dc2b7b55c9d0dd506e9.png',
  logoGitBlobSha:'5636a6eafb8cb98994546dc2b7b55c9d0dd506e9',
  quotationLogoAsset:'profiles/v1/plc-systems-quotation-62421d422191624fa335e1b6bfaf8fecbdb2cd50.png',
  quotationLogoGitBlobSha:'62421d422191624fa335e1b6bfaf8fecbdb2cd50',
  accent:'#0b9a9d',quotationAccent:'#009999',tableBackground:'#e3f6f5',tableText:'#2854a4',
  ruleColor:'#4772c7',termsMode:'flow'
 }
];
const modules=[
 {type:'esi',label:'ELECTRONIC SALES INVOICE',prefix:'ESI',priced:true},
 {type:'packing',label:'PACKING LIST',prefix:'PL',priced:false},
 {type:'delivery',label:'DELIVERY RECEIPT',prefix:'DR',priced:false},
 {type:'payment',label:'PAYMENT ACKNOWLEDGEMENT RECEIPT',prefix:'AR',priced:false},
 {type:'quotation',label:'QUOTATION',prefix:'Q',priced:true},
 {type:'po',label:'PURCHASE ORDER TO SUPPLIERS',prefix:'PO',priced:true}
];
const outputDirectory=process.env.TL_RENDER_MATRIX_OUTPUT_DIR||'/tmp/cp-tl-opt-04b-render-matrix';
await mkdir(outputDirectory,{recursive:true});
const assetCss=await Promise.all(stylesheetAssets.map(asset=>
 readFile(fileURLToPath(new URL('../frontend/assets/tradelink/'+asset,import.meta.url)),'utf8')));
const stylesheet=assetCss.join('\n\n');
const items=Array.from({length:26},(_,index)=>{
 const number=String(index+1).padStart(3,'0');
 return {
  kind:'item',
  description:'CP-TL-OPT-04B ITEMTOKEN'+number+' INDUSTRIAL COMPONENT\nModel: QA-'+number+
   '\nTechnical specification: precision-machined stainless steel component for acceptance verification.',
  quantity:2,unit:'pieces',unitPrice:123.45,serialNumber:'SERIAL-QA-'+number
 };
});
const paymentParticulars=Array.from({length:60},(_,index)=>{
 const number=String(index+1).padStart(3,'0');
 return 'CP-TL-OPT-04B PAYMENTTOKEN'+number+
  ' payment reference, bank reconciliation and acknowledgement details.';
}).join('\n');
const browser=await chromium.launch({
 headless:true,
 ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?
  {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})
});
const expected=[];
try{
 for(const profile of profiles){
  const template={
   id:profile.templateId,version:'v1.42.0',profileId:profile.id,profileVersion:1,
   accent:profile.accent,tableBackground:profile.tableBackground,
   tableText:profile.tableText,ruleColor:profile.ruleColor,
   termsMode:profile.termsMode,rendererVersion:'tradelink-renderer-v1',
   stylesheetAssets:[...stylesheetAssets],
   stylesheetGitBlobShas:[...stylesheetGitBlobShas]
  };
  const company={
   id:profile.id,templateId:profile.templateId,name:profile.name,
   address:profile.address,phone:profile.phone,quotationPhone:profile.quotationPhone,
   email:profile.email,website:profile.website,tin:profile.tin,
   logoAsset:profile.logoAsset,logoGitBlobSha:profile.logoGitBlobSha,
   quotationLogoAsset:profile.quotationLogoAsset,
   quotationLogoGitBlobSha:profile.quotationLogoGitBlobSha
  };
  for(const module of modules){
   const documentNumber=module.prefix+'-OPT04B-'+profile.id.toUpperCase();
   const marker='CP-TL-OPT-04B-'+profile.id.toUpperCase()+'-'+module.type.toUpperCase();
   const terms=[
    'CP-TL-OPT-04B TERMS '+profile.id+' '+module.type,
    ...Array.from({length:12},(_,index)=>
     (index+1)+'. '+marker+' LONG TERM CLAUSE '+String(index+1).padStart(2,'0')+
     ' — supplier obligations, delivery conditions, payment terms and document-specific requirements.'),
    marker+'-TERMS'
   ].join('\n');
   const content={
    documentType:module.type,documentNumber,vendorId:profile.id,
    templateId:profile.templateId,customerName:'Synthetic PDF Acceptance Customer',
    customerAddress:'Synthetic address, Cebu City',customerContact:'Synthetic Contact',
    customerEmail:'pdf-acceptance@example.test',customerPhone:'+63 900 000 0000',
    customerTin:'QA-TIN-OPT04B',currency:'PHP',vatType:'12',
    discountType:'fixed',discountValue:0,exchangeRate:1,
    items:module.type==='payment'?[]:items,
    terms,remarks:marker+'-REMARKS',
    verifiedByEmail:'reviewer@example.test',approvedByEmail:'approver@example.test',
    verifiedBy:'Synthetic reviewer',approvedBy:'Synthetic approver'
   };
   if(module.type==='quotation'){
    content.referenceNumber='REF-OPT04B';content.validity='30 days';
    content.deliveryCommitment='14 days';content.paymentTerms='Net 30';
    content.quoteStatus='Approved for PDF acceptance';
   }
   if(module.type==='esi')content.dueDate='2026-12-27';
   if(module.type==='po'){
    content.poNumber='SUPPLIER-PO-OPT04B';content.targetDeliveryDate='2026-12-15';
    content.paymentTerms='Net 30';
   }
   if(module.type==='packing'||module.type==='delivery')content.referenceNumber='SHIP-OPT04B';
   if(module.type==='delivery')content.serialNumber='SERIAL-QA-001';
   if(module.type==='payment'){
    content.paymentParticulars=paymentParticulars;
    content.cashAmount=50;content.chequeAmount=150;
    content.bankName='Synthetic Bank';content.chequeNumber='QA-CH-001';
   }
   const row={
    id:documentId,workspace_id:workspaceId,board_id:boardId,
    board_item_id:boardItemId,document_type:module.type,document_number:documentNumber,
    revision:5,workflow_state:'approved',created_at:createdAt,updated_at:createdAt,
    archived_at:null,created_by:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    created_by_name:'CP-TL-OPT-04B Acceptance Creator',
    approval_policy:'standard-dual-v1',approved:true,
    primary_reviewed_at:createdAt,secondary_reviewed_at:createdAt,content
   };
   const renderSnapshot={
    documentId,revision:5,snapshotSource:'captured',capturedAt:createdAt,
    snapshot:{
     schemaVersion:1,snapshotSource:'captured',profileVersion:1,
     company,template,terms,termsSource:'document',capturedAt:createdAt
    }
   };
   let markup=renderTradeLinkSavedDocumentOutput(row,workspaceId,documentId,{
    creatorName:'CP-TL-OPT-04B Acceptance Creator',renderSnapshot
   });
   assert.match(markup,/data-tradelink-template-version="v1\.42\.0"/);
   assert.match(markup,new RegExp('data-tradelink-company-profile="'+profile.id+'"'));
   assert.ok(markup.includes(marker+'-TERMS'));
   assert.ok(markup.includes(marker+'-REMARKS'));
   assert.ok(markup.includes(profile.name.replaceAll('&','&amp;')));
   assert.ok(stylesheet.includes(profile.accent));
   assert.ok(markup.includes(module.type==='quotation'?profile.quotationLogoAsset:profile.logoAsset));
   const logoMatches=[...markup.matchAll(/src="(file:[^"]+)"/g)];
   for(const match of logoMatches){
    const bytes=await readFile(fileURLToPath(match[1]));
    markup=markup.replace('src="'+match[1]+'"','src="data:image/png;base64,'+bytes.toString('base64')+'"');
   }
   const page=await browser.newPage({viewport:{width:1200,height:900}});
   try{
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>'+
     stylesheet+'</style></head><body><section id="tradelink-saved-print">'+markup+
     '</section></body></html>');
    const article=page.locator('article[data-tradelink-signed-output]');
    assert.equal(await article.getAttribute('data-tradelink-template-version'),'v1.42.0');
    assert.equal(await article.getAttribute('data-tradelink-profile-version'),'1');
    assert.equal(await article.getAttribute('data-tradelink-render-snapshot-source'),'captured');
    const expectedAccent=module.type==='quotation'?profile.quotationAccent:profile.accent;
    assert.equal(await article.evaluate(node=>getComputedStyle(node).getPropertyValue('--tl-official-accent').trim()),expectedAccent);
    assert.equal(await article.locator('img').count(),1);
    assert.match(await article.locator('img').getAttribute('src'),/^data:image\/png;base64,/);
    assert.ok((await page.locator('body').innerText()).includes(marker+'-TERMS'));
    assert.ok((await page.locator('body').innerText()).includes(marker+'-REMARKS'));
    assert.equal(await page.locator('.tl-official-approval-stamp.is-approved').count(),1);
    if(module.type==='quotation'){
     assert.equal(await page.locator('.tl-quote-letterhead').count(),1);
     assert.equal(await page.locator('.tl-quote-terms').count(),profile.termsMode==='new-page'?1:1);
    }else{
     assert.equal(await page.locator('.tl-official-document-title h2').textContent(),module.label);
    }
    if(module.type==='payment'){
     assert.equal(await page.locator('.tl-official-payment-particulars').count(),1);
     const paymentText=await page.locator('.tl-official-payment-particulars').innerText();
     assert.ok(paymentText.includes('PAYMENTTOKEN001')&&paymentText.includes('PAYMENTTOKEN060'));
    }else{
     assert.equal(await page.locator('.tl-official-items tbody tr:not(.tl-official-note-row)').count(),26);
     assert.ok((await page.locator('.tl-official-items tbody tr:not(.tl-official-note-row)').first().innerText()).includes('ITEMTOKEN001'));
     assert.ok((await page.locator('.tl-official-items tbody tr:not(.tl-official-note-row)').last().innerText()).includes('ITEMTOKEN026'));
    }
    await page.emulateMedia({media:'print'});
    const filename=profile.id+'-'+module.type+'.pdf';
    const file=outputDirectory+'/'+filename;
    const pdf=await page.pdf({path:file,preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
    assert.ok(pdf.length>5000,'Chromium generated PDF for '+profile.id+' / '+module.type);
    assert.match(pdf.subarray(0,8).toString(),/^%PDF-/);
    expected.push({
     file,profile:profile.id,company:profile.name,type:module.type,
     title:module.label,documentNumber,marker,
     termsMarker:marker+'-TERMS',remarksMarker:marker+'-REMARKS',
     firstContentMarker:module.type==='payment'?'PAYMENTTOKEN001':'ITEMTOKEN001',
     lastContentMarker:module.type==='payment'?'PAYMENTTOKEN060':'ITEMTOKEN026',
     total:module.priced?formatTradeLinkAmount(calculateTradeLinkAmounts(content).total)+' PHP':null,
     cashTotal:module.type==='payment'?'50.00 PHP':null,
     chequeTotal:module.type==='payment'?'150.00 PHP':null,
     minPages:2,pageSize:module.type==='quotation'?'letter':'a4'
    });
    console.log('PASS Chromium',profile.id,module.type,filename,pdf.length+' bytes');
   }finally{
    await page.close();
   }
  }
 }
}finally{
 await browser.close();
}
assert.equal(expected.length,18,'all six modules across three companies must render');
await writeFile(outputDirectory+'/expected.json',JSON.stringify(expected,null,2));
console.log('PASS: all 18 immutable company/module render combinations produced Chromium PDFs.');
