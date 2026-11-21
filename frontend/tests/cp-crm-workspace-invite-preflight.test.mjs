import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WS02D_INVITE_CLIENT_ENABLED,WorkspaceInvitationClient} from '../workspace-invitation-client.js';
import {WS02D_ACCEPTANCE_ENABLED,WorkspaceInvitationAcceptanceClient} from '../workspace-invitation-acceptance.js';
import {WS11_INVITATION_MANAGEMENT_ENABLED,WorkspaceInvitationManagementClient} from '../workspace-invitation-management.js';
import {validateDirectEmailInvitation} from '../workspace-ui.js';
const source=(path)=>readFileSync(path,'utf8');
const id='11111111-1111-4111-8111-111111111111';
test('production UI explicitly marks send, acceptance and manager listing dormant; no optimistic membership',()=>{
 assert.equal(WS02D_INVITE_CLIENT_ENABLED,false);
 assert.equal(WS02D_ACCEPTANCE_ENABLED,false);
 assert.equal(WS11_INVITATION_MANAGEMENT_ENABLED,false);
 const ui=source('frontend/workspace-ui.js');
 assert.match(ui,/Send invitation/);
 assert.match(ui,/data-ws11-refresh/);
 assert.match(ui,/refresh.disabled=!canManage/);
 assert.match(ui,/recipient joins after signing in and accepting/);
});
test('dormant clients do not attempt authenticated writes or reads',async()=>{
 const auth={authorized:()=>{throw Error('unexpected network')}};
 const api={context:()=>{throw Error('unexpected DB read')}};
 await assert.rejects(new WorkspaceInvitationClient({auth,api}).send({workspaceId:id}),{status:503});
 await assert.rejects(new WorkspaceInvitationAcceptanceClient({auth,api}).accept('invalid'),{status:503});
 await assert.rejects(new WorkspaceInvitationManagementClient({auth,api}).list(id),{status:503});
});
test('frontend uses the three distinct trusted endpoints and a single normalized Member recipient',()=>{
 assert.equal(validateDirectEmailInvitation({email:'  Member@Example.COM '}).email,'member@example.com');
 assert.equal(validateDirectEmailInvitation({email:'a@example.com,b@example.com'}).valid,false);
 assert.match(source('frontend/workspace-invitation-client.js'),/\/functions\/v1\/ws02d-invite/);
 assert.match(source('frontend/workspace-invitation-acceptance.js'),/\/functions\/v1\/ws02d-accept/);
 assert.match(source('frontend/workspace-invitation-management.js'),/\/functions\/v1\/ws02d-manage/);
});
test('candidate SQL acceptance uses an existing workspace membership model without implicit board grant',()=>{
 const sql=source('sql/cp-ws02d-invitation-accept-candidate.sql');
 assert.match(sql,/INSERT INTO public\.workspace_members/);
 assert.match(sql,/INSERT INTO private\.ws01_member_roles/);
 assert.match(sql,/email_confirmed_at IS NOT NULL/);
 assert.match(sql,/v_inv\.state<>'pending'/);
 assert.match(sql,/v_inv\.expires_at<=now\(\)/);
 assert.doesNotMatch(sql,/INSERT INTO public\.work_board_members|GRANT EXECUTE.*authenticated/s);
});
test('repository trusted handler is staged; deployed reservation is independently inventoried before activation',()=>{
 const invite=source('supabase/functions/ws02d-invite/index.ts');
 const accept=source('supabase/functions/ws02d-accept/index.ts');
 assert.match(invite,/serveInvitationRoute\('invite'\)/);
 assert.match(accept,/serveInvitationRoute\('accept'\)/);
 // This is NOT evidence these candidate functions are deployed. Production
 // inspection (recorded in the investigation) found dormant HTTP 503 handlers.
});
