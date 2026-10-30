/** CP-A12.2 optional real denial challenge, isolated APSYNTRA QA board only.
 * Never uses domain/production boards. Explicit user confirmation required by UI.
 */
import {runSignedNegativeBoardAcceptance} from './board-negative-acceptance.js';
const QA_BOARD='098b6797-0bf7-407b-8802-bd8a00c606f6';
const QA_GROUP='6eaf3d6e-f9a1-4f32-85cd-d05b383fe27f';
export async function runDeniedQaWrite(auth,api,{verifiedReadOnlyResult}={}){
 if(verifiedReadOnlyResult?.status!=='pass'||verifiedReadOnlyResult?.passed!==12||
    !['unassigned_nonadmin','cross_workspace'].includes(verifiedReadOnlyResult?.scenario))
   return{status:'not_eligible',detail:'All twelve signed read-only denials must pass first.'};
 let context;
 try{
  const me=await auth.getVerifiedUser();
  context=await api.context();
  if(!me?.id||me.id!==auth.userId||context.user_id!==me.id)
   throw Error('Signed identity mismatch');
  const isOther=context.workspace_id!=='00000000-0000-4000-8000-000000000001';
  if((verifiedReadOnlyResult.scenario==='cross_workspace')!==isOther)
   throw Error('Workspace changed since read-only acceptance');
  if(!isOther&&context.profile.platform_role==='admin_general_manager')
   throw Error('An administrator is not eligible for unassigned member testing');
  if(await api.allowed(QA_BOARD,'view')||await api.allowed(QA_BOARD,'edit'))
   throw Error('QA board access is already permitted; denial scenario is not applicable');
 }catch{return{status:'blocked',detail:'Current signed identity or QA permission preflight did not match the accepted read-only scenario.'};}
 const label='APSYNTRA-A12-DENIED-WRITE-'+crypto.randomUUID();
 try{
  const created=await api.addItem(QA_BOARD,QA_GROUP,label);
  let cleaned=false;
  if(created){
   try{await api.deleteBoardItem(created);cleaned=true;}catch{/* preserve failure for manual QA inspection */}
  }
  return{status:'fail',detail:'Backend unexpectedly allowed a test write to the isolated QA board.',cleanupConfirmed:cleaned};
 }catch(err){
  if(err?.status===403&&err?.code==='42501')
   return{status:'pass',detail:'Real signed create was rejected by the central board edit guard (HTTP 403, SQLSTATE 42501).'};
  return{status:'fail',detail:err?.status?'Unexpected backend response HTTP '+err.status:'QA denial request did not produce a verifiable access rejection.'};
 }
}
