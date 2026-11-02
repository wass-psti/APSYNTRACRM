/** CP-FRT-SEC14 — deployed first-party source compatibility guard.
 * Scans frontend runtime and local scripts, never production data or credentials.
 * The standalone FRT repository and unknown deployed clients require separate
 * compatibility evidence; a static source scan cannot certify those consumers.
 */
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,relative,join,extname} from 'node:path';
import {pathToFileURL} from 'node:url';

const legacy=Object.freeze(['frt_'+'get_request','frt_'+'list_requests','frt_'+'dashboard']);
const safe=Object.freeze({
 'frontend/frt-finance-readonly.js':['frt_board_dashboard_safe','frt_board_list_safe'],
 'frontend/frt-finance-workflow.js':['frt_restricted_request_detail']
});
const extensions=new Set(['.js','.mjs','.jsx','.ts','.tsx','.html']);
export function deprecatedRpcReferences(source){
 if(typeof source!=='string')throw new TypeError('Expected source text');
 const matcher=new RegExp('\\b(?:'+legacy.join('|')+')\\b','g');
 return Array.from(source.matchAll(matcher),hit=>({
  name:hit[0],line:source.slice(0,hit.index).split('\\n').length
 }));
}
function runtimeFiles(root){
 const found=[];
 function walk(p){
  for(const ent of readdirSync(resolve(root,p),{withFileTypes:true})){
   const path=join(p,ent.name);
   if(ent.isDirectory()){
    if(path==='frontend/tests')continue;
    walk(path);
   }else if(ent.isFile()&&extensions.has(extname(path))&&
    path!=='scripts/sec14-legacy-read-consumer-guard.mjs')found.push(path);
  }
 }
 walk('frontend');
 walk('scripts');
 found.push('index.html');
 return found.sort();
}
export function auditFirstPartyLegacyReads(root){
 const records=runtimeFiles(root);
 const uses=[];
 for(const path of records){
  const source=readFileSync(resolve(root,path),'utf8');
  for(const hit of deprecatedRpcReferences(source)){
   uses.push({path:path.replaceAll('\\','/'),name:hit.name,line:hit.line});
  }
 }
 const missingSafe=[];
 for(const [path,names] of Object.entries(safe)){
  const source=readFileSync(resolve(root,path),'utf8');
  for(const name of names){
   // Require a real RPC name string, not an incidental documentation comment.
   if(!source.includes("api.rpc('"+name+"'")&&!source.includes('api.rpc("'+name+'"'))
    missingSafe.push({path,name});
  }
 }
 return {scannedFiles:records.length,legacyReferences:uses,missingRestrictedReads:missingSafe};
}
const invoked=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(invoked){
 const result=auditFirstPartyLegacyReads(process.cwd());
 if(result.legacyReferences.length||result.missingRestrictedReads.length){
  console.error('FAIL CP-FRT-SEC14 first-party legacy consumer compatibility guard');
  console.error(JSON.stringify(result,null,2));
  process.exitCode=1;
 }else{
  console.log('PASS CP-FRT-SEC14: '+result.scannedFiles+
   ' first-party runtime files; no legacy read RPC literals; restricted FRT reads present.');
  console.log('External deployed clients / legacy permission retirement: NOT VERIFIED');
 }
}
