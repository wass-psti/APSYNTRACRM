/**
 * CP-TL-REVISION-HISTORY-05: disposable historical Approved reprint.
 * Uses synthetic revisions and real UI renderer + Chromium PDF engine.
 * Does NOT establish a signed production historical-reprint acceptance.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {normalizeTradeLinkRevisionBundle} from '../frontend/tradelink-domain-client.js';
import {renderTradeLinkSavedDocumentOutput} from '../frontend/tradelink-saved-document-output.js';
import {renderTradeLinkDocumentRepository,initialTradeLinkDraftView}
 from '../frontend/tradelink-draft-workspace.js';
import {TRADELINK_DEFAULT_TERMS} from '../frontend/tradelink-official-templates.js';

const workspace='00000000-0000-4000-8000-000000000001';
const board='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
const documentId='99999999-9999-4999-8999-999999999992';
const boardItemId='99999999-9999-4999-8999-999999999991';
const stamp='2026-11-17T08:00:00.000Z';
const number='Q-REV-HISTORY-001';
const oldContent={
 documentType:'quotation',documentNumber:number,currency:'PHP',vatType:'12',
 discountType:'fixed',discountValue:0,customerName:'Synthetic historical acceptance',
 paymentTerms:'QA only; no commercial obligations',
 vendorId:'watchdog-sales',templateId:'watchdog-sales-reference-v1',
 verifiedByEmail:'revision-primary@example.test',
 approvedByEmail:'revision-secondary@example.test',
 items:[{kind:'item',description:'Immutable first revision only',quantity:2,unitPrice:125.25}],
 terms:TRADELINK_DEFAULT_TERMS.quotation
};
const record=(revision,approved)=>({
 id:documentId,board_id:board,workspace_id:workspace,board_item_id:boardItemId,
 document_type:'quotation',document_number:number,
 workflow_state:approved?'approved':'for-approval',revision,
 content:revision===1?oldContent:{
  ...oldContent,items:[{...oldContent.items[0],description:'New pending revision only',unitPrice:200}]
 },
 created_by:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 updated_by:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 created_at:stamp,updated_at:stamp,archived_at:null,
 snapshot_source:'captured',revision_at:stamp,approved,
 primary_reviewed_at:stamp,secondary_reviewed_at:approved?stamp:null
});
const metadata=(revision,approved,current)=>({
 revision,workflowState:approved?'approved':'for-approval',approved,current,
 snapshotSource:'captured',revisionAt:stamp,capturedAt:stamp,
 primaryAt:stamp,secondaryAt:approved?stamp:null
});
const older=record(1,true),latest=record(2,false);
const history=normalizeTradeLinkRevisionBundle({
 documentId,boardItemId,currentRevision:2,
 revisions:[metadata(2,false,true),metadata(1,true,false)],selected:older
},workspace,documentId,1);
assert.equal(history.selected.revision,1);
assert.equal(history.selected.approved,true);
assert.equal(history.revisions[0].approved,false);
assert.equal(history.selected.content.items[0].unitPrice,125.25);
assert.equal(latest.content.items[0].unitPrice,200);

const detail={board:{id:board,workspace_id:workspace,name:'TradeLink',status:'active',
 description:'[APSYNTRA:MODULE:tradelink:v1]'},groups:[],columns:[],items:[]};
const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[{
 documentId,boardItemId,documentType:'quotation',documentNumber:number,revision:2,
 workflowState:'for-approval',archived:false
}],documentPreview:{documentId,record:history.selected,latestRecord:latest,
 revisions:history.revisions,events:null,attachments:[]}};
const repository=renderTradeLinkDocumentRepository({
 detail,workspaceId:workspace,view,canManage:true
});
assert.match(repository,/data-action="tradelink-document-revision-print"[^>]*data-revision="1"/);
assert.doesNotMatch(repository,/data-action="tradelink-document-revision-print"[^>]*data-revision="2"/);

const html=renderTradeLinkSavedDocumentOutput(history.selected,workspace,documentId);
for(const expected of ['Immutable first revision only','APPROVED','₱250.50',
 '₱30.06','₱280.56']){
 assert.ok(html.includes(expected),'Missing historical field '+expected);
}
assert.doesNotMatch(html,/New pending revision only/);
const css=await readFile(new URL('../frontend/tradelink-application.css',import.meta.url),'utf8');
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>'+
  css+'</style></head><body><section id="tradelink-saved-print">'+html+
  '</section></body></html>');
 assert.equal(await page.locator('.tl-quote-letterhead').count(),1);
 assert.equal(await page.locator('.tl-quote-parties').count(),1);
 assert.equal(await page.locator('.tl-quote-terms').count(),1);
 assert.equal(await page.locator('.tl-official-approval-stamp.is-approved').count(),1);
 await page.emulateMedia({media:'print'});
 const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
 assert.ok(pdf.length>10000,'Chromium must generate a nonempty PDF');
 assert.match(pdf.subarray(0,12).toString(),/^%PDF-/);
 assert.match(pdf.toString('latin1'),/\/MediaBox\s*\[\s*0\s+0\s+612(?:\.\d+)?\s+792(?:\.\d+)?\s*\]/);
 console.log('PASS: Chromium PDF of synthetic prior Approved revision');
 console.log('PASS: pending new revision is not printable, old amounts and wording preserved');
 console.log('PASS: saved Letter template and flowing Quotation sections');
 console.log('DISPOSABLE TEST ONLY — not signed production historical acceptance');
}finally{
 await browser?.close();
}
