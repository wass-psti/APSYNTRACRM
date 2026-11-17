import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../sql/tests/cp-tl-final05-production-readonly.sql',import.meta.url),'utf8');

test('FINAL-05 production acceptance query is read-only and covers six source transition outcomes',()=>{
 assert.match(sql,/BEGIN TRANSACTION READ ONLY;/);
 assert.match(sql,/ROLLBACK;\s*$/);
 assert.equal((sql.match(/\bSELECT\b/gi)||[]).length>=5,true);
 const plain=sql.replace(/--[^\n]*/g,'');
 assert.doesNotMatch(plain,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|CREATE|CALL|EXECUTE)\b\s+(?:INTO|TABLE|FUNCTION|ON|FROM|public|private|auth|\w+\.)?/i);
 for(const type of ['esi','quotation','po','delivery','payment','packing'])
  assert.match(sql,new RegExp(`\\('${type}','(?:submitted|completed)','(?:submitted|completed)'\\)`));
 assert.match(sql,/s\.revision=e\.revision/);
 assert.match(sql,/e\.metadata->>'action'='submit'/);
 assert.match(sql,/s\.document_number=d\.document_number/);
 assert.match(sql,/s\.board_item_id=d\.board_item_id/);
 assert.match(sql,/current_snapshot_mismatches/);
 assert.match(sql,/current_board_mismatches/);
});
