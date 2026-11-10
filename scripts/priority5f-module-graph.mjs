/** Deterministic static ES-module graph inspection; no app execution or RPCs.
 * Distinguishes statically fetched dependencies from dynamic feature imports.
 */
import {readFileSync} from 'node:fs';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const appFile=resolve(repo,'frontend/app.js');
function staticEdges(file,override){
 const source=override??readFileSync(file,'utf8');
 // Keep the expression bounded to a single import/export statement, including
 // multiline named bindings. Dynamic import(...) never matches this pattern.
 const edges=[];
 const statements=[...source.matchAll(/(?:^|\n)\s*import\s+(?!\()(?:[^;]*?\s+from\s*)?['"](\.[^'"\n]+)['"]/g),
  ...source.matchAll(/(?:^|\n)\s*export\s+(?:\*|\{[^}]*\})\s+from\s*['"](\.[^'"\n]+)['"]/g)];
 for(const match of statements){
  const url=match[1].split('?')[0].split('#')[0];
  const full=resolve(dirname(file),url);
  if(full.startsWith(resolve(repo,'frontend')+sep)&&full.endsWith('.js'))edges.push(full);
 }
 return edges;
}
export function inspectStaticModuleGraph({appSource=readFileSync(appFile,'utf8')}={}){
 const pending=[appFile],seen=new Set();let totalBytes=0;
 while(pending.length){
  const file=pending.pop();
  if(seen.has(file))continue;
  seen.add(file);
  const source=file===appFile?appSource:readFileSync(file,'utf8');
  totalBytes+=Buffer.byteLength(source);
  for(const child of staticEdges(file,source))pending.push(child);
 }
 return {count:seen.size,sourceBytes:totalBytes,
  modules:[...seen].map(file=>relative(repo,file).split(sep).join('/')).sort()};
}
export function originalImportBaseline(source=readFileSync(appFile,'utf8')){
 if(!source.includes("import {syncFuelTrans} from './fueltrans-lazy.js';"))
  throw Error('Expected the scoped Priority 5F lazy feature integration');
 return source.replace("import {syncFuelTrans} from './fueltrans-lazy.js';",
  "import {syncFuelTrans} from './fueltrans-native.js';")+
  "\nimport {openBoardImportWizard} from './board-import-ui.js';"+
  "\nimport {runTwelveBoardQa} from './board-operational-qa.js';\n";
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const optimized=inspectStaticModuleGraph();
 const baseline=inspectStaticModuleGraph({appSource:originalImportBaseline()});
 const removed=baseline.modules.filter(path=>!optimized.modules.includes(path));
 console.log('PRIORITY5F_STATIC_GRAPH: '+JSON.stringify({baseline:{modules:baseline.count,bytes:baseline.sourceBytes},
  optimized:{modules:optimized.count,bytes:optimized.sourceBytes},
  deferred:{modules:removed.length,bytes:baseline.sourceBytes-optimized.sourceBytes,
   sample:removed.filter(path=>/fueltrans|board-import|operational-qa/.test(path)).slice(0,25)}}));
 if(optimized.modules.includes('frontend/fueltrans-native.js')||
  optimized.modules.includes('frontend/board-import-ui.js')||
  optimized.modules.includes('frontend/board-operational-qa.js'))process.exitCode=1;
}
