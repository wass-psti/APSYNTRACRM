/** TradeLink-specific Board Items contract. No source records or file URLs are synthesized. */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
export const TRADELINK_BOARD_ID='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
export const TRADELINK_WORKFLOW_STATUS=Object.freeze(['For Approval','Submitted','Approved','Draft']);
export const TRADELINK_QUOTE_STATUS=Object.freeze(['Submitted','Won','Expired','Closed','Under Negotiation','Delivered','Canceled','On-Hold','Lost','Working on it','Approved']);
export const TRADELINK_FIELDS=Object.freeze([
 {name:'Person',type:'people'},
 {name:'Workflow Status',type:'status',options:TRADELINK_WORKFLOW_STATUS},
 {name:'Quote Status',type:'status',options:TRADELINK_QUOTE_STATUS},
 {name:'Date',type:'date'},
 {name:'Amount',type:'number'}
]);
export const TRADELINK_FILES_KEY='tradelink:files';
export function isTradeLinkBoard(b){
 return b?.id===TRADELINK_BOARD_ID&&validUuid(b.workspace_id)&&
  b.name==='TradeLink'&&b.status==='active'&&
  String(b.description||'').startsWith('[APSYNTRA:MODULE:tradelink:v1]');
}
function matches(c,s){
 if(!validUuid(c?.id)||c.system_key!=null||c.visible===false||
  !/^(custom:|custom_)/.test(String(c.column_key||''))||
  c.name!==s.name||c.data_type!==s.type)return false;
 if(s.type!=='status')return true;
 const labels=c.config?.labels;
 return Array.isArray(labels)&&labels.length===s.options.length&&
  labels.every((x,i)=>x?.active!==false&&x?.name===s.options[i]);
}
function matching(detail,s){return (detail?.columns||[]).find(c=>matches(c,s));}
export function tradeLinkSetupStatus(detail){
 if(!isTradeLinkBoard(detail?.board))return {eligible:false,ready:false,missing:[]};
 const missing=TRADELINK_FIELDS.filter(s=>!matching(detail,s)).map(s=>s.name);
 return {eligible:true,ready:missing.length===0,missing,attachmentReady:false};
}
export function tradeLinkGridColumns(detail){
 if(!isTradeLinkBoard(detail?.board))return null;
 const key=s=>{
  const c=matching(detail,s);
  return c?'col:'+c.id:'tradelink:pending-'+s.name.toLowerCase().replace(/\s+/g,'-');
 };
 const [person,workflow,quote,date,amount]=TRADELINK_FIELDS;
 return [{key:'record',title:'Item'},
  {key:key(person),title:'Person'},
  {key:key(workflow),title:'Workflow Status'},
  {key:key(quote),title:'Quote Status'},
  {key:key(date),title:'Date'},
  {key:TRADELINK_FILES_KEY,title:'Files'},
  {key:key(amount),title:'Amount'}];
}
/** Never print internal status IDs or user UUIDs as cell labels. */
export function tradeLinkDisplayValue(c,value){
 if(value==null||value==='')return '—';
 if(c.data_type==='status')return c.config?.labels?.find(x=>x?.id===value&&x?.active!==false)?.name||'—';
 if(c.data_type==='people')return 'Assigned user'; // Resolve only with an authorized member directory later.
 if(c.data_type==='number')return typeof value==='number'&&Number.isFinite(value)?String(value):'—';
 if(c.data_type==='date')return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:'—';
 return '—';
}
/** Explicit manager action only. Additive, idempotent, signed and CAS-guarded.
 * Files remains a display placeholder pending a private storage authorization contract.
 */
export async function configureTradeLinkColumns({auth,api,structure}={}){
 if(!auth?.getVerifiedUser||!api?.context||!api?.board||!api?.allowed||!structure?.mutate)
  throw new ApiError('Signed board configuration clients are unavailable.',403);
 const actor=await auth.getVerifiedUser(),ctx=await api.context();
 if(!validUuid(actor?.id)||actor.id!==auth.userId||actor.id!==ctx?.user_id||
   ctx.profile?.status!=='active'||!validUuid(ctx.workspace_id))
  throw new ApiError('Signed workspace identity changed.',403);
 if(await api.allowed(TRADELINK_BOARD_ID,'manage')!==true)
  throw new ApiError('TradeLink board manager permission is required.',403);
 for(const spec of TRADELINK_FIELDS){
  const detail=await api.board(TRADELINK_BOARD_ID);
  if(!isTradeLinkBoard(detail?.board)||detail.board.workspace_id!==ctx.workspace_id||
     !Array.isArray(detail.items)||detail.items.length)
   throw new ApiError('TradeLink identity, workspace or empty-board state changed.',409);
  const existing=(detail.columns||[]).filter(c=>
   String(c.name||'').toLowerCase()===spec.name.toLowerCase());
  if(existing.length){
   if(existing.length!==1||!matches(existing[0],spec))
    throw new ApiError('Existing '+spec.name+' column needs manual reconciliation.',409);
   continue;
  }
  await structure.mutate(detail,{action:'create',name:spec.name,type:spec.type,
   config:spec.options?{options:[...spec.options]}:{},visible:true});
 }
 const final=await api.board(TRADELINK_BOARD_ID);
 if(!isTradeLinkBoard(final?.board)||final.board.workspace_id!==ctx.workspace_id||
    !tradeLinkSetupStatus(final).ready)
  throw new ApiError('TradeLink table verification failed. Refresh before retrying.',409);
 return {boardId:TRADELINK_BOARD_ID,ready:true,attachmentReady:false};
}
