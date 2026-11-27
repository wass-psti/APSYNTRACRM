import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {renderTradeLinkSavedDocumentOutput} from '../frontend/tradelink-saved-document-output.js';
import {tradeLinkCompanyTemplateSnapshot} from '../frontend/tradelink-official-templates.js';
import {calculateTradeLinkAmounts,formatTradeLinkAmount} from '../frontend/tradelink-finance.js';

const workspace='00000000-0000-4000-8000-000000000001';
const id='99999999-9999-4999-8999-999999999992';
const stamp='2026-11-25T01:00:00Z';
const css=await readFile(new URL('../frontend/apsyntra-styles.bundle.css',import.meta.url),'utf8');
const output=process.env.TL_PRINT_OUTPUT_DIR||'/tmp/cp-tl-quotation-print';
await mkdir(output,{recursive:true});
const line=i=>({kind:'item',description:'ITEMTOKEN'+String(i).padStart(3,'0')+' industrial component\nModel: QA-'+i+'\nBrand: Synthetic',quantity:2,unitPrice:123.45});
const longNote={kind:'note',description:Array.from({length:80},(_,i)=>'NOTETOKEN'+String(i).padStart(3,'0')+' technical detail').join('\n')};
assert.ok(longNote.description.length>2000);
longNote.description=Array.from({length:70},(_,i)=>'NOTETOKEN'+String(i).padStart(3,'0')+' technical').join('\n');
assert.ok(longNote.description.length<=2000);
const scenarios=[
 ['watchdog-sales',1,[{kind:'note',description:'Scope of work\nSynthetic technical proposal\nNOTETOKEN000'},line(1)],'zero'],
 ['watchdog-opc',26,Array.from({length:26},(_,i)=>line(i+1)),'12'],
 ['plc-systems',4,Array.from({length:4},(_,i)=>line(i+1)),'12'],
 ['watchdog-opc',99,[longNote,...Array.from({length:99},(_,i)=>line(i+1))],'12']
];
const expected=[];
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
try{
 for(const [profile,count,items,vatType] of scenarios){
  const number='Q-QA-'+count;
  const content={documentType:'quotation',documentNumber:number,vendorId:profile,
   templateId:tradeLinkCompanyTemplateSnapshot(profile).id,customerName:'Synthetic client',
   customerAddress:'Synthetic address',customerContact:'Synthetic contact',customerEmail:'qa@example.test',
   customerPhone:'000-000',referenceNumber:'TEST-REFERENCE',date:'2026-11-25',currency:'PHP',vatType,
   validity:'30 Days',deliveryCommitment:'4 Weeks',paymentTerms:'Net 30',items,
   verifiedByEmail:'reviewer@example.test',approvedByEmail:'manager@example.test',
   terms:'Standard Terms & Conditions of Sale\n1. Test terms\nTERMSENDTOKEN'};
  const row={id,workspace_id:workspace,board_id:'264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   board_item_id:'99999999-9999-4999-8999-999999999991',document_type:'quotation',document_number:number,
   revision:1,workflow_state:'approved',created_at:stamp,updated_at:stamp,archived_at:null,content,
   approved:true,approval_policy:count===1?'gm-sales-supervisor-exempt-v1':'standard-dual-v1',
   primary_reviewed_at:count===1?null:stamp,secondary_reviewed_at:stamp};
  let html=renderTradeLinkSavedDocumentOutput(row,workspace,id,{creatorName:'Synthetic creator'});
  const logo=html.match(/src="(file:[^"]+)"/)[1];
  html=html.replace(logo,'data:image/png;base64,'+(await readFile(fileURLToPath(logo))).toString('base64'));
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body><section id="tradelink-saved-print"><div class="tl-print-shell">'+html+'</div></section></body></html>');
  await page.locator('.tl-quote-logo').evaluate(img=>img.decode());
  const approvalStamp=page.locator('.tl-official-approval-stamp');
  assert.equal(await approvalStamp.innerText(),'APPROVED',
   profile+' approved stamp contains only APPROVED');
  assert.equal(await approvalStamp.locator('span').count(),0,
   profile+' approved stamp has no subtitle, separators or revision text');
  for(const selector of ['.tl-quote-workflow-line','.tl-quote-client',
   '.tl-quote-commercial','.tl-quote-financial-summary',
   '.tl-quote-approval-summary','.tl-quote-responsibility'])
   assert.equal(await page.locator(selector).count(),1,profile+' reference layout '+selector);
  assert.equal(await page.locator('.tl-quote-commercial dl>div').count(),5,
   profile+' commercial fields');
  assert.equal(await page.locator('.tl-quote-financial-summary dl>div').count(),6,
   profile+' complete financial summary');
  assert.equal(await page.locator('tbody tr:not(.tl-official-note-row)').count(),count);
  assert.deepEqual(await page.locator('tbody tr:not(.tl-official-note-row) td:first-child').allTextContents(),Array.from({length:count},(_,i)=>String(i+1)));
  await page.emulateMedia({media:'print'});
  const approvalPresentation=await approvalStamp.evaluate(element=>{
   const style=getComputedStyle(element);
   return {borderColor:style.borderTopColor,backgroundColor:style.backgroundColor,
    color:style.color,display:style.display,textAlign:style.textAlign};
  });
  assert.deepEqual(approvalPresentation,{
   borderColor:'rgb(24, 132, 81)',backgroundColor:'rgb(242, 251, 245)',
   color:'rgb(18, 107, 66)',display:'flex',textAlign:'center'
  },profile+' retains the green approval stamp presentation');
  const file=output+'/'+profile+'-'+count+'.pdf';
  await page.pdf({path:file,preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
  expected.push({file,count,notes:items.filter(i=>i.kind==='note').flatMap(i=>i.description.match(/NOTETOKEN\d+/g)||[]),total:'₱'+formatTradeLinkAmount(calculateTradeLinkAmounts(content).total),profile});
  console.log('PRINTED',profile,'priced rows',count,'total',expected.at(-1).total);
  await page.close();
 }
}finally{await browser.close()}
await writeFile(output+'/expected.json',JSON.stringify(expected,null,2));
