import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const staged=readFileSync('sql/cp-tl03-staged-domain.sql','utf8');
const preflight=readFileSync('sql/tests/cp-tl03c-production-readiness.sql','utf8');
const phaseA=readFileSync('sql/tests/cp-tl03c-stage-a-readonly.sql','utf8');
const phaseB=readFileSync('sql/cp-tl03c-write-permission-candidate.sql','utf8');
const rollback=readFileSync('sql/cp-tl03c-emergency-disable-candidate.sql','utf8');
const rollbackQA=readFileSync('sql/tests/cp-tl03c-disposable-emergency-acceptance.sql','utf8');
const ci=readFileSync('.github/workflows/cp-tl03b-disposable-postgres.yml','utf8');

test('production Stage A cannot grant either public or private document mutation',()=>{
 assert.match(staged,/CREATE FUNCTION private\.tl03_commit\(/);
 assert.match(staged,/CREATE FUNCTION public\.tl03_document_commit\(/);
 assert.match(staged,/REVOKE ALL ON FUNCTION private\.tl03_commit/);
 assert.match(staged,/REVOKE ALL ON FUNCTION public\.tl03_document_commit/);
 assert.doesNotMatch(staged,/^GRANT EXECUTE ON FUNCTION (?:private\.tl03_commit|public\.tl03_document_commit)/m);
 assert.match(staged,/GRANT EXECUTE ON FUNCTION public\.tl03_document_read/);
 assert.match(staged,/GRANT EXECUTE ON FUNCTION public\.tl03_documents_list/);
 assert.equal((staged.match(/^COMMIT;$/gm)||[]).length,1);
});

test('separate Stage B grant is preflight guarded, atomic, and draft-only',()=>{
 assert.match(phaseB,/SEPARATE, EXPLICIT PRODUCTION PERMISSION-CHANGE APPROVAL/);
 assert.match(phaseB,/^BEGIN;$/m);
 assert.match(phaseB,/^COMMIT;$/m);
 assert.match(phaseB,/DO \$write_activation_preflight\$/);
 assert.match(phaseB,/to_regclass\('public\.tradelink_documents'\)/);
 assert.match(phaseB,/private\.wm_board_config_session_active\(\)/);
 assert.match(phaseB,/has_function_privilege\('authenticated'/);
 assert.match(phaseB,/GRANT EXECUTE ON FUNCTION private\.tl03_commit/);
 assert.match(phaseB,/GRANT EXECUTE ON FUNCTION public\.tl03_document_commit/);
 assert.doesNotMatch(phaseB,/^\s*(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\s/m);
});

test('Stage A verification refuses accidental write permissions and requires RLS',()=>{
 assert.match(phaseA,/has_function_privilege\('authenticated'/);
 assert.match(phaseA,/private\.tl03_commit/);
 assert.match(phaseA,/public\.tl03_document_commit/);
 assert.match(phaseA,/c\.relrowsecurity/);
 assert.match(phaseA,/Stage A unexpectedly enabled writes/);
 assert.doesNotMatch(phaseA,/^\s*(?:GRANT|REVOKE|CREATE|ALTER|INSERT|UPDATE|DELETE)\s/m);
});

test('production drift gate is read-only and pins eight actual central function definitions',()=>{
 assert.match(preflight,/WITH expected_functions/);
 assert.match(preflight,/definition_signatures_pinned|dependency_signatures_pinned/);
 assert.match(preflight,/PRECHECK_PASS__SEPARATE_PRODUCTION_APPROVAL_STILL_REQUIRED/);
 assert.match(preflight,/BLOCKED__REVIEW_DRIFT_AND_RETEST/);
 assert.equal((preflight.match(/'[a-f0-9]{32}'/g)||[]).length,8);
 assert.doesNotMatch(preflight,/^\s*(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE|TRUNCATE)\b/im);
});

test('disposable PostgreSQL CI proves deny-before-grant then signed transaction acceptance',()=>{
 const ordered=[
 'cp-tl03-disposable-setup.sql',
 'cp-tl03-staged-domain.sql',
 'cp-tl03c-stage-a-readonly.sql',
 'cp-tl03c-write-permission-candidate.sql',
 'cp-tl03-disposable-acceptance.sql',
 'cp-tl03-postactivation-readonly.sql',
 'cp-tl03c-emergency-disable-candidate.sql',
 'cp-tl03c-disposable-emergency-acceptance.sql'
 ];
 const steps=ci.slice(ci.indexOf('    steps:'));
 const offsets=ordered.map(v=>steps.indexOf(v));
 assert.ok(offsets.every((p,i)=>p>=0 && (i===0 || p>offsets[i-1])));
 assert.match(ci,/image: postgres:17/);
 assert.match(ci,/PGHOST: 127\.0\.0\.1/);
 assert.match(ci,/PGDATABASE: tradelink_disposable/);
 assert.match(ci,/persist-credentials: false/);
 assert.match(ci,/node --test/);
});

test('emergency disable revokes new document API grants without destroying audit or board data',()=>{
 assert.match(rollback,/REVOKE ALL ON FUNCTION private\.tl03_commit/);
 assert.match(rollback,/REVOKE ALL ON FUNCTION public\.tl03_document_commit/);
 assert.match(rollback,/REVOKE ALL ON FUNCTION public\.tl03_document_read/);
 assert.match(rollback,/REVOKE ALL ON FUNCTION public\.tl03_documents_list/);
 assert.match(rollback,/REVOKE SELECT ON TABLE public\.tradelink_documents,public\.tradelink_document_events/);
 assert.match(rollback,/^BEGIN;$/m);
 assert.match(rollback,/^COMMIT;$/m);
 assert.doesNotMatch(rollback,/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT|CREATE|ALTER)\b/m);
 assert.match(rollbackQA,/count\(\*\) FROM public\.tradelink_document_events/);
 assert.match(rollbackQA,/count\(\*\) FROM public\.work_board_items/);
 assert.match(rollbackQA,/Emergency disable modified disposable domain or board records/);
});
