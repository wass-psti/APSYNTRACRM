/** Controlled activation of *public* Material Sourcing columns only.
 * NOT wired into app startup or UI. Never invoke for live production without
 * separately approved schema-write change. Sensitive values require private
 * server-side storage and a deployed, tested authorization contract.
 */
import {ApiError} from './session.js';
import {BoardStructureClient} from './board-structure-admin.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP,
 planMaterialSourcingSchema} from './material-sourcing-schema-plan.js';

export const MATERIAL_SOURCING_ACTIVATION_ACK='AUTHORIZE_MRH_PUBLIC_SCHEMA_MUTATION';

const deny=(message,status=403)=>{throw new ApiError(message,status);};

function checkSnapshot(detail,workspaceId){
 const plan=planMaterialSourcingSchema(detail);
 if(detail?.board?.workspace_id!==workspaceId||
    plan.status==='BLOCKED'||plan.status==='BLOCKED_CONFLICT'||
    plan.groupId!==MATERIAL_SOURCING_GROUP.id||
    plan.groupName!==MATERIAL_SOURCING_GROUP.title)
  deny('Material Request Hub identity, original group, or schema drifted. No further writes.',409);
 return plan;
}

/** The caller must separately establish approval; this literal is not a
 * permission mechanism. Actual permission is validated by the signed backend.
 * Partial writes are returned as a receipt. Network or CAS uncertainty is fatal:
 * never retry blindly; inspect the server's authoritative state.
 */
export async function activateApprovedPublicSourcingColumns({
 api,auth,acknowledgement
}={}){
 if(acknowledgement!==MATERIAL_SOURCING_ACTIVATION_ACK)
  deny('Production board schema activation has not been separately approved.');
 if(!api?.board||!api?.context||!api?.allowed||!api?.rpc||
    !auth?.getVerifiedUser)deny('Verified board activation dependencies unavailable.');
 const verified=await auth.getVerifiedUser(),ctx=await api.context();
 if(!verified?.id||verified.id!==auth.userId||
    ctx?.user_id!==verified.id||ctx?.profile?.status!=='active'||
    !ctx?.workspace_id)
  deny('Signed workspace identity is not verified.');
 const actor=verified.id,workspace=ctx.workspace_id;
 const assertCurrent=async()=>{
  if(!auth.isSignedIn||auth.userId!==actor)
   deny('Signed account changed during schema activation.');
  const now=await api.context();
  if(now?.user_id!==actor||now?.workspace_id!==workspace||
     now?.profile?.status!=='active')
   deny('Workspace or membership changed during schema activation.');
  if(await api.allowed(MATERIAL_SOURCING_BOARD_ID,'manage')!==true)
   deny('Authoritative board manager access is required.');
 };
 const client=new BoardStructureClient(api),created=[];
 await assertCurrent();
 let detail=await api.board(MATERIAL_SOURCING_BOARD_ID);
 let plan=checkSnapshot(detail,workspace);
 // Only fields explicitly classified as ordinary in the reference plan.
 // Restricted fields and formula placeholders are intentionally excluded.
 const wanted=plan.additions.map(field=>field.name);
 for(const name of wanted){
  await assertCurrent();
  detail=await api.board(MATERIAL_SOURCING_BOARD_ID);
  plan=checkSnapshot(detail,workspace);
  const field=plan.additions.find(item=>item.name===name);
  if(!field)continue; // already present with correct type
  if(field.exposure!=='ordinary'||field.derived)
   deny('Restricted or computed fields may not use generic board storage.');
  const result=await client.mutate(detail,{
   action:'create',name:field.name,type:field.type,
   config:field.options?{options:[...field.options]}:{},visible:true
  });
  // Fresh server reread after every accepted receipt; never trust local state.
  const updated=await api.board(MATERIAL_SOURCING_BOARD_ID);
  checkSnapshot(updated,workspace);
  if(!updated.columns.some(column=>
    column.id===result.column_id&&column.name===field.name&&
    column.data_type===field.type))
   deny('Schema mutation receipt could not be verified. Do not retry.',409);
  created.push(field.name);
 }
 await assertCurrent();
 detail=await api.board(MATERIAL_SOURCING_BOARD_ID);
 plan=checkSnapshot(detail,workspace);
 if(plan.additions.length)
  deny('Some public sourcing columns remain unverified. Inspect the board.',409);
 return Object.freeze({status:'PUBLIC_COLUMNS_VERIFIED',
  boardId:MATERIAL_SOURCING_BOARD_ID,
  groupId:MATERIAL_SOURCING_GROUP.id,groupName:MATERIAL_SOURCING_GROUP.title,
  created:Object.freeze(created),restrictedFieldsNotActivated:16});
}
