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
const outputDirectory=process.env.TL_HISTORY_OUTPUT_DIR||'/tmp/cp-tl-opt-04b-history';
const stylesheetAssets=[
 'templates/tradelink-application-v1.42.0-fc3a9e2dd3626a4b7657ea72c105b042d8128287.css',
 'templates/tradelink-quotation-redesign-v1.42.0-866f644ed2f9a5fa569e799351feac19a90325fa.css'
];
const stylesheetGitBlobShas=[
 'fc3a9e2dd3626a4b7657ea72c105b042d8128287',
 '866f644ed2f9a5fa569e799351feac19a90325fa'
];
const profile={
 id:'watchdog-sales',name:'Watchdog Automation Sales & Services',
 address:'Bldg.2 Paseo de Amores Sergio Osmena St.\nGun-ob, Lapu-lapu City 6015',
 phone:'+63 917 7073079',quotationPhone:'+63 917 7073079',
 email:'info@watchdogautomation.com.ph',website:'www.watchdogautomation.com.ph',
 tin:'211-258-356-00000',templateId:'watchdog-sales-reference-v1',
 logoAsset:'profiles/v1/watchdog-sales-ac1c97ed05b379a20caaccdbc3e3f02be8aebf89.png',
 logoGitBlobSha:'ac1c97ed05b379a20caaccdbc3e3f02be8aebf89',
 quotationLogoAsset:'profiles/v1/watchdog-sales-quotation-ee2cb021cacdffd5c0240d8ede81ee58892db4b9.png',
 quotationLogoGitBlobSha:'ee2cb021cacdffd5c0240d8ede81ee58892db4b9',
 accent:'#ef4155',quotationAccent:'#ff3d57',tableBackground:'#fce5e7',
 tableText:'#1644a3',ruleColor:'#2d65d5',termsMode:'new-page'
};
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
const stylesheet=(await Promise.all(stylesheetAssets.map(asset=>
 readFile(fileURLToPath(new URL('../frontend/assets/tradelink/'+asset,import.meta.url)),'utf8')
))).join('\n\n');

await mkdir(outputDirectory,{recursive:true});

function buildRevision(revision){
 const marker='CP-TL-OPT-04B-REVISION-'+revision;
 const terms=marker+'-TERMS\n'+
  '1. Historical terms are bound to this exact approved revision.\n'+
  '2. Company profile, template version and stylesheet hashes remain immutable.\n'+
  marker+'-TERMS-END';
 const itemMarker=marker+'-ITEM';
 const remarksMarker=marker+'-REMARKS';
 const content={
  documentType:'quotation',documentNumber:'Q-OPT04B-HISTORICAL-001',
  vendorId:profile.id,templateId:profile.templateId,
  customerName:'Synthetic Historical Customer',
  customerAddress:'Synthetic address, Cebu City',
  customerContact:'Synthetic Contact',
  customerEmail:'history-acceptance@example.test',
  customerPhone:'+63 900 000 0000',
  currency:'PHP',vatType:'12',discountType:'fixed',discountValue:0,
  exchangeRate:1,date:'2026-11-27',referenceNumber:'HISTORY-OPT04B',
  validity:'30 days',deliveryCommitment:'14 days',paymentTerms:'Net 30',
  items:[{
   kind:'item',description:itemMarker+' industrial component for revision '+revision,
   quantity:1,unit:'piece',unitPrice:100,serialNumber:'HISTORY-SERIAL-'+revision
  }],
  terms,remarks:remarksMarker,
  verifiedByEmail:'history-reviewer@example.test',
  approvedByEmail:'history-approver@example.test',
  verifiedBy:'Synthetic history reviewer',
  approvedBy:'Synthetic history approver'
 };
 const row={
  id:documentId,workspace_id:workspaceId,board_id:boardId,
  board_item_id:boardItemId,document_type:'quotation',
  document_number:content.documentNumber,revision,
  workflow_state:'approved',created_at:createdAt,updated_at:createdAt,
  archived_at:null,created_by:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  created_by_name:'CP-TL-OPT-04B Historical Acceptance Creator',
  approval_policy:'standard-dual-v1',approved:true,
  primary_reviewed_at:createdAt,secondary_reviewed_at:createdAt,content
 };
 const renderSnapshot={
  documentId,revision,snapshotSource:'captured',capturedAt:createdAt,
  snapshot:{
   schemaVersion:1,snapshotSource:'captured',profileVersion:1,
   company,template,terms,termsSource:'document',capturedAt:createdAt
  }
 };
 const html=renderTradeLinkSavedDocumentOutput(row,workspaceId,documentId,{
  creatorName:'CP-TL-OPT-04B Historical Acceptance Creator',renderSnapshot
 });
 return {
  revision,marker,termsMarker:marker+'-TERMS-END',
  itemMarker,remarksMarker,content,row,renderSnapshot,html,
  total:'₱'+formatTradeLinkAmount(calculateTradeLinkAmounts(content).total)
 };
}

const browser=await chromium.launch({
 headless:true,
 ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?
  {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})
});
const expected=[];
async function renderPdf(scenario,fileName,forbiddenMarkers){
 let markup=scenario.html;
 const logoMatches=[...markup.matchAll(/src="(file:[^"]+)"/g)];
 for(const match of logoMatches){
  const bytes=await readFile(fileURLToPath(match[1]));
  markup=markup.replace(match[0],'src="data:image/png;base64,'+bytes.toString('base64')+'"');
 }
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 try{
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>'+
   stylesheet+'</style></head><body><section id="tradelink-saved-print">'+markup+
   '</section></body></html>');
  await page.locator('.tl-quote-logo').evaluate(image=>image.decode());
  const article=page.locator('article[data-tradelink-signed-output]');
  assert.equal(await article.getAttribute('data-tradelink-template-version'),'v1.42.0');
  assert.equal(await article.getAttribute('data-tradelink-profile-version'),'1');
  assert.equal(await article.getAttribute('data-tradelink-render-snapshot-source'),'captured');
  assert.equal(await article.getAttribute('data-tradelink-revision'),String(scenario.revision));
  const text=await page.locator('body').innerText();
  for(const token of [scenario.marker,scenario.termsMarker,scenario.itemMarker,
   scenario.remarksMarker,scenario.total,'APPROVED']){
   assert.ok(text.includes(token),'Historical revision output must contain '+token);
  }
  for(const token of forbiddenMarkers){
   assert.ok(!text.includes(token),'Revision output must not contain '+token);
  }
  assert.equal(await page.locator('.tl-official-approval-stamp').innerText(),'APPROVED');
  await page.emulateMedia({media:'print'});
  const file=outputDirectory+'/'+fileName;
  const pdf=await page.pdf({path:file,preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
  assert.ok(pdf.length>5000,'Chromium generated historical PDF '+fileName);
  assert.match(pdf.subarray(0,8).toString(),/^%PDF-/);
  expected.push({
   file,revision:scenario.revision,profile:profile.id,company:profile.name,
   title:'QUOTATION',documentNumber:scenario.content.documentNumber,
   marker:scenario.marker,termsMarker:scenario.termsMarker,
   itemMarker:scenario.itemMarker,remarksMarker:scenario.remarksMarker,
   total:scenario.total,forbiddenMarkers,pageSize:'letter'
  });
  console.log('PASS Chromium historical revision',scenario.revision,fileName,pdf.length+' bytes');
 }finally{
  await page.close();
 }
}
try{
 const historical=buildRevision(4);
 const current=buildRevision(5);
 const repeatedHistorical=buildRevision(4);
 assert.equal(historical.html,repeatedHistorical.html,
  'The same historical revision and immutable snapshot must produce identical markup');
 await renderPdf(historical,'revision-4-before.pdf',[
  current.marker,current.termsMarker,current.itemMarker,current.remarksMarker
 ]);
 await renderPdf(current,'revision-5-current.pdf',[
  historical.marker,historical.termsMarker,historical.itemMarker,historical.remarksMarker
 ]);
 await renderPdf(repeatedHistorical,'revision-4-after.pdf',[
  current.marker,current.termsMarker,current.itemMarker,current.remarksMarker
 ]);
}finally{
 await browser.close();
}
assert.equal(expected.length,3,'two historical renders and one current revision render are required');
await writeFile(outputDirectory+'/expected.json',JSON.stringify(expected,null,2));
console.log('PASS: historical revision 4 was rendered before and after revision 5 without changing its immutable output.');
