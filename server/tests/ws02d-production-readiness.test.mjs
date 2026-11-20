import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessWorkspaceInvitationProductionReadiness as evaluate} from '../ws02d-production-readiness.mjs';
const names=['workspace membership model','signed session verification',
 'native workspace scope','workspace owner roles','digest extension',
 'invitation schema and feature flag','trusted issuance and acceptance',
 'trusted invitation manager','provider delivery ledger','native browser isolation'];
const checks=names.map(dependency=>({dependency,verified_state:'PRESENT'}));
const evidence={twoIndependentSignedStagingUsers:true,smtpAuthenticated:true,
 inboxDeliveryVerified:true,signedRecipientAcceptanceVerified:true,
 crossSessionMembershipVerified:true,trustedStagingEdgeVerified:true};
test('production currently has compatible core but no invitation schema or delivery; cannot activate',()=>{
 const observed=checks.map((x,i)=>i>=5&&i<=8?{...x,verified_state:'MISSING'}:x);
 const r=evaluate({checks:observed});
 assert.equal(r.coreSchemaCompatible,true);
 assert.equal(r.databaseInstalled,false);
 assert.equal(r.state,'BLOCKED');
 assert.equal(r.productionActivationAuthorized,false);
 assert.equal(r.missing.includes('provider delivery ledger'),true);
});
test('all SQL objects alone can never certify verified email delivery and accepted membership',()=>{
 const r=evaluate({checks});
 assert.equal(r.databaseInstalled,true);
 assert.equal(r.state,'BLOCKED');
 assert.equal(r.productionActivationAuthorized,false);
});
test('all externally verified prerequisites establish staging acceptance but never authorize production writes',()=>{
 const r=evaluate({checks,evidence});
 assert.equal(r.state,'STAGING_ACCEPTED');
 assert.equal(r.productionActivationAuthorized,false);
 assert.deepEqual(r.missing,[]);
});
test('each independent evidence dimension is required',()=>{
 for(const key of Object.keys(evidence)){
  const r=evaluate({checks,evidence:{...evidence,[key]:false}});
  assert.equal(r.state,'BLOCKED',key);
 }
});
test('unavailable or duplicate diagnostics cannot report ready',()=>{
 assert.equal(evaluate().state,'BLOCKED');
 assert.throws(()=>evaluate({checks:[checks[0],checks[0]]}),/duplicated/);
 assert.throws(()=>evaluate({checks:[{dependency:'a',verified_state:'yes'}]}),/Invalid/);
});
test('production diagnostics never mutate authorization, SMTP or invitation records',()=>{
 const sql=readFileSync('sql/diagnostics/cp-crm-workspace-invite-production-readiness.sql','utf8');
 assert.match(sql,/to_regprocedure\('private\.ws02d_issue/);
 assert.match(sql,/has_table_privilege\('authenticated'/);
 assert.match(sql,/CASE WHEN to_regclass\('private\.ws02d_invitations'\) IS NULL THEN FALSE/);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|GRANT|REVOKE|TRUNCATE|CALL)\s+(?:INTO|TABLE|ROLE|FUNCTION|ON|FROM|SCHEMA|POLICY|EXTENSION)?\b/i);
});
