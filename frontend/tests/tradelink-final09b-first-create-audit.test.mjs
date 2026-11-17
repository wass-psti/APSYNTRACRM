import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../sql/tests/cp-tl-final09b-first-create-readonly.sql',import.meta.url),'utf8');

test('FINAL-09B acceptance audit remains strictly read only and covers six type prefixes',()=>{
 assert.match(sql,/BEGIN TRANSACTION READ ONLY;/);
 assert.match(sql,/ROLLBACK;\s*$/);
 const statements=sql.replace(/--[^\n]*/g,'');
 assert.doesNotMatch(statements,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|TRUNCATE|CALL)\b\s/i);
 for(const [type,prefix] of Object.entries({esi:'ESI-',packing:'PL-',delivery:'DR-',payment:'AR-',quotation:'Q-',po:'PO-'})){
  assert.ok(sql.includes(`('${type}','${prefix}')`));
 }
 assert.match(sql,/e\.operation='created'/);
 assert.match(sql,/e\.actor_id=d\.created_by AND e\.revision=1/);
 assert.match(sql,/s\.revision=1/);
 assert.match(sql,/b\.title=d\.document_number/);
 assert.match(sql,/s\.content->>'documentNumber'=d\.document_number/);
 assert.match(sql,/d\.document_number ~/);
 assert.match(sql,/private\.tradelink_document_sequences/);
});
