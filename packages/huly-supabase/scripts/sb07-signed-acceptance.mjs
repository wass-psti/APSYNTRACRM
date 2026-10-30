/** SB07: genuine signed-user integration of existing 5173 host and Supabase.
 * Requires an existing session, never creates users or credentials.
 * Read-only by default. Writes require explicit nonproduction confirmation.
 */
import {randomUUID} from 'node:crypto';
const origin='http://127.0.0.1:5173',e=process.env;
const needed=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_ACCESS_TOKEN','HULY_BOARD_ID','HULY_WORKSPACE_ID'];
const missing=needed.filter(k=>!e[k]);if(missing.length){console.error('BLOCKED: missing '+missing.join(', '));process.exit(2);}
const endpoint=new URL(e.SUPABASE_URL);
if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error('Invalid Supabase URL');
const supabase=endpoint.origin,board=e.HULY_BOARD_ID,workspace=e.HULY_WORKSPACE_ID;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if(!uuid.test(board)||!uuid.test(workspace))throw Error('Invalid board/workspace UUID');
let checks=0;
function verify(ok,label){if(!ok)throw Error('FAIL: '+label);checks++;console.log('PASS: '+label);}
async function call(uri,opts={}){
 const headers={accept:'application/json'};
 if(opts.auth!==false)headers.authorization='Bearer '+e.SUPABASE_ACCESS_TOKEN;
 if(opts.direct)headers.apikey=e.SUPABASE_PUBLISHABLE_KEY;
 if(opts.body!==undefined)headers['content-type']='application/json';
 const res=await fetch(uri,{method:opts.method||'GET',headers,...(opts.body===undefined?{}:{body:JSON.stringify(opts.body)}),redirect:'error',signal:AbortSignal.timeout(15000)});
 let data;try{data=await res.json()}catch{throw Error('Non-JSON HTTP '+res.status);}
 return {status:res.status,data};
}
const docs=(id,ws=workspace)=>origin+'/api/v1/huly/boards/'+board+'/documents/'+encodeURIComponent(id)+'?workspace_id='+encodeURIComponent(ws);
const txPath=origin+'/api/v1/huly/boards/'+board+'/native-transactions?workspace_id='+workspace;
const atomicPath=origin+'/api/v1/huly/boards/'+board+'/transactions?workspace_id='+workspace;
function tx(kind,id,actor,other={}){return {_id:randomUUID(),_class:'core:class:Tx'+kind,space:'core:space:Tx',modifiedBy:actor,modifiedOn:Date.now(),objectClass:'tracker:class:Issue',objectSpace:'tracker:space:Project',objectId:id,...other};}
try {
 const me=await call(supabase+'/auth/v1/user',{direct:true});
 verify(me.status===200&&uuid.test(me.data.id),'Supabase verified existing signed-user session');
 const actor=me.data.id;
 const context=await call(supabase+'/rest/v1/rpc/wm_auth_access_context',{direct:true,method:'POST',body:{}});
 verify(context.status===200&&context.data.user_id===actor&&context.data.workspace_id===workspace&&context.data.profile?.status==='active','Authoritative workspace scope');
 const access=await call(supabase+'/rest/v1/rpc/work_board_access',{direct:true,method:'POST',body:{p_board_id:board,p_required:'view'}});
 verify(access.status===200&&access.data===true,'Authoritative board view permission');
 const absentId='sb07.missing.'+randomUUID();
 verify((await call(docs(absentId),{auth:false})).status===401,'Anonymous host rejection');
 verify((await call(docs(absentId))).status===404,'Signed host read and RLS');
 const outside=workspace==='11111111-1111-4111-8111-111111111111'?'22222222-2222-4222-8222-222222222222':'11111111-1111-4111-8111-111111111111';
 verify((await call(docs(absentId,outside))).status===403,'Cross-workspace denial');
 if(e.SB07_WRITE_APPROVED!=='yes'||e.SB07_NONPRODUCTION_BOARD!=='yes'){console.log('READ-ONLY VERIFIED: '+checks+' checks; signed writes pending');process.exit(0);}
 const edit=await call(supabase+'/rest/v1/rpc/work_board_access',{direct:true,method:'POST',body:{p_board_id:board,p_required:'edit'}});
 verify(edit.status===200&&edit.data===true,'Authoritative board edit permission');
 const id=randomUUID(),parent='SB07.Parent.'+id,child='SB07.Child.'+id;
 const first=tx('CreateDoc',parent,actor,{attributes:{title:'SB07 parent',status:'tracker:status:Todo',priority:2,tags:[],history:[]}});
 const second=tx('CreateDoc',child,actor,{attachedTo:parent,attachedToClass:'tracker:class:Issue',collection:'subIssues',attributes:{title:'SB07 child',status:'tracker:status:Todo',priority:2,tags:[],history:[{id:'step',phase:'pending'}]}});
 const created=await call(txPath,{method:'POST',body:{txes:[first,second]}});
 verify(created.status===200&&created.data.applied===2,'Atomic native parent-child create');
 const childDoc='huly.issue.'+child;
 const before=await call(docs(childDoc));
 verify(before.status===200&&before.data.revision===1&&before.data.payload?.snapshot?.attachedTo===parent,'Independent parent reference read');
 const change=tx('UpdateDoc',child,actor,{operations:{$push:{tags:{$each:['first']}},$update:{history:{$query:{id:'step'},$update:{phase:'done'}}}}});
 const changed=await call(txPath,{method:'POST',body:{txes:[change]}});
 verify(changed.status===200&&changed.data.applied===1,'Native embedded update persisted');
 const after=await call(docs(childDoc));
 verify(after.status===200&&after.data.revision===2&&after.data.payload.snapshot.tags?.[0]==='first'&&after.data.payload.snapshot.history?.[0]?.phase==='done','Independent operator and revision verification');
 const stale=await call(atomicPath,{method:'POST',body:{operations:[{action:'update',documentId:childDoc,expectedRevision:1,payload:after.data.payload}]}});
 verify(stale.status===409,'Stale revision denied');
 const parentDenied=await call(txPath,{method:'POST',body:{txes:[tx('RemoveDoc',parent,actor)]}});
 verify(parentDenied.status===409,'Active child protects parent');
 verify((await call(txPath,{method:'POST',body:{txes:[tx('RemoveDoc',child,actor)]}})).status===200,'Child tombstone');
 verify((await call(txPath,{method:'POST',body:{txes:[tx('RemoveDoc',parent,actor)]}})).status===200,'Parent tombstone');
 verify((await call(docs(childDoc))).status===404,'Tombstone hidden');
 const eventsUri=new URL('/rest/v1/huly_sb06_events',supabase);
 eventsUri.searchParams.set('select','event_type,actor_id');eventsUri.searchParams.set('board_id','eq.'+board);eventsUri.searchParams.set('document_id','eq.'+childDoc);
 const events=await call(eventsUri.href,{direct:true});
 const types=new Set(Array.isArray(events.data)?events.data.map(v=>v.event_type):[]);
 verify(events.status===200&&['create','update','remove'].every(t=>types.has(t))&&events.data.every(v=>v.actor_id===actor),'Independent Supabase event evidence');
 console.log('SIGNED NONPRODUCTION ACCEPTANCE: '+checks+' checks; tombstones and audit events retained');
}catch(err){console.error('BLOCKED/FAILED: '+err.message);process.exitCode=1;}
