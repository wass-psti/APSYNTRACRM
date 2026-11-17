import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const readNormalized=(path)=>readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
import {TL03_WORKFLOW_SUBMIT_ENABLED,TL03_DUAL_REVIEW_ENABLED} from '../tradelink-domain-client.js';

const candidate=readNormalized('sql/tradelink-document-submit-candidate.sql','utf8');
const migration=readNormalized('supabase/migrations/20261117060100_tradelink_submitted_workflow_activation.sql','utf8');

test('staged production migration uses the tested Submit function and exact candidate',()=>{
 const section=migration.indexOf('-- TradeLink document workflow:');
 assert.ok(section>0);
 const normalized=migration.slice(section).replace(/-- Compatibility gate for the existing production immutable revision engine\.[\s\S]*?END \$snapshot_preflight\$;\n/,'');
 assert.equal(normalized.replace('BEGIN;\n\n','BEGIN;\n'),candidate);
 assert.match(migration,/tl03_document_revision_snapshot_guard/);
 assert.match(migration,/tl03_document_revision_snapshot_update/);
 assert.match(migration,/tl03_events_append_only/);
 assert.match(migration,/DO \$snapshot_preflight\$/);
 assert.match(migration,/p_operation NOT IN|p_expected_revision/);
 assert.match(migration,/CREATE FUNCTION public\.tl03_document_submit/);
 assert.match(migration,/SECURITY INVOKER SET search_path=''/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.tl03_document_submit/);
});

test('installed backend has a separately activated Submit frontend while two-reviewer flow remains enabled',()=>{
 assert.equal(TL03_WORKFLOW_SUBMIT_ENABLED,true);
 assert.equal(TL03_DUAL_REVIEW_ENABLED,true);
});
