/** CP-BOARD-COL-DELETE / Phase B2 — user-triggered signed QA fixture.
 * No privileged SQL, fabricated GoTrue identities, or recovery activation.
 * A partial/uncertain outcome is preserved for inspection, never retried.
 */
import {validUuid} from './data.js';
export const B2_QA_FIXTURE_BOARD_NAME='CP-BOARD-COL-DELETE QA Signed Fixture';
export const B2_QA_FIXTURE_COLUMN_NAME='Recovery Status';
const TITLES=Object.freeze(['B2 QA item 1','B2 QA item 2','B2 QA item 3','B2 QA item 4']);
const VALUES=Object.freeze(['B2-QA-Alpha','B2-QA-Beta','B2-QA-Gamma','B2-QA-Delta']);
const STATES=new Set(['PASS','PENDING','BLOCKED','PARTIAL','UNCERTAIN']);
const STAGES=new Set(['prerequisites','signed-identity','existing-boards','board-created',
 'column-created','cells-created','verified-readback','completed']);
const REASONS=new Set(['NONE','SIGNED_SESSION_UNAVAILABLE','WORKSPACE_CHANGED',
 'DUPLICATE_FIXTURE','MISSING_MANAGER_ACCESS','INVALID_BOARD_RESPONSE',
 'INVALID_COLUMN_RESPONSE','INVALID_ITEM_RESPONSE','INCOMPLETE_READBACK',
 'SIGNED_API_ERROR','UNVERIFIED_WRITE_OUTCOME','NOT_CREATED']);
const safe=(value,allowed,fallback)=>allowed.has(value)?value:fallback;
const report=(status,stage,reason,boardId=null,completedCells=0)=>Object.freeze({
 checkpoint:'CP-BOARD-COL-DELETE-B2',status,stage,reason,boardId,
 completedCells:Number.isInteger(completedCells)&&completedCells>=0&&completedCells<=4?completedCells:0,
 expectedCells:4,activationChanged:false,recoveryWritesAttempted:0
});
const properSession=async(auth,api,expected=null)=>{
 const user=await auth.getVerifiedUser();
 const ctx=await api.context();
 if(!validUuid(user?.id)||auth.userId!==user.id||
  ctx?.user_id!==user.id||!validUuid(ctx?.workspace_id)||
  ctx?.profile?.status!=='active')return null;
 if(expected&&(expected.actor!==user.id||expected.workspace!==ctx.workspace_id))return null;
 return {actor:user.id,workspace:ctx.workspace_id};
};
const boardValid=(detail,id,ctx)=>detail?.board?.id===id&&
 detail.board.name===B2_QA_FIXTURE_BOARD_NAME&&
 detail.board.workspace_id===ctx.workspace&&
 detail.board.status==='active'&&detail.board.created_by===ctx.actor&&
 Array.isArray(detail.groups)&&Array.isArray(detail.columns)&&
 Array.isArray(detail.items)&&Array.isArray(detail.values);
const columnValid=c=>validUuid(c?.id)&&c.name===B2_QA_FIXTURE_COLUMN_NAME&&
 (c.column_key?.startsWith('custom:')||c.column_key?.startsWith('custom_'))&&
 c.system_key==null&&c.data_type==='text';
const readback=(detail,columnId,itemIds,actor)=>{
 const col=detail.columns.filter(c=>c.id===columnId&&columnValid(c));
 if(col.length!==1||itemIds.length!==4)return false;
 for(let i=0;i<4;i++){
  const item=detail.items.filter(x=>x.id===itemIds[i]&&x.title===TITLES[i]&&
    x.created_by===actor&&x.archived_at==null);
  const cell=detail.values.filter(x=>x.item_id===itemIds[i]&&
    x.column_id===columnId&&x.value===VALUES[i]);
  if(item.length!==1||cell.length!==1)return false;
 }
 return detail.values.filter(x=>x.column_id===columnId).length===4;
};
/** Only the user's real GoTrue session can create the board and values. */
export async function createB2SignedQaFixture({auth,api,structure}={}){
 if(typeof auth?.getVerifiedUser!=='function'||typeof api?.context!=='function'||
  typeof api?.boards!=='function'||typeof api?.createBoard!=='function'||
  typeof api?.allowed!=='function'||typeof api?.board!=='function'||
  typeof api?.addItem!=='function'||typeof api?.setBoardCellCas!=='function'||
  typeof structure?.mutate!=='function')
  return report('BLOCKED','prerequisites','SIGNED_SESSION_UNAVAILABLE');
 let boardId=null,completedCells=0,stage='signed-identity',writeIssued=false;
 try{
  const ctx=await properSession(auth,api);
  if(!ctx)return report('BLOCKED',stage,'SIGNED_SESSION_UNAVAILABLE');
  stage='existing-boards';
  const boards=await api.boards('active');
  if(!Array.isArray(boards))return report('BLOCKED',stage,'SIGNED_API_ERROR');
  if(boards.some(b=>typeof b?.name==='string'&&b.name.startsWith('CP-BOARD-COL-DELETE QA ')))
   return report('PENDING',stage,'DUPLICATE_FIXTURE');
  if(!await properSession(auth,api,ctx))
   return report('BLOCKED',stage,'WORKSPACE_CHANGED');
  stage='board-created';writeIssued=true;
  const newId=await api.createBoard(B2_QA_FIXTURE_BOARD_NAME,
   'Nonproduction board-column recovery QA fixture; no operational records.');
  if(!validUuid(newId))
   return report('UNCERTAIN',stage,'UNVERIFIED_WRITE_OUTCOME');
  boardId=newId;
  let detail=await api.board(boardId);
  if(!boardValid(detail,boardId,ctx))
   return report('PARTIAL',stage,'INVALID_BOARD_RESPONSE',boardId);
  if(await api.allowed(boardId,'manage')!==true)
   return report('PARTIAL',stage,'MISSING_MANAGER_ACCESS',boardId);
  if(detail.columns.some(c=>c.name===B2_QA_FIXTURE_COLUMN_NAME))
   return report('PARTIAL',stage,'INVALID_COLUMN_RESPONSE',boardId);
  if(!await properSession(auth,api,ctx))
   return report('PARTIAL',stage,'WORKSPACE_CHANGED',boardId);
  stage='column-created';
  const created=await structure.mutate(detail,{action:'create',
   name:B2_QA_FIXTURE_COLUMN_NAME,type:'text',config:{}});
  const columnId=created?.column_id;
  if(!validUuid(columnId))
   return report('PARTIAL',stage,'INVALID_COLUMN_RESPONSE',boardId);
  detail=await api.board(boardId);
  if(!boardValid(detail,boardId,ctx)||!detail.columns.some(c=>c.id===columnId&&columnValid(c)))
   return report('PARTIAL',stage,'INVALID_COLUMN_RESPONSE',boardId);
  if(detail.groups.length!==1||!validUuid(detail.groups[0]?.id)||detail.items.length)
   return report('PARTIAL',stage,'INVALID_BOARD_RESPONSE',boardId);
  const groupId=detail.groups[0].id,itemIds=[];
  stage='cells-created';
  for(let i=0;i<4;i++){
   if(!await properSession(auth,api,ctx))
    return report('PARTIAL',stage,'WORKSPACE_CHANGED',boardId,completedCells);
   const itemId=await api.addItem(boardId,groupId,TITLES[i]);
   if(!validUuid(itemId))
    return report('PARTIAL',stage,'INVALID_ITEM_RESPONSE',boardId,completedCells);
   itemIds.push(itemId);
   await api.setBoardCellCas(itemId,columnId,VALUES[i],null);
   completedCells++;
  }
  stage='verified-readback';
  const current=await api.board(boardId);
  if(!boardValid(current,boardId,ctx)||!readback(current,columnId,itemIds,ctx.actor)||
   await api.allowed(boardId,'manage')!==true||
   !await properSession(auth,api,ctx))
   return report('PARTIAL',stage,'INCOMPLETE_READBACK',boardId,completedCells);
  return report('PASS','completed','NONE',boardId,4);
 }catch(error){
  const isUncertain=error?.schemaOutcomeUncertain===true||
   !Number.isInteger(Number(error?.status))||Number(error?.status)>=500;
  return report(isUncertain&&writeIssued?'UNCERTAIN':boardId?'PARTIAL':'BLOCKED',
   stage,isUncertain&&writeIssued?'UNVERIFIED_WRITE_OUTCOME':'SIGNED_API_ERROR',
   boardId,completedCells);
 }
}
/** Read-only in-band acceptance for the existing signed session. */
export async function inspectB2SignedQaFixture({auth,api}={}){
 if(typeof auth?.getVerifiedUser!=='function'||typeof api?.context!=='function'||
  typeof api?.boards!=='function'||typeof api?.board!=='function'||
  typeof api?.allowed!=='function')
  return report('BLOCKED','prerequisites','SIGNED_SESSION_UNAVAILABLE');
 try{
  const ctx=await properSession(auth,api);
  if(!ctx)return report('BLOCKED','signed-identity','SIGNED_SESSION_UNAVAILABLE');
  const boards=await api.boards('active');
  if(!Array.isArray(boards))return report('BLOCKED','existing-boards','SIGNED_API_ERROR');
  const matches=boards.filter(b=>b?.name===B2_QA_FIXTURE_BOARD_NAME);
  if(boards.some(b=>typeof b?.name==='string'&&
    b.name.startsWith('CP-BOARD-COL-DELETE QA ')&&
    b.name!==B2_QA_FIXTURE_BOARD_NAME))
   return report('BLOCKED','existing-boards','DUPLICATE_FIXTURE');
  if(matches.length===0)return report('PENDING','existing-boards','NOT_CREATED');
  if(matches.length!==1||!validUuid(matches[0]?.id))
   return report('BLOCKED','existing-boards','DUPLICATE_FIXTURE');
  const id=matches[0].id;
  const detail=await api.board(id);
  if(!boardValid(detail,id,ctx)||await api.allowed(id,'manage')!==true)
   return report('BLOCKED','verified-readback','MISSING_MANAGER_ACCESS',id);
  const cols=detail.columns.filter(columnValid);
  if(cols.length!==1)return report('PENDING','verified-readback','INCOMPLETE_READBACK',id);
  const cells=detail.values.filter(x=>x.column_id===cols[0].id);
  const complete=cells.length===4&&TITLES.every((title,i)=>{
   const item=detail.items.find(x=>x.title===title&&x.created_by===ctx.actor&&
    x.archived_at==null);
   return item&&cells.some(x=>x.item_id===item.id&&x.value===VALUES[i]);
  });
  const stable=await properSession(auth,api,ctx);
  if(!stable)return report('BLOCKED','verified-readback','WORKSPACE_CHANGED',id);
  return complete?report('PASS','completed','NONE',id,4):
   report('PENDING','verified-readback','INCOMPLETE_READBACK',id,cells.length);
 }catch{return report('BLOCKED','verified-readback','SIGNED_API_ERROR');}
}
export function sanitizeB2QaFixtureReport(value){
 return JSON.stringify({
 checkpoint:'CP-BOARD-COL-DELETE-B2',
 status:safe(value?.status,STATES,'BLOCKED'),
 stage:safe(value?.stage,STAGES,'prerequisites'),
 reason:safe(value?.reason,REASONS,'SIGNED_API_ERROR'),
 completedCells:Number.isInteger(value?.completedCells)&&value.completedCells>=0&&
  value.completedCells<=4?value.completedCells:0,
 expectedCells:4,activationChanged:false,recoveryWritesAttempted:0,
 boardIdentifierDisclosed:false,
 acceptanceBoundary:'SIGNED_QA_SETUP_ONLY_NOT_DELETE_OR_ACTIVITY_RESTORATION'
 },null,2);
}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
export function renderB2SignedQaFixture({busy=false,result=null}={}){
 const status=result?'<p><strong>Signed QA fixture: '+esc(safe(result.status,STATES,'BLOCKED'))+
  '</strong> · '+esc(safe(result.reason,REASONS,'SIGNED_API_ERROR'))+
  ' · '+Number(result.completedCells||0)+'/4 stored test cells</p>':'';
 const link=validUuid(result?.boardId)?
  '<a href="#/boards/'+esc(result.boardId)+'">Open QA board for review</a>':'';
 return '<section class="panel" aria-label="B2 signed QA fixture"><h3>Board recovery B2 — signed QA fixture</h3>'+
  '<p class="muted">Creates one ordinary QA board, one custom column and four synthetic values only when you choose Create. '+
  'Uses your verified signed session and server authorization. Does not enable deletion or restoration; never auto-retries partial writes.</p>'+
  '<button type="button" data-action="security-b2-qa-inspect"'+(busy?' disabled':'')+'>Inspect signed QA fixture</button> '+
  '<button type="button" data-action="security-b2-qa-create"'+(busy||result?.status==='PASS'?' disabled':'')+'>Create signed B2 QA fixture</button> '+
  (result?'<button type="button" data-action="security-b2-qa-copy"'+(busy?' disabled':'')+'>Copy nonsecret QA report</button>':'')+
  status+link+'</section>';
}
