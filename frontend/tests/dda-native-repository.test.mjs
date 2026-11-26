import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createActivityController} from '../apps/DailyDepartmentActivity/activity-controller.js';
import {createActivityRepository} from '../apps/DailyDepartmentActivity/activity-repository.js';

const input={personId:'p',date:'2026-11-26',title:'Report',details:'Notes',status:'Completed',categoryId:''};
function fixture(){
  const map=new Map();
  const storage={get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
  const auth={isSignedIn:true,userId:'u'};
  let server={workspaceId:'w',revision:0,directory:{departments:[{id:'d',name:'Ops'}],people:[{id:'p',name:'Person',departmentId:'d'}]},categories:[],records:[]};
  let sequence=0;
  const receipts=new Map(),calls=[];
  const api={async rpc(name,args){
    calls.push({name,args:structuredClone(args)});
    if(name==='dda_snapshot_v1')return structuredClone(server);
    assert.equal(name,'dda_submit_v1');
    assert.equal(args.p_workspace_id,'w');
    assert.equal('actor' in args,false);
    const id=args.p_request_id;
    let receipt=receipts.get(id);
    if(receipt){assert.deepEqual(args,receipt.args);}
    else {
      if(args.p_expected_revision!==server.revision)receipt={args,rejectedRequestId:id,rejectionReason:'Revision conflict'};
      else {
        const record=args.p_record;
        if(args.p_action==='save-activity')server.records=[...server.records.filter(row=>row.id!==record.id),record];
        else if(args.p_action==='delete-activity')server.records=server.records.filter(row=>row.id!==record.id);
        else if(args.p_action==='save-category')server.categories=[...server.categories.filter(row=>row.id!==record.id),record];
        server.revision++;
        receipt={args,acknowledgedRequestId:id,acknowledgedRevision:server.revision};
      }
      receipts.set(id,receipt);
    }
    const {args:_,...outcome}=receipt;
    return structuredClone({...server,...outcome});
  }};
  const create=()=>{
    const repository=createActivityRepository({auth,api,workspaceId:'w',storage});
    return createActivityController({repository,workspaceId:'w',userId:auth.userId,draftStorage:storage,makeId:()=> 'id'+(++sequence)});
  };
  return {create,auth,api,storage,calls,get server(){return server;}};
}
test('DDA signed adapter persists exact request before RPC and recovers a committed response lost across remount',async()=>{
  const f=fixture(),a=f.create();
  await a.load();a.storeDraft(input,input);
  const rpc=f.api.rpc;
  f.api.rpc=async(name,args)=>{const result=await rpc(name,args);if(name==='dda_submit_v1')throw Error('Network interrupted');return result;};
  await assert.rejects(a.save(input),/Network interrupted/);
  const first=f.calls.at(-1).args;
  assert.equal(f.server.records.length,1);
  assert.equal(a.recoverDraft(input).title,input.title);
  a.dispose();
  f.api.rpc=rpc;
  const b=f.create(),next=await b.load();
  assert.deepEqual(f.calls.at(-1).args,first);
  assert.equal(next.recoveries[0].outcome,'committed');
  assert.equal(b.getRecords().length,1);
  assert.equal(b.recoverDraft(input),null);
  assert.equal(f.storage.length,0);
});
test('DDA recovery of an unsent request executes the same envelope once',async()=>{
  const f=fixture(),a=f.create();await a.load();a.storeDraft(input,input);
  const rpc=f.api.rpc;
  let attempted;
  f.api.rpc=async(name,args)=>{attempted=structuredClone(args);throw Error('offline');};
  await assert.rejects(a.save(input),/offline/);
  assert.equal(f.server.records.length,0);
  f.api.rpc=rpc;
  const next=await f.create().load();
  assert.deepEqual(f.calls.at(-1).args,attempted);
  assert.equal(next.records.length,1);
});
test('DDA stale command is terminally rejected with draft retained, then reviewed save succeeds',async()=>{
  const f=fixture(),a=f.create();await a.load();a.storeDraft(input,input);
  const rpc=f.api.rpc;
  f.api.rpc=async()=>{throw Error('offline');};
  await assert.rejects(a.save(input),/offline/);
  f.api.rpc=rpc;
  f.server.revision=1;
  const b=f.create(),next=await b.load();
  assert.equal(next.recoveries[0].outcome,'rejected');
  assert.equal(b.recoverDraft(input).title,input.title);
  assert.equal(f.server.records.length,0);
  await b.save(input);
  assert.equal(f.server.records.length,1);
});
test('DDA newer local draft survives acknowledgement of earlier request',async()=>{
  const f=fixture(),a=f.create();await a.load();a.storeDraft(input,input);
  const rpc=f.api.rpc;
  f.api.rpc=async(name,args)=>{await rpc(name,args);throw Error('offline');};
  await assert.rejects(a.save(input),/offline/);
  a.storeDraft(input,{...input,title:'Newer draft'});
  f.api.rpc=rpc;
  const b=f.create();await b.load();
  assert.equal(b.recoverDraft(input).title,'Newer draft');
});
test('DDA invalid acknowledgement retains request and account switch cannot replay it',async()=>{
  const f=fixture(),a=f.create();await a.load();
  const rpc=f.api.rpc;
  f.api.rpc=async(name,args)=>{const result=await rpc(name,args);return {...result,acknowledgedRequestId:'wrong'};};
  await assert.rejects(a.save(input),/did not confirm/);
  assert.equal(f.storage.length,1);
  f.api.rpc=rpc;f.auth.userId='other';
  await assert.rejects(a.load(),/session changed/);
  const next=await f.create().load();
  assert.equal(next.recoveries.length,0);
  assert.equal(f.storage.length,1);
});
test('DDA storage failure prevents network mutation',async()=>{
  const f=fixture(),a=f.create();await a.load();
  f.storage.setItem=()=>{throw Error('Storage unavailable');};
  await assert.rejects(a.save(input),/Storage unavailable/);
  assert.equal(f.calls.filter(call=>call.name==='dda_submit_v1').length,0);
});
