/** Material Request Hub — signed, item-scoped protected sourcing fields.
 * Sensitive values NEVER go through wm_get_board, public board cells, local
 * storage, or persistent reporting. Derived finance values are not edited.
 */
import {ApiError,} from './session.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP,MATERIAL_SOURCING_EXISTING,MATERIAL_SOURCING_ADDITIONS,isApprovedPublicMaterialSourcingColumn} from './material-sourcing-schema-plan.js';

const PRIVATE_FIELDS=Object.freeze(MATERIAL_SOURCING_ADDITIONS
 .filter(field=>field.exposure==='restricted'&&!field.derived)
 .map(field=>Object.freeze({name:field.name,type:field.type,options:field.options})));
const FIELD_BY_NAME=new Map(PRIVATE_FIELDS.map(field=>[field.name,field]));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const deny=(message,status=403)=>{throw new ApiError(message,status);};

export const materialSourcingProtectedFields=PRIVATE_FIELDS;
export const isMaterialSourcingBoard=board=>board?.id===MATERIAL_SOURCING_BOARD_ID&&
 board?.name==='Material Request Hub'&&board?.status==='active';

function validContext({api,auth,workspaceId,boardId,itemId}){
 if(boardId!==MATERIAL_SOURCING_BOARD_ID||!UUID.test(itemId||'')||
    !UUID.test(workspaceId||'')||!auth?.isSignedIn||
    !UUID.test(auth.userId||'')||typeof auth.getVerifiedUser!=='function'||
    !api?.context||!api?.allowed||!api?.rpc)
  deny('Signed sourcing context is unavailable.');
}
export async function authorizeMaterialSourcingItem({api,auth,workspaceId,boardId,itemId,edit=false}){
 validContext({api,auth,workspaceId,boardId,itemId});
 const userId=auth.userId;
 const verified=await auth.getVerifiedUser();
 if(verified?.id!==userId||!auth.isSignedIn||auth.userId!==userId)
  deny('Sourcing session changed.');
 const context=await api.context();
 if(context?.user_id!==userId||context?.workspace_id!==workspaceId||
    context?.profile?.status!=='active')
  deny('Sourcing workspace access denied.');
 if(await api.allowed(boardId,edit?'edit':'view')!==true)
  deny('Sourcing board permission denied.');
 const bootstrap=await api.rpc('material_request_hub_bootstrap',{p_workspace_id:workspaceId});
 if(bootstrap?.workspaceId!==workspaceId||bootstrap?.role!=='ADMIN')
  deny('Restricted sourcing access is unavailable.');
 if(!auth.isSignedIn||auth.userId!==userId)
  deny('Sourcing session changed.');
 return userId;
}

/** Fast post-RPC session verification. The RPC already enforces module role,
 * item scope and board permissions, so don't repeat expensive role preflights. */
export async function revalidateMaterialSourcingSession({api,auth,workspaceId},actor){
 if(!auth?.isSignedIn||auth.userId!==actor)deny('Sourcing session changed.');
 const verified=await auth.getVerifiedUser();
 if(!auth.isSignedIn||auth.userId!==actor||verified?.id!==actor)
  deny('Sourcing session changed.');
 const context=await api.context();
 if(!auth.isSignedIn||auth.userId!==actor||context?.user_id!==actor||
    context?.workspace_id!==workspaceId||context?.profile?.status!=='active')
  deny('Sourcing workspace or session changed.');
 return actor;
}

export function normalizeProtectedSourcingRead(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))
  deny('Invalid protected sourcing response.',502);
 const result=Object.create(null);
 for(const field of PRIVATE_FIELDS){
  const cell=payload[field.name];
  if(cell===undefined)continue;
  if(!cell||typeof cell!=='object'||Array.isArray(cell)||
     !Number.isSafeInteger(cell.revision)||cell.revision<1)
   deny('Invalid sourcing revision.',502);
  const value=cell.value;
  if(field.type==='number'){
   if(typeof value!=='number'||!Number.isFinite(value)||value<0)
    deny('Invalid sourcing numeric value.',502);
  }else if(field.options){
   if(!field.options.includes(value))deny('Invalid sourcing choice.',502);
  }else if(typeof value!=='string'||value.length>2000){
   deny('Invalid sourcing text.',502);
  }
  result[field.name]=Object.freeze({value,revision:cell.revision});
 }
 return Object.freeze(result);
}
export function parseProtectedSourcingValue(fieldName,raw){
 const field=FIELD_BY_NAME.get(fieldName);
 if(!field)deny('Unsupported protected sourcing field.',400);
 const value=String(raw??'').trim();
 if(field.type==='number'){
  if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)||
     value.length>20||!Number.isFinite(Number(value))||
     Number(value)>1e12)
   deny('Enter a nonnegative numeric value.',400);
  return Number(value);
 }
 if(field.options){
  if(!field.options.includes(value))deny('Select an allowed currency.',400);
  return value;
 }
 if(field.name==='Requestor'){
  if(!UUID.test(value))deny('Select a valid workspace member ID.',400);
  return value;
 }
 if(!value||value.length>2000)deny('Enter 1–2000 characters.',400);
 return value;
}

export async function readProtectedSourcingItem({api,auth,boardId,workspaceId,itemId}){
 const input={api,auth,boardId,workspaceId,itemId};
 const actor=await authorizeMaterialSourcingItem(input);
 const raw=await api.rpc('mrh_sourcing_sensitive_read',{
  p_board_id:boardId,p_item_id:itemId
 });
 if(!auth.isSignedIn||auth.userId!==actor)deny('Sourcing session changed.');
 // Server RPC enforces protected scope; recheck identity and workspace.
 await revalidateMaterialSourcingSession(input,actor);
 return normalizeProtectedSourcingRead(raw);
}
export async function writeProtectedSourcingField({
 api,auth,boardId,workspaceId,itemId,fieldName,value,expectedRevision=null
}){
 const input={api,auth,boardId,workspaceId,itemId};
 const actor=await authorizeMaterialSourcingItem({...input,edit:true});
 const parsed=parseProtectedSourcingValue(fieldName,value);
 if(expectedRevision!==null&&(!Number.isSafeInteger(expectedRevision)||expectedRevision<1))
  deny('Refresh the sourcing field before editing.',409);
 const result=await api.rpc('mrh_sourcing_sensitive_write',{
  p_board_id:boardId,p_item_id:itemId,p_field_name:fieldName,
  p_value:parsed,p_expected_revision:expectedRevision
 });
 await revalidateMaterialSourcingSession(input,actor);
 if(result?.field_name!==fieldName||!Number.isSafeInteger(result?.revision)||
    result.revision!==(expectedRevision===null?1:expectedRevision+1))
  deny('The sourcing write receipt is invalid; refresh before retrying.',409);
 return Object.freeze({fieldName,revision:result.revision});
}
export function renderProtectedSourcingEditor(cells,{editing=false}={}){
 const labels=Object.freeze({
  'Buying Price':'Buying price','Currency':'Currency','Shipping Cost':'Shipping cost',
  'Shipping Cost Currency':'Shipping currency','Vendor Details':'Vendor details'
 });
 const renderField=field=>{
  const cell=cells?.[field.name],raw=cell?.value;
  const rendered=raw===undefined||raw===null||raw===''?'—':String(raw);
  const control=field.options?
   '<select name="value" required aria-label="'+escape(field.name)+'">'+
   '<option value="">Select currency</option>'+
   field.options.map(x=>'<option value="'+escape(x)+'"'+(raw===x?' selected':'')+'>'+
    escape(x)+'</option>').join('')+'</select>':
   '<input name="value" required maxlength="'+(field.type==='number'?20:2000)+
   '" '+(field.type==='number'?'inputmode="decimal" type="text"':'type="text"')+
   ' value="'+escape(raw===undefined?'':String(raw))+'" aria-label="'+escape(field.name)+'" />';
  return '<div class="mrh-sourcing-field"><div class="mrh-sourcing-value">'+
   '<strong>'+escape(labels[field.name]||field.name)+'</strong>'+
   '<p>'+escape(rendered)+'</p></div>'+
   (editing?'<form data-mrh-private-field="'+escape(field.name)+'">'+
    '<label class="sr-only">Update '+escape(field.name)+'</label>'+control+
    '<button class="secondary" type="submit">Save</button>'+
    '</form>':'')+'</div>';
 };
 const named=name=>PRIVATE_FIELDS.find(field=>field.name===name);
 const section=(title,icon,fields)=>
  '<section class="mrh-private-section"><h3><span aria-hidden="true">'+icon+'</span>'+title+'</h3>'+
   '<div class="mrh-private-grid">'+fields.map(name=>renderField(named(name))).join('')+'</div></section>';
 return '<div class="mrh-sourcing-editor" aria-label="Protected Material Sourcing details">'+
  '<div role="status" aria-live="polite" data-mrh-private-status>'+
   (Object.keys(cells||{}).length===0?'No protected values entered yet. Use Edit protected fields to add values.':'')+
   '</div>'+
  section('Pricing & Cost','₱',['Buying Price','Currency'])+
  '<section class="mrh-private-section mrh-calculated-section"><h3><span aria-hidden="true">▤</span>Calculated totals</h3>'+
  '<p>Not calculated — verified exchange rates and approved landed-cost rules are not configured.</p></section>'+
  section('Logistics','▧',['Vendor Details','Shipping Cost','Shipping Cost Currency'])+
  (editing?'<p class="mrh-private-edit-note">Save each protected value individually. Revision checks prevent overwriting newer changes.</p>':'')+
  '</div>';
}

/** Add a real part number to the original Main group, never a demo fixture. */
export async function createMaterialSourcingPart({api,auth,workspaceId,partNumber}){
 const boardId=MATERIAL_SOURCING_BOARD_ID;
 const groupId=MATERIAL_SOURCING_GROUP.id;
 const itemId='00000000-0000-4000-8000-000000000000';
 const title=String(partNumber??'').trim();
 if(!title||title.length>240)deny('Part number must contain 1–240 characters.',400);
 if(typeof api?.addItem!=='function'||typeof api?.board!=='function')
  deny('Signed board creation is unavailable.');
 const actor=await authorizeMaterialSourcingItem({
  api,auth,workspaceId,boardId,itemId,edit:true
 });
 const detail=await api.board(boardId);
 if(detail?.board?.id!==boardId||detail?.board?.workspace_id!==workspaceId||
    detail.board.status!=='active'||!detail.groups?.some(group=>
     group.id===groupId&&group.title==='Main group'))
  deny('Original Material Sourcing board or Main group changed.',409);
 if(!auth.isSignedIn||auth.userId!==actor)deny('Sourcing session changed.');
 await authorizeMaterialSourcingItem({api,auth,workspaceId,boardId,itemId,edit:true});
 // The existing server RPC additionally checks current signed board edit access
 // and group ownership, and records an audit event.
 const savedId=await api.addItem(boardId,groupId,title);
 if(!UUID.test(savedId||''))deny('Creation receipt uncertain. Refresh before retrying.',409);
 if(!auth.isSignedIn||auth.userId!==actor)
  deny('Creation completed but the signed context changed. Refresh the board.',409);
 const fresh=await api.board(boardId);
 if(fresh?.board?.workspace_id!==workspaceId||
    !fresh.items?.some(row=>row.id===savedId&&row.group_id===groupId&&row.title===title))
  deny('Part creation could not be verified. Refresh before retrying.',409);
 return Object.freeze({itemId:savedId,partNumber:title});
}

/** On-demand, read-only genuine signed production readiness inspection.
 * Returns bounded nonsecret statuses only. No automatically created fixtures,
 * no sensitive values, no account names, no retained reports.
 */
export async function inspectMaterialSourcingSignedReadiness({api,auth}={}){
 if(!auth?.isSignedIn||!auth?.userId||!api?.context||!api?.board||
    !api?.allowed||!api?.rpc||!auth?.getVerifiedUser)
  deny('Verified Material Sourcing session required.');
 const userId=auth.userId;
 const verified=await auth.getVerifiedUser();
 const context=await api.context();
 if(!auth.isSignedIn||auth.userId!==userId||verified?.id!==userId||
    context?.user_id!==userId||context?.profile?.status!=='active'||
    !UUID.test(context?.workspace_id||''))
  deny('Current signed identity or workspace is unavailable.');
 const workspaceId=context.workspace_id;
 const boardId=MATERIAL_SOURCING_BOARD_ID;
 const boardAllowed=await api.allowed(boardId,'view')===true;
 if(!boardAllowed)deny('Material Request Hub board access denied.');
 const detail=await api.board(boardId);
 if(!isMaterialSourcingBoard(detail.board)||
    detail.board.workspace_id!==workspaceId||
    !detail.groups?.some(group=>group.id===MATERIAL_SOURCING_GROUP.id&&
      group.title===MATERIAL_SOURCING_GROUP.title))
  deny('Material Sourcing board or Main group changed.',409);
 const role=await api.rpc('material_request_hub_bootstrap',{p_workspace_id:workspaceId});
 if(role?.workspaceId!==workspaceId||role.role!=='ADMIN')
  deny('Active Material Request Hub ADMIN access required.');
 const currentColumns=Array.isArray(detail.columns)?detail.columns:[];
 const publicFields=MATERIAL_SOURCING_ADDITIONS.filter(f=>f.exposure==='ordinary');
 const verifiedFields=publicFields.filter(field=>currentColumns.some(column=>
  isApprovedPublicMaterialSourcingColumn(detail.board,column)&&
  column.name.trim().toLowerCase()===field.name.toLowerCase()));
 const existing=MATERIAL_SOURCING_EXISTING.every(field=>
  currentColumns.some(column=>column.name===field.name&&column.data_type===field.type));
 const items=Array.isArray(detail.items)?detail.items.filter(item=>
  UUID.test(item.id||'')&&item.group_id===MATERIAL_SOURCING_GROUP.id&&
  !item.archived_at):[];
 let privateRead='NO_PERSISTED_ITEM';
 // Test actual private RPC only against a real, authorized persisted item.
 if(items.length){
  await readProtectedSourcingItem({
   api,auth,boardId,workspaceId,itemId:items[0].id
  });
  privateRead='SIGNED_READ_VERIFIED';
 }
 const finalContext=await api.context();
 if(!auth.isSignedIn||auth.userId!==userId||
    finalContext?.user_id!==userId||finalContext?.workspace_id!==workspaceId)
  deny('Signed sourcing scope changed during readiness inspection.');
 return Object.freeze({
  status:existing?'SIGNED_READINESS_VERIFIED':'SCHEMA_DRIFT',
  originalGroup:'VERIFIED',
  originalColumns:existing?'VERIFIED':'DRIFT',
  publicColumnsVerified:verifiedFields.length,
  publicColumnsExpected:publicFields.length,
  signedDomainAdmin:'VERIFIED',
  privateRead,
  itemCount:items.length,
  writesPerformed:0,
  productionWriteAcceptance:'NOT_EXECUTED',
  crossRoleDenial:'NOT_EXECUTED'
 });
}
