import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldRefreshWorkspaceBoardList} from '../platform-sync.js';

test('targeted board broadcasts do not reload the workspace board catalog',()=>{
 assert.equal(shouldRefreshWorkspaceBoardList({reason:'broadcast',view:'board'}),false);
});

test('non-broadcast reconciliation retains authoritative workspace catalog refresh',()=>{
 for(const reason of ['join','poll','focus','visible','online','manual'])
  assert.equal(shouldRefreshWorkspaceBoardList({reason,view:'board'}),true,reason);
});

test('broadcasts outside an open board retain workspace catalog refresh',()=>{
 for(const view of ['boards','overview','settings','foundation','role-configuration'])
  assert.equal(shouldRefreshWorkspaceBoardList({reason:'broadcast',view}),true,view);
});

test('app reconciliation uses targeted reads and preserves archived-board handling',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const reconcile=app.slice(app.indexOf('async function reconcilePlatformSync('),
  app.indexOf('\nlet workspaceRelationReadGeneration',app.indexOf('async function reconcilePlatformSync(')));
 assert.match(reconcile,/shouldRefreshWorkspaceBoardList\(\{reason,view\}\)/);
 assert.match(reconcile,/refreshBoardCatalog&&!nativeModuleId\?await db\.boards\('active'\):state\.boards/);
 assert.match(reconcile,/if\(refreshBoardCatalog&&!nativeModuleId\)state\.boards=boards/);
 assert.match(reconcile,/!refreshBoardCatalog&&detail\.board\.status!=='active'/);
 assert.match(reconcile,/!nativeModuleId&&await db\.allowed\(boardId,'view'\)/);
 assert.match(reconcile,/nativeModuleId\?db\.nativeApplicationBoardContext\(nativeModuleId\)/);
 assert.match(reconcile,/nativeModuleId\?Promise\.resolve\(null\):readVisibleBoardSnapshot\(boardId,tab/);
});
