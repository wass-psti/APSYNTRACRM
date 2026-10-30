/** Explicit, isolated QA acceptance of the hosted APSYNTRA native Issue gateway.
 * This does NOT test other boards or the upstream full TxProcessor.
 */
import {NativeIssueClient,nativeIssueTx} from './native-client.js';
import {QA_BOARD_NAME} from './pages-persistence.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function must(ok,message){if(!ok)throw new Error(message);}
export async function runNativeQa(api,{board,context}={}){
 must(board?.name===QA_BOARD_NAME&&uuid.test(board.id||''),'Use the isolated APSYNTRA QA board only.');
 must(context?.profile?.status==='active'&&uuid.test(context.user_id||'')&&uuid.test(context.workspace_id||'')
  &&api.auth?.userId===context.user_id,'A genuine signed workspace session is required.');
 const client=new NativeIssueClient(api);
 const boardId=board.id,workspaceId=context.workspace_id,actor=context.user_id;
 let documentId=null,cleaned=false;
 const steps=[];
 const pass=(name,detail)=>steps.push({name,status:'pass',detail});
 try{
  must(await api.allowed(boardId,'edit')===true,'Central edit permission denied');
  pass('Authorized QA scope','Existing board permission returned edit access');
  const stamp='APSYNTRA-NATIVE-QA-'+crypto.randomUUID();
  const created=await client.create(boardId,workspaceId,actor,{title:stamp+' created',priority:2});
  documentId='huly.issue.'+created.id;
  let row=(await api.issues(boardId,workspaceId)).find(r=>r.document_id===documentId);
  must(row?.revision===1&&row.payload.snapshot.title===stamp+' created','Native create was not persisted');
  pass('Server-native create','Issue committed and independently reloaded at revision 1');
  await client.update(boardId,workspaceId,actor,row,{'title':stamp+' changed','$inc':{priority:1}});
  row=(await api.issues(boardId,workspaceId)).find(r=>r.document_id===documentId);
  must(row?.revision===2&&row.payload.snapshot.priority===3&&row.payload.snapshot.title===stamp+' changed',
    'Native operator update was not persisted');
  pass('Server-native operators','Direct title update and $inc persisted at revision 2');
  let denied=false;
  try{
   const forged=nativeIssueTx({kind:'update',actor:crypto.randomUUID(),id:created.id,operations:{title:'untrusted'}});
   await client.commit(boardId,workspaceId,[forged]);
  }catch(err){if(err?.status===403)denied=true;else throw err;}
  must(denied,'Forged actor was not explicitly rejected by the server');
  pass('Identity spoofing rejected','Supabase native gateway denied mismatched actor claim');
  let crossDenied=false;
  try{
   await client.commit(boardId,crypto.randomUUID(),
     [nativeIssueTx({kind:'update',actor,id:created.id,operations:{title:'untrusted'}})]);
  }catch(err){if(err?.status===403)crossDenied=true;else throw err;}
  must(crossDenied,'Cross-workspace transaction was not explicitly denied');
  pass('Workspace isolation','Supabase native gateway rejected cross-workspace mutation');
  await client.remove(boardId,workspaceId,actor,row);
  cleaned=true;
  must(!(await api.issues(boardId,workspaceId)).some(r=>r.document_id===documentId),
    'Removed native Issue still visible');
  const ledger=await api.issueEvents(boardId,workspaceId,documentId);
  const types=['create','update','remove'];
  must(ledger.length===3 && ledger.every((r,i)=>r.document_id===documentId
    &&r.actor_id===actor &&r.event_type===types[i]&&r.revision===i+1),
    'Native transaction audit sequence or actor mismatch');
  pass('Native removal and audit','Tombstone and 1→2→3 event sequence independently verified');
  return{status:'pass',passed:steps.length,total:6,steps};
 }catch(err){
  if(documentId&&!cleaned){
   try{const row=(await api.issues(boardId,workspaceId)).find(r=>r.document_id===documentId);
    if(row){await client.remove(boardId,workspaceId,actor,row);cleaned=true;}
   }catch{/* Retain evidence of partial QA run; never delete unrelated records. */}
  }
  return{status:'fail',passed:steps.length,total:6,steps,
   error:err?.status?'Backend rejected request (HTTP '+err.status+')':err?.message||'Native acceptance failed',
   cleanupConfirmed:cleaned};
 }
}
