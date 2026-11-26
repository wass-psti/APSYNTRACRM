import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createActivityController} from '../apps/DailyDepartmentActivity/activity-controller.js';

const input = {personId:'p1', date:'2026-11-26', title:'Daily report', details:'Notes', status:'Completed', categoryId:'c1'};
function fixture() {
  let sequence = 0;
  const workspaceId = 'w1';
  let server = {workspaceId, revision:0, directory:{departments:[{id:'d1',name:'Operations'}],people:[{id:'p1',name:'Synthetic person',departmentId:'d1'}]},categories:[{id:'c1',name:'Reports'}],records:[]};
  const values = new Map();
  const storage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const commands = [];
  const repository = {
    async load() { return structuredClone(server); },
    async mutate(command) {
      commands.push(command);
      assert.equal(command.workspaceId, workspaceId);
      assert.equal(command.expectedRevision, server.revision);
      const {action,record} = command;
      if(action === 'save-activity') server.records = [...server.records.filter(item=>item.id!==record.id), record];
      else if(action === 'delete-activity') server.records = server.records.filter(item=>item.id!==record.id);
      else if(action === 'save-category') server.categories = [...server.categories.filter(item=>item.id!==record.id),record];
      else throw Error('Unknown command');
      server.revision++;
      return structuredClone(server);
    }
  };
  const create = (userId='u1') => createActivityController({repository,workspaceId,userId,draftStorage:storage,makeId:()=> 'id'+(++sequence)});
  return {create,repository,commands,storage,get server(){return server;}};
}
test('controller loads authoritative snapshot and saves, edits, filters and deletes with server readback',async()=>{
  const f=fixture(), a=f.create();
  await a.load();
  a.storeDraft(input,input);
  const saved=await a.save(input);
  const id=saved.snapshot.records[0].id;
  assert.equal(saved.snapshot.revision,1);
  assert.equal(a.recoverDraft(input),null);
  const b=f.create('u2');
  await b.load();
  assert.equal(b.getRecords({categoryId:'c1'})[0].id,id);
  await a.save({...input,title:'Revised'},id);
  assert.equal(a.getRecords({query:'revised'}).length,1);
  await a.remove(id);
  assert.equal(a.getRecords().length,0);
  await b.load();
  assert.equal(b.getRecords().length,0);
  assert.deepEqual(f.commands.map(command=>command.expectedRevision),[0,1,2]);
});
test('category save and rename require server confirmation',async()=>{
  const f=fixture(), a=f.create();
  await a.load();
  const result=await a.saveCategory({name:'Field'});
  const category=result.snapshot.categories.find(item=>item.name==='Field');
  await a.saveCategory({name:'Field work'},category.id);
  assert.equal(a.getSnapshot().categories.find(item=>item.id===category.id).name,'Field work');
});
test('failed or ambiguous mutations preserve draft and committed projection until reload',async()=>{
  const f=fixture(), a=f.create();
  await a.load();
  a.storeDraft(input,input);
  const original=f.repository.mutate;
  f.repository.mutate=async command=>{await original(command);throw Error('Connection lost');};
  await assert.rejects(a.save(input),/Connection lost/);
  assert.equal(a.getRecords().length,0);
  assert.equal(a.recoverDraft(input).title,input.title);
  assert.equal(a.requiresReload,true);
  await assert.rejects(a.save(input),/Reload DDA/);
  await a.load();
  assert.equal(a.getRecords().length,1);
  assert.equal(a.requiresReload,false);
});
test('unacknowledged or wrong-workspace results cannot replace the committed snapshot',async()=>{
  const f=fixture(), a=f.create();
  await a.load();
  f.repository.mutate=async()=>({...f.server,revision:1});
  await assert.rejects(a.save(input),/not acknowledged/);
  assert.equal(a.getRecords().length,0);
  await a.load();
  f.repository.mutate=async()=>({...f.server,workspaceId:'other'});
  await assert.rejects(a.save(input),/workspace snapshot/);
});
test('overlapping actions and stale readback fail without overwriting current state',async()=>{
  const f=fixture(), a=f.create();
  await a.load();
  const pending=a.save(input);
  await assert.rejects(a.save(input),/already in progress/);
  await pending;
  f.repository.load=async()=>({...f.server,revision:0,records:[]});
  await assert.rejects(a.load(),/Stale/);
  assert.equal(a.getRecords().length,1);
});
test('draft storage failure after confirmed save is reported separately from server save',async()=>{
  const f=fixture(), a=f.create();
  await a.load();
  f.storage.removeItem=()=>{throw Error('blocked');};
  const result=await a.save(input);
  assert.equal(result.snapshot.records.length,1);
  assert.match(result.draftWarning,/Saved on server/);
});
test('disposed controller ignores late responses',async()=>{
  const f=fixture(), a=f.create();
  const pending=a.load();
  a.dispose();
  await assert.rejects(pending,/disposed/);
  assert.throws(()=>a.getSnapshot(),/disposed/);
});
