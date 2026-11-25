import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright';
import {renderTradeLinkApplication} from '../frontend/tradelink-application.js';
import {initialTradeLinkDraftView,renderTradeLinkDraftLineItem} from '../frontend/tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../frontend/tradelink-board-items.js';
const workspaceId='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},items:[],groups:[],columns:[]};
const css=await readFile('frontend/apsyntra-styles.bundle.css','utf8');
const types=['esi','packing','delivery','payment','quotation','po'];
const editable='input:not([type=hidden]):not([type=date]):not([type=file]):not([type=checkbox]):not([type=radio]):not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])';
function contrast(a,b){
 const luminance=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
for(const [name,engine] of [['Chromium',chromium],['Firefox',firefox],['WebKit',webkit]]){
 const browser=await engine.launch({headless:true});
 try{
  for(const theme of ['light','dark'])for(const width of [1366,390]){
   const page=await browser.newPage({viewport:{width,height:900}});
   await page.route('**/*',route=>route.abort());
   let count=0,minContrast=Infinity;
   const inspect=async html=>{
    await page.setContent('<!doctype html><html data-aps-monday-theme="'+theme+'"><head><style>'+css+'</style></head><body><div id="app">'+html+'</div></body></html>');
    const results=await page.locator(editable).evaluateAll(elements=>elements.map(el=>({
     name:el.name||el.id,hint:el.getAttribute('placeholder'),value:el.value,
     visible:el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0,
     colors:[getComputedStyle(el,'::placeholder').color,getComputedStyle(el).backgroundColor]
    })));
    for(const r of results){assert.ok(r.hint?.trim(),name+' '+theme+' missing '+r.name);count++;if(r.visible){const ratio=contrast(...r.colors);assert.ok(ratio>=4.5,JSON.stringify({...r,ratio}));minContrast=Math.min(minContrast,ratio);}}
   };
   for(const type of types){
    await inspect(renderTradeLinkApplication({detail,workspaceId,section:'drafts',draftView:initialTradeLinkDraftView(type),canManage:true}));
    const form=page.locator('[data-tradelink-draft-form]');
    const initial=await form.evaluate(el=>Object.fromEntries(new FormData(el)));
    const client=page.locator('[name=customerName]');
    assert.equal(await client.inputValue(),'');
    assert.equal(await client.evaluate(el=>el.matches(':placeholder-shown')),true);
    await client.fill('Synthetic QA customer');assert.equal(await client.evaluate(el=>el.matches(':placeholder-shown')),false);
    await client.fill('');assert.equal(await client.evaluate(el=>el.matches(':placeholder-shown')),true);
    assert.deepEqual(await form.evaluate(el=>Object.fromEntries(new FormData(el))),initial);
    assert.ok(!Object.values(initial).some(v=>typeof v==='string'&&v.startsWith('Enter ')));
    if(type!=='payment'){
     const extra=renderTradeLinkDraftLineItem({kind:'item',quantity:''},type)+renderTradeLinkDraftLineItem({kind:'note'},type);
     await page.locator('[data-tradelink-draft-line-items]').evaluate((el,html)=>el.insertAdjacentHTML('beforeend',html),extra);
     assert.equal(await page.locator('[data-tradelink-line-item]').last().locator('textarea').getAttribute('placeholder'),'Enter item note');
     const qty=page.locator('input[name=lineQuantity]:not([type=hidden])').last();
     assert.equal(await qty.getAttribute('placeholder'),'Enter quantity');
    }
   }
   await inspect(renderTradeLinkApplication({detail,workspaceId,section:'quotation',canManage:true}));
   await inspect(renderTradeLinkApplication({detail,workspaceId,section:'documents',canManage:true}));
   console.log('PASS',name,theme,width,count,'applicable controls; minimum contrast',minContrast.toFixed(2));
   await page.close();
  }
 }finally{await browser.close();}
}
