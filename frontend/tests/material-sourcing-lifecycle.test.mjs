import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,workspaceId,userId,boardId,id} from '../../scripts/fixtures/cp-ms-crm-03-fixture.mjs';
import {setMaterialArchived,findLifecycleMaterial} from '../apps/MaterialSourcing/lifecycle.js';
import {renderNativeMaterialSourcing} from '../apps/MaterialSourcing/native-screen.js';
const target=id(200);
const render=(detail,canCreate=true)=>renderNativeMaterialSourcing(detail,{},new Date('2026-11-28T12:00:00Z'),{workspaceId,canCreate});
function setup(){
 const detail=fixture();let edit=true;let calls=0;let refreshes=0;
 const auth={isSignedIn:true,userId,getVerifiedUser:async()=>({id:userId})};
 const api={context:async()=>({user_id:userId,workspace_id:workspaceId,profile:{status:'active'}}),
  allowed:async(_board,access)=>access==='view'||edit,
  board:async()=>structuredClone(detail),invalidateBoardCache:()=>{refreshes++;},
  rpc:async(name,args)=>{assert.equal(name,'wm_set_board_item_archived');assert.equal(args.p_item_id,target);
   assert.equal(typeof args.p_archived,'boolean');calls++;
   detail.items[0].archived_at=args.p_archived?'2026-11-28T13:00:00Z':null;
  }};
 return {detail,api,auth,deny:()=>{edit=false;},calls:()=>calls,refreshes:()=>refreshes,
  input:{api,auth,workspaceId,itemId:target}};
}
test('active and archived materials remain distinct, restore retains same identity',async()=>{
 const f=setup();
 const before=structuredClone(f.detail);
 const active=render(f.detail);
 assert.match(active,/aria-label="Archive material SYNTHETIC-B"/);
 assert.match(active,/Archived materials \(0\)/);
 assert.deepEqual(await setMaterialArchived({...f.input,archived:true}),{itemId:target,archived:true,changed:true});
 const archived=render(f.detail);
 assert.doesNotMatch(archived,new RegExp('data-ms-item="'+target+'"'));
 assert.match(archived,/Archived materials \(1\)/);
 assert.match(archived,new RegExp('data-action="mrh-native-restore" data-id="'+target+'"'));
 assert.equal(f.detail.items.length,before.items.length);
 assert.deepEqual(f.detail.values,before.values);
 assert.deepEqual(await setMaterialArchived({...f.input,archived:true}),{itemId:target,archived:true,changed:false});
 assert.equal(f.calls(),1);
 assert.deepEqual(await setMaterialArchived({...f.input,archived:false}),{itemId:target,archived:false,changed:true});
 assert.match(render(f.detail),new RegExp('data-ms-item="'+target+'"'));
 assert.equal(f.calls(),2);assert.equal(f.refreshes(),5);
});
test('viewers can see archives but have no lifecycle mutation controls',async()=>{
 const f=setup();f.detail.items[0].archived_at='2026-11-28T13:00:00Z';f.deny();
 const html=render(f.detail,false);
 assert.match(html,/Archived materials \(1\)/);
 assert.doesNotMatch(html,/data-action="mrh-native-(archive|restore)"/);
 await assert.rejects(setMaterialArchived({...f.input,archived:false}),/edit access denied/);
 assert.equal(f.calls(),0);
});
test('all-archived Main group still exposes restore; foreign scope is rejected',()=>{
 const f=setup();for(const row of f.detail.items)row.archived_at='2026-11-28T13:00:00Z';
 assert.match(render(f.detail),/Archived materials \(3\)/);
 assert.match(render(f.detail),/Restore material SYNTHETIC-B/);
 assert.throws(()=>findLifecycleMaterial(f.detail,id(999),target),/board or Main group/);
 assert.throws(()=>findLifecycleMaterial(f.detail,workspaceId,id(999)),/not in the loaded Main group/);
});
test('partial board explicitly labels loaded archive count and escapes titles',()=>{
 const f=setup();f.detail.pagination={has_more:true,total_count:100};
 f.detail.items[0].archived_at='2026-11-28T13:00:00Z';f.detail.items[0].title='<img src=x>';
 const html=render(f.detail);
 assert.match(html,/Archived materials \(1 loaded\)/);
 assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img src=x>/);
});
test('route departure before write prevents mutation',async()=>{
 const f=setup();await assert.rejects(setMaterialArchived({...f.input,archived:true,isCurrent:()=>false}),/view changed/);
 assert.equal(f.calls(),0);
});
test('uncertain response never automatically retries; verified no-op on explicit retry',async()=>{
 const f=setup(),original=f.api.rpc;
 f.api.rpc=async(...args)=>{await original(...args);throw Error('lost response');};
 await assert.rejects(setMaterialArchived({...f.input,archived:true}),/result uncertain/);
 assert.equal(f.calls(),1);
 const result=await setMaterialArchived({...f.input,archived:true});
 assert.equal(result.changed,false);assert.equal(f.calls(),1);
});
test('success transport without expected persisted state is not certified',async()=>{
 const f=setup();f.api.rpc=async()=>{};
 await assert.rejects(setMaterialArchived({...f.input,archived:true}),/state could not be verified/);
});
