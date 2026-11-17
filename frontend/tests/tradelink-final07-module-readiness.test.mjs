import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../sql/tests/cp-tl-final07-module-readiness-readonly.sql',import.meta.url),'utf8');

test('FINAL-07 readiness audit is read-only and distinguishes archived QA from genuine acceptance',()=>{
 assert.match(sql,/BEGIN TRANSACTION READ ONLY;/);
 assert.match(sql,/ROLLBACK;\s*$/);
 const stripped=sql.replace(/--[^\n]*/g,'');
 assert.doesNotMatch(stripped,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|CREATE)\b/i);
 for(const type of ['esi','quotation','po','delivery','payment','packing'])
  assert.match(sql,new RegExp(`\\('${type}','(?:submitted|completed)','(?:submitted|completed)'\\)`));
 assert.match(sql,/count\(\*\) FILTER \(WHERE d\.archived_at IS NOT NULL\)/);
 assert.match(sql,/count\(\*\) FILTER \(WHERE d\.archived_at IS NULL\)/);
 assert.match(sql,/e\.metadata->>'action'='submit'/);
 assert.match(sql,/s\.revision=e\.revision/);
 assert.match(sql,/s\.workflow_state=r\.expected_state/);
 assert.match(sql,/b\.title=d\.document_number/);
 assert.match(sql,/production_transition_verified/);
});
