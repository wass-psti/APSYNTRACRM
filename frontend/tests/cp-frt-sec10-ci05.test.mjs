import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requireCI05,executeCI05} from '../../scripts/cp-frt-sec10-ci05.mjs';
const candidate=readFileSync('sql/tests/cp-frt-sec10-ci05-session-guard-candidate.sql','utf8');
const source=readFileSync('scripts/cp-frt-sec10-ci05.mjs','utf8');
test('CI05 blocks all non-ephemeral or non-GitHub execution before network',async()=>{
 let network=0;
 for(const env of [{},{CI:'true',GITHUB_ACTIONS:'false',SEC10_CI05:'EPHEMERAL_ONLY'},
  {CI:'false',GITHUB_ACTIONS:'true',SEC10_CI05:'EPHEMERAL_ONLY'},
  {CI:'true',GITHUB_ACTIONS:'true',SEC10_CI05:'NOT_APPROVED'}]){
  await assert.rejects(executeCI05('',env,async()=>{network++;throw Error('OUTBOUND')}),/CI05_NOT_ISOLATED/);
 }
 assert.equal(network,0);
 assert.equal(requireCI05({CI:'true',GITHUB_ACTIONS:'true',SEC10_CI05:'EPHEMERAL_ONLY'}),true);
});
test('candidate keeps existing FRT module and CRM ceilings while checking session ownership and expiry',()=>{
 assert.match(candidate,/CANDIDATE ONLY/);
 assert.match(candidate,/RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''/);
 assert.match(candidate,/auth\.sessions AS sess/);
 assert.match(candidate,/sess\.user_id=v_actor/);
 assert.match(candidate,/sess\.id=v_sid::uuid/);
 assert.match(candidate,/to_timestamp\(v_exp::bigint\) <= now\(\)/);
 assert.match(candidate,/AND \(SELECT private\.frt_signed_session_active\(\)\)/);
 assert.match(candidate,/public\.apsyntra_crm_effective_role\(auth\.uid\(\),p_workspace_id\)/);
 assert.match(candidate,/a\.module_id='fund-released-tracker'/);
 assert.match(candidate,/wm\.workspace_id=p_workspace_id AND wm\.active=true/);
 assert.match(candidate,/REVOKE ALL ON FUNCTION private\.frt_signed_session_active\(\) FROM PUBLIC,anon,authenticated/);
 assert.doesNotMatch(candidate,/GRANT EXECUTE ON FUNCTION private\.frt_signed_session_active/);
 assert.doesNotMatch(candidate,/INSERT INTO auth\.sessions|DELETE FROM auth\.sessions/);
});
test('real JWT natural expiry is based on GoTrue exp without a fake or edited bearer',()=>{
 assert.ok(source.includes('const expireAt=member.sessionProof.expiresAt*1000'));
 assert.ok(source.includes('const lastProbe=expireAt+100000'));
 assert.ok(source.includes('setTimeout(resolve,delay)'));
 assert.ok(source.includes('member.accessToken'));
 assert.ok(source.includes('NATURALLY_EXPIRED_GOTRUE_JWT_STILL_AUTHORIZED'));
 assert.ok(source.includes('TOKEN_SESSION_REMOVED_BEFORE_NATURAL_EXPIRY'));
 assert.ok(source.includes('productionDeployed:false'));
});
