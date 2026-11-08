// CP-WS-01/H3 offline function-source guard.
// Never prints SQL source, account data or the protected directory path.
// This checks provenance only; it never connects to or changes any database.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const manifestFile = fileURLToPath(new URL(
  '../sql/tests/cp-ws01-h3-private-core-source-manifest.json', import.meta.url));
const g4bFile = fileURLToPath(new URL(
  '../sql/tests/cp-ws01c-g4b-source-fingerprint-inventory.json', import.meta.url));
const g4cFile = fileURLToPath(new URL(
  '../sql/tests/cp-ws01c-g4c-role-dependent-fingerprints.json', import.meta.url));

const ensure = (ok,code) => { if (!ok) throw new Error(code); };
const sha256 = value => createHash('sha256').update(value).digest('hex');

// Fingerprints and ACLs prove source identity, not functional authorization.
export function verifyPinnedCoreManifest(manifest, g4b, g4c) {
  ensure(manifest?.checkpoint === 'CP-WS-01-Lifecycle-H3', 'BAD_CHECKPOINT');
  ensure(manifest.source_bodies_included === false
    && manifest.requires_private_source_bundle === true, 'SOURCE_BOUNDARY');
  const entries = manifest.core_functions;
  ensure(Array.isArray(entries) && entries.length === 3, 'BAD_ENTRY_COUNT');
  const byFile = new Map(entries.map(x => [x.file,x]));
  ensure(byFile.size === 3, 'DUPLICATE_ENTRY');
  const required = [
    ['current_workspace_id.sql','public.current_workspace_id(p_user_id uuid)','uuid',true],
    ['has_module_access.sql','public.has_module_access(p_module_id text, p_user_id uuid)','boolean',true],
    ['module_role_for.sql','public.module_role_for(p_module_id text, p_user_id uuid)','text',false],
  ];
  const g4bBySignature = new Map(g4b.entries.map(e => [
    e.signature, e.source_sha256]));
  const g4cBySignature = new Map(g4c.role_sources.map(e => [
    e.signature, e.source_sha256]));
  for (const [name,signature,returns,clientExec] of required) {
    const f = byFile.get(name);
    ensure(f?.signature===signature && f.return_type===returns,'SIGNATURE_DRIFT');
    ensure(f.owner==='postgres' && f.language==='sql'
      && f.volatility==='stable' && f.security_definer===true
      && f.anon_execute===false && f.authenticated_execute===clientExec
      && f.search_path==='public', 'ACL_OR_BEHAVIOR_METADATA_DRIFT');
    ensure(/^[a-f0-9]{64}$/.test(f.source_sha256),'BAD_SOURCE_HASH');
    if (name!=='current_workspace_id.sql') {
      ensure(g4bBySignature.get(signature)===f.source_sha256
        && g4cBySignature.get(signature)===f.source_sha256,
      'CROSS_MANIFEST_DRIFT');
    }
  }
  ensure(g4b.entries.length===63 && g4c.dependents.length===54,
    'DEPENDENCY_COUNT_DRIFT');
  const old = new Map(g4b.entries.map(x=>[x.signature,x.source_sha256]));
  const shared = g4c.dependents.filter(x=>old.has(x.signature));
  ensure(shared.length===44 && shared.every(
    x=>old.get(x.signature)===x.source_sha256),'DEPENDENCY_INTERSECTION_DRIFT');
  ensure(new Set([...g4b.entries.map(x=>x.signature),
    ...g4c.dependents.map(x=>x.signature)]).size===73,
  'DEPENDENCY_UNION_DRIFT');
  return Object.freeze({core:3,directCallers:73,copiedSource:false,runtimeReplay:false});
}
const isInsideRepo = (candidate,repo) => {
  const rel=relative(repo,candidate);
  return rel==='' || (rel!=='..' && !rel.startsWith('..'+sep)
    && !isAbsolute(rel));
};

export function verifyPrivateSourceBundle({directory,manifest,repo=repoRoot}) {
  ensure(typeof directory==='string'&&isAbsolute(directory),
    'BUNDLE_MUST_BE_ABSOLUTE');
  const wanted=manifest.core_functions;
  ensure(Array.isArray(wanted)&&wanted.length===3,'UNVERIFIED_MANIFEST');
  const actualDir=resolve(directory);
  const info=lstatSync(actualDir);
  ensure(info.isDirectory()&&!info.isSymbolicLink(),'INSECURE_DIRECTORY_TYPE');
  ensure((info.mode & 0o077)===0,'INSECURE_DIRECTORY_PERMISSIONS');
  if(typeof process.getuid==='function')
    ensure(info.uid===process.getuid(),'WRONG_DIRECTORY_OWNER');
  const realDir=realpathSync(actualDir);
  ensure(!isInsideRepo(realDir,realpathSync(repo)),
    'PRIVATE_SOURCE_WITHIN_PUBLIC_REPOSITORY');
  ensure(JSON.stringify(readdirSync(realDir).sort())===
    JSON.stringify(wanted.map(x=>x.file).sort()),
  'UNEXPECTED_PRIVATE_BUNDLE_FILES');
  for(const source of wanted) {
    ensure(/^[a-z][a-z0-9_]*\.sql$/.test(source.file)
      && basename(source.file)===source.file,'INVALID_SOURCE_NAME');
    ensure(/^[0-9a-f]{64}$/.test(source.source_sha256),
      'INVALID_SOURCE_HASH');
    const path=join(realDir,source.file),st=lstatSync(path);
    ensure(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1,
      'INSECURE_SOURCE_TYPE');
    ensure((st.mode & 0o077)===0,'INSECURE_SOURCE_PERMISSIONS');
    if(typeof process.getuid==='function')
      ensure(st.uid===process.getuid(),'WRONG_SOURCE_OWNER');
    ensure(st.size>0&&st.size<=128*1024,'INVALID_SOURCE_SIZE');
    // Exact pg_get_functiondef output, including trailing newline.
    ensure(sha256(readFileSync(path))===source.source_sha256,
      'SOURCE_FINGERPRINT_MISMATCH');
  }
  return Object.freeze({verifiedFiles:3,sourceReplay:false});
}
// Build a read-only, metadata-only live drift probe from the pinned inventories.
// The SQL reads pg_get_functiondef internally to hash it but returns NO source text.
// A matching result proves source identity, never PostgreSQL runtime compatibility.
export function generateLiveCatalogFingerprintSql(manifest,g4b,g4c) {
 verifyPinnedCoreManifest(manifest,g4b,g4c);
 const entries=new Map();
 for(const entry of [...g4b.entries,...g4c.dependents,...manifest.core_functions]){
  const previous=entries.get(entry.signature);
  ensure(!previous||previous===entry.source_sha256,'SOURCE_CATALOG_CONFLICT');
  entries.set(entry.signature,entry.source_sha256);
 }
 ensure(entries.size===74,'SOURCE_CATALOG_COUNT_DRIFT');
 const literal=value=>"'"+value.replaceAll("'","''")+"'";
 const rows=[...entries].sort(([a],[b])=>a.localeCompare(b))
  .map(([signature,sha])=>'('+literal(signature)+','+literal(sha)+')')
  .join(',\n ');
 return `-- CP-WS-ACTIVATE-04 read-only production source-fingerprint preflight.
-- This prints aggregate drift and signatures ONLY, never SQL function bodies.
-- MATCH is provenance only; 73 real caller paths remain unexecuted.
WITH expected(signature,expected_sha256) AS (
 VALUES
 ${rows}
), actual AS (
 SELECT pg_catalog.format('%I.%I(%s)',n.nspname,p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid)) AS signature,
   pg_catalog.encode(pg_catalog.sha256(
     pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid),'UTF8')),
     'hex') AS actual_sha256
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private','huly_rewrite')
), audit AS (
 SELECT e.signature, (a.signature IS NULL) AS missing,
   (a.signature IS NOT NULL AND a.actual_sha256<>e.expected_sha256) AS drift
 FROM expected e LEFT JOIN actual a ON a.signature=e.signature
)
SELECT count(*) AS expected_total,
 count(*) FILTER (WHERE NOT missing) AS located,
 count(*) FILTER (WHERE missing) AS missing,
 count(*) FILTER (WHERE drift) AS drift,
 COALESCE(pg_catalog.jsonb_agg(signature ORDER BY signature)
   FILTER (WHERE missing OR drift),'[]'::jsonb) AS mismatch_signatures,
 CASE WHEN count(*)=74 AND
   count(*) FILTER (WHERE missing OR drift)=0
 THEN 'SOURCE_FINGERPRINTS_MATCH__RUNTIME_UNVERIFIED'
 ELSE 'SOURCE_FINGERPRINT_DRIFT__REVIEW_REQUIRED' END AS status
FROM audit;`;
}

export function verifyDefaultPinnedSourceCatalog() {
  return verifyPinnedCoreManifest(JSON.parse(readFileSync(manifestFile,'utf8')),
    JSON.parse(readFileSync(g4bFile,'utf8')),
    JSON.parse(readFileSync(g4cFile,'utf8')));
}
function cli() {
  try {
    const args=process.argv.slice(2);
    ensure(args.length===1&&(args[0]==='--manifest-only'||
      args[0]==='--catalog-sql'||args[0].startsWith('--private-dir=')),'USAGE');
    verifyDefaultPinnedSourceCatalog();
    if(args[0]==='--catalog-sql') {
      // No connection, credentials, source bodies or production writes.
      console.log(generateLiveCatalogFingerprintSql(
        JSON.parse(readFileSync(manifestFile,'utf8')),
        JSON.parse(readFileSync(g4bFile,'utf8')),
        JSON.parse(readFileSync(g4cFile,'utf8'))));
      return;
    }
    if(args[0]==='--manifest-only') {
      console.log('CP_WS01_H3_CORE_PROVENANCE_PASS: 3 core sources, 73 dependencies; replay NOT RUN');
      return;
    }
    verifyPrivateSourceBundle({
      directory:args[0].slice('--private-dir='.length),
      manifest:JSON.parse(readFileSync(manifestFile,'utf8'))
    });
    console.log('CP_WS01_H3_PRIVATE_SOURCE_FINGERPRINT_PASS: 3 protected snapshots; replay NOT RUN');
  } catch(e) {
    console.error('CP_WS01_H3_SOURCE_BLOCKED: '+
      (/^[A-Z_]+$/.test(e.message)?e.message:'INPUT_OR_PERMISSION_ERROR'));
    process.exitCode=1;
  }
}
if(process.argv[1]&&resolve(process.argv[1])===
  fileURLToPath(import.meta.url))cli();
