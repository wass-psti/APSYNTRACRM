import test from 'node:test';
import assert from 'node:assert/strict';
import {modalRecoveryKind,installModalRecoveryAction} from '../modal-recovery.js';

class FakeButton{
 constructor(){
  this.type='submit';this.disabled=true;this.textContent='Saving…';this.isConnected=true;
  this.listeners=new Map();this.attributes=new Map();
  this.classList={remove(){},add(){}};
 }
 addEventListener(type,callback){
  const handlers=this.listeners.get(type)||[];handlers.push(callback);this.listeners.set(type,handlers);
 }
 setAttribute(name,value){this.attributes.set(name,value);}
 removeAttribute(name){this.attributes.delete(name);}
 async click(){
  const event={preventDefault(){event.defaultPrevented=true;}};
  for(const handler of this.listeners.get('click')||[])await handler(event);
  return event;
 }
}

test('partial destructive batch is recovery-required, not a retryable revision conflict',()=>{
 assert.equal(modalRecoveryKind({status:409,code:'BOARD_DELETE_PARTIAL_OR_UNCERTAIN'},
  {disableOnConflict:true}),'partial');
 assert.equal(modalRecoveryKind({status:409,code:'BOARD_REVISION_STALE'},
  {disableOnConflict:true}),'conflict');
 assert.equal(modalRecoveryKind({code:'40001'},
  {disableOnConflict:true}),'conflict');
 assert.equal(modalRecoveryKind({status:409,code:'BOARD_REVISION_STALE'},
  {disableOnConflict:false}),null);
 assert.equal(modalRecoveryKind({schemaOutcomeUncertain:true},{}),null);
 assert.equal(modalRecoveryKind({status:400,code:'VALIDATION'},
  {disableOnConflict:true}),null);
});

test('recovery control is enabled and non-submitting, then refreshes and closes',async()=>{
 const button=new FakeButton();const calls=[];
 const installed=installModalRecoveryAction(button,{
  label:'Close and refresh Trash',
  action:async()=>calls.push('refresh'),
  close:()=>calls.push('close')
 });
 assert.equal(installed,true);
 assert.equal(button.type,'button');
 assert.equal(button.disabled,false);
 assert.equal(button.textContent,'Close and refresh Trash');
 const event=await button.click();
 assert.equal(event.defaultPrevented,true);
 assert.deepEqual(calls,['refresh','close']);
 assert.equal(button.attributes.has('aria-busy'),false);
});

test('failed recovery restores an enabled retryable refresh action without resubmitting deletion',async()=>{
 const button=new FakeButton();const errors=[];let attempts=0;
 installModalRecoveryAction(button,{
  label:'Close and refresh Trash',
  action:async()=>{attempts++;throw new Error('refresh unavailable');},
  close:()=>assert.fail('modal must remain open when refresh fails'),
  onError:error=>errors.push(error.message)
 });
 await button.click();
 assert.equal(attempts,1);
 assert.deepEqual(errors,['refresh unavailable']);
 assert.equal(button.type,'button');
 assert.equal(button.disabled,false);
 assert.equal(button.textContent,'Close and refresh Trash');
 await button.click();
 assert.equal(attempts,2);
});

test('concurrent recovery clicks do not start duplicate refreshes',async()=>{
 const button=new FakeButton();let calls=0;let release;
 const pending=new Promise(resolve=>{release=resolve;});
 installModalRecoveryAction(button,{label:'Refresh',action:()=>{calls++;return pending;}});
 const first=button.click();
 await button.click();
 assert.equal(calls,1);
 release();await first;
 assert.equal(calls,1);
});
