/** Disposable Chromium test: actual renderer and extracted application handlers.
 * No live server, credentials, or production mutations. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {renderTradeLinkDocumentRepository,initialTradeLinkDraftView,serializeTradeLinkDocumentCsv} from '../frontend/tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../frontend/tradelink-board-items.js';
const workspace='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},groups:[],columns:[],items:[]};
const rows=[false,true,false].map((hidden,i)=>({documentId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb'+i,boardItemId:'cccccccc-cccc-4ccc-8ccc-ccccccccccc'+i,documentNumber:'Q-QA-'+i,clientName:'Disposable',documentType:'quotation',revision:1,workflowState:'draft',archived:false,hidden,createdAt:'2026-11-08T20:00:00Z',updatedAt:'2026-11-08T22:00:00Z'}));
const source=await readFile(new URL('../frontend/app.js',import.meta.url),'utf8');
const extract=(name,next)=>source.slice(source.indexOf(name),source.indexOf(next,source.indexOf(name)));
const selection=extract('function updateTradeLinkDocumentSelection(panel)','function captureTradeLinkDraftListFilters(event)');
const mutation=extract('async function applyTradeLinkDocumentBulkAction(operation)','async function changeTradeLinkDraftState(');
const changeStart=source.indexOf(" if(event.target?.matches?.('[data-tl-select-document],[data-tl-select-all]')){");
const change=source.slice(changeStart,source.indexOf(' if(captureTradeLinkDraftListFilters(event))',changeStart));
const render=(mode,selected=[])=>renderTradeLinkDocumentRepository({detail,workspaceId:workspace,canManage:true,view:{...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows,listFilters:{visibilityMode:mode},selectedDocumentIds:selected}});
let browser;
const dir=await mkdtemp(join(tmpdir(),'tl-bulk-browser-'));
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({acceptDownloads:true});
 await page.route('**/*',route=>route.abort());
 await page.setContent('<main id="root">'+render('visible',[rows[1].documentId])+'</main>');
 assert.equal(await page.locator('[data-tradelink-domain-record]:visible').count(),2);
 assert.equal(await page.locator('[data-tl-selected-count]').textContent(),'0 selected');
 const setup=`
 const root=document.querySelector('#root');
 const state={boardManage:true,tradeLinkSection:'documents',context:{workspace_id:${JSON.stringify(workspace)}},tradeLinkDraft:{status:'AUTHORIZED_READ',rows:${JSON.stringify(rows)},selectedDocumentIds:[]}};
 const auth={userId:'disposable'};const routeSerial=1;
 const tradeLinkAuthorizedListRoute=()=>true;
 const render=()=>{};const toast=()=>{};
 const tradeLinkDraftSaveFailureMessage=e=>e.message;
 let fail=true;let calls=[];let refreshes=0;
 const tradeLinkDraftWorkspace={bulkAction:async input=>{calls.push(input);if(fail)throw Error('Disposable failure');}};
 const loadTradeLinkDrafts=async()=>{refreshes++;};
 const serializeTradeLinkDocumentCsv=${serializeTradeLinkDocumentCsv.toString()};
 const typeLabels=[['quotation','Quotation']];
 ${selection}
 ${mutation}
 root.addEventListener('change',event=>{${change}});
 root.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;if(action==='tradelink-documents-export-selection')exportTradeLinkDocumentSelection(button.closest('[data-tradelink-domain-list]'));else if(action.startsWith('tradelink-documents-')&&action.endsWith('-selection')){const op=action.split('-')[2];if(['hide','unhide','delete'].includes(op))void applyTradeLinkDocumentBulkAction(op);}});
 window.qa={state,calls,setFail:v=>fail=v,refreshes:()=>refreshes};
 `;
 await page.addScriptTag({content:setup});
 await page.locator('[data-tl-select-all]').check();
 assert.deepEqual(await page.evaluate(()=>qa.state.tradeLinkDraft.selectedDocumentIds),[rows[0].documentId,rows[2].documentId]);
 const downloadPromise=page.waitForEvent('download');
 await page.locator('[data-action="tradelink-documents-export-selection"]').click();
 const download=await downloadPromise;
 const csv=await readFile(await download.path(),'utf8');
 assert.ok(csv.includes('Q-QA-0')&&csv.includes('Q-QA-2')&&!csv.includes('Q-QA-1'));
 await page.locator('[data-action="tradelink-documents-hide-selection"]').click();
 await page.waitForFunction(()=>qa.state.tradeLinkDraft.error==='Disposable failure');
 assert.deepEqual(await page.evaluate(()=>qa.state.tradeLinkDraft.selectedDocumentIds),[rows[0].documentId,rows[2].documentId]);
 assert.deepEqual(await page.evaluate(()=>qa.calls[0].documents),[rows[0],rows[2]].map(r=>({documentId:r.documentId,revision:r.revision})));
 await page.evaluate(()=>qa.setFail(false));
 await page.locator('[data-action="tradelink-documents-hide-selection"]').click();
 await page.waitForFunction(()=>qa.refreshes()===1);
 assert.deepEqual(await page.evaluate(()=>qa.state.tradeLinkDraft.selectedDocumentIds),[]);
 await page.setContent(render('hidden',[rows[1].documentId]));
 assert.equal(await page.locator('[data-tradelink-domain-record]:visible').count(),1);
 assert.equal(await page.locator('[data-action="tradelink-documents-unhide-selection"]').isEnabled(),true);
 assert.equal(await page.locator('[data-action="tradelink-documents-hide-selection"]').isEnabled(),false);
 await page.setContent(render('all',rows.map(r=>r.documentId)));
 assert.equal(await page.locator('[data-tradelink-domain-record]:visible').count(),3);
 assert.equal(await page.locator('[data-action="tradelink-documents-hide-selection"]').isEnabled(),false);
 assert.equal(await page.locator('[data-action="tradelink-documents-unhide-selection"]').isEnabled(),false);
 console.log('PASS: disposable Chromium visibility, exact selection, CSV download, failed mutation retention, successful mutation refresh, mixed selection controls');
}finally{await browser?.close();await rm(dir,{recursive:true,force:true});}
