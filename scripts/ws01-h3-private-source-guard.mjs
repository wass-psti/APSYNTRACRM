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
// Protected full-caller source prerequisite (74 original function definitions).
// Filenames are SHA-256(signature).sql so no function-body or identity is needed
// in the public repository. The directory and contents never leave the owner host.
export function expectedFullCallerSources(manifest,g4b,g4c) {
 verifyPinnedCoreManifest(manifest,g4b,g4c);
 const sources=new Map();
 for(const entry of [...g4b.entries,...g4c.dependents,...manifest.core_functions]) {
  const existing=sources.get(entry.signature);
  ensure(!existing||existing.source_sha256===entry.source_sha256,
    'FULL_SOURCE_MANIFEST_CONFLICT');
  sources.set(entry.signature,{signature:entry.signature,
    file:sha256(entry.signature)+'.sql',source_sha256:entry.source_sha256});
 }
 ensure(sources.size===74,'FULL_SOURCE_MANIFEST_COUNT');
 // The one post-baseline production update is documented separately.
 // Never silently substitute it for the pinned historical definition.
 const evolutionSignature='private.tl03_commit(p_board_id uuid, p_document_id uuid, p_expected_revision bigint, p_operation text, p_data jsonb)';
 const evolution=sources.get(evolutionSignature);
 ensure(evolution?.source_sha256==='5fb4ac5d256746444786826d8128abdcfa5c54ecbe145aff5fd55fa25a89119d',
   'FULL_SOURCE_EVOLUTION_BASELINE_DRIFT');
 // Preserve the historical identity of the independently observed signed
 // access-context evolution. This does not approve its runtime behavior.
 ensure(sources.get('public.wm_auth_access_context()')?.source_sha256===
  '7b60bbc93690cbdf34c9db2e7c541e1a563a385aeeae75642fb1c2e6e7eb49d7',
  'FULL_SOURCE_CONTEXT_BASELINE_DRIFT');
 return [...sources.values()].sort((a,b)=>a.signature.localeCompare(b.signature));
}

export function verifyCompletePrivateSourceBundle({directory,sources,repo=repoRoot,allowDocumentedLiveEvolution=false}) {
 ensure(typeof directory==='string'&&isAbsolute(directory),'BUNDLE_MUST_BE_ABSOLUTE');
 ensure(Array.isArray(sources)&&sources.length===74,'FULL_SOURCE_MANIFEST_COUNT');
 const declared=new Map();
 for(const source of sources) {
  ensure(typeof source.signature==='string'&&source.signature.length>0
    && /^[a-f0-9]{64}\.sql$/.test(source.file)
    && source.file===sha256(source.signature)+'.sql'
    && /^[a-f0-9]{64}$/.test(source.source_sha256),
   'FULL_SOURCE_MANIFEST_INVALID');
  ensure(!declared.has(source.file),'FULL_SOURCE_DUPLICATE');
  declared.set(source.file,source);
 }
 const info=lstatSync(directory);
 ensure(info.isDirectory()&&!info.isSymbolicLink(),'INSECURE_DIRECTORY_TYPE');
 ensure((info.mode&0o077)===0,'INSECURE_DIRECTORY_PERMISSIONS');
 if(typeof process.getuid==='function')
  ensure(info.uid===process.getuid(),'WRONG_DIRECTORY_OWNER');
 const realDir=realpathSync(directory);
 ensure(!isInsideRepo(realDir,realpathSync(repo)),
   'PRIVATE_SOURCE_WITHIN_PUBLIC_REPOSITORY');
 const files=readdirSync(realDir).sort();
 ensure(files.length===declared.size && files.every(x=>declared.has(x)),
   'FULL_SOURCE_MISSING_OR_EXTRA_FILES');
 let documented=0;
 for(const filename of files) {
  const path=join(realDir,filename),st=lstatSync(path);
  ensure(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1,
    'INSECURE_SOURCE_TYPE');
  ensure((st.mode&0o077)===0,'INSECURE_SOURCE_PERMISSIONS');
  if(typeof process.getuid==='function')
   ensure(st.uid===process.getuid(),'WRONG_SOURCE_OWNER');
  ensure(st.size>0&&st.size<=256*1024,'INVALID_SOURCE_SIZE');
  const source=declared.get(filename),observed=sha256(readFileSync(path));
  if(observed!==source.source_sha256) {
   const documentedTradeLink=
     source.signature==='private.tl03_commit(p_board_id uuid, p_document_id uuid, p_expected_revision bigint, p_operation text, p_data jsonb)' &&
     source.source_sha256==='5fb4ac5d256746444786826d8128abdcfa5c54ecbe145aff5fd55fa25a89119d' &&
     observed==='08da27924332a9cd8290ff6e7e379308567e6f26f1ae5e6ac443c412489ac618';
   const documentedContext=
     source.signature==='public.wm_auth_access_context()' &&
     source.source_sha256==='7b60bbc93690cbdf34c9db2e7c541e1a563a385aeeae75642fb1c2e6e7eb49d7' &&
     observed==='b73a1b4e3bb10f8412405cea38a95c870ca26d45dc8d60154f91957b1fcd376b';
   ensure(allowDocumentedLiveEvolution && (documentedTradeLink||documentedContext),
     'FULL_SOURCE_FINGERPRINT_MISMATCH');
   documented++;
  }
 }
 return Object.freeze({verifiedOriginals:74,originalCallers:73,
  executionPerformed:false,documentedLiveEvolutionAccepted:documented>0});
}

// Build a read-only, metadata-only live drift probe from the pinned inventories.
// The SQL reads pg_get_functiondef internally to hash it but returns NO source text.
// A matching result proves source identity, never PostgreSQL runtime compatibility.
export function generateLiveCatalogFingerprintSql(manifest,g4b,g4c) {
 verifyPinnedCoreManifest(manifest,g4b,g4c);
 const entries=new Map();
 // G4C captures source hashes only. Do NOT infer ACL expectations from
 // signed_executable, which describes a call path rather than a direct GRANT.
 for(const entry of g4c.dependents) {
  entries.set(entry.signature,{hash:entry.source_sha256});
 }
 for(const entry of [...g4b.entries,...manifest.core_functions]) {
  const prior=entries.get(entry.signature);
  ensure(!prior||prior.hash===entry.source_sha256,'SOURCE_CATALOG_CONFLICT');
  const properties={
   hash:entry.source_sha256,
   securityDefiner:entry.security_definer,
   authExecute:entry.authenticated_execute,
   anonExecute:entry.anon_execute ?? null,
  };
  if(prior?.securityDefiner!==undefined) {
   ensure(prior.securityDefiner===properties.securityDefiner &&
     prior.authExecute===properties.authExecute,'SOURCE_ACL_MANIFEST_CONFLICT');
  }
  entries.set(entry.signature,properties);
 }
 ensure(entries.size===74,'SOURCE_CATALOG_COUNT_DRIFT');
 // Recorded evolution, NOT a new historical baseline or security acceptance.
 // Stage B grants: merged PR #86 (owner-authorized); PG migration history:
 // 20261108065354 lifecycle timestamp and 20261108065903 PT409 conflicts.
 // Only this exact source hash + expected ACL may be classified as documented.
 const knownSignature='private.tl03_commit(p_board_id uuid, p_document_id uuid, p_expected_revision bigint, p_operation text, p_data jsonb)';
 const knownHistoricalHash='5fb4ac5d256746444786826d8128abdcfa5c54ecbe145aff5fd55fa25a89119d';
 const knownLiveHash='08da27924332a9cd8290ff6e7e379308567e6f26f1ae5e6ac443c412489ac618';
 const knownEntry=entries.get(knownSignature);
 ensure(knownEntry?.hash===knownHistoricalHash &&
   knownEntry.authExecute===false && knownEntry.securityDefiner===true,
   'DOCUMENTED_EVOLUTION_HISTORICAL_BASELINE_DRIFT');
 const contextSignature='public.wm_auth_access_context()';
 const contextHistoricalHash='7b60bbc93690cbdf34c9db2e7c541e1a563a385aeeae75642fb1c2e6e7eb49d7';
 const contextLiveHash='b73a1b4e3bb10f8412405cea38a95c870ca26d45dc8d60154f91957b1fcd376b';
 const contextEntry=entries.get(contextSignature);
 ensure(contextEntry?.hash===contextHistoricalHash &&
   contextEntry.authExecute===true && contextEntry.securityDefiner===true &&
   contextEntry.anonExecute===null,
   'DOCUMENTED_CONTEXT_HISTORICAL_BASELINE_DRIFT');
 const literal=value=>"'"+value.replaceAll("'","''")+"'";
 const bool=value=>value===null||value===undefined?'NULL':value?'true':'false';
 const rows=[...entries].sort(([a],[b])=>a.localeCompare(b))
  .map(([signature,record])=>'('+
    [literal(signature),literal(record.hash),bool(record.securityDefiner),
      bool(record.authExecute),bool(record.anonExecute),
      signature===knownSignature?literal(knownLiveHash):signature===contextSignature?literal(contextLiveHash):'NULL'].join(',')+')')
  .join(',\n ');
 return `-- CP-WS-ACTIVATE-04 read-only historical baseline comparison.
-- Compare catalog SHA-256, SECURITY DEFINER and direct EXECUTE grants.
-- Historical ACL drift may reflect an authorized later activation.
-- Returns only counters and function signatures, NO function source bodies.
-- No original authorization caller is executed by this query.
WITH expected(signature,expected_sha256,expected_definer,
 expected_authenticated_execute,expected_anon_execute,documented_live_sha256) AS (
 VALUES
 ${rows}
), actual AS (
 SELECT pg_catalog.format('%I.%I(%s)',n.nspname,p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid)) AS signature,
   pg_catalog.encode(pg_catalog.sha256(
     pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid),'UTF8')),
     'hex') AS actual_sha256,
   p.prosecdef AS security_definer,
   pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
     AS authenticated_execute,
   pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
     AS anon_execute
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private','huly_rewrite')
), audit AS (
 SELECT e.signature,(a.signature IS NULL) AS missing,
   (a.signature IS NOT NULL AND a.actual_sha256<>e.expected_sha256) AS drift,
   (a.signature IS NOT NULL AND
    ((e.expected_definer IS NOT NULL AND
       a.security_definer IS DISTINCT FROM e.expected_definer)
     OR (e.expected_authenticated_execute IS NOT NULL AND
       a.authenticated_execute IS DISTINCT FROM e.expected_authenticated_execute)
     OR (e.expected_anon_execute IS NOT NULL AND
       a.anon_execute IS DISTINCT FROM e.expected_anon_execute)))
       AS permission_drift,
   (e.documented_live_sha256 IS NOT NULL AND
     a.actual_sha256=e.documented_live_sha256 AND
     a.security_definer IS TRUE AND
     a.authenticated_execute IS TRUE AND
     a.anon_execute IS FALSE) AS documented_live_evolution
 FROM expected e LEFT JOIN actual a ON a.signature=e.signature
)
SELECT count(*) AS expected_total,
 count(*) FILTER (WHERE NOT missing) AS located,
 count(*) FILTER (WHERE missing) AS missing,
 count(*) FILTER (WHERE drift) AS drift,
 count(*) FILTER (WHERE permission_drift) AS permission_drift,
 count(*) FILTER (WHERE documented_live_evolution) AS documented_live_evolutions,
 count(*) FILTER (WHERE (missing OR drift OR permission_drift)
   AND NOT documented_live_evolution) AS unexplained_drift,
 COALESCE(pg_catalog.jsonb_agg(signature ORDER BY signature)
   FILTER (WHERE missing OR drift),'[]'::jsonb) AS mismatch_signatures,
 COALESCE(pg_catalog.jsonb_agg(signature ORDER BY signature)
   FILTER (WHERE permission_drift),'[]'::jsonb)
   AS permission_mismatch_signatures,
 CASE WHEN count(*)=74 AND
   count(*) FILTER (WHERE missing OR drift OR permission_drift)=0
 THEN 'HISTORICAL_BASELINE_MATCH__RUNTIME_UNVERIFIED'
 WHEN count(*)=74 AND count(*) FILTER (
   WHERE (missing OR drift OR permission_drift)
     AND NOT documented_live_evolution)=0
 THEN 'DOCUMENTED_LIVE_EVOLUTION__RUNTIME_UNVERIFIED'
 ELSE 'SOURCE_OR_PERMISSION_BASELINE_DRIFT__REVIEW_REQUIRED' END AS status
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
      args[0]==='--catalog-sql'||args[0].startsWith('--private-dir=')||
      args[0].startsWith('--full-private-dir=')||
      args[0].startsWith('--full-live-private-dir=')),'USAGE');
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
    if(args[0].startsWith('--full-private-dir=')||
       args[0].startsWith('--full-live-private-dir=')) {
      const live=args[0].startsWith('--full-live-private-dir=');
      const sources=expectedFullCallerSources(
        JSON.parse(readFileSync(manifestFile,'utf8')),
        JSON.parse(readFileSync(g4bFile,'utf8')),
        JSON.parse(readFileSync(g4cFile,'utf8')));
      const result=verifyCompletePrivateSourceBundle({
        directory:args[0].slice(
          (live?'--full-live-private-dir=':'--full-private-dir=').length),
        sources,allowDocumentedLiveEvolution:live});
      console.log('CP_WS_ACTIVATE04_PROTECTED_74_SOURCE_FINGERPRINT_PASS: 73 caller sources; documented live evolution='+result.documentedLiveEvolutionAccepted+'; runtime NOT RUN');
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
