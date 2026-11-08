import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, chmodSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildReadOnlyAcquisitionSql,validateAcquiredRows,
 persistVerifiedSourceBundle } from './ws01-activate04-acquire-protected-sources.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex');
function sample() {
 const sources=[],rows=[];
 for(let i=0;i<74;i++){
  const signature='private.synthetic_'+i+'(p_id uuid)';
  const body=Buffer.from('-- source fixture '+i+'\n');
  sources.push({signature,file:hash(signature)+'.sql',
    source_sha256:hash(body)});
  rows.push([signature,body.toString('hex'),'postgres','t','f','f'].join('\t'));
 }
 return {sources,rows};
}

test('acquisition query is source-scoped and read-only',()=>{
 const {sources}=sample();
 const sql=buildReadOnlyAcquisitionSql(sources);
 assert.match(sql,/BEGIN READ ONLY;/);
 assert.match(sql,/SET LOCAL statement_timeout='30s';/);
 assert.match(sql,/pg_catalog\.pg_get_functiondef/);
 assert.match(sql,/ORDER BY wanted.signature;/);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|GRANT|REVOKE|TRUNCATE)\s+(?:INTO|TABLE|FUNCTION|ROLE|ON|FROM)/i);
 assert.equal((sql.match(/private\.synthetic_/g)||[]).length,74);
});

test('all 74 synthetic protected definitions validate without executing callers',()=>{
 const {sources,rows}=sample();
 const result=validateAcquiredRows(rows.join('\n')+'\n',sources);
 assert.equal(result.files.length,74);
 assert.equal(result.documentedLiveEvolutions,0);
 assert.deepEqual(result.files.map(f=>f.filename),
  sources.map(s=>s.file));
});

test('missing, modified, duplicate and unexpected sources fail closed',()=>{
 const {sources,rows}=sample();
 assert.throws(()=>validateAcquiredRows(rows.slice(1).join('\n'),sources),
  /SOURCE_ROW_COUNT_MISMATCH/);
 const altered=[...rows];altered[0]=altered[0].replace('736f75726365','ff6f75726365');
 assert.throws(()=>validateAcquiredRows(altered.join('\n'),sources),
  /SOURCE_FINGERPRINT_MISMATCH/);
 const duplicated=[...rows];duplicated[0]=duplicated[1];
 assert.throws(()=>validateAcquiredRows(duplicated.join('\n'),sources),
  /SOURCE_UNEXPECTED_OR_DUPLICATE/);
 const malformed=[...rows];malformed[0]='private.synthetic_0(p_id uuid)\txyz\tpostgres\tt\tf\tf';
 assert.throws(()=>validateAcquiredRows(malformed.join('\n'),sources),
  /SOURCE_BYTES_INVALID/);
});

test('private source acquisition writes 0600 only outside public checkout',()=>{
 const root=mkdtempSync(join(tmpdir(),'ws01-activate04-acquire-'));
 const parent=join(root,'secret'),repo=join(root,'repo');
 mkdirSync(parent,{mode:0o700});mkdirSync(repo,{mode:0o700});
 const {sources,rows}=sample(),outputDir=join(parent,'originals');
 try {
  const result=persistVerifiedSourceBundle({outputDir,sources,rows:rows.join('\n'),repo});
  assert.deepEqual(result,{verifiedSources:74,documentedLiveEvolutions:0,executionPerformed:false});
  assert.equal(readdirSync(outputDir).length,74);
  assert.equal(readFileSync(join(outputDir,sources[0].file),'utf8'),'-- source fixture 0\n');
  assert.throws(()=>persistVerifiedSourceBundle({outputDir,sources,rows:rows.join('\n'),repo}),
    /OUTPUT_ALREADY_EXISTS/);
  assert.throws(()=>persistVerifiedSourceBundle({outputDir:join(repo,'source'),sources,rows:rows.join('\n'),repo}),
    /OUTPUT_INSIDE_PUBLIC_REPO/);
  chmodSync(parent,0o755);
  assert.throws(()=>persistVerifiedSourceBundle({outputDir:join(parent,'other'),sources,rows:rows.join('\n'),repo}),
    /INSECURE_OUTPUT_PARENT/);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('CLI requires configured database and never echoes SQL or private paths',()=>{
 const exe=fileURLToPath(new URL('./ws01-activate04-acquire-protected-sources.mjs',import.meta.url));
 const env={...process.env,PGHOST:'',PGUSER:'',PGDATABASE:''};
 const child=spawnSync(process.execPath,[exe,'--output-dir=/nonexistent/secret'],{encoding:'utf8',env});
 assert.notEqual(child.status,0);
 assert.match(child.stderr,/CP_WS_ACTIVATE04_ACQUISITION_BLOCKED: DATABASE_CONNECTION_NOT_CONFIGURED/);
 assert.doesNotMatch(child.stderr,/private\.synthetic_|nonexistent|CREATE FUNCTION|password|service_role/i);
});
