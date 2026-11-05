/** CP-WS-02D/B3 source integrity, optional disposable-only fixture emission.
 * No network, credentials or direct production database access.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sql=readFileSync(new URL('../sql/cp-ws02d-b3-remaining-domain-ceiling-candidate.sql',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../sql/tests/cp-ws02d-b3-remaining-domain-manifest.json',import.meta.url),'utf8'));
function fail(message){throw new Error('WS02D/B3 source contract: '+message);}
function guard(action){
 return `  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(\n    public.current_workspace_id(auth.uid()),auth.uid(),'${action}') THEN\n    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';\n  END IF;\n`;
}
if(manifest.count!==24||manifest.functions.length!==24)fail('24 function candidates required');
const names=new Set();
const sources=[];
for(const entry of manifest.functions){
 if(names.has(entry.name))fail('duplicate function '+entry.name);
 names.add(entry.name);
 if(!['edit','manage'].includes(entry.action))fail('unexpected permission action');
 if(entry.anonymousExecute!==false)fail('anonymous EXECUTE should remain denied');
 const start='-- WS02D_B3_SOURCE_BEGIN:'+entry.name+'\n';
 const end='-- WS02D_B3_SOURCE_END:'+entry.name+'\n';
 if(sql.split(start).length!==2||sql.split(end).length!==2)fail('missing unique source markers '+entry.name);
 const segment=sql.split(start)[1].split(end)[0];
 if(!segment.endsWith(';\n'))fail('source needs terminal semicolon '+entry.name);
 const patched=segment.slice(0,-2);
 const g=guard(entry.action);
 if(patched.split(g).length!==2)fail('single inserted guard expected '+entry.name);
 const original=patched.replace('\n'+g,'');
 if(!original.startsWith('CREATE OR REPLACE FUNCTION '+entry.signature.split('(')[0]+'('))
 fail('signature changed '+entry.name);
 if(createHash('md5').update(original).digest('hex')!==entry.fingerprint)fail('source drift '+entry.name);
 if(!sql.includes("md5(pg_get_functiondef(to_regprocedure('"+entry.signature+"'))) IS DISTINCT FROM '"+entry.fingerprint+"'"))fail('missing fingerprint preflight '+entry.name);
 sources.push({entry,original});
}
if((sql.match(/-- WS02D_B3_SOURCE_BEGIN:/g)||[]).length!==24)fail('extra source definitions');
const mode=process.argv[2]||'--check';
if(mode==='--check'){
 process.stdout.write('WS02D_B3_SOURCE_INTEGRITY_PASS 24/24; no source edits beyond role ceiling guard\n');
}else if(mode==='--emit-fixture'){
 process.stdout.write('\\set ON_ERROR_STOP on\n');
 process.stdout.write("DO $guard$ BEGIN IF current_database()<>'workspace_disposable' THEN RAISE EXCEPTION 'Disallowed fixture database' USING ERRCODE='42501'; END IF; END $guard$;\n");
 const types=new Set(['order_intake_orders']);
 for(const {original} of sources){for(const m of original.matchAll(/(?:public\\.)?([A-Za-z_][A-Za-z0-9_]*)%rowtype/gi))types.add(m[1].toLowerCase());}
 for(const name of [...types].sort()){
  if(!/^[a-z][a-z0-9_]*$/.test(name))fail('unexpected type');
  process.stdout.write('CREATE TABLE IF NOT EXISTS public.'+name+' (id uuid);\n');
 }
 process.stdout.write('SET check_function_bodies = off;\n');
 for(const {entry,original} of sources){
  process.stdout.write(original+';\n');
  process.stdout.write('REVOKE ALL ON FUNCTION '+entry.signature+' FROM PUBLIC,anon,authenticated;\n');
  if(entry.authenticatedExecute)process.stdout.write('GRANT EXECUTE ON FUNCTION '+entry.signature+' TO authenticated;\n');
 }
 process.stdout.write('RESET check_function_bodies;\n');
}else fail('unsupported mode');
