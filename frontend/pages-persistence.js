/** GitHub Pages signed-user persistence acceptance.
 * Opt-in ONLY. Runs against an explicitly designated isolated APSYNTRA QA board.
 * Uses existing Supabase Auth/RBAC/RLS/RPC; never creates users or uses service credentials.
 * No local Node/Vite server is required.
 */
const QA_NAME='APSYNTRA QA';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class AcceptanceError extends Error {
 constructor(message){super(message);this.name='AcceptanceError';}
}
function assert(condition,message){if(!condition)throw new AcceptanceError(message);}
export async function runPagesPersistenceAcceptance(api,{board,context,onStep=()=>{}}={}){
 assert(board?.name===QA_NAME && uuid.test(board?.id||''),'An explicitly designated APSYNTRA QA board is required.');
 assert(context?.profile?.status==='active' && uuid.test(context.workspace_id||'')
  && uuid.test(context.user_id||''),'An active authenticated workspace is required.');
 assert(api?.auth?.userId===context.user_id,'Authentication identity and workspace context disagree.');
 const boardId=board.id,workspaceId=context.workspace_id,actor=context.user_id;
 const steps=[];
 function pass(name,detail){steps.push({name,status:'pass',detail});onStep(steps.at(-1));}
 let documentId=null,cleaned=false;
 try{
  assert(await api.allowed(boardId,'edit')===true,'Edit permission denied by the authoritative board RPC.');
  pass('Authorized isolated QA board','Central edit permission confirmed for APSYNTRA QA');
  const stamp='APSYNTRA-QA-'+crypto.randomUUID();
  const id=await api.createIssue(boardId,workspaceId,
   {title:stamp+' create',status:'tracker:status:Todo',priority:2},actor);
  documentId='huly.issue.'+id;
  let rows=await api.issues(boardId,workspaceId);
  let row=rows.find(item=>item.document_id===documentId);
  assert(row?.revision===1 && row?.payload?.snapshot?.title===stamp+' create','Create was not independently persisted at revision 1.');
  pass('Signed create and independent read','Issue persisted through the existing Supabase transaction RPC');
  await api.updateIssue(boardId,workspaceId,row,{title:stamp+' updated'},actor);
  rows=await api.issues(boardId,workspaceId);
  const updated=rows.find(item=>item.document_id===documentId);
  assert(updated?.revision===2 && updated?.payload?.snapshot?.title===stamp+' updated','Update was not persisted with revision 2.');
  pass('Update and revision increment','Independent Issue view confirms compare-and-swap update');
  let conflict=false;
  try{
   await api.commit(boardId,workspaceId,[{
    action:'update',documentId,expectedRevision:1,payload:row.payload
   }]);
  }catch(err){if(err?.status===409)conflict=true;else throw err;}
  assert(conflict,'An outdated revision was not rejected with an HTTP 409 conflict.');
  pass('Stale revision rejected','Atomic transaction RPC denied an obsolete write');
  await api.removeIssue(boardId,workspaceId,updated);
  cleaned=true;
  rows=await api.issues(boardId,workspaceId);
  assert(!rows.some(item=>item.document_id===documentId),'Removed Issue was still visible in the RLS view.');
  pass('Reversible removal','Deleted document is hidden from the active Issue view');
  const events=await api.issueEvents(boardId,workspaceId,documentId);
  assert(Array.isArray(events),'Event ledger response was malformed.');
  // The invoker view sorts by event_id. Require the EXACT committed sequence,
  // not merely a set of event names; stale or fabricated audit rows must fail.
  const expected=[['create',1],['update',2],['remove',3]];
  assert(events.length===expected.length && events.every((event,index)=>
    event.document_id===documentId && event.actor_id===actor &&
    event.event_type===expected[index][0] && event.revision===expected[index][1]),
   'Event provenance, document scope or revision sequence did not match the committed transactions.');
  pass('Append-only event evidence','Independent invoker view confirms exact 1→2→3 audit sequence by signed user');
  return{passed:steps.length,total:6,status:'pass',steps,boardName:board.name};
 }catch(error){
  // Best effort cleanup only for our own newly created QA document.
  // Never claim cleanup succeeded unless it actually did.
  if(documentId&&!cleaned){
   try{
    const live=(await api.issues(boardId,workspaceId)).find(x=>x.document_id===documentId);
    if(live){await api.removeIssue(boardId,workspaceId,live);cleaned=true;}
   }catch{/* The QA issue may remain for investigation. */}
  }
  return{passed:steps.length,total:6,status:'fail',steps,
    error:error instanceof AcceptanceError?error.message:
      (error?.status?'Backend returned HTTP '+error.status:'Signed persistence test failed'),
    cleanupConfirmed:cleaned,boardName:board.name};
 }
}
export const QA_BOARD_NAME=QA_NAME;
