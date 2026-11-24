/**
 * CP-CRM-GLOBAL-SEARCH-03A-03 — existing native application read adapters.
 * All calls reuse the current signed Supabase client and each application's
 * established RPC/RLS contract. This module contains no write operations.
 */
import {createNativeSearchAdapter} from './global-search-adapters.js';

const MODULES=Object.freeze({
 tools:'Tool Traceability',toolbox:'Toolbox Issues',materials:'Material Request Hub',
 evaluation:'Employee Evaluation',charter:'Charter Navigator',orders:'Order Intake',aims:'APS AIMS',fm1:'Feedmill Ticketing Portal'
});
const clean=value=>String(value??'').replace(/\s+/g,' ').trim().slice(0,120);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FM1_STATUSES=new Set(['New','Triaged','Assigned','In Progress','Waiting','Restored','Resolution Review','Closed','Reopened','Duplicate','Cancelled']);
const validFm1Ticket=(ticket,workspaceId)=>Boolean(ticket&&UUID.test(ticket.id||'')&&
 /^FM1-\d{4}-\d{6}$/.test(ticket.ticket_number||'')&&ticket.workspace_id===workspaceId&&
 Number.isSafeInteger(ticket.revision)&&Number.isFinite(Date.parse(ticket.received_at||''))&&FM1_STATUSES.has(ticket.status));
const words=query=>clean(query).toLocaleLowerCase().split(/\s+/).filter(Boolean);
const firstTerm=query=>words(query)[0]||'';
const matches=(query,fields)=>{
 const terms=words(query),text=fields.map(v=>String(v??'').toLocaleLowerCase());
 return terms.length>0&&terms.every(term=>text.some(value=>value.includes(term)));
};
const array=value=>Array.isArray(value)?value:[];
const safeRows=(result)=>{
 const rows=Array.isArray(result)?result:result?.items;
 if(!Array.isArray(rows)||rows.length>200)throw new Error('Native application search returned an invalid page.');
 return rows;
};
const escapeFilter=value=>String(value||'').replace(/[,*()\\]/g,' ').trim().slice(0,80);

async function signedIdentityScope({auth,api,userId,workspaceId}){
 const [user,context]=await Promise.all([auth.getVerifiedUser(),api.context()]);
 if(!user?.id||user.id!==userId||auth.userId!==userId||context?.user_id!==userId||
    context?.workspace_id!==workspaceId)
  throw new Error('Signed native-search workspace context changed.');
 return {userId,workspaceId};
}

function postgrestQuery(table,params){
 return '/rest/v1/'+table+'?'+new URLSearchParams(params).toString();
}
async function readOrderIntake({auth,workspaceId,query,limit}){
 const term=escapeFilter(firstTerm(query));if(term.length<2)return [];
 const rows=await auth.authorized(postgrestQuery('order_intake_orders',{
  select:'id,workspace_id,po_number,client_name,status,company,industry,po_date,date_received,delivery_date,currency,po_amount,fiscal_year,revision,updated_at',
  workspace_id:'eq.'+workspaceId,archived:'eq.false',
  or:`(po_number.ilike.*${term}*,client_name.ilike.*${term}*,status.ilike.*${term}*,company.ilike.*${term}*,industry.ilike.*${term}*)`,
  order:'updated_at.desc,id.desc',limit:String(limit)
 }));
 if(!Array.isArray(rows)||rows.length>limit)throw new Error('Order Intake search response is invalid.');
 return rows.filter(row=>row.workspace_id===workspaceId&&typeof row.id==='string').map(row=>({
  id:row.id,poNumber:row.po_number,clientName:row.client_name,status:row.status,
  company:row.company,industry:row.industry,poDate:row.po_date,
  dateReceived:row.date_received,deliveryDate:row.delivery_date,currency:row.currency,
  amount:row.po_amount,fiscalYear:row.fiscal_year,revision:row.revision,updatedAt:row.updated_at
 })).filter(row=>matches(query,[row.poNumber,row.clientName,row.status,row.company,row.industry,row.fiscalYear]));
}
async function readAims({auth,workspaceId,query,limit}){
 const term=escapeFilter(firstTerm(query));if(term.length<2)return [];
 const rows=await auth.authorized(postgrestQuery('aps_aims_entities',{
  select:'id,workspace_id,entity_type,payload,revision,created_at,updated_at',
  workspace_id:'eq.'+workspaceId,archived:'eq.false',
  or:`(entity_type.ilike.*${term}*,payload->>name.ilike.*${term}*,payload->>assetTag.ilike.*${term}*,payload->>serialNumber.ilike.*${term}*)`,
  order:'updated_at.desc,id.desc',limit:String(limit)
 }));
 if(!Array.isArray(rows)||rows.length>limit)throw new Error('APS AIMS search response is invalid.');
 return rows.filter(row=>row.workspace_id===workspaceId&&typeof row.id==='string').map(row=>({
  id:row.id,entityType:row.entity_type,payload:row.payload||{},revision:row.revision,
  createdAt:row.created_at,updatedAt:row.updated_at
 })).filter(row=>matches(query,[row.entityType,row.payload?.name,row.payload?.assetTag,row.payload?.serialNumber,row.payload?.status]));
}

export function createRemainingNativeSearchAdapters({auth,api,getBoards}={}){
 if(!auth||!api||typeof getBoards!=='function')throw new TypeError('Native application clients are required.');
 const identityScopes=new Map();
 const identityScope=context=>{
  const userId=context?.userId,workspaceId=context?.workspaceId;
  if(!userId||!workspaceId)throw new Error('A signed native-search workspace scope is required.');
  const key=userId+'|'+workspaceId;
  let pending=identityScopes.get(key);
  if(!pending){
   pending=signedIdentityScope({auth,api,userId,workspaceId});
   identityScopes.set(key,pending);
   pending.catch(()=>{if(identityScopes.get(key)===pending)identityScopes.delete(key);});
   while(identityScopes.size>4)identityScopes.delete(identityScopes.keys().next().value);
  }
  return pending;
 };
 const scope=async(applicationId,context)=>{
  const identity=await identityScope(context);
  if(applicationId==='fm1')return {...identity,boardId:null};
  const moduleName=MODULES[applicationId];
  const board=array(getBoards()).find(item=>item?.name===moduleName&&item?.status!=='trashed');
  if(!board?.id)throw new Error('The application board is not available in this workspace.');
  return {...identity,boardId:board.id};
 };
 const tools=createNativeSearchAdapter({
  id:'tool-traceability-tools',applicationId:'tools',name:'Tool Traceability',recordType:'Tool',
  read:async(query,context={})=>{
   const s=await scope('tools',context);
   const result=await api.rpc('tool_traceability_list_tools',{p_workspace_id:s.workspaceId,
    p_search:firstTerm(query).slice(0,90),p_category:null,p_availability:null,p_limit:Math.min(20,context.limit||20),p_cursor:null});
   return safeRows(result).filter(row=>row?.id&&matches(query,[row.name,row.category,row.itemType,row.availability]))
    .map(row=>({...row,nativeKind:'tools'}));
  },
  getId:row=>row.id,getTitle:row=>row.name||row.id,
  getSubtitle:row=>[row.category,row.availability].filter(Boolean).join(' · '),
  getExcerpt:row=>row.itemType||'Tool inventory',
  getSearchFields:row=>[row.name,row.category,row.itemType,row.availability],
  getNavigationScope:()=> 'tools',
  getHref:row=>nativeHref(getBoards(),'tools',row.id,'tools')
 });
 const requests=createNativeSearchAdapter({
  id:'tool-traceability-requests',applicationId:'tools',name:'Tool Traceability',recordType:'Tool request',
  read:async(query,context={})=>{
   const s=await scope('tools',context);
   const result=await api.rpc('tool_traceability_list_requests',{p_workspace_id:s.workspaceId,
    p_search:firstTerm(query).slice(0,90),p_status:null,p_extension_state:null,
    p_limit:Math.min(20,context.limit||20),p_cursor:null});
   return safeRows(result).filter(row=>row?.id&&matches(query,[row.name,row.reference,row.requestStatus,row.extensionState]))
    .map(row=>({...row,nativeKind:'requests'}));
  },
  getId:row=>row.id,getTitle:row=>row.reference||row.name||row.id,
  getSubtitle:row=>[row.name,row.requestStatus].filter(Boolean).join(' · '),
  getExcerpt:row=>row.extensionState||'',
  getSearchFields:row=>[row.reference,row.name,row.requestStatus,row.extensionState],
  getNavigationScope:()=> 'requests',
  getHref:row=>nativeHref(getBoards(),'tools',row.id,'requests')
 });
 const toolbox=createNativeSearchAdapter({
  id:'toolbox-issues',applicationId:'toolbox',name:'Toolbox Issues',recordType:'Issue',
  read:async(query,context={})=>{
   const s=await scope('toolbox',context),term=firstTerm(query).slice(0,120);
   const requests=[
    api.rpc('toolbox_issues_list_issues',{p_workspace_id:s.workspaceId,
     p_where:{name:term},p_order_by:{column:'updatedAt',direction:'desc'},p_limit:Math.min(20,context.limit||20),p_cursor:null}),
    api.rpc('toolbox_issues_list_issues',{p_workspace_id:s.workspaceId,
     p_where:{person:term},p_order_by:{column:'updatedAt',direction:'desc'},p_limit:Math.min(20,context.limit||20),p_cursor:null})
   ];
   const pages=await Promise.all(requests),seen=new Set(),rows=[];
   for(const page of pages)for(const row of safeRows(page))if(row?.id&&!seen.has(String(row.id))){
    seen.add(String(row.id));if(matches(query,[row.name,row.status,row.date,row.person,row.targetDate]))rows.push(row);
   }
   return rows.slice(0,Math.min(20,context.limit||20));
  },
  getId:row=>row.id,getTitle:row=>row.name||'Untitled issue',
  getSubtitle:row=>[row.status,row.date].filter(Boolean).join(' · '),
  getExcerpt:row=>Array.isArray(row.person)?row.person.map(p=>p?.name).filter(Boolean).join(', '):'',
  getSearchFields:row=>[row.name,row.status,row.date,row.person],
  getHref:row=>nativeHref(getBoards(),'toolbox',row.id)
 });
 const materials=createNativeSearchAdapter({
  id:'material-request-hub',applicationId:'materials',name:'Material Request Hub',recordType:'Material request',
  read:async(query,context={})=>{
   const s=await scope('materials',context),term=firstTerm(query).slice(0,120),limit=Math.min(20,context.limit||20);
   const pages=await Promise.all([
    api.rpc('material_request_hub_list_requests',{p_workspace_id:s.workspaceId,
     p_where:{name:term},p_sort:{column:'createdAt',direction:'desc'},p_limit:limit,p_cursor:null}),
    api.rpc('material_request_hub_list_requests',{p_workspace_id:s.workspaceId,
     p_where:{sourceInventory:{contains:term}},p_sort:{column:'createdAt',direction:'desc'},p_limit:limit,p_cursor:null})
   ]);
   const seen=new Set(),rows=[];
   for(const page of pages)for(const row of safeRows(page))if(row?.id&&!seen.has(String(row.id))){
    seen.add(String(row.id));if(matches(query,[row.name,row.approvalStatus,row.typeOfRequest,row.sourceInventory]))rows.push(row);
   }
   return rows.slice(0,limit).map(row=>({...row,nativeKind:'materials'}));
  },
  getId:row=>row.id,getTitle:row=>row.name||row.id,
  getSubtitle:row=>[row.approvalStatus,row.typeOfRequest].filter(Boolean).join(' · '),
  getExcerpt:row=>row.sourceInventory||'',
  getSearchFields:row=>[row.name,row.approvalStatus,row.typeOfRequest,row.sourceInventory],
  getHref:row=>nativeHref(getBoards(),'materials',row.id)
 });
 const evaluation=createNativeSearchAdapter({
  id:'employee-evaluation',applicationId:'evaluation',name:'Employee Evaluation',recordType:'Performance evaluation',
  read:async(query,context={})=>{
   const s=await scope('evaluation',context);
   const results=await Promise.allSettled([
    api.rpc('employee_evaluation_management_snapshot',{}),
    api.rpc('employee_evaluation_my_snapshot',{})
   ]);
   const snapshots=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
   if(!snapshots.length)throw results.find(r=>r.status==='rejected')?.reason||new Error('Employee Evaluation search is unavailable.');
   const byId=new Map();
   for(const snapshot of snapshots){
    const employees=new Map(array(snapshot?.employees).map(row=>[row.id,row]));
    const self=snapshot?.employee;
    for(const row of array(snapshot?.evaluations)){
     const employee=employees.get(row.employee_id)||
      (self?.id===row.employee_id?self:null);
     const mapped={...row,employeeName:employee?.name||employee?.full_name||'Employee'};
     if(matches(query,[mapped.employeeName,row.period,row.status,row.overall_score]))byId.set(row.id,mapped);
    }
   }
   return [...byId.values()].slice(0,Math.min(20,context.limit||20));
  },
  getId:row=>row.id,getTitle:row=>row.employeeName||'Employee evaluation',
  getSubtitle:row=>[row.period,row.status].filter(Boolean).join(' · '),
  getExcerpt:row=>row.overall_score==null?'':`Score ${row.overall_score}`,
  getSearchFields:row=>[row.employeeName,row.period,row.status,row.overall_score],
  getHref:row=>nativeHref(getBoards(),'evaluation',row.id)
 });
 const charter=createNativeSearchAdapter({
  id:'charter-navigator',applicationId:'charter',name:'Charter Navigator',recordType:'Charter booking',
  read:async(query,context={})=>{
   const s=await scope('charter',context);
   const result=await auth.authorized('/rest/v1/rpc/charter_dispatch',{method:'POST',body:{p_workspace_id:s.workspaceId,
    p_path:'/items/query',p_method:'POST',p_body:{where:{name:firstTerm(query).slice(0,120)},
     orderBy:{column:'updatedAt',direction:'desc'},pagination:{limit:Math.min(20,context.limit||20)}}}});
   return safeRows(result).filter(row=>row?.id&&matches(query,[row.name,row.bookingStatus,row.tripDate,row.tier,row.session]));
  },
  getId:row=>row.id,getTitle:row=>row.name||row.id,
  getSubtitle:row=>[row.bookingStatus,row.tripDate].filter(Boolean).join(' · '),
  getExcerpt:row=>[row.tier,row.session].filter(Boolean).join(' · '),
  getSearchFields:row=>[row.name,row.bookingStatus,row.tripDate,row.tier,row.session],
  getHref:row=>nativeHref(getBoards(),'charter',row.id)
 });
 const orders=createNativeSearchAdapter({
  id:'order-intake',applicationId:'orders',name:'Order Intake',recordType:'Purchase order',
  read:async(query,context={})=>{
   const s=await scope('orders',context);
   return readOrderIntake({auth,workspaceId:s.workspaceId,query,limit:Math.min(20,context.limit||20)});
  },
  getId:row=>row.id,getTitle:row=>row.poNumber||row.id,
  getSubtitle:row=>[row.clientName,row.status].filter(Boolean).join(' · '),
  getExcerpt:row=>[row.company,row.dateReceived].filter(Boolean).join(' · '),
  getSearchFields:row=>[row.poNumber,row.clientName,row.status,row.company,row.industry,row.fiscalYear],
  getHref:row=>nativeHref(getBoards(),'orders',row.id)
 });
 const aims=createNativeSearchAdapter({
  id:'aps-aims',applicationId:'aims',name:'APS AIMS',recordType:'Asset and inventory record',
  read:async(query,context={})=>{
   const s=await scope('aims',context);
   return readAims({auth,workspaceId:s.workspaceId,query,limit:Math.min(20,context.limit||20)});
  },
  getId:row=>row.id,getTitle:row=>row.payload?.name||row.payload?.assetTag||row.entityType,
  getSubtitle:row=>[row.entityType,row.payload?.status].filter(Boolean).join(' · '),
  getExcerpt:row=>row.payload?.serialNumber||row.payload?.assetTag||'',
  getSearchFields:row=>[row.entityType,row.payload?.name,row.payload?.assetTag,row.payload?.serialNumber,row.payload?.status],
  getHref:row=>nativeHref(getBoards(),'aims',row.id)
 });
 const fm1=createNativeSearchAdapter({
  id:'fm1-incidents',applicationId:'fm1',name:'Feedmill Ticketing Portal',recordType:'Incident ticket',
  read:async(query,context={})=>{
   const s=await scope('fm1',context),term=firstTerm(query).slice(0,160);
   if(term.length<2)return [];
   const result=await api.rpc('fm1_list_tickets_v1',{p_workspace_id:s.workspaceId,
    p_limit:Math.min(20,context.limit||20),p_offset:0,p_search:term,p_status:null,p_priority:null});
   const rows=safeRows(result);
   return rows.filter(row=>validFm1Ticket(row,s.workspaceId)&&
    matches(query,[row.ticket_number,row.subject,row.requester_name,row.status,row.priority_effective]))
    .map(row=>({...row,nativeKind:'fm1'}));
  },
  getId:row=>row.id,getTitle:row=>row.ticket_number,
  getSubtitle:row=>[row.subject,row.status].filter(Boolean).join(' · '),
  getExcerpt:row=>[row.priority_effective,row.requester_name].filter(Boolean).join(' · '),
  getSearchFields:row=>[row.ticket_number,row.subject,row.requester_name,row.status,row.priority_effective],
  getHref:row=>nativeHref(getBoards(),'fm1',row.id)
 });

 return Object.freeze([tools,requests,toolbox,materials,evaluation,charter,orders,aims,fm1]);
}

function nativeHref(boards,moduleKey,recordId,scopeValue=''){
 if(moduleKey==='fm1')return '#/fm1/ticket/'+encodeURIComponent(String(recordId));
 if(moduleKey==='orders')return '#/order-intake/all-orders/record/'+encodeURIComponent(String(recordId));
 const name=MODULES[moduleKey],board=array(boards).find(item=>item?.name===name&&item?.status!=='trashed');
 return board?.id?'#/boards/'+board.id+'/native/'+moduleKey+'/'+encodeURIComponent(String(recordId))+
  (scopeValue?'/'+scopeValue:''):'#/boards';
}

export async function readNativeSearchRecordDetail({applicationId,recordId,navigationScope='',auth,api,workspaceId}={}){
 if(!auth||!api||typeof recordId!=='string'||!recordId||recordId.length>180)
  throw new TypeError('Invalid native record detail request.');
 const context=await api.context(),user=await auth.getVerifiedUser();
 if(!user?.id||auth.userId!==user.id||context?.user_id!==user.id||
    context?.workspace_id!==workspaceId)
  throw new Error('Signed native record context changed.');
 switch(applicationId){
  case 'fm1':{
   if(!UUID.test(recordId))throw new TypeError('Invalid FM1 ticket identifier.');
   const detail=await api.rpc('fm1_ticket_detail_v1',{p_workspace_id:workspaceId,p_ticket_id:recordId});
   if(!detail||!validFm1Ticket(detail.ticket,workspaceId)||
      !['obligations','events','milestones','holds','audit','conversations'].every(key=>Array.isArray(detail[key])))
    throw new Error('FM1 ticket detail response could not be verified.');
   return detail;
  }
  case 'tools':
   return api.rpc('tool_traceability_get_item',{p_workspace_id:workspaceId,
    p_board:navigationScope==='requests'?'requests':'tools',p_item_id:recordId});
  case 'toolbox':
   return api.rpc('toolbox_issues_get_issue',{p_workspace_id:workspaceId,p_issue_id:recordId});
  case 'materials':
   return api.rpc('material_request_hub_get_request',{p_workspace_id:workspaceId,p_request_id:recordId});
  case 'evaluation':{
   const snapshots=await Promise.allSettled([
    api.rpc('employee_evaluation_management_snapshot',{}),api.rpc('employee_evaluation_my_snapshot',{})
   ]);
   for(const result of snapshots)if(result.status==='fulfilled'){
    const snapshot=result.value;
    const found=array(snapshot?.evaluations).find(row=>row.id===recordId);
    if(found){
     const employee=array(snapshot?.employees).find(row=>row.id===found.employee_id)||
      (snapshot?.employee?.id===found.employee_id?snapshot.employee:null);
     return {...found,employeeName:employee?.name||employee?.full_name||'Employee'};
    }
   }
   throw new Error('The evaluation is no longer available in the signed application view.');
  }
  case 'charter':
   return auth.authorized('/rest/v1/rpc/charter_dispatch',{method:'POST',body:{
    p_workspace_id:workspaceId,p_path:'/items/'+recordId,p_method:'GET',p_body:{}}});
  case 'orders':{
   const rows=await auth.authorized(postgrestQuery('order_intake_orders',{
    select:'id,workspace_id,po_number,client_name,po_date,date_received,delivery_date,currency,po_amount,vat_rate,vat_exclusive_amount,vat_amount,procurement_expenses,gross_profit,status,company,industry,account_manager,buyer_in_charge,end_user_in_charge,notes,fiscal_year,revision,created_at,updated_at',
    id:'eq.'+recordId,workspace_id:'eq.'+workspaceId,archived:'eq.false',limit:'1'
   }));
   if(!Array.isArray(rows)||rows.length!==1)throw new Error('Order Intake record is unavailable.');
   return rows[0];
  }
  case 'aims':{
   const rows=await auth.authorized(postgrestQuery('aps_aims_entities',{
    select:'id,workspace_id,entity_type,payload,revision,created_at,updated_at',
    id:'eq.'+recordId,workspace_id:'eq.'+workspaceId,archived:'eq.false',limit:'1'
   }));
   if(!Array.isArray(rows)||rows.length!==1)throw new Error('APS AIMS record is unavailable.');
   return rows[0];
  }
  default:throw new Error('Unsupported native application detail route.');
 }
}

export function renderNativeSearchRecordDetail(record,{escape=value=>String(value??'')}={}){
 if(!record||typeof record!=='object'||Array.isArray(record))return '<p class="muted">No record details are available.</p>';
 const entries=Object.entries(record).filter(([key])=>!['workspace_id','created_by','auth_user_id'].includes(key)).slice(0,60);
 return '<dl class="native-search-detail-fields">'+entries.map(([key,value])=>{
  let display;
  if(value===null||value===undefined||value==='')display='—';
  else if(typeof value==='object')display=JSON.stringify(value);
  else display=String(value);
  return '<div class="native-search-detail-field"><dt>'+escape(key.replace(/([A-Z])/g,' $1').replace(/_/g,' '))+
   '</dt><dd>'+escape(display.slice(0,1800))+'</dd></div>';
 }).join('')+'</dl>';
}
