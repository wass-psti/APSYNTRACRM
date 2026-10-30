/**
 * CP-HULY-SB03: genuine signed-user host acceptance.
 * Requires an existing authenticated development session; never creates accounts.
 * Default read-only; writes require two opt-ins for an isolated nonproduction board.
 */
const origin='http://127.0.0.1:5173';
const required=['SUPABASE_ACCESS_TOKEN','HULY_BOARD_ID','HULY_WORKSPACE_ID'];
const missing=required.filter(k=>!process.env[k]);
if(missing.length){console.error('BLOCKED: Missing '+missing.join(', '));process.exit(2);}
const {SUPABASE_ACCESS_TOKEN:token,HULY_BOARD_ID:board,HULY_WORKSPACE_ID:workspace}=process.env;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if(!uuid.test(board)||!uuid.test(workspace)){console.error('BLOCKED: Invalid board/workspace UUID');process.exit(2);}
const uri=(id)=>`${origin}/api/v1/huly/boards/${board}/documents/${id}?workspace_id=${workspace}`;
const send=async(id,method='GET',data,auth=true)=>{
  let res;
  try{
    res=await fetch(uri(id),{
      method,headers:{...(auth?{Authorization:`Bearer ${token}`}:{}),...(data===undefined?{}:{'content-type':'application/json'})},
      ...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(15000),redirect:'error'
    });
  }catch{throw new Error('Existing 5173 host unreachable');}
  let payload;
  try{payload=await res.json()}catch{throw new Error(`Host response ${res.status} is not JSON`);}
  return {status:res.status,payload};
};
const expect=(actual,code,label)=>{if(actual.status!==code)throw new Error(`${label}: expected ${code}, received ${actual.status}`);};
try{
  expect(await send('sb03-unsigned', 'GET',undefined,false),401,'Anonymous rejection');
  expect(await send(`cp.huly.sb03.readonly.${crypto.randomUUID()}`),404,'Signed authorized missing document');
  console.log('PASS: Host accepts a real signed-user read and rejects anonymous access.');
  if(process.env.HULY_SB03_WRITE_APPROVED!=='yes'){console.log('PENDING: nonproduction write acceptance disabled');process.exit(0);}
  if(process.env.HULY_SB03_NONPRODUCTION_BOARD!=='yes')throw new Error('Nonproduction board confirmation required');
  const id=`cp.huly.sb03.${crypto.randomUUID()}`;
  expect(await send(id,'PUT',{payload:{kind:'sb03-acceptance',version:1},expectedRevision:null}),201,'Create');
  expect(await send(id),200,'Read');
  expect(await send(id,'PUT',{payload:{kind:'sb03-acceptance',version:2},expectedRevision:1}),200,'Update');
  expect(await send(id,'PUT',{payload:{kind:'sb03-acceptance',version:3},expectedRevision:1}),409,'Stale revision conflict');
  console.log('PASS: Signed nonproduction create/read/update/conflict. Test document remains in huly_rewrite schema.');
}catch(error){console.error('BLOCKED:',error.message);process.exitCode=1;}
