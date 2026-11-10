import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('TradeLink production activation inspection is SELECT-only and Board-scoped',()=>{
 const sql=readFileSync('sql/tests/cp-tl03-activation-readonly-gate.sql','utf8');
 assert.match(sql,/WITH current_status AS/);
 assert.match(sql,/SELECT jsonb_build_object/);
 assert.match(sql,/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88/);
 assert.match(sql,/00000000-0000-4000-8000-000000000001/);
 assert.match(sql,/invalid_board_projections/);
 assert.match(sql,/tl03_events_append_only/);
 assert.match(sql,/storage\.buckets/);
 assert.match(sql,/pg_catalog\.pg_policies/);
 for(const name of ['baseDraftReady','searchReady','submitReady','reviewReady',
  'decisionReady','operationalReady','privateAttachmentsReady','backendComplete'])
  assert.ok(sql.includes("'"+name+"'"),'Missing readiness check '+name);
 assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|CALL)\s+(INTO|FROM|TABLE|FUNCTION|POLICY|SCHEMA|ROLE|ON)/i);
 assert.doesNotMatch(sql,/auth\.users|auth\.sessions|storage\.objects|request\.jwt\.claim|service_role|pg_sleep/);
});
test('TradeLink activation preserves signed security gates without retired recovery targets',()=>{
 const doc=readFileSync('docs/TRADELINK-CONTROLLED-ACTIVATION-20261109.md','utf8');
 for(const required of [
  'NO-GO','recovery-policy retirement','tradelink-document-submit-candidate.sql',
  'tradelink-document-review-revision-candidate.sql',
  'tradelink-document-decision-candidate.sql',
  'tradelink-document-operational-candidate.sql',
  'tradelink-document-attachments-candidate.sql',
  'tradelink-documents-page-candidate.sql',
  'expired/revoked sessions','No changes to TimeTracker'
 ]){
  assert.ok(doc.toLowerCase().includes(required.toLowerCase()),
   'Missing controlled acceptance prerequisite: '+required);
 }
 const currentPolicy=JSON.parse(readFileSync('config/production-release-policy.json','utf8'));
 assert.equal(currentPolicy.recovery.mandatoryRecoveryRehearsal,false);
 assert.equal(currentPolicy.recovery.mandatoryRpoHours,null);
 assert.equal(currentPolicy.recovery.mandatoryRtoHours,null);
 const client=readFileSync('frontend/tradelink-domain-client.js','utf8');
 for(const gate of ['TL03_WORKFLOW_SUBMIT_ENABLED','TL03_WORKFLOW_REVIEW_ENABLED',
  'TL03_WORKFLOW_DECISION_ENABLED','TL03_WORKFLOW_OPERATIONAL_ENABLED'])
  assert.ok(client.includes('export const '+gate+'=false;'));
 const attachments=readFileSync('frontend/tradelink-attachments.js','utf8');
 assert.match(attachments,/export const TL03_ATTACHMENTS_ENABLED=false;/);
});
