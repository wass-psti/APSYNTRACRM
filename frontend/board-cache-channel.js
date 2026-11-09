/** Invalidation hints between same-origin CRM tabs. No board content or grants.
 * Browser messages are untrusted: all reads/permissions remain signed server RPCs.
 */
import {validUuid} from './data.js';
export const BOARD_CACHE_CHANNEL='apsyntra.crm.board-invalidation.v1';
export class BoardCacheChannel {
 constructor({auth,onInvalidate=()=>{},Channel=globalThis.BroadcastChannel,
   sender=globalThis.crypto?.randomUUID?.()||'local-tab',clock=()=>Date.now()}={}){
  Object.assign(this,{auth,onInvalidate,Channel,sender,clock});
  this.channel=null;this.scope=null;this.sequence=0;this.seen=new Map();
 }
 start({userId,workspaceId}={}){
  if(!validUuid(userId)||!validUuid(workspaceId)||
    !this.auth?.isSignedIn||this.auth.userId!==userId){this.stop();return false;}
  if(this.scope?.userId===userId&&this.scope?.workspaceId===workspaceId)return true;
  this.stop();this.scope={userId,workspaceId};
  if(typeof this.Channel!=='function')return true; // Supported fallback: no cross-tab hints.
  try{
   this.channel=new this.Channel(BOARD_CACHE_CHANNEL);
   this.channel.onmessage=event=>this.receive(event?.data);
  }catch{this.channel=null;}
  return true;
 }
 stop(){
  if(this.channel){this.channel.onmessage=null;try{this.channel.close();}catch{}}
  this.channel=null;this.scope=null;this.seen.clear();this.sequence=0;
 }
 publish(boardId=null,revision=null){
  const scope=this.scope;
  if(!scope||!this.channel||!this.auth?.isSignedIn||
    this.auth.userId!==scope.userId||
    (boardId!==null&&!validUuid(boardId)))return false;
  const event={version:1,type:'invalidate',sender:this.sender,
   sequence:++this.sequence,userId:scope.userId,workspaceId:scope.workspaceId,
   boardId,revision:validRevision(revision)?revision:null,at:this.clock()};
  try{this.channel.postMessage(event);return true;}catch{return false;}
 }
 receive(message){
  const scope=this.scope;
  if(!scope||!this.auth?.isSignedIn||this.auth.userId!==scope.userId||
    !message||typeof message!=='object'||Array.isArray(message)||
    message.version!==1||message.type!=='invalidate'||
    message.userId!==scope.userId||message.workspaceId!==scope.workspaceId||
    typeof message.sender!=='string'||message.sender.length>100||
    message.sender===this.sender||
    !Number.isSafeInteger(message.sequence)||message.sequence<1||
    (message.boardId!==null&&!validUuid(message.boardId))||
    !(message.revision===null||validRevision(message.revision))||
    !Number.isFinite(message.at)||Math.abs(this.clock()-message.at)>120000)
   return false;
  if(message.sequence<=(this.seen.get(message.sender)||0))return false;
  if(this.seen.size>=32&&!this.seen.has(message.sender))
   this.seen.delete(this.seen.keys().next().value);
  this.seen.set(message.sender,message.sequence);
  this.onInvalidate({boardId:message.boardId,revision:message.revision,
   userId:scope.userId,workspaceId:scope.workspaceId});
  return true;
 }
}
function validRevision(value){
 return typeof value==='string'&&value.length<=40&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)&&
  Number.isFinite(Date.parse(value));
}
