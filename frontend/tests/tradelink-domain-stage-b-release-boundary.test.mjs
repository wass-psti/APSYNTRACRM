import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load=path=>readFileSync(path,'utf8');
const activation=load('sql/cp-tl03c-write-permission-candidate.sql');
const rollback=load('sql/cp-tl03c-stage-b-write-revoke-candidate.sql');
const emergency=load('sql/cp-tl03c-emergency-disable-candidate.sql');
const frontend=load('frontend/tradelink-domain-client.js');
const removeComments=sql=>sql.replace(/^\s*--[^\n]*$/gm,'');
const grants=[
  'private.tl03_commit(uuid,uuid,bigint,text,jsonb)',
  'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)'
];

test('Stage B production candidate grants only two exact signed Draft RPCs',()=>{
 const sql=removeComments(activation);
 assert.match(activation,/DO NOT APPLY TO PRODUCTION WITHOUT/);
 assert.equal((sql.match(/^GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+/gmi)||[]).length,2);
 assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);
 assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
 assert.match(sql,/DO \$write_activation_preflight\$/);
 for(const signature of grants){
  const expected='GRANT EXECUTE ON FUNCTION '+signature+'\n TO authenticated;';
  assert.ok(sql.includes(expected),'Missing exact scoped grant: '+signature);
  assert.match(sql,new RegExp('has_function_privilege\\(\\x27authenticated\\x27,\\s*\\x27'+signature.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\x27,\\x27EXECUTE\\x27\\)'));
 }
 assert.doesNotMatch(sql,/^\s*(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER|CALL|COPY|REVOKE)\b/gmi);
 assert.doesNotMatch(sql,/^\s*GRANT\s+(?!EXECUTE\s+ON\s+FUNCTION)/gmi);
 assert.doesNotMatch(sql,/\b(?:anon|service_role)\b\s*;/i);
});
test('narrow rollback only removes Stage B write grants and preserves Stage A reads',()=>{
 const sql=removeComments(rollback);
 assert.match(rollback,/DO NOT RUN ON PRODUCTION WITHOUT SEPARATE/);
 assert.equal((sql.match(/^REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+/gmi)||[]).length,2);
 for(const signature of grants){
  assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION '+signature+'\n FROM authenticated;'));
 }
 assert.doesNotMatch(sql,/^\s*(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER|CALL|COPY|GRANT)\b/gmi);
 assert.doesNotMatch(sql,/^REVOKE\s+SELECT\b/gmi);
 assert.match(sql,/has_function_privilege\('authenticated',\s*'public\.tl03_documents_list\(uuid,integer\)','EXECUTE'\)/);
 assert.match(sql,/has_function_privilege\('authenticated',\s*'public\.tl03_document_read\(uuid,uuid\)','EXECUTE'\)/);
 assert.match(sql,/has_table_privilege\('authenticated',\s*'public\.tradelink_documents','SELECT'\)/);
 assert.match(sql,/has_table_privilege\('authenticated',\s*'public\.tradelink_document_events','SELECT'\)/);
 assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);
 assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
});
test('broad emergency disable is distinct, and frontend cannot silently enable writes',()=>{
 assert.match(emergency,/REVOKE ALL ON FUNCTION public\.tl03_documents_list/);
 assert.match(emergency,/REVOKE SELECT ON TABLE public\.tradelink_documents/);
 assert.match(frontend,/export const TL03_DOMAIN_READS_ENABLED=true;/);
 assert.match(frontend,/export const TL03_DOMAIN_WRITES_ENABLED=true;/);
});
