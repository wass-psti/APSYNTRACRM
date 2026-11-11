/** CMP-01: explicitly approved Status/Dropdown schema setup for imports.
 * m143-v1 cannot atomically create choice columns. A manager may instead
 * authorize one audited, CAS-protected schema mutation, then review an
 * independent import preview. Do not silently mutate the board.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
import {canManuallyEditBoard} from './board-inline-items.js';
const fail=(message,status=400)=>{throw new ApiError(message,status);};
const clean=value=>String(value??'').trim();
const norm=value=>clean(value).toLocaleLowerCase();
const allowedChoices=new Set(['status','dropdown']);
export function importChoiceLabels(sheet,source){
 const idx=sheet?.headers?.indexOf(source);
 if(idx==null||idx<0||!Array.isArray(sheet?.rows))fail('Source column is no longer available.');
 const labels=[],seen=new Set();
 for(let i=0;i<sheet.rows.length;i++){
  const value=clean(sheet.rows[i]?.[idx]);
  if(!value)continue;
  const line=sheet.rowNumbers?.[i]??i+2;
  if(value.length>80)fail('Worksheet "'+(sheet.worksheet||sheet.name||'CSV')+
   '" · row '+line+' · column "'+source+'": Option label exceeds 80 characters.');
  if(/^[=+@]/.test(value)||/^-(?!\d)/.test(value))
   fail('Worksheet "'+(sheet.worksheet||sheet.name||'CSV')+
   '" · row '+line+' · column "'+source+'": Formula-like option labels are not accepted.');
  if(!seen.has(norm(value))){
   if(labels.length>=50)fail('Choice columns support at most 50 distinct labels.');
   seen.add(norm(value));labels.push(value);
  }
 }
 if(!labels.length)fail('Add at least one nonblank choice value to configure this column.');
 return labels;
}
export function choiceCreationPreview({sheet,source,type,name,detail,existingColumnId}={}){
 if(!allowedChoices.has(type))fail('Only Status or Dropdown is supported for choice setup.');
 const title=clean(name||source);
 if(!title||title.length>80)fail('Column name must have 1–80 characters.');
 const existing=detail?.columns||[];
 if(existingColumnId){
  const column=existing.find(c=>c.id===existingColumnId);
  if(!validUuid(existingColumnId)||type!=='status'||!column||
     column.data_type!=='status'||!(column.system_key==null||column.system_key==='status'))
   fail('The selected existing Status column is unavailable.',409);
  const sourceLabels=importChoiceLabels(sheet,source);
  const configured=Array.isArray(column.config?.labels)?column.config.labels:[];
  const present=new Map(configured.map(x=>[norm(x?.name||x?.label),x]));
  const added=sourceLabels.filter(x=>!present.has(norm(x)));
  const reactivated=sourceLabels.filter(x=>present.get(norm(x))?.active===false);
  if(configured.length+added.length>50)
   fail('The Status column would exceed the supported 50 labels.');
  return {source,type,name:column.name,labels:sourceLabels,
   existingColumnId,added,reactivated,configuredCount:configured.length};
 }
 if(existing.some(c=>norm(c.name)===norm(title)))
  fail('The board already contains "'+title+'". Map to the existing column instead.',409);
 if(existing.length>=30)fail('The board already has the maximum number of columns.');
 return {source,type,name:title,labels:importChoiceLabels(sheet,source)};
}
function appendedStatusLabels(column,additions,reactivated=[]){
 const options=Array.isArray(column?.config?.labels)?column.config.labels:[];
 const used=new Set(options.map(x=>String(x?.id||'')));
 const colors=['#7f8a9a','#4f7df3','#e64f70','#23b784','#6d5bd0','#2a9bb8','#d9a227','#d54a9c'];
 const reopened=new Set(reactivated.map(norm));
 return [...options.map(x=>{
  const existing={...x,name:x.name||x.label};
  return reopened.has(norm(existing.name))?{...existing,active:true}:existing;
 }),...additions.map(label=>{
  // Stable, collision-resistant-enough IDs for this already user-confirmed
  // schema operation; never replace IDs of existing values.
  let h=2166136261;
  for(const ch of label)h=Math.imul(h^ch.charCodeAt(0),16777619);
  const base='import_'+(h>>>0).toString(36),id=(()=>{
   let result=base,index=1;
   while(used.has(result))result=base+'_'+index++;
   used.add(result);return result;
  })();
  return {id,name:label,color:colors[used.size%colors.length],active:true,description:''};
 })];
}
export async function provisionImportChoiceColumn({
 api,auth,boardId,detail,sheet,source,type,name,existingColumnId
}={}){
 if(!validUuid(boardId)||!api?.board||!api?.allowed||!api?.rpc||
    !api?.context||!auth?.getVerifiedUser)
  fail('Signed board schema management is unavailable.',403);
 const preview=choiceCreationPreview({sheet,source,type,name,detail,existingColumnId});
 const actor=await auth.getVerifiedUser(),context=await api.context();
 if(!validUuid(actor?.id)||auth.userId!==actor.id||
    context?.user_id!==actor.id||context?.profile?.status!=='active'||
    context.workspace_id!==detail?.board?.workspace_id||
    detail?.board?.id!==boardId||
    !canManuallyEditBoard(detail?.board,true))
  fail('Signed ordinary-board identity or workspace changed.',403);
 if(await api.allowed(boardId,'manage')!==true)
  fail('Only authorized board managers can create configured columns.',403);
 const live=await api.board(boardId);
 if(live?.board?.workspace_id!==context.workspace_id||
    live?.board?.updated_at!==detail.board.updated_at||
    !canManuallyEditBoard(live?.board,true))
  fail('The board changed after column preview. Reload and review before creating.',409);
 choiceCreationPreview({sheet,source,type,name,detail:live,existingColumnId});
 const session=await api.rpc('wm_board_ui_read',{p_board_id:boardId});
 if(session?.board_id!==boardId)
  fail('An active, authorized board session could not be confirmed.',403);
 if(existingColumnId){
  const column=(live.columns||[]).find(c=>c.id===existingColumnId);
  const current=choiceCreationPreview({sheet,source,type,name,detail:live,existingColumnId});
  const labels=appendedStatusLabels(column,current.added,current.reactivated);
  const uncertain=()=>{
   const error=new ApiError('Status configuration result is uncertain. Refresh the board and inspect its Status options before retrying.',409);
   error.schemaOutcomeUncertain=true;throw error;
  };
  let receipt;
  try{
   receipt=await api.rpc('wm_set_board_status_labels',{
    p_column_id:existingColumnId,p_labels:labels,
    p_default_label_id:column.config?.default_label_id||null
   });
  }catch(error){
   const status=Number(error?.status);
   if(!Number.isInteger(status)||status<400||status>=500)uncertain();
   throw error;
  }
  if(!Array.isArray(receipt?.labels)||receipt.labels.length!==labels.length)uncertain();
  let updated;
  try{updated=await api.board(boardId);}catch{uncertain();}
  const persisted=(updated?.columns||[]).find(c=>c.id===existingColumnId);
  if(updated?.board?.workspace_id!==context.workspace_id||!persisted||
     labels.some(label=>!persisted.config?.labels?.some(x=>
      x.id===label.id&&norm(x.name||x.label)===norm(label.name||label.label))))uncertain();
  return {detail:updated,columnId:existingColumnId,labels:current.labels,existing:true};
 }
 // A lost response may arrive after an already-committed mutation.
 // Treat transport/5xx and failed read-back as uncertain; never retry blindly.
 const uncertain=()=>{
  const error=new ApiError(
   'Column creation outcome is uncertain. Close the wizard, refresh the board, and check its columns and activity before retrying.',409);
  error.schemaOutcomeUncertain=true;
  throw error;
 };
 let receipt;
 try{
  receipt=await api.rpc('wm_board_schema_mutate',{
   p_board_id:boardId,p_expected_updated_at:live.board.updated_at,
   p_action:'create',p_column_id:null,p_name:preview.name,
   p_data_type:type,p_config:{options:preview.labels},
   p_visible:true,p_confirm_delete:false
  });
 }catch(error){
  const status=Number(error?.status);
  if(!Number.isInteger(status)||status<400||status>=500)uncertain();
  throw error;
 }
 if(receipt?.board_id!==boardId||receipt?.action!=='create'||
    !validUuid(receipt.column_id)||typeof receipt.updated_at!=='string')
  uncertain();
 let updated;
 try{updated=await api.board(boardId);}catch{uncertain();}
 const col=(updated?.columns||[]).find(c=>c.id===receipt.column_id);
 if(!col||updated.board?.workspace_id!==context.workspace_id||
    col.name!==preview.name||col.data_type!==type||
    col.system_key!=null)
  uncertain();
 const choices=type==='status'?(col.config?.labels||[])
   .map(x=>x.name||x.label).filter(Boolean):col.config?.options||[];
 if(choices.length!==preview.labels.length||
    choices.some((x,i)=>norm(x)!==norm(preview.labels[i])))
  uncertain();
 return {detail:updated,columnId:col.id,labels:preview.labels};
}
