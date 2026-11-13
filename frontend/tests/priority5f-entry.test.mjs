import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectStaticModuleGraph,originalImportBaseline} from '../../scripts/priority5f-module-graph.mjs';
test('Priority 5F reduces the exact anonymous startup ES module graph without removing auth',()=>{
 const baseline=inspectStaticModuleGraph({appSource:originalImportBaseline()});
 const optimized=inspectStaticModuleGraph();
 assert.ok(baseline.count-optimized.count>=30,'at least thirty feature-only modules become on-demand');
 assert.ok(baseline.sourceBytes-optimized.sourceBytes>=200000,'at least 200 KB decoded feature source removed');
 for(const path of ['frontend/session.js','frontend/data.js','frontend/initialization-core.js',
  'frontend/workspace-startup-read.js','frontend/performance-critical-path.js',
  'frontend/board-grid.js','frontend/action-menu-experience.js','frontend/fueltrans-lazy.js'])
  assert.ok(optimized.modules.includes(path),'required startup dependency: '+path);
 for(const path of ['frontend/fueltrans-native.js','frontend/fueltrans/app.js',
  'frontend/fueltrans/supabase-client.js','frontend/board-import-ui.js',
  'frontend/board-import-parse.js','frontend/board-operational-qa.js']){
  assert.ok(baseline.modules.includes(path),'original baseline included '+path);
  assert.ok(!optimized.modules.includes(path),'feature module must not run before requested: '+path);
 }
});
test('existing boot entry, initialization recovery and security policy are unchanged',()=>{
 const html=readFileSync('index.html','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(html,/<script src="\.\/frontend\/startup-guard\.js" defer><\/script>/);
 assert.match(html,/<script type="module" src="\.\/frontend\/app\.js"><\/script>/);
 assert.match(html,/style-src-attr 'none'/);
 assert.match(app,/if\(await startupVerifiedRead\(async\(\)=>await auth\.restore\(\)\)\)/);
 assert.match(app,/await refreshWorkspace\(\)/);
 assert.match(app,/startupCriticalPath\.end\(\{authenticated:outcome==='AUTHENTICATED'\}\)/);
 assert.match(app,/await readWorkspaceStartup\(\{/);
 assert.match(app,/case 'board-import':\{/);
 assert.match(app,/if\(!activeBoardLayout\(\)\|\|!canManuallyEditBoard/);
 assert.match(app,/case 'foundation-operational-test':\{/);
 assert.match(app,/if\(state\.roleVerified!==true\)return/);
 assert.doesNotMatch(app,/import\(['"]https:\/\//);
 const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
 assert.match(smoke,/frontend\/fueltrans-lazy\.js/);
});
