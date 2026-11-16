import {frtActorLabel,frtEventLabel,frtAuditDetailEntries} from './frt-collaboration.js';
const e=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const date=value=>{const parsed=Date.parse(value);return Number.isFinite(parsed)?new Date(parsed).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'}):'—';};
export function renderFRTComments(comments,{currentUserId='',currentUserName=''}={}){
 if(!Array.isArray(comments)||!comments.length)return '<div class="frt-collab-empty">No comments yet. Start the discussion for this request.</div>';
 return '<ol class="frt-collab-thread">'+comments.map(comment=>'<li class="frt-collab-comment"><header><strong>'+e(frtActorLabel(comment.userId,{currentUserId,currentUserName}))+'</strong><time datetime="'+e(comment.createdAt)+'">'+e(date(comment.createdAt))+'</time></header><p>'+e(comment.body)+'</p></li>').join('')+'</ol>';
}
export function renderFRTActivityEvents(events,requests,{currentUserId='',currentUserName=''}={}){
 if(!Array.isArray(events)||!events.length)return '<div class="frt-collab-empty">No persisted activity events match these filters.</div>';
 const requestMap=new Map(requests.map(request=>[request.requestId,request]));
 return '<ol class="frt-collab-events">'+events.map(event=>{
  const request=requestMap.get(event.requestId);
  const details=frtAuditDetailEntries(event.details);
  return '<li class="frt-collab-event"><div class="frt-collab-event-main"><strong>'+e(frtEventLabel(event.action))+'</strong><time datetime="'+e(event.createdAt)+'">'+e(date(event.createdAt))+'</time></div><p>'+e(request?.voucher||'')+' · '+e(request?.title||event.requestId)+'</p><small>Actor: '+e(frtActorLabel(event.userId,{currentUserId,currentUserName}))+' · '+e(event.action)+'</small>'+(details.length?'<dl>'+details.map(item=>'<div><dt>'+e(item.label)+'</dt><dd>'+e(item.value)+'</dd></div>').join('')+'</dl>':'')+'</li>';
 }).join('')+'</ol>';
}
export function renderFRTActivityFilters({companies=[],requests=[],companyCode='',requestId='',action='',search=''}={}){
 const actions=['REQUEST_CREATED','FINANCE_APPROVED','REQUEST_REJECTED','GM_VERIFIED','BANK_EXECUTION_RECORDED','LIQUIDATION_SUBMITTED','LIQUIDATION_APPROVED','COMMENT_ADDED','FINANCE_APPROVAL_REVOKED','GM_VERIFICATION_REVOKED','REQUEST_CLOSED','REQUEST_ARCHIVED','REQUEST_FILING_STATUS_CHANGED','REQUEST_DATE_CORRECTED','REQUEST_PERSON_ASSIGNED'];
 return '<form class="frt-collab-filters" data-frt-activity-filters><label>Company<select name="companyCode">'+companies.map(company=>'<option value="'+e(company.code)+'"'+(company.code===companyCode?' selected':'')+'>'+e(company.name)+' ('+e(company.code)+')</option>').join('')+'</select></label><label>Request<select name="requestId"><option value="">All requests</option>'+requests.map(request=>'<option value="'+e(request.requestId)+'"'+(request.requestId===requestId?' selected':'')+'>'+e(request.voucher)+' · '+e(request.title)+'</option>').join('')+'</select></label><label>Action<select name="action"><option value="">All actions</option>'+actions.map(value=>'<option value="'+value+'"'+(action===value?' selected':'')+'>'+e(frtEventLabel(value))+'</option>').join('')+'</select></label><label class="frt-collab-search">Search<input name="search" type="search" maxlength="80" value="'+e(search)+'" placeholder="Action, voucher, reason…"/></label><button type="submit" class="primary">Apply filters</button></form>';
}
export function renderFRTNotifications(notifications,requests,{currentUserId='',currentUserName=''}={}){
 if(!Array.isArray(notifications)||!notifications.length)return '<div class="frt-collab-empty">No request notifications or upcoming liquidation deadlines for this company.</div>';
 const requestMap=new Map(requests.map(request=>[request.requestId,request]));
 return '<ol class="frt-collab-events frt-collab-notifications">'+notifications.map(item=>{
  const request=requestMap.get(item.requestId);
  const tone=item.type==='overdue'?'is-overdue':item.type==='due-soon'?'is-due-soon':'';
  return '<li class="frt-collab-event '+tone+'"><div class="frt-collab-event-main"><strong>'+e(item.title)+'</strong><time datetime="'+e(item.createdAt)+'">'+e(date(item.createdAt))+'</time></div><p>'+e(item.message)+'</p><button type="button" class="secondary" data-frt-notification-request="'+e(item.requestId)+'">Open '+e(request?.voucher||'request')+'</button></li>';
 }).join('')+'</ol>';
}
