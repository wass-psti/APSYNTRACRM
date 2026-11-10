import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {showEngineeringDiagnostics} from '../engineering-diagnostics-visibility.js';

test('engineering controls require both explicit opt-in and server-verified bootstrap',()=>{
 for(const value of ['', '?diagnostics=0','?diagnostics=true','?diagnostics=1&mode=normal']){
  assert.equal(showEngineeringDiagnostics(value,false),false);
 }
 assert.equal(showEngineeringDiagnostics('',true),false);
 assert.equal(showEngineeringDiagnostics('?diagnostics=1',false),false);
 assert.equal(showEngineeringDiagnostics('?diagnostics=1',true),true);
 assert.equal(showEngineeringDiagnostics('?diagnostics=true',true),false);
 assert.equal(showEngineeringDiagnostics('?diagnostics=1&mode=normal',true),true);
});
test('shared ordinary UI hides diagnostics; actionable bulk flow still probes on demand',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/function sidebar\(\)\{\s*const engineeringUi=showEngineeringDiagnostics\(location.search,state.roleVerified===true\)/);
 assert.match(app,/function boardPage\(\)\{\s*const engineeringUi=showEngineeringDiagnostics\(location.search,state.roleVerified===true\)/);
 assert.match(app,/engineeringUi\?sidebarNav\('#\/foundation'/);
 assert.match(app,/engineeringUi\?sidebarNav\('#\/security'/);
 assert.match(app,/engineeringUi\?sidebarNav\('#\/acceptance'/);
 assert.match(app,/engineeringUi&&state.edit&&canBulkEditBoard\(b\)/);
 assert.match(app,/engineeringUi\?row01AcceptancePanel\(b\):''/);
 assert.match(app,/case 'bulk-actions':\{[\s\S]*?await ensureSignedBulkReady\(board\)/);
 assert.match(app,/case 'bulk-status':\{[\s\S]*?await ensureSignedBulkReady\(state.board.board\)/);
 assert.match(app,/case 'bulk-archive':\{[\s\S]*?await ensureSignedBulkReady\(state.board.board\)/);
 assert.match(app,/case 'bulk02-verify'/);
 assert.match(app,/case 'profile-rendering'/);
});
test('no production role or data mutation is introduced',()=>{
 const helper=readFileSync(new URL('../engineering-diagnostics-visibility.js',import.meta.url),'utf8');
 assert.doesNotMatch(helper,/fetch\(|rpc\(|localStorage|sessionStorage|setItem\(|service_role/);
});
