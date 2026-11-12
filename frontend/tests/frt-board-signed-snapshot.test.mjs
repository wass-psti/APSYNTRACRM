import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderFRTBoardSignedSnapshot} from '../frt-board-signed-snapshot.js';
const board='f36da8fe-8d9d-4629-9938-12533cb3ca39';
const good={status:'PASS',companyCode:'PSTI',companies:[{code:'PSTI',name:'PSTI'}],
 summary:{total_requests:1},requests:[{
  requestId:'11111111-1111-4111-8111-111111111111',title:'QA Fund request',
  voucher:'DV-PSTI-2026-001',status:'PENDING_APPROVAL',dateNeeded:'2026-11-15'}]};
test('the board shows authoritative signed domain request values but never creates mirror rows or write actions',()=>{
 const html=renderFRTBoardSignedSnapshot(good,{boardId:board});
 for(const value of ['QA Fund request','DV-PSTI-2026-001','PENDING_APPROVAL','2026-11-15'])
  assert.match(html,new RegExp(value));
 assert.match(html,/1 recent signed request displayed/);
 assert.match(html,/Open FRT Finance/);
 assert.match(html,/separate from board-mirror items/);
 assert.doesNotMatch(html,/data-action="frt-|data-action="new-item"|data-item-id/);
});
test('missing, loading, denied, and empty signed results do not masquerade as verified items',()=>{
 assert.match(renderFRTBoardSignedSnapshot(null,{busy:true,boardId:board}),/Loading signed FRT requests/);
 assert.match(renderFRTBoardSignedSnapshot({status:'BLOCKED'}, {boardId:board}),/unavailable for this session/);
 assert.match(renderFRTBoardSignedSnapshot({...good,summary:{total_requests:0},requests:[]},{boardId:board}),
  /No signed FRT requests exist/);
});
test('server-provided labels are HTML escaped and no bank/amount fields are exposed',()=>{
 const html=renderFRTBoardSignedSnapshot({...good,requests:[{...good.requests[0],
  title:'<img src=x onerror=alert(1)>',amount:1000000,recipientBank:'Secret Bank'}]},
  {boardId:board});
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img|Secret Bank|1000000/);
});
test('FRT board items route loads signed domain data on initial navigation and refresh without inventing work-board items',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/renderFRTBoardSignedSnapshot\(state\.frtFinance/);
 assert.match(app,/\['items','finance'\]\.includes\(tab\).*?moduleByBoardName/s);
 assert.match(app,/if\(tab==='items'&&moduleByBoardName\(state\.board\.board\?\.name\)\?\.key==='frt'\)/);
 assert.match(app,/state\.context\?\.user_id===identity&&state\.context\?\.workspace_id===workspace/);
 assert.doesNotMatch(app,/frtFinance\.requests\.map\(.*?work_board_items/);
});
