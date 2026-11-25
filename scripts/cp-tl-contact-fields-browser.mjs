import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {renderTradeLinkDraftWorkspace,initialTradeLinkDraftView,prepareTradeLinkDraftCommand} from '../frontend/tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../frontend/tradelink-board-items.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const view=initialTradeLinkDraftView('quotation');
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},items:[],groups:[],columns:[]};
const markup=renderTradeLinkDraftWorkspace({detail,workspaceId,view,canManage:true});
for(const [name,engine] of [['Chromium',chromium],['Firefox',firefox],['WebKit',webkit]]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',route=>route.abort());
  await page.setContent(markup);
  const email=page.getByLabel('Client email',{exact:true});
  const phone=page.getByLabel('Client phone',{exact:true});
  for(const value of ['','buyer@example.test','Buyer+sales@sub.example.test']){
   await email.fill(value);assert.equal(await email.evaluate(el=>el.checkValidity()),true,name+' email valid');
  }
  for(const value of ['09171234567','buyer@','buyer@example','a@-example.test']){
   await email.fill(value);assert.equal(await email.evaluate(el=>el.checkValidity()),false,name+' email invalid');
  }
  for(const value of ['','09171234567','+63 917 123 4567','(032) 123-4567','5550100','+63 (32) 123-4567 ext. 12','02 1234 5678 / 09171234567']){
   await phone.fill(value);assert.equal(await phone.evaluate(el=>el.checkValidity()),true,name+' phone valid');
  }
  for(const value of ['buyer@example.test','N/A','---','123abc','123+456']){
   await phone.fill(value);assert.equal(await phone.evaluate(el=>el.checkValidity()),false,name+' phone invalid');
  }
  await email.fill('buyer@example.test');await phone.fill('09171234567');
  const values=await page.locator('[data-tradelink-draft-form]').evaluate(form=>Object.fromEntries(new FormData(form)));
  // Use the actual DOM contact values, with a minimal quotation Save command.
  const fields=new Map(Object.entries({documentType:'quotation',documentNumber:'Q-CONTACT-QA',customerName:'Synthetic client',customerEmail:values.customerEmail,customerPhone:values.customerPhone}));
  const command=prepareTradeLinkDraftCommand(view,fields,{documentId:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
  assert.equal(command.draft.customerEmail,'buyer@example.test');
  assert.equal(command.draft.customerPhone,'09171234567');
  console.log('PASS',name,'native validity, optional blanks, formatted phone numbers and canonical Save mapping');
 }finally{await browser.close();}
}
