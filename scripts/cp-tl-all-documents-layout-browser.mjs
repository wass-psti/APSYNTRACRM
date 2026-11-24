/** Disposable responsive acceptance using actual TradeLink markup and bundled CSS. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {renderTradeLinkApplication} from '../frontend/tradelink-application.js';
import {initialTradeLinkDraftView} from '../frontend/tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../frontend/tradelink-board-items.js';
const workspaceId='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},groups:[],items:[],columns:[]};
const rows=Array.from({length:15},(_,i)=>({documentId:'bbbbbbbb-bbbb-4bbb-8bbb-'+String(i+1).padStart(12,'0'),boardItemId:'cccccccc-cccc-4ccc-8ccc-'+String(i+1).padStart(12,'0'),documentNumber:'Q-LAYOUT-'+i,clientName:'Disposable example customer '+i,documentType:'quotation',revision:1,workflowState:i===1?'approved':i===2?'completed':'draft',archived:false,hidden:false,createdAt:'2026-11-08T20:00:00Z',updatedAt:'2026-11-08T22:00:00Z'}));
const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows,listPage:{server:true,appliedFilters:{},pageIndex:0,history:[],hasMore:false}};
const render=(draftView=view,extra={})=>renderTradeLinkApplication({detail,workspaceId,section:'documents',draftView,canManage:true,...extra});
const css=await readFile(new URL('../frontend/apsyntra-styles.bundle.css',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.route('**/*',route=>route.abort());
 const show=async markup=>page.setContent('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\nbody{margin:0}#app{width:100%;min-width:0}</style><div id="app">'+markup+'</div></html>');
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:900});
  await show(render());
  const geometry=await page.evaluate(()=>{
   const box=s=>document.querySelector(s).getBoundingClientRect();
   const repo=box('.tl-document-repository'),list=box('.tl-document-list-pane'),filters=box('.tl-draft-list-filters'),search=box('input[name=query]');
   return {width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,repo:repo.width,list:list.width,searchInside:search.left>=filters.left-1&&search.right<=filters.right+1,tableOverflow:document.querySelector('.tl-document-repository .tl-records-scroll').scrollWidth>document.querySelector('.tl-document-repository .tl-records-scroll').clientWidth};
  });
  console.log(JSON.stringify(geometry));
  if(geometry.overflow>1) console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+2&&r.width>0&&!e.closest('.tl-records-scroll,.tl-reference-document-filter-tabs,.tl-reference-portal-links')}).map(e=>({tag:e.tagName,cls:e.className,right:Math.round(e.getBoundingClientRect().right),width:Math.round(e.getBoundingClientRect().width)})).slice(0,35)));
  assert.ok(geometry.overflow<=1,'Page overflow at '+width);
  assert.ok(geometry.list>=geometry.repo-60,'Listing must fill repository at '+width);
  assert.ok(geometry.searchInside,'Search must fit its filter container at '+width);
  assert.equal(await page.locator('.tl-document-preview-pane,.tl-document-detail-view,.tl-document-split-view').count(),0);
  assert.equal(await page.locator('[data-tradelink-domain-record]').count(),15);
  assert.equal(await page.locator('button').filter({hasText:/^Preview$/}).count(),0);
  assert.equal(await page.locator('[data-action="tradelink-documents-hide-selection"]').count(),1);
 }
 await page.setViewportSize({width:1440,height:900});await show(render());
 const first=page.locator('[data-tradelink-domain-record]').filter({hasText:'Q-LAYOUT-0'});
 await first.locator('.tl-ref-row-action-trigger').click();
 const edit=first.locator('[data-tradelink-document-edit]');
 assert.equal(await edit.textContent(),'Preview/Edit');
 await edit.click();
 assert.equal(await page.evaluate(()=>location.hash),'#/tradelink/drafts/edit/'+rows[0].documentId);
 const record={id:rows[0].documentId,workspace_id:workspaceId,board_id:TRADELINK_BOARD_ID,board_item_id:rows[0].boardItemId,revision:1,workflow_state:'draft',archived_at:null,created_at:rows[0].createdAt,updated_at:rows[0].updatedAt,document_type:'quotation',document_number:rows[0].documentNumber,content:{documentType:'quotation',documentNumber:rows[0].documentNumber,customerName:'Disposable verified customer',currency:'PHP',vatType:'zero',items:[{id:'line-1',kind:'item',description:'Disposable item',quantity:1,unit:'each',unitPrice:25}]}};
 await show(render({...view,documentPreview:{documentId:record.id,record,attachments:[],events:[]}}));
 assert.equal(await page.locator('.tl-document-detail-view').count(),1);
 assert.match(await page.locator('.tl-document-detail-view').textContent(),/Disposable verified customer/);
 assert.equal(await page.locator('[data-action="tradelink-document-preview-close"]').count(),1);
 console.log('PASS: responsive layout, primary edit navigation, preserved on-demand verified detail and bulk controls');
}finally{await browser.close();}
