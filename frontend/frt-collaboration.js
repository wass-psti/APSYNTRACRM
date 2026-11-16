/** FRT operational collaboration reads and comment writes using existing contracts. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const companyPattern=/^[A-Za-z0-9_-]{1,32}$/;
const actionLabels=Object.freeze({
 REQUEST_CREATED:'Fund request submitted',FINANCE_APPROVED:'Finance approval recorded',
 REQUEST_REJECTED:'Fund request rejected',GM_VERIFIED:'General Manager verification recorded',
 BANK_EXECUTION_RECORDED:'Bank execution recorded',LIQUIDATION_SUBMITTED:'Liquidation submitted',
 LIQUIDATION_APPROVED:'Liquidation approved',COMMENT_ADDED:'Discussion comment added',
 FINANCE_APPROVAL_REVOKED:'Finance approval revoked',GM_VERIFICATION_REVOKED:'GM verification revoked',
 REQUEST_CLOSED:'Fund request closed',REQUEST_ARCHIVED:'Fund request archived',
 REQUEST_FILING_STATUS_CHANGED:'Filing status changed',REQUEST_DATE_UPDATED:'Required date updated',
 REQUEST_PERSON_ASSIGNED:'Request assignee updated',REQUEST_DATE_CORRECTED:'Required date corrected'
});
const fail=(message,status=400,code='FRT_COLLABORATION_INVALID')=>{
 const error=new Error(message);error.status=status;error.code=code;return error;
};
const validObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const safeText=(value,max)=>typeof value==='string'&&value.length<=max?value:null;
const isoDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const encodeParams=params=>new URLSearchParams(params).toString();
function requireScope({workspaceId,requestId}={}){
 if(!uuid.test(workspaceId||'')||!uuid.test(requestId||''))throw fail('Invalid FRT workspace or request identifier.');
}
async function readRows(auth,table,params){
 if(!auth?.isSignedIn||typeof auth.authorized!=='function')throw fail('A signed FRT session is required.',401);
 const response=await auth.authorized('/rest/v1/'+table+'?'+encodeParams(params),{method:'GET'});
 if(!Array.isArray(response))throw fail('FRT '+table+' read returned an invalid response.',502,'FRT_READ_CONTRACT_INVALID');
 return response;
}
function projectComment(row,workspaceId,requestId){
 if(!validObject(row)||!uuid.test(row.id||'')||row.workspace_id!==workspaceId||
  row.fund_request_id!==requestId||!uuid.test(row.user_id||'')||
  !safeText(row.body,4000)||!row.body.trim()||!isoDate(row.created_at))
  throw fail('FRT comment response contract is invalid.',502,'FRT_COMMENT_CONTRACT_INVALID');
 return {id:row.id,workspaceId:row.workspace_id,requestId:row.fund_request_id,
  userId:row.user_id,body:row.body,createdAt:row.created_at};
}
export async function loadFRTComments({auth,workspaceId,requestId,limit=100}={}){
 requireScope({workspaceId,requestId});
 if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw fail('Invalid comment page size.');
 const rows=await readRows(auth,'frt_comments',{select:'id,workspace_id,fund_request_id,user_id,body,created_at',
  workspace_id:'eq.'+workspaceId,fund_request_id:'eq.'+requestId,
  order:'created_at.asc,id.asc',limit:String(limit)});
 if(rows.length>limit)throw fail('FRT comment page exceeded its limit.',502);
 return rows.map(row=>projectComment(row,workspaceId,requestId));
}
export async function addFRTComment({api,workspaceId,requestId,body}={}){
 requireScope({workspaceId,requestId});
 if(typeof body!=='string'||body.trim().length<1||body.length>4000)throw fail('Enter a comment of up to 4,000 characters.');
 const result=await api?.rpc?.('frt_add_comment',{p_workspace_id:workspaceId,p_request_id:requestId,p_body:body.trim()});
 if(result?.ok!==true)throw fail('FRT comment could not be confirmed. Refresh the discussion before retrying.',409,'FRT_COMMENT_WRITE_UNCONFIRMED');
 return {ok:true};
}
function validateRequestRows(rows,workspaceId,companyCode){
 if(!Array.isArray(rows)||rows.length>100)throw fail('FRT safe request list is invalid.',502);
 const seen=new Set();
 return rows.map(row=>{
  if(!validObject(row)||!uuid.test(row.id||'')||row.workspace_id!==workspaceId||
   row.company_code!==companyCode||!safeText(row.title,250)||!safeText(row.voucher_no,100)&&row.voucher_no!==null||
   !safeText(row.status,70)||!['NOT_FILED','FILED'].includes(row.filing_status)||seen.has(row.id))
   throw fail('FRT safe request row contract is invalid.',502);
  seen.add(row.id);return {requestId:row.id,title:row.title,voucher:row.voucher_no||'—',
   status:row.status,liquidationStatus:row.liquidation_status,filingStatus:row.filing_status};
 });
}
function validateAuditRow(row,workspaceId,allowedIds){
 const id=typeof row?.id==='number'||typeof row?.id==='string'?String(row.id):'';
 if(!/^\d+$/.test(id)||!validObject(row)||row.workspace_id!==workspaceId||
  !uuid.test(row.fund_request_id||'')||!allowedIds.has(row.fund_request_id)||
  !(row.user_id===null||uuid.test(row.user_id||''))||!safeText(row.action,100)||
  !validObject(row.details)||!isoDate(row.created_at))
  throw fail('FRT audit event contract is invalid.',502,'FRT_AUDIT_CONTRACT_INVALID');
 return {id,workspaceId:row.workspace_id,requestId:row.fund_request_id,userId:row.user_id,
  action:row.action,details:row.details,createdAt:row.created_at};
}
export async function loadFRTAuditPage({auth,api,workspaceId,companyCode,requestId='',action='',search='',offset=0,limit=50}={}){
 if(!uuid.test(workspaceId||'')||!companyPattern.test(companyCode||''))throw fail('Invalid FRT activity scope.');
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000||!Number.isSafeInteger(limit)||limit<1||limit>100)
  throw fail('Invalid FRT activity page.');
 const rawRequests=await api.rpc('frt_board_list_safe',{p_workspace_id:workspaceId,p_company:companyCode,p_search:''});
 const requests=validateRequestRows(rawRequests,workspaceId,companyCode);
 if(requestId&&!requests.some(row=>row.requestId===requestId))throw fail('Selected request is not in the current company list.',409);
 if(!requests.length)return {requests,events:[],hasMore:false,offset,limit};
 const ids=requestId?[requestId]:requests.map(row=>row.requestId);
 const params={select:'id,workspace_id,fund_request_id,user_id,action,details,created_at',
  workspace_id:'eq.'+workspaceId,fund_request_id:'in.('+ids.join(',')+')',
  order:'created_at.desc,id.desc',limit:String(limit+1),offset:String(offset)};
 if(action)params.action='eq.'+action;
 const term=String(search||'').trim().slice(0,80).replace(/[^\p{L}\p{N} ._@-]/gu,'');
 if(term.length>=2){
  const pattern='*'+term+'*';
  params.or='(action.ilike.'+pattern+',details->>reason.ilike.'+pattern+
   ',details->>voucher.ilike.'+pattern+',details->>company.ilike.'+pattern+
   ',details->>reference.ilike.'+pattern+')';
 }
 const rows=await readRows(auth,'frt_audit_logs',params);
 if(rows.length>limit+1)throw fail('FRT audit page exceeded its limit.',502);
 const allowedIds=new Set(ids),events=rows.slice(0,limit).map(row=>validateAuditRow(row,workspaceId,allowedIds));
 return {requests,events,hasMore:rows.length>limit,offset,limit};
}
export async function loadFRTDeadlineSnapshots({api,workspaceId,requests=[],concurrency=6}={}){
 if(!uuid.test(workspaceId||'')||!Array.isArray(requests)||requests.length>100||
  !Number.isSafeInteger(concurrency)||concurrency<1||concurrency>12)
  throw fail('Invalid FRT deadline snapshot scope.');
 const candidates=requests.filter(request=>request?.status==='DONE'&&request?.liquidationStatus!=='APPROVED');
 const results=[];let cursor=0;
 const worker=async()=>{
  while(cursor<candidates.length){
   const request=candidates[cursor++];
   try{
    const snapshot=await api.rpc('frt_bank_execution_snapshot',{p_workspace_id:workspaceId,p_request_id:request.requestId});
    if(!validObject(snapshot)||snapshot.workspaceId!==workspaceId||snapshot.requestId!==request.requestId||
     typeof snapshot.recorded!=='boolean'||typeof snapshot.eligible!=='boolean'||
     !['NOT_SUBMITTED','SUBMITTED','APPROVED'].includes(snapshot.liquidationStatus)||
     !['NO_BANK_EXECUTION','STAFF_RECORDED_BANK_EVIDENCE'].includes(snapshot.source)||
     (snapshot.recorded&&(!isoDate(snapshot.executedAt)||!isoDate(snapshot.deadlineAt)||
      snapshot.source!=='STAFF_RECORDED_BANK_EVIDENCE'||
      Date.parse(snapshot.deadlineAt)-Date.parse(snapshot.executedAt)!==72*60*60*1000))||
     (!snapshot.recorded&&(snapshot.executedAt!==null||snapshot.deadlineAt!==null||snapshot.source!=='NO_BANK_EXECUTION')))
      throw fail('FRT bank execution snapshot contract is invalid.',502,'FRT_BANK_SNAPSHOT_INVALID');
    if(snapshot.recorded)results.push({requestId:request.requestId,snapshot});
   }catch(error){results.push({requestId:request.requestId,error});}
  }
 };
 await Promise.all(Array.from({length:Math.min(concurrency,candidates.length)},worker));
 return results;
}

export function frtActorLabel(userId,{currentUserId='',currentUserName=''}={}){
 if(!userId)return 'System';
 if(userId===currentUserId&&currentUserName)return currentUserName;
 return 'Member · '+userId.slice(0,8);
}
export function frtEventLabel(action){return actionLabels[action]||String(action||'FRT activity').replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase());}
const detailLabels=Object.freeze({voucher:'Voucher',company:'Company',total:'Total',reason:'Reason',reference:'Reference',
 gmVerificationCleared:'GM verification cleared',executedAt:'Executed at',bankName:'Bank',
 transactionReference:'Bank reference',bankSource:'Bank evidence',expectedStatus:'Previous status',
 nextStatus:'New status',filingStatus:'Filing status',from:'Previous value',to:'New value'});
export function frtAuditDetailEntries(details){
 if(!validObject(details))return [];
 return Object.entries(detailLabels).filter(([key])=>Object.hasOwn(details,key)&&
  ['string','number','boolean'].includes(typeof details[key])).map(([key,label])=>({label,value:String(details[key])}));
}
function csvCell(value){return '"'+String(value??'').replace(/"/g,'""')+'"';}
export function frtAuditCsv(events,requestMap=new Map()){
 const header=['Timestamp','Action','Actor ID','Request ID','Voucher','Request title','Details'];
 const rows=(Array.isArray(events)?events:[]).map(event=>{
  const request=requestMap.get(event.requestId);
  const details=frtAuditDetailEntries(event.details).map(entry=>entry.label+': '+entry.value).join('; ');
  return [event.createdAt,event.action,event.userId||'',event.requestId,request?.voucher||'',request?.title||'',details];
 });
 return '\uFEFF'+[header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
export function projectFRTNotifications({events=[],requests=[],bankSnapshots=[],now=Date.now()}={}){
 const requestMap=new Map(requests.map(request=>[request.requestId,request]));
 const notifications=[];
 for(const event of events){
  const request=requestMap.get(event.requestId);if(!request)continue;
  notifications.push({id:'event-'+event.id,type:'event',action:event.action,
   title:frtEventLabel(event.action),message:request.voucher+' · '+request.title,
   requestId:event.requestId,createdAt:event.createdAt,sortAt:Date.parse(event.createdAt)});
 }
 for(const entry of bankSnapshots){
  const snapshot=entry?.snapshot,request=requestMap.get(entry?.requestId);
  if(!request||snapshot?.recorded!==true||snapshot.liquidationStatus==='APPROVED'||
   snapshot.source!=='STAFF_RECORDED_BANK_EVIDENCE')continue;
  const deadline=Date.parse(snapshot.deadlineAt);if(!Number.isFinite(deadline))continue;
  const remaining=deadline-now;
  if(remaining<=0){
   notifications.push({id:'deadline-overdue-'+entry.requestId,type:'overdue',
    title:'Liquidation overdue',message:request.voucher+' · 72-hour deadline passed',
    requestId:entry.requestId,createdAt:snapshot.deadlineAt,sortAt:Number.MAX_SAFE_INTEGER});
  }else if(remaining<=24*60*60*1000){
   notifications.push({id:'deadline-soon-'+entry.requestId,type:'due-soon',
    title:'Liquidation due within 24 hours',message:request.voucher+' · Deadline '+snapshot.deadlineAt,
    requestId:entry.requestId,createdAt:snapshot.deadlineAt,sortAt:Number.MAX_SAFE_INTEGER-1});
  }
 }
 return notifications.sort((a,b)=>b.sortAt-a.sortAt);
}
