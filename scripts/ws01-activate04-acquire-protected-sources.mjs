// CP-WS-ACTIVATE-04 owner-host source acquisition. NOT a replay/deployment tool.
// Never print function bodies, connection secrets, or private paths.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync, mkdirSync, writeFileSync, renameSync, rmSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedFullCallerSources } from './ws01-h3-private-source-guard.mjs';

const repoRoot=fileURLToPath(new URL('../',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const ensure=(condition,code)=>{if(!condition)throw new Error(code);};
const expectedLive={
 signature:'private.tl03_commit(p_board_id uuid, p_document_id uuid, p_expected_revision bigint, p_operation text, p_data jsonb)',
 historical:'5fb4ac5d256746444786826d8128abdcfa5c54ecbe145aff5fd55fa25a89119d',
 live:'08da27924332a9cd8290ff6e7e379308567e6f26f1ae5e6ac443c412489ac618'
};
const inside=(child,parent)=>{const r=relative(parent,child);return r===''||r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
const sqlLiteral=v=>"'"+v.replaceAll("'","''")+"'";

export function buildReadOnlyAcquisitionSql(sources) {
 ensure(Array.isArray(sources)&&sources.length===74 &&
  new Set(sources.map(s=>s.signature)).size===74,'SOURCE_INVENTORY_INVALID');
 const values=sources.map(s=>'('+sqlLiteral(s.signature)+')').join(',\n');
 return `BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
WITH wanted(signature) AS (VALUES ${values}),
observed AS (
 SELECT pg_catalog.format('%I.%I(%s)',n.nspname,p.proname,
   pg_catalog.pg_get_function_identity_arguments(p.oid)) AS signature,
  pg_catalog.encode(pg_catalog.convert_to(
   pg_catalog.pg_get_functiondef(p.oid),'UTF8'),'hex') AS definition_hex,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef AS security_definer,
  pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private','huly_rewrite')
)
SELECT wanted.signature,observed.definition_hex,observed.owner,
 observed.security_definer,observed.authenticated_execute,observed.anon_execute
FROM wanted LEFT JOIN observed USING (signature)
ORDER BY wanted.signature;
COMMIT;`;
}

export function validateAcquiredRows(raw,sources) {
 ensure(typeof raw==='string'&&raw.length>0&&raw.length<32*1024*1024,
  'SOURCE_RESPONSE_INVALID');
 const expected=new Map(sources.map(s=>[s.signature,s]));
 ensure(expected.size===74,'SOURCE_INVENTORY_INVALID');
 const lines=raw.trimEnd().split('\n');
 ensure(lines.length===74,'SOURCE_ROW_COUNT_MISMATCH');
 const files=[];
 let documented=0;
 for(const line of lines) {
  const cells=line.split('\t');
  ensure(cells.length===6,'SOURCE_ROW_FORMAT_INVALID');
  const [signature,hex,owner,definer,auth,anon]=cells;
  const record=expected.get(signature);
  ensure(record&&!files.some(f=>f.signature===signature),'SOURCE_UNEXPECTED_OR_DUPLICATE');
  ensure(hex.length>0&&hex.length%2===0&&/^[0-9a-f]+$/.test(hex) &&
   hex.length<=512*1024,'SOURCE_BYTES_INVALID');
  const bytes=Buffer.from(hex,'hex');
  const digest=sha(bytes);
  if(digest!==record.source_sha256) {
   ensure(signature===expectedLive.signature &&
     record.source_sha256===expectedLive.historical &&
     digest===expectedLive.live &&
     owner==='postgres' && definer==='t' &&
     auth==='t' && anon==='f','SOURCE_FINGERPRINT_MISMATCH');
   documented++;
  }
  ensure(/^[tf]$/.test(definer)&&/^[tf]$/.test(auth)&&/^[tf]$/.test(anon),
   'SOURCE_PERMISSION_METADATA_INVALID');
  files.push({signature,filename:record.file,bytes});
 }
 ensure(files.length===74&&documented<=1,'SOURCE_INVENTORY_INVALID');
 return {files,documentedLiveEvolutions:documented};
}

export function persistVerifiedSourceBundle({outputDir,sources,rows,repo=repoRoot}) {
 ensure(typeof outputDir==='string'&&isAbsolute(outputDir),'OUTPUT_MUST_BE_ABSOLUTE');
 const target=resolve(outputDir);
 ensure(!existsSync(target),'OUTPUT_ALREADY_EXISTS');
 const parent=realpathSync(dirname(target));
 const stat=lstatSync(parent);
 ensure(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,
  'INSECURE_OUTPUT_PARENT');
 if(typeof process.getuid==='function')ensure(stat.uid===process.getuid(),'WRONG_OUTPUT_OWNER');
 ensure(!inside(parent,realpathSync(repo)),'OUTPUT_INSIDE_PUBLIC_REPO');
 const {files,documentedLiveEvolutions}=validateAcquiredRows(rows,sources);
 const staging=target+'.staging-'+process.pid;
 ensure(!existsSync(staging),'STAGING_ALREADY_EXISTS');
 let active=false;
 try {
  mkdirSync(staging,{mode:0o700});
  active=true;
  for(const f of files)writeFileSync(resolve(staging,f.filename),f.bytes,
   {flag:'wx',mode:0o600});
  renameSync(staging,target);
  active=false;
 } finally {
  if(active)rmSync(staging,{recursive:true,force:true});
 }
 return Object.freeze({verifiedSources:74,documentedLiveEvolutions,
  executionPerformed:false});
}

function cli() {
 try {
  const args=process.argv.slice(2);
  ensure(args.length===1&&args[0].startsWith('--output-dir='),'USAGE');
  ensure(process.env.PGHOST&&process.env.PGUSER&&process.env.PGDATABASE,
   'DATABASE_CONNECTION_NOT_CONFIGURED');
  ensure(process.env.PGDATABASE!=='workspace_disposable',
   'WRONG_DATABASE_FOR_PRODUCTION_SOURCE');
  const sources=expectedFullCallerSources(
   JSON.parse(readFileSync(new URL('../sql/tests/cp-ws01-h3-private-core-source-manifest.json',import.meta.url),'utf8')),
   JSON.parse(readFileSync(new URL('../sql/tests/cp-ws01c-g4b-source-fingerprint-inventory.json',import.meta.url),'utf8')),
   JSON.parse(readFileSync(new URL('../sql/tests/cp-ws01c-g4c-role-dependent-fingerprints.json',import.meta.url),'utf8')));
  const target=args[0].slice('--output-dir='.length);
  // Validate the output boundary before connecting. No user-controlled shell.
  ensure(isAbsolute(target)&&!existsSync(target),'OUTPUT_MUST_BE_NEW_ABSOLUTE');
  const opts=['-X','-w','-q','-A','-t','-F','\t','-v','ON_ERROR_STOP=1',
   '-c',buildReadOnlyAcquisitionSql(sources)];
  const subprocess=spawnSync('psql',opts,{encoding:'utf8',maxBuffer:32*1024*1024,
   timeout:60000,env:{...process.env,PGCONNECT_TIMEOUT:'5'}});
  ensure(!subprocess.error&&subprocess.status===0,'READ_ONLY_ACQUISITION_FAILED');
  const result=persistVerifiedSourceBundle({outputDir:target,sources,rows:subprocess.stdout});
  console.log('CP_WS_ACTIVATE04_SOURCE_ACQUISITION_PASS: 74 protected definitions; documented evolution='+result.documentedLiveEvolutions+'; runtime NOT RUN');
 } catch(err) {
  // No exception messages, stderr, SQL, credentials or private paths in logs.
  console.error('CP_WS_ACTIVATE04_ACQUISITION_BLOCKED: '+
   (/^[A-Z_]+$/.test(err.message)?err.message:'INPUT_OR_ACCESS_ERROR'));
  process.exitCode=1;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))cli();
