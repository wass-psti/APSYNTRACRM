/** CP-BOARD-BULK02 current-GoTrue-session, read-only authorization acceptance.
 * Deliberately invalid payloads exercise actual deployed HTTP RPC authorization
 * without inserting/updating/deleting any work_board data. No JWTs exported.
 */
import {validUuid} from './data.js';
import {canBulkEditBoard} from './board-bulk02-client.js';
import {isProtectedBoard} from './board-card-lifecycle.js';

const check=(id,status,detail)=>Object.freeze({id,status,detail});
const codeOf=error=>String(error?.code||'');
const isInvalid=error=>codeOf(error)==='22023';
const isDenied=error=>codeOf(error)==='42501'||
  (error?.status===403&&codeOf(error)!=='22023');
const combine=checks=>checks.some(x=>x.status==='FAIL')?'FAIL':
 checks.some(x=>x.status==='BLOCKED')?'BLOCKED':'PASS';
const sentinelItem='00000000-0000-4000-8000-000000000000';
const sentinelGroup='00000000-0000-4000-8000-000000000001';

async function expectRejected(api,id,args,expected,description,checks){
 try{
  await api.rpc(id,args);
  checks.push(check(description,'FAIL','An intentionally invalid request unexpectedly succeeded.'));
  return false;
 }catch(error){
  const valid=expected==='invalid'?isInvalid(error):isDenied(error);
  checks.push(check(description,valid?'PASS':codeOf(error)?'FAIL':'BLOCKED',
   valid?'The signed server enforced the expected permission and validation boundary.':
   'The server rejection did not match the expected authorization outcome.'));
  return valid;
 }
}
export async function probeBulk02SignedSession({auth,api,board}={}){
 const checks=[];
 const fail=(id,status,detail)=>({
  checkpoint:'CP-BOARD-BULK02',status,ready:false,canManage:false,
  boardId:board?.id??null,
  checks:[...checks,check(id,status,detail)]
 });
 if(!auth?.getVerifiedUser||!api?.context||!api?.board||
    !api?.boards||!api?.allowed||!api?.rpc)
  return fail('clients','BLOCKED','Current signed GoTrue or board clients unavailable.');
 if(!canBulkEditBoard(board)||!validUuid(board.workspace_id))
  return fail('board','BLOCKED','Only an accessible ordinary active board can run the activation check.');
 let user,ctx,fresh,boards;
 try{
  [user,ctx]=await Promise.all([auth.getVerifiedUser(),api.context()]);
  if(!validUuid(user?.id)||user.id!==ctx?.user_id||
     ctx?.workspace_id!==board.workspace_id||ctx?.profile?.status!=='active')
   return fail('identity','FAIL','Verified GoTrue identity or active workspace does not match.');
  checks.push(check('identity','PASS','Current GoTrue user and workspace match the board.'));
  [fresh,boards]=await Promise.all([api.board(board.id),api.boards('active')]);
  if(fresh?.board?.id!==board.id||
     fresh.board.workspace_id!==board.workspace_id||
     !Array.isArray(boards))
   return fail('scope','FAIL','The signed board read was outside the intended scope.');
  checks.push(check('scope','PASS','Current signed workspace board read succeeded.'));
 }catch{
  return fail('session','BLOCKED','Current authenticated board reads could not complete.');
 }
 const edit=await api.allowed(board.id,'edit').catch(()=>null);
 const manage=await api.allowed(board.id,'manage').catch(()=>null);
 if(typeof edit!=='boolean'||typeof manage!=='boolean')
  return fail('roles','BLOCKED','Effective server roles could not be verified.');
 checks.push(check('roles','PASS','Effective board edit and manage permissions were read from the server.'));
 const bulkArgs={p_board_id:board.id,p_action:'status',p_rows:[]};
 await expectRejected(api,'wm_board_bulk_mutate',bulkArgs,edit?'invalid':'denied',
  'bulk-edit-permission',checks);
 await expectRejected(api,'wm_board_group_cas',{
  p_board_id:board.id,p_group_id:sentinelGroup,p_expected_updated_at:null,
  p_action:'rename',p_title:'NO_WRITE'
 },edit?'invalid':'denied','group-rename-permission',checks);
 await expectRejected(api,'wm_board_group_cas',{
  p_board_id:board.id,p_group_id:sentinelGroup,p_expected_updated_at:null,
  p_action:'delete_empty',p_title:null
 },manage?'invalid':'denied','group-delete-manager-ceiling',checks);
 const protectedBoard=boards.find(x=>isProtectedBoard(x)&&validUuid(x.id));
 if(!protectedBoard)
  checks.push(check('protected-board','BLOCKED',
   'No application-protected board is visible for a real signed denial test.'));
 else await expectRejected(api,'wm_board_bulk_mutate',{
  p_board_id:protectedBoard.id,p_action:'archive',
  p_rows:[{id:sentinelItem,expected_updated_at:'2026-01-01T00:00:00Z'}]
 },'denied','protected-board',checks);
 try{
  const [after,scope]=await Promise.all([auth.getVerifiedUser(),api.context()]);
  checks.push(check('session-stability',
   after?.id===user.id&&scope?.user_id===user.id&&
   scope?.workspace_id===ctx.workspace_id?'PASS':'FAIL',
   'Current signed identity and workspace were checked again after the probes.'));
 }catch{
  checks.push(check('session-stability','BLOCKED',
   'Final signed session validation could not complete.'));
 }
 const status=combine(checks);
 return Object.freeze({
  checkpoint:'CP-BOARD-BULK02',status,
  ready:status==='PASS'&&edit===true,
  canManage:status==='PASS'&&manage===true,
  boardId:board.id,
  workspaceId:ctx.workspace_id,
  userId:user.id,
  checks:Object.freeze(checks),
  pending:Object.freeze([
   'Actual authorized writes on an approved disposable board',
   'Foreign workspace, revoked and expired disposable sessions',
   'Second-role signed browser verification and audit inspection'
  ])
 });
}
