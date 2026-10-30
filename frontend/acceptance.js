/** Read-only signed-session acceptance from the already authenticated APSYNTRA browser.
 * No access-token export, privileged key, database write, or local-host dependency.
 * Each PASS is backed by an actual Supabase request, not cached UI state.
 */
const idMatch=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const definitions=[
  ['identity','Supabase signed-user identity'],
  ['workspace','Authoritative active workspace'],
  ['boards','Authorized board listing'],
  ['board-detail','Board details under central RBAC'],
  ['board-permission','Authoritative board view permission'],
  ['huly-view','Huly Issue RLS view connectivity']
];
function errorDetail(err){
 if(err?.status===401)return 'Session rejected or expired (HTTP 401)';
 if(err?.status===403)return 'Access denied by central authorization (HTTP 403)';
 if(err?.status===404)return 'Required backend API is missing (HTTP 404)';
 return err?.status?'Backend request failed (HTTP '+err.status+')':'Network or API request failed';
}
export async function runReadOnlyAcceptance(auth,api){
 const checks=[]; let user,ctx,boards,selected;
 async function check(id,run){
  const title=definitions.find(([key])=>key===id)?.[1]||id;
  try{
   const detail=await run();
   checks.push({id,title,status:'pass',detail});
   return true;
  }catch(err){
   checks.push({id,title,status:'fail',detail:errorDetail(err)});
   return false;
  }
 }
 function pending(){
  for(const [id,title] of definitions){
   if(!checks.some(row=>row.id===id))checks.push({id,title,status:'pending',detail:'Prerequisite did not pass'});
  }
 }
 if(!await check('identity',async()=>{
  user=await auth.getVerifiedUser();
  if(!idMatch.test(user?.id||'')||user.id!==auth.userId)throw Error('Invalid authenticated identity');
  return 'Verified using the live Supabase Auth user endpoint';
 })){pending();return checks;}
 if(!await check('workspace',async()=>{
  ctx=await api.context();
  if(ctx.user_id!==user.id||!idMatch.test(ctx.workspace_id))throw Error('Mismatched workspace');
  return 'Active server-authoritative workspace and profile';
 })){pending();return checks;}
 if(!await check('boards',async()=>{
  boards=await api.boards('active');
  if(!Array.isArray(boards))throw Error('Invalid board list');
  return boards.length+' visible active board(s)';
 })){pending();return checks;}
 selected=boards.find(b=>idMatch.test(b?.id||''));
 if(!selected){
  for(const [id,title] of definitions.slice(3))checks.push({id,title,status:'pending',detail:'No accessible active board to check'});
  return checks;
 }
 if(!await check('board-detail',async()=>{
  const result=await api.board(selected.id);
  if(result?.board?.id!==selected.id)throw Error('Board identity mismatch');
  return 'Board details returned for an authorized board';
 })){pending();return checks;}
 if(!await check('board-permission',async()=>{
  if(!await api.allowed(selected.id,'view'))throw Object.assign(Error('Not authorized'),{status:403});
  return 'Central work_board_access returned true for view';
 })){pending();return checks;}
 await check('huly-view',async()=>{
  const rows=await api.issues(selected.id,ctx.workspace_id);
  if(!Array.isArray(rows))throw Error('Malformed Huly view');
  return 'RLS-protected Issue view returned '+rows.length+' row(s)';
 });
 pending();
 return checks;
}
export function summarizeAcceptance(checks){
 return {passed:checks.filter(c=>c.status==='pass').length,
  failed:checks.filter(c=>c.status==='fail').length,
  pending:checks.filter(c=>c.status==='pending').length,
  total:checks.length,
  certified:checks.length===6 && checks.every(c=>c.status==='pass')};
}
