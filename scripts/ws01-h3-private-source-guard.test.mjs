import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync,
  unlinkSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyPinnedCoreManifest, verifyPrivateSourceBundle,
  verifyDefaultPinnedSourceCatalog, generateLiveCatalogFingerprintSql } from './ws01-h3-private-source-guard.mjs';

const manifest = JSON.parse(readFileSync(
  new URL('../sql/tests/cp-ws01-h3-private-core-source-manifest.json',import.meta.url)));
const g4b = JSON.parse(readFileSync(
  new URL('../sql/tests/cp-ws01c-g4b-source-fingerprint-inventory.json',import.meta.url)));
const g4c = JSON.parse(readFileSync(
  new URL('../sql/tests/cp-ws01c-g4c-role-dependent-fingerprints.json',import.meta.url)));
const sourceExports={generateLiveCatalogFingerprintSql};
const hash = text => createHash('sha256').update(text).digest('hex');

test('pin 3 real source signatures, permissions and 73 unique dependency fingerprints',()=>{
 const result=verifyDefaultPinnedSourceCatalog();
 assert.deepEqual(result,{core:3,directCallers:73,copiedSource:false,runtimeReplay:false});
 const drift=structuredClone(manifest);
 drift.core_functions[1].source_sha256='0'.repeat(64);
 assert.throws(()=>verifyPinnedCoreManifest(drift,g4b,g4c),/CROSS_MANIFEST_DRIFT/);
 const acl=structuredClone(manifest);
 acl.core_functions[2].authenticated_execute=true;
 assert.throws(()=>verifyPinnedCoreManifest(acl,g4b,g4c),/ACL_OR_BEHAVIOR_METADATA_DRIFT/);
 const overlap=structuredClone(g4c);
 overlap.dependents.find(x=>x.calls_current_workspace_id).source_sha256='f'.repeat(64);
 assert.throws(()=>verifyPinnedCoreManifest(manifest,g4b,overlap),/DEPENDENCY_INTERSECTION_DRIFT/);
});

function withPrivateFixtures(fn) {
 const base=mkdtempSync(join(tmpdir(),'ws01-h3-'));
 const repo=join(base,'repo'),bundle=join(base,'private');
 mkdirSync(repo,{mode:0o700});
 mkdirSync(bundle,{mode:0o700});
 const contents=[
  'CREATE FUNCTION public.alpha() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;\n',
  'CREATE FUNCTION public.beta() RETURNS int AS $$ SELECT 2 $$ LANGUAGE sql;\n',
  'CREATE FUNCTION public.gamma() RETURNS int AS $$ SELECT 3 $$ LANGUAGE sql;\n'
 ];
 const files=['current_workspace_id.sql','has_module_access.sql','module_role_for.sql'];
 const snapshot={core_functions:files.map((file,i)=>({
  file,source_sha256:hash(contents[i])
 }))};
 try {
  files.forEach((file,i)=>writeFileSync(join(bundle,file),contents[i],
    {mode:0o600}));
  return fn({base,repo,bundle,snapshot,files});
 } finally {
  rmSync(base,{recursive:true,force:true});
 }
}

test('valid protected source hashes pass without executing SQL',()=>{
 withPrivateFixtures(({repo,bundle,snapshot})=>{
  assert.deepEqual(verifyPrivateSourceBundle({directory:bundle,manifest:snapshot,repo}),
    {verifiedFiles:3,sourceReplay:false});
 });
});

test('tampered SQL is rejected; no SQL body or directory path leaks',()=>{
 withPrivateFixtures(({repo,bundle,snapshot,files})=>{
  writeFileSync(join(bundle,files[0]),'TAMPERED\n',{mode:0o600});
  assert.throws(()=>verifyPrivateSourceBundle({directory:bundle,manifest:snapshot,repo}),
    /SOURCE_FINGERPRINT_MISMATCH/);
 });
});

test('unsafe directory ACL, file ACL and extra files are rejected',()=>{
 withPrivateFixtures(({repo,bundle,snapshot,files})=>{
  chmodSync(bundle,0o755);
  assert.throws(()=>verifyPrivateSourceBundle({directory:bundle,manifest:snapshot,repo}),
    /INSECURE_DIRECTORY_PERMISSIONS/);
  chmodSync(bundle,0o700);
  chmodSync(join(bundle,files[0]),0o644);
  assert.throws(()=>verifyPrivateSourceBundle({directory:bundle,manifest:snapshot,repo}),
    /INSECURE_SOURCE_PERMISSIONS/);
  chmodSync(join(bundle,files[0]),0o600);
  writeFileSync(join(bundle,'unexpected.sql'),'ignored',{mode:0o600});
  assert.throws(()=>verifyPrivateSourceBundle({directory:bundle,manifest:snapshot,repo}),
    /UNEXPECTED_PRIVATE_BUNDLE_FILES/);
 });
});

test('symlinked private SQL and source placed inside the public repository fail closed',()=>{
 withPrivateFixtures(({base,repo,bundle,snapshot,files})=>{
  const source=join(bundle,files[0]);
  const real=join(base,'real.sql');
  rmSync(source,{force:true});
  writeFileSync(real,'link target',{mode:0o600});
  symlinkSync(real,source);
  assert.throws(()=>verifyPrivateSourceBundle({directory:bundle,manifest:snapshot,repo}),
    /INSECURE_SOURCE_TYPE/);
  unlinkSync(source);
  rmSync(real,{force:true});
  const inside=join(repo,'source-bundle');
  mkdirSync(inside,{mode:0o700});
  for(const file of files)writeFileSync(join(inside,file),'dummy',{mode:0o600});
  assert.throws(()=>verifyPrivateSourceBundle({directory:inside,manifest:snapshot,repo}),
    /PRIVATE_SOURCE_WITHIN_PUBLIC_REPOSITORY/);
 });
});

test('CLI marks metadata-only acceptance and fails closed with no secret files',()=>{
 const exe=fileURLToPath(new URL('./ws01-h3-private-source-guard.mjs',import.meta.url));
 const good=spawnSync(process.execPath,[exe,'--manifest-only'],{encoding:'utf8'});
 assert.equal(good.status,0);
 assert.match(good.stdout,/CORE_PROVENANCE_PASS/);
 assert.match(good.stdout,/replay NOT RUN/);
 const blocked=spawnSync(process.execPath,[exe],{encoding:'utf8'});
 assert.notEqual(blocked.status,0);
 assert.match(blocked.stderr,/H3_SOURCE_BLOCKED: USAGE/);
 assert.doesNotMatch(blocked.stderr,/CREATE FUNCTION|supabase\.co|service_role/i);
});

test('live source catalog probe is read-only, deterministic and returns only hashes/signatures',()=>{
 const { generateLiveCatalogFingerprintSql } = sourceExports;
 const sql=generateLiveCatalogFingerprintSql(manifest,g4b,g4c);
 assert.match(sql,/WITH expected\(signature,expected_sha256,expected_definer,/);
 assert.match(sql,/count\(\*\)=74/);
 assert.match(sql,/SOURCE_OR_PERMISSION_BASELINE_DRIFT__REVIEW_REQUIRED/);
 assert.match(sql,/HISTORICAL_BASELINE_MATCH__RUNTIME_UNVERIFIED/);
 assert.match(sql,/permission_mismatch_signatures/);
 assert.match(sql,/documented_live_sha256/);
 assert.match(sql,/documented_live_evolutions/);
 assert.match(sql,/unexplained_drift/);
 assert.match(sql,/DOCUMENTED_LIVE_EVOLUTION__RUNTIME_UNVERIFIED/);
 assert.match(sql,/08da27924332a9cd8290ff6e7e379308567e6f26f1ae5e6ac443c412489ac618/);
 assert.match(sql,/pg_catalog\.has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/);
 assert.match(sql,/pg_catalog\.has_function_privilege\('anon',p\.oid,'EXECUTE'\)/);
 assert.match(sql,/count\(\*\) FILTER \(WHERE permission_drift\)/);
 assert.match(sql,/private\.tl03_commit/);
 assert.match(sql,/false/);
 assert.match(sql,/NULL/);
 assert.match(sql,/pg_catalog\.pg_get_functiondef/);
 assert.match(sql,/jsonb_agg\(signature ORDER BY signature\)/);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE)\s+(?:TABLE|FUNCTION|ROLE|ON|INTO|FROM|public|private)/i);
 assert.doesNotMatch(sql,/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public/i);
 const conflict=structuredClone(g4c);
 conflict.role_sources[0].source_sha256='0'.repeat(64);
 assert.throws(()=>generateLiveCatalogFingerprintSql(manifest,g4b,conflict),
   /CROSS_MANIFEST_DRIFT/);
 const executable=fileURLToPath(new URL('./ws01-h3-private-source-guard.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[executable,'--catalog-sql'],{encoding:'utf8'});
 assert.equal(result.status,0);
 assert.equal(result.stdout.trim(),sql.trim());
 assert.equal(result.stderr,'');
});

test('historical ACL expectations do not silently adopt later grants',()=>{
 const sql=generateLiveCatalogFingerprintSql(manifest,g4b,g4c);
 const entry=g4b.entries.find(e=>e.signature.startsWith('private.tl03_commit('));
 assert.equal(entry.authenticated_execute,false,'source manifest was Stage A');
 assert.ok(sql.includes("'"+entry.signature+"','"+entry.source_sha256+"',true,false,NULL"));
 const drift=structuredClone(g4b);
 drift.entries.find(e=>e.signature===entry.signature).authenticated_execute=true;
 // Baseline comparison may differ but the stored historical manifest is never updated.
 const changed=generateLiveCatalogFingerprintSql(manifest,drift,g4c);
 assert.ok(changed.includes("'"+entry.signature+"','"+entry.source_sha256+"',true,true,NULL"));
 assert.notEqual(sql,changed);
});

test('documented evolution is confined to exact historical TradeLink signature and hash',()=>{
 const sql=generateLiveCatalogFingerprintSql(manifest,g4b,g4c);
 const entry=g4b.entries.find(e=>e.signature.startsWith('private.tl03_commit('));
 assert.ok(entry);
 assert.match(sql,/5fb4ac5d256746444786826d8128abdcfa5c54ecbe145aff5fd55fa25a89119d/);
 assert.match(sql,/08da27924332a9cd8290ff6e7e379308567e6f26f1ae5e6ac443c412489ac618/);
 const rows=sql.split('\n').filter(line=>line.trim().startsWith("('"));
 assert.equal(rows.filter(line=>line.includes('08da27924332a9cd8290ff6e7e379308567e6f26f1ae5e6ac443c412489ac618')).length,1);
 assert.match(rows.find(line=>line.includes(entry.signature)),/true,false,NULL,'08da279/);
 const drift=structuredClone(g4b);
 drift.entries.find(e=>e.signature===entry.signature).source_sha256='a'.repeat(64);
 assert.throws(()=>generateLiveCatalogFingerprintSql(manifest,drift,g4c),
   /DOCUMENTED_EVOLUTION_HISTORICAL_BASELINE_DRIFT/);
});
