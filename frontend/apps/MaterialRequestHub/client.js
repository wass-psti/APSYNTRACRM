/**
 * Signed Material Request Hub RPC adapter for the original request lifecycle.
 * Existing workspace, authentication, role assignments, audit and SQL remain authoritative.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses=Object.freeze({pending:'⏳ Pending',approved:'✅ Approved',rejected:'❌ Rejected'});
const roles=new Set(['ADMIN','REQUESTOR','APPROVER','WAREHOUSE','VIEWER']);
const capabilities=new Set(['view','create','edit','approve','reject','release','comment','attach','admin']);
const types=Object.freeze(['Client PO','Project BOM']);
const inventories=Object.freeze(['WASS Inventory','PSTI Inventory','WAO Inventory','IFAB']);
const invoices=Object.freeze(['Service Invoice','Sales Invoice','No Invoice']);
const fail=message=>{throw new Error(message);};
const text=(value,max=4000)=>typeof value==='string'?value.slice(0,max):'';
export function materialRequestStatus(value){
 return Object.keys(statuses).find(key=>statuses[key]===value)||null;
}
export function normalizeMaterialRequestRow(row){
 if(!row||typeof row!=='object'||Array.isArray(row)||
  typeof row.id!=='string'||!row.id||row.id.length>180||
  typeof row.name!=='string'||row.name.length>240||
  !materialRequestStatus(row.approvalStatus)||
  !Number.isSafeInteger(row.version)||row.version<1)
  fail('Material Request Hub returned an invalid request.');
 return Object.freeze({...row,
  id:row.id,name:row.name,version:row.version,
  status:materialRequestStatus(row.approvalStatus),
  creatorName:text(row.creator?.name,160),
  requestType:Array.isArray(row.typeOfRequest)?text(row.typeOfRequest[0],60):'',
  inventory:Array.isArray(row.sourceInventory)?text(row.sourceInventory[0],60):'',
  invoiceType:Array.isArray(row.typeOfInvoice)?text(row.typeOfInvoice[0],60):'',
  remarks:text(row.remarks,4000),
  rejectionReason:text(row.rejectionReason,2000)});
}
export function normalizeMaterialRequestBootstrap(value,{userId,workspaceId}={}){
 if(!value||value.workspaceId!==workspaceId||value.user?.id!==userId||
  !roles.has(value.role)||!Array.isArray(value.capabilities)||
  !value.capabilities.includes('view')||
  value.capabilities.some(cap=>!capabilities.has(cap)))
  fail('Material Request Hub signed access is unavailable.');
 return Object.freeze({
  role:value.role,userId,workspaceId,capabilities:Object.freeze([...new Set(value.capabilities)]),
  userName:text(value.user?.name,160)
 });
}
export function normalizeMaterialRequestPage(payload){
 if(!payload||!Array.isArray(payload.items)||payload.items.length>50||
  (payload.cursor!==null&&payload.cursor!==undefined&&
   (typeof payload.cursor!=='string'||!/^\d{1,9}$/.test(payload.cursor))))
  fail('Material Request Hub returned an invalid list page.');
 const ids=new Set();
 const items=payload.items.map(row=>{
  const item=normalizeMaterialRequestRow(row);
  if(ids.has(item.id))fail('Material Request Hub returned a duplicate request.');
  ids.add(item.id);return item;
 });
 return Object.freeze({items:Object.freeze(items),cursor:payload.cursor||null});
}
function safeNonnegative(raw){
 if(raw==null||String(raw).trim()==='')return null;
 const value=String(raw).trim();
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value)||value.length>24||
  !Number.isFinite(Number(value))||Number(value)>1e12)
  fail('Quantity must be a nonnegative number with no more than four decimals.');
 return Number(value);
}
function choice(value,allowed,name){
 const clean=String(value||'').trim();
 if(clean!==''&&!allowed.includes(clean))fail('Invalid '+name+'.');
 return clean;
}
export function materialRequestDraft(form){
 const name=String(form?.name||'').trim(),remarks=String(form?.remarks||'').trim();
 if(name.length<1||name.length>240)fail('Provide a request name (1–240 characters).');
 if(remarks.length>4000)fail('Remarks are limited to 4,000 characters.');
 return Object.freeze({
  name,typeOfRequest:choice(form.typeOfRequest,types,'request type'),
  sourceInventory:choice(form.sourceInventory,inventories,'inventory source'),
  typeOfInvoice:choice(form.typeOfInvoice,invoices,'invoice type'),
  requestedQty:safeNonnegative(form.requestedQty),remarks
 });
}
export class MaterialRequestHubClient{
 constructor({auth,api,userId,workspaceId}={}){
  if(!auth?.getVerifiedUser||!api?.context||!api?.rpc||
   !UUID.test(userId||'')||!UUID.test(workspaceId||''))
   fail('Signed Material Request Hub client configuration is unavailable.');
  this.auth=auth;this.api=api;this.userId=userId;this.workspaceId=workspaceId;
 }
 async identity(){
  if(!this.auth.isSignedIn||this.auth.userId!==this.userId)
   fail('Material Request Hub signed session changed.');
  const [user,context]=await Promise.all([this.auth.getVerifiedUser(),this.api.context()]);
  if(!this.auth.isSignedIn||this.auth.userId!==this.userId||
   user?.id!==this.userId||context?.user_id!==this.userId||
   context?.workspace_id!==this.workspaceId||context?.profile?.status!=='active')
   fail('Material Request Hub signed workspace changed.');
  return true;
 }
 async invoke(name,args={},write=false){
  await this.identity();
  // Request kind is explicitly set: mutations must never receive a read retry.
  const result=await this.api.rpc(name,{p_workspace_id:this.workspaceId,...args},
   {requestKind:write?'mutation':'read',retryableRead:!write});
  await this.identity();
  return result;
 }
 async bootstrap(){
  const raw=await this.invoke('material_request_hub_bootstrap');
  return normalizeMaterialRequestBootstrap(raw,{
   userId:this.userId,workspaceId:this.workspaceId});
 }
 async list({section='requests',search='',cursor=null}={}){
  const where={};
  if(section==='approvals')where.approvalStatus=[statuses.pending];
  else if(section==='release')where.approvalStatus=[statuses.approved];
  const term=String(search||'').trim().slice(0,120);
  if(term)where.name=term;
  if(cursor!==null&&(typeof cursor!=='string'||!/^\d{1,9}$/.test(cursor)))
   fail('Invalid request continuation cursor.');
  return normalizeMaterialRequestPage(await this.invoke('material_request_hub_list_requests',{
   p_where:where,p_sort:{},p_limit:25,p_cursor:cursor}));
 }
 async detail(requestId){
  if(typeof requestId!=='string'||!requestId||requestId.length>180)
   fail('Invalid request identifier.');
  const raw=await this.invoke('material_request_hub_get_request',{p_request_id:requestId});
  const row=normalizeMaterialRequestRow(raw);
  if(row.id!==requestId)fail('Signed request detail does not match the selected record.');
  return row;
 }
 async summary(){
  const [status,source,total]=await Promise.all([
   this.invoke('material_request_hub_aggregates',{p_group_by:'approvalStatus',p_metrics:[]}),
   this.invoke('material_request_hub_aggregates',{p_group_by:'sourceInventory',p_metrics:[]}),
   this.invoke('material_request_hub_aggregates',{p_group_by:null,p_metrics:[]})
  ]);
  if(!Array.isArray(status)||!Array.isArray(source)||!Array.isArray(total)||
   !total[0]||status.some(r=>!materialRequestStatus(r?.approvalStatus)||
   !Number.isSafeInteger(Number(r.count))||Number(r.count)<0)||
   source.some(r=>typeof r?.sourceInventory!=='string'||
   !Number.isSafeInteger(Number(r.count))||Number(r.count)<0)||
   !Number.isSafeInteger(Number(total[0].totalCount))||
   Number(total[0].totalCount)<0)fail('Material Request Hub aggregate response is invalid.');
  return Object.freeze({statuses:status,sources:source,total:Number(total[0].totalCount),
   requestedQty:Number(total[0].totalRequestedQty)||0});
 }
 async create(form){
  const scope=await this.bootstrap();
  if(!scope.capabilities.includes('create'))fail('Create permission is unavailable.');
  const draft=materialRequestDraft(form);
  const raw=await this.invoke('material_request_hub_create_request',{p_fields:draft},true);
  const receipt=normalizeMaterialRequestRow(raw);
  return this.detail(receipt.id);
 }
 async update(requestId,form,expectedVersion){
  const scope=await this.bootstrap();
  if(!scope.capabilities.includes('edit'))fail('Edit permission is unavailable.');
  await this.version(requestId,expectedVersion);
  const draft=materialRequestDraft(form);
  const raw=await this.invoke('material_request_hub_update_request',{
   p_request_id:requestId,p_fields:draft,p_expected_version:expectedVersion},true);
  const receipt=normalizeMaterialRequestRow(raw);
  if(receipt.id!==requestId||receipt.version!==expectedVersion+1)
   fail('The request update result is uncertain; refresh the request before retrying.');
  return this.detail(requestId);
 }
 async version(requestId,expectedVersion){
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)
   fail('Refresh the request before changing its status.');
  const current=await this.detail(requestId);
  if(current.version!==expectedVersion)
   fail('This request has changed. Refresh its latest version before proceeding.');
  return current;
 }
 async decide(action,requestId,expectedVersion,reason=''){
  const scope=await this.bootstrap();
  if(!['approve','reject','release'].includes(action)||
   !scope.capabilities.includes(action))fail('This action is not permitted for your role.');
  const current=await this.version(requestId,expectedVersion);
  if(action==='release'&&(current.status!=='approved'||current.releasedDate))
   fail('Only approved, unreleased requests can be released.');
  if(action!=='release'&&current.status!=='pending')
   fail('Only pending requests can be approved or rejected.');
  const args={p_request_id:requestId,p_expected_version:expectedVersion};
  const rpc=action==='approve'?'material_request_hub_approve_request':
   action==='reject'?'material_request_hub_reject_request':
   'material_request_hub_release_request';
  if(action==='reject'){
   const clean=String(reason||'').trim();
   if(!clean||clean.length>2000)fail('A rejection reason (1–2,000 characters) is required.');
   args.p_reason=clean;
  }
  const raw=await this.invoke(rpc,args,true);
  const receipt=normalizeMaterialRequestRow(raw);
  if(receipt.id!==requestId||receipt.version!==expectedVersion+1)
   fail('The action result is uncertain; refresh before retrying.');
  return this.detail(requestId);
 }
 async comment(requestId,textValue){
  const scope=await this.bootstrap();
  if(!scope.capabilities.includes('comment'))fail('Comment permission is unavailable.');
  const clean=String(textValue||'').trim();
  if(!clean||clean.length>8000)fail('A comment must contain 1–8,000 characters.');
  await this.detail(requestId);
  return this.invoke('material_request_hub_add_update',{p_request_id:requestId,p_text:clean},true);
 }
}
