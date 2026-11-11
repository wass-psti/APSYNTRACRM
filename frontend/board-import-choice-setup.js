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
  if(!seen.has(norm(value))){
   if(labels.length>=50)fail('Choice columns support at most 50 distinct labels.');
   seen.add(norm(value));labels.push(value);
  }
 }
 if(!labels.length)fail('Add at least one nonblank choice value to configure this column.');
 return labels;
}
export function choiceCreationPreview({sheet,source,type,name,detail}={}){
 if(!allowedChoices.has(type))fail('Only Status or Dropdown is supported for choice setup.');
 const title=clean(name||source);
 if(!title||title.length>80)fail('Column name must have 1–80 characters.');
 const existing=detail?.columns||[];
 if(existing.some(c=>norm(c.name)===norm(title)))
  fail('The board already contains "'+title+'". Map to the existing column instead.',409);
 if(existing.length>=30)fail('The board already has the maximum number of columns.');
 return {source,type,name:title,labels:importChoiceLabels(sheet,source)};
}
export async function provisionImportChoiceColumn({
 api,auth,boardId,detail,sheet,source,type,name
}={}){
 if(!validUuid(boardId)||!api?.board||!api?.allowed||!api?.rpc||
    !api?.context||!auth?.getVerifiedUser)
  fail('Signed board schema management is unavailable.',403);
 const preview=choiceCreationPreview({sheet,source,type,name,detail});
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
 choiceCreationPreview({sheet,source,type,name,detail:live});
 const session=await api.rpc('wm_board_ui_read',{p_board_id:boardId});
 if(session?.board_id!==boardId)
  fail('An active, authorized board session could not be confirmed.',403);
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
