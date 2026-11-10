import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('sql/bs01-p2-privacy-governance-disposable-candidate.sql','utf8');
const base=readFileSync('sql/bs01-board-guest-sharing-disposable-candidate.sql','utf8');
const app=readFileSync('frontend/app.js','utf8');
const ui=readFileSync('frontend/board-share.js','utf8');

test('P2 requires disposable database and existing P1 schema',()=>{
 assert.match(sql,/current_database\(\)<>'workspace_disposable'/);
 for(const name of ['bs01_board_policies','bs01_guest_grants','bs01_links'])
  assert.match(sql,new RegExp("to_regclass\\('private\\."+name+"'\\) IS NULL"));
 assert.match(base,/current_database\(\)<>'workspace_disposable'/);
});
test('privacy policy is private by default, CAS controlled and audit logged',()=>{
 assert.match(base,/mode text NOT NULL DEFAULT 'private'/);
 assert.match(sql,/CREATE FUNCTION private\.bs01_set_policy\(/);
 assert.match(sql,/p_expected_revision bigint/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/Stale board privacy revision/);
 assert.match(sql,/private\.bs01_policy_events/);
 assert.match(sql,/reviewed_by=CASE WHEN p_mode='guest_shareable' THEN actor ELSE NULL END/);
 assert.match(sql,/platform_role='admin_general_manager'/);
 assert.match(sql,/public\.work_board_access\(p_board,'manage'\)/);
});
test('all 12 existing integrated application boards are pinned by id',()=>{
 const ids=[
 'b520cefe-6abb-446a-abec-ae5589329a99',
 '47df2cdc-503a-4a22-a35c-06f72be5c56b',
 'e761b849-f144-4ad2-a418-af9e68b5cc58',
 'f36da8fe-8d9d-4629-9938-12533cb3ca39',
 '7af78b3f-67bf-4600-9aa1-906d19d486e'.replace('906d','90e'),
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
 '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
 'd045708b-6e36-4f0a-92fc-f0b8baf93de3',
 'd1593528-36a6-4644-82f9-58873d3c136b',
 '8219a2a9-be85-479e-af0c-e4a399495f58',
 '991d8263-fc7d-49f0-9207-387edd51d299',
 '617c4c0f-e343-4b3b-8456-50d47dcbaf99'
 ];
 for(const boardId of ids)assert.ok(sql.includes(boardId),boardId);
 assert.match(sql,/b\.description NOT LIKE '\[APSYNTRA:MODULE:%'/);
});
test('link and grant writes require reviewed guest_shareable policy',()=>{
 assert.match(sql,/CREATE TRIGGER bs01_before_issue_guard/);
 assert.match(sql,/CREATE TRIGGER bs01_before_guest_grant_guard/);
 assert.match(sql,/private\.bs01_external_share_eligible\(NEW\.board_id\)/);
 assert.match(sql,/p\.mode='guest_shareable'/);
 assert.match(sql,/p\.reviewed_at IS NOT NULL/);
 assert.match(sql,/l\.redeemed_by IS NULL/);
 assert.match(sql,/l\.expires_at>now\(\)/);
});
test('downgrade transaction revokes both links and redeemed grants',()=>{
 assert.match(sql,/UPDATE private\.bs01_links l SET revoked_at=now\(\)/);
 assert.match(sql,/UPDATE private\.bs01_guest_grants g/);
 assert.match(sql,/SET revoked_at=now\(\),revoked_by=actor/);
 assert.match(sql,/grant\.revoked/);
 assert.match(sql,/link\.revoked/);
});
test('guest reads remain gated and unavailable to browser',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION private\.bs01_guest_read_allowed/);
 assert.match(sql,/private\.bs01_external_share_eligible\(p_board\)/);
 assert.match(sql,/f\.guest_read_enabled IS TRUE/);
 assert.match(sql,/g\.revoked_at IS NULL/);
 assert.match(sql,/i\.revoked_at IS NULL/);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.bs01_guest_read_allowed/);
 assert.match(base,/guest_read_enabled boolean NOT NULL DEFAULT false/);
 assert.doesNotMatch(sql,/^\s*GRANT\s+(?:EXECUTE|SELECT|INSERT|UPDATE|DELETE)\b/gim);
});
test('no global workspace grant, source module RPC rewrite or auth activation',()=>{
 for(const source of [sql,base]){
  assert.doesNotMatch(source,/\bINSERT\s+INTO\s+public\.workspace_members\b/i);
  assert.doesNotMatch(source,/\bUPDATE\s+public\.profiles\s+SET\s+platform_role\b/i);
  assert.doesNotMatch(source,/\bALTER\s+TABLE\s+auth\.users\b/i);
 }
 assert.match(ui,/BOARD_SHARE_LINKS_ENABLED=false/);
 assert.match(app,/case 'board-share-preview':/);
});
