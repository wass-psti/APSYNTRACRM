/**
 * Material Request Hub native host. No second sign-in, React root, local database or SDK.
 * This module owns only its ephemeral UI state. Database permissions are server-enforced.
 */
import {MaterialRequestHubClient} from './client.js';
import {parseMaterialRequestHubRoute,materialRequestHubHref} from './route.js';
import {renderMaterialRequestHub} from './ui.js';
import {MATERIAL_SOURCING_BOARD_ID} from '../../material-sourcing-schema-plan.js';

const issue=error=>{
 const base=String(error?.message||'The request could not be completed.').slice(0,350);
 return error?.mayHaveCommitted?
  'The server response was interrupted; the change may have been committed. Refresh the signed list before any retry. '+base:base;
};
class Controller{
 constructor({api,auth,userId,workspaceId}){
  this.client=new MaterialRequestHubClient({api,auth,userId,workspaceId});
  this.userId=userId;this.workspaceId=workspaceId;this.auth=auth;
  this.access=null;this.summary=null;this.items=[];this.cursor=null;
  this.selected=null;this.section='overview';this.requestId=null;
  this.search='';this.rejectId=null;this.editing=false;
  this.loading=false;this.busy=false;this.loaded=false;
  this.error='';this.notice='';this.run=0;this.alive=true;
  this.sourcingHref=null;this.container=null;
  this.onClick=event=>{void this.click(event);};
  this.onSubmit=event=>{void this.submit(event);};
 }
 same(seq){
  return this.alive&&seq===this.run&&this.auth.isSignedIn&&
   this.auth.userId===this.userId&&this.container?.isConnected===true;
 }
 attach(container,route,{hasSourcingBoard=false}={}){
  if(!container)return;
  if(this.container!==container){
   this.container?.removeEventListener('click',this.onClick);
   this.container?.removeEventListener('submit',this.onSubmit);
   this.container=container;
   this.container.addEventListener('click',this.onClick);
   this.container.addEventListener('submit',this.onSubmit);
  }
  this.sourcingHref=hasSourcingBoard?'#/boards/'+MATERIAL_SOURCING_BOARD_ID+'/sourcing':null;
  const changed=this.section!==route.section||this.requestId!==route.requestId;
  if(changed){
   this.section=route.section;this.requestId=route.requestId;
   this.rejectId=null;this.editing=false;this.search='';
   this.items=[];this.summary=null;this.cursor=null;
   this.loaded=false;this.notice='';this.error='';
   this.run++;
  }
  this.draw();
  if(!this.loaded&&!this.loading)void this.load();
 }
 draw(){
  if(!this.container?.isConnected)return;
  this.container.innerHTML=renderMaterialRequestHub({
   access:this.access,section:this.section,requestId:this.requestId,
   items:this.items,summary:this.summary,selected:this.selected,
   busy:this.busy,loading:this.loading,error:this.error,notice:this.notice,
   cursor:this.cursor,search:this.search,rejectId:this.rejectId,
   editing:this.editing,sourcingHref:this.sourcingHref
  });
 }
 async load(){
  const seq=++this.run;
  this.loading=true;this.error='';this.notice='';this.draw();
  try{
   const access=await this.client.bootstrap();
   if(!this.same(seq))return;
   this.access=access;
   if(this.requestId){
    const selected=await this.client.detail(this.requestId);
    if(!this.same(seq))return;
    this.selected=selected;
   }else if(this.section==='overview'){
    const summary=await this.client.summary();
    if(!this.same(seq))return;
    this.summary=summary;
   }else if(this.section!=='new-request'){
    const page=await this.client.list({section:this.section,search:this.search});
    if(!this.same(seq))return;
    this.items=page.items;this.cursor=page.cursor;
   }
   this.loaded=true;
  }catch(error){
   if(!this.same(seq))return;
   this.access=null;this.items=[];this.selected=null;this.summary=null;
   this.error=issue(error);
   this.loaded=true;
  }finally{
   if(this.same(seq)){this.loading=false;this.draw();}
  }
 }
 async loadMore(){
  if(this.busy||!this.cursor||!this.access||this.requestId)return;
  const seq=++this.run, cursor=this.cursor;
  this.busy=true;this.error='';this.draw();
  try{
   const page=await this.client.list({section:this.section,search:this.search,cursor});
   if(!this.same(seq))return;
   const present=new Set(this.items.map(x=>x.id));
   if(page.items.some(x=>present.has(x.id)))
    throw new Error('The request page overlapped existing results. Refresh to reconcile.');
   this.items=[...this.items,...page.items];this.cursor=page.cursor;
  }catch(error){if(this.same(seq))this.error=issue(error);}
  finally{if(this.same(seq)){this.busy=false;this.draw();}}
 }
 async change(action,requestId,version,reason=''){
  if(this.busy||!this.access)return;
  if(!Number.isSafeInteger(version)||version<1)return;
  const permission=action==='approve'?'approve':action==='reject'?'reject':'release';
  if(!this.access.capabilities.includes(permission))return;
  const seq=++this.run;
  this.busy=true;this.error='';this.notice='';this.draw();
  try{
   const result=await this.client.decide(action,requestId,version,reason);
   if(!this.same(seq))return;
   this.notice='Request '+result.id+' was '+(action==='approve'?'approved':action==='reject'?'rejected':'released')+'.';
   this.rejectId=null;
   if(this.requestId===requestId)this.selected=result;
   else{
    // Never patch a possibly stale page by guessing a new workflow projection.
    const page=await this.client.list({section:this.section,search:this.search});
    if(!this.same(seq))return;
    this.items=page.items;this.cursor=page.cursor;
   }
  }catch(error){if(this.same(seq))this.error=issue(error);}
  finally{if(this.same(seq)){this.busy=false;this.draw();}}
 }
 async click(event){
  const target=event.target.closest('[data-mrh-refresh],[data-mrh-load-more],[data-mrh-reject-open],[data-mrh-reject-cancel],[data-mrh-decision],[data-mrh-edit]');
  if(!target||!this.container?.contains(target))return;
  event.preventDefault();
  if(target.hasAttribute('data-mrh-refresh')){if(!this.busy)void this.load();return;}
  if(target.hasAttribute('data-mrh-load-more')){void this.loadMore();return;}
  if(this.busy)return;
  if(target.hasAttribute('data-mrh-reject-open')){
   this.rejectId=target.getAttribute('data-mrh-reject-open');this.draw();
   this.container.querySelector('.mrh-reject-form textarea')?.focus();return;
  }
  if(target.hasAttribute('data-mrh-reject-cancel')){this.rejectId=null;this.draw();return;}
  if(target.hasAttribute('data-mrh-edit')){this.editing=true;this.draw();return;}
  const action=target.getAttribute('data-mrh-decision');
  if(!action)return;
  const id=target.getAttribute('data-id'),version=Number(target.getAttribute('data-version'));
  if(!['approve','release'].includes(action))return;
  if(!window.confirm(action==='release'?'Confirm material release?':'Approve this material request?'))return;
  await this.change(action,id,version);
 }
 async submit(event){
  const form=event.target.closest('[data-mrh-form],[data-mrh-reject-form],[data-mrh-search],[data-mrh-comment]');
  if(!form||!this.container?.contains(form))return;
  event.preventDefault();
  if(this.busy||this.loading)return;
  if(form.hasAttribute('data-mrh-search')){
   this.search=String(new FormData(form).get('search')||'').trim().slice(0,120);
   this.loaded=false;void this.load();return;
  }
  if(form.hasAttribute('data-mrh-reject-form')){
   const id=form.getAttribute('data-mrh-reject-form');
   const reason=String(new FormData(form).get('reason')||'').trim();
   if(!reason)return;
   await this.change('reject',id,Number(form.getAttribute('data-version')),reason);return;
  }
  const seq=++this.run;
  this.busy=true;this.error='';this.notice='';this.draw();
  try{
   if(form.hasAttribute('data-mrh-comment')){
    if(!this.requestId)throw new Error('Open a request before commenting.');
    await this.client.comment(this.requestId,new FormData(form).get('text'));
    if(!this.same(seq))return;
    this.selected=await this.client.detail(this.requestId);
    if(!this.same(seq))return;
    this.notice='Update recorded.';
   }else{
    const values=Object.fromEntries(new FormData(form));
    const editing=form.getAttribute('data-mrh-form')==='edit';
    if(editing&&(!this.requestId||!this.selected))
     throw new Error('Refresh the saved request before editing.');
    const result=editing?
     await this.client.update(this.requestId,values,this.selected.version):
     await this.client.create(values);
    if(!this.same(seq))return;
    this.editing=false;
    this.selected=result;
    this.notice=editing?'Request changes saved.':'Request created.';
    if(!editing){location.hash=materialRequestHubHref('requests',result.id);}
   }
  }catch(error){
   if(this.same(seq)){
    const uncertain=error?.mayHaveCommitted||/network|timeout|interrupted|uncertain/i.test(String(error?.message||''));
    this.error=uncertain?'The request outcome cannot be confirmed. Do not submit again until you have checked All Requests. '+issue(error):issue(error);
   }
  }finally{if(this.same(seq)){this.busy=false;this.draw();}}
 }
 unmount(){
  this.alive=false;this.run++;
  this.container?.removeEventListener('click',this.onClick);
  this.container?.removeEventListener('submit',this.onSubmit);
  this.container=null;this.items=[];this.selected=null;this.summary=null;this.access=null;
 }
}
let controller=null;
export function mountMaterialRequestHubApplication(container,{auth,api,userId,workspaceId,
 routeHash='',hasSourcingBoard=false}={}){
 const path=String(routeHash).split('?')[0].replace(/^#\/?/,'').split('/');
 const route=parseMaterialRequestHubRoute(path);
 if(!route||!container)return;
 if(!controller||controller.userId!==userId||controller.workspaceId!==workspaceId||
    controller.auth!==auth){
  controller?.unmount();
  controller=new Controller({auth,api,userId,workspaceId});
 }
 controller.attach(container,route,{hasSourcingBoard});
}
export function unmountMaterialRequestHubApplication(){
 controller?.unmount();controller=null;
}
