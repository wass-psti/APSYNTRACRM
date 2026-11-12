import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 authorizeMaterialSourcingViewer,readProtectedSourcingItem,writeProtectedSourcingField
} from '../material-sourcing-application.js';
import {MATERIAL_SOURCING_BOARD_ID} from '../material-sourcing-schema-plan.js';
const actor='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const item='33333333-3333-4333-8333-333333333333';
function setup({allowed=true,role='VIEWER',revoked=false,foreign=false}={}){
 const calls=[];
 const auth={userId:actor,isSignedIn:true,getVerifiedUser:async()=>({id:actor})};
 const api={
  context:async()=>({user_id:actor,workspace_id:foreign?'44444444-4444-4444-8444-444444444444':workspace,profile:{status:'active'}}),
  allowed:async(b,r)=>{calls.push('allowed:'+r);return allowed},
  rpc:async(name)=>{
   calls.push(name);
   if(name==='material_request_hub_bootstrap')return {workspaceId:workspace,role};
   if(name==='mrh_sourcing_board_viewer_read'){
    if(revoked)auth.isSignedIn=false;
    return {'Buying Price':{value:123,revision:2},'Vendor Details':{value:'Supplier A',revision:1}};
   }
   throw new Error('Unexpected RPC: '+name);
  }
 };
 return {input:{api,auth,workspaceId:workspace,boardId:MATERIAL_SOURCING_BOARD_ID,itemId:item},calls};
}
test('signed employee board viewer can read real commercial RPC without ADMIN bootstrap',async()=>{
 const x=setup({role:'VIEWER'});
 const values=await readProtectedSourcingItem(x.input);
 assert.equal(values['Buying Price'].value,123);
 assert.equal(values['Vendor Details'].value,'Supplier A');
 assert.deepEqual(x.calls,['allowed:view','mrh_sourcing_board_viewer_read']);
});
test('commercial read still denies inactive session, foreign workspace and denied board',async()=>{
 for(const options of [{allowed:false},{foreign:true}]){
  const x=setup(options);
  await assert.rejects(()=>readProtectedSourcingItem(x.input));
  assert.ok(!x.calls.includes('mrh_sourcing_board_viewer_read'));
 }
 const revoked=setup({revoked:true});
 await assert.rejects(()=>readProtectedSourcingItem(revoked.input),/session changed/i);
});
test('existing protected write remains ADMIN gated even after new employee read',async()=>{
 const x=setup({role:'VIEWER'});
 await assert.rejects(()=>writeProtectedSourcingField({...x.input,fieldName:'Buying Price',value:'3',expectedRevision:2}));
 assert.ok(x.calls.includes('material_request_hub_bootstrap'));
 assert.ok(!x.calls.includes('mrh_sourcing_sensitive_write'));
});
test('drawer displays read values but hides editing unless confirmed ADMIN and EDIT',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const part=app.slice(app.indexOf('async function openBoardItemDetails('),app.indexOf('async function openBoardMembers('));
 assert.match(part,/const editAllowed=await db\.allowed\(snapshot\.boardId,'edit'\)/);
 assert.match(part,/canProtectedEdit=role\?\.workspaceId===snapshot\.workspaceId&&role\?\.role==='ADMIN'/);
 assert.match(part,/editToggle\.hidden=!\(canPublicEdit\|\|canProtectedEdit\)/);
 assert.match(part,/canPublicEdit=editAllowed===true/);
 assert.match(part,/renderProtectedSourcingEditor\(result,\{editing:editing&&canProtectedEdit\}\)/);
 assert.match(part,/writeProtectedSourcingField\(\{\.\.\.input,/);
});
