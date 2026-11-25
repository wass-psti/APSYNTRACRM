import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 normalizeGlobalSearchQuery,isGlobalSearchShortcut,isGlobalSearchEditableTarget,
 buildGlobalSearchResults,globalSearchResultKind,GLOBAL_SEARCH_MIN_QUERY,GLOBAL_SEARCH_MAX_RESULTS
} from '../global-search.js';
import {createNativeSearchAdapter,createNativeSearchRegistry,
 normalizeNativeSearchResult,scoreNativeSearchResult} from '../global-search-adapters.js';

const source=readFileSync('frontend/global-search.js','utf8');
const app=readFileSync('frontend/app.js','utf8');
const data=readFileSync('frontend/data.js','utf8');
const css=readFileSync('frontend/global-search.css','utf8');
const sql=readFileSync('supabase/migrations/20261116055059_cp_crm_global_search_02_indexed_workspace_search.sql','utf8');
const prefixSql=readFileSync('supabase/migrations/20261116062331_cp_crm_global_search_02b_prefix_index_lookup.sql','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const index=readFileSync('index.html','utf8');
const styleManifest=readFileSync('scripts/priority5-style-manifest.mjs','utf8');

const activeBoard={id:'10000000-0000-4000-8000-000000000001',name:'Tool Traceability',
 description:'Tool custody and stock movement',status:'active'};
const archivedBoard={id:'10000000-0000-4000-8000-000000000002',name:'Archived Projects',
 description:'Old project records',status:'archived'};
const trashedBoard={id:'10000000-0000-4000-8000-000000000003',name:'Trashed Board',
 description:'Unavailable',status:'trashed'};
const modules=[{key:'tools',name:'Tool Traceability',description:'Tool custody and stock movement',recordType:'Tool'}];
const navigation=[{title:'My boards',subtitle:'Navigation',href:'#/boards'},
 {title:'Settings',subtitle:'Navigation',href:'#/settings'}];
const record={board_id:activeBoard.id,board_name:activeBoard.name,board_status:'active',
 item_id:'20000000-0000-4000-8000-000000000001',item_title:'Wrench 204',
 group_title:'Available tools',item_status:'working',is_archived:false,
 match_field:'Serial number',match_excerpt:'Asset serial TOOL-204-AX'};

test('normalizes search input and enforces bounded query length',()=>{
 assert.equal(normalizeGlobalSearchQuery('  Tool   Traceability  '),'tool traceability');
 assert.equal(normalizeGlobalSearchQuery(null),'');
 assert.equal(normalizeGlobalSearchQuery('A'.repeat(200)).length,160);
 assert.equal(GLOBAL_SEARCH_MIN_QUERY,2);
});

test('registers exact macOS and Windows/Linux shortcut combinations only',()=>{
 const base={key:'k',defaultPrevented:false,repeat:false,isComposing:false,
  altKey:false,shiftKey:false,metaKey:false,ctrlKey:false};
 assert.equal(isGlobalSearchShortcut({...base,metaKey:true},'MacIntel'),true);
 assert.equal(isGlobalSearchShortcut({...base,ctrlKey:true},'Win32'),true);
 assert.equal(isGlobalSearchShortcut({...base,ctrlKey:true},'Linux x86_64'),true);
 assert.equal(isGlobalSearchShortcut({...base,ctrlKey:true},'MacIntel'),false);
 assert.equal(isGlobalSearchShortcut({...base,metaKey:true},'Win32'),false);
 for(const event of [
  {...base,metaKey:true,repeat:true},{...base,metaKey:true,altKey:true},
  {...base,metaKey:true,shiftKey:true},{...base,metaKey:true,isComposing:true},
  {...base,metaKey:true,defaultPrevented:true},{...base,key:'l',metaKey:true}
 ])assert.equal(isGlobalSearchShortcut(event,'MacIntel'),false);
});

test('avoids intercepting keyboard shortcuts while editing text or selecting values',()=>{
 for(const tagName of ['INPUT','TEXTAREA','SELECT'])
  assert.equal(isGlobalSearchEditableTarget({tagName}),true);
 assert.equal(isGlobalSearchEditableTarget({tagName:'DIV',isContentEditable:true}),true);
 assert.equal(isGlobalSearchEditableTarget({tagName:'DIV',getAttribute:name=>name==='role'?'textbox':null}),true);
 assert.equal(isGlobalSearchEditableTarget({tagName:'BUTTON'}),false);
});

test('finds modules, navigation pages, active and archived boards, and board records',()=>{
 const results=buildGlobalSearchResults('tool traceability',{
  boards:[activeBoard,archivedBoard,trashedBoard],modules,navigation,records:[record]
 });
 assert.ok(results.some(row=>row.type==='module'&&row.id==='tools'));
 assert.ok(results.some(row=>row.type==='board'&&row.boardId===activeBoard.id));
 assert.ok(!results.some(row=>row.title==='Trashed Board'));
 const recordResults=buildGlobalSearchResults('tool-204',{
  boards:[activeBoard],modules,navigation,records:[record]
 });
 assert.equal(recordResults.length,1);
 assert.equal(recordResults[0].type,'record');
 assert.equal(recordResults[0].itemId,record.item_id);
 assert.equal(recordResults[0].href,'#/boards/'+activeBoard.id+'/items');
 const crossFieldResults=buildGlobalSearchResults('tool traceability wrench',{
  boards:[],modules:[],navigation:[],records:[record]
 });
 assert.equal(crossFieldResults.length,1,'server-matched tokens across separate fields must remain visible');
 assert.equal(crossFieldResults[0].itemId,record.item_id);
});

test('keeps quick navigation available before typing and limits result volume',()=>{
 const results=buildGlobalSearchResults('',{
  boards:[activeBoard,archivedBoard],modules,navigation
 });
 assert.ok(results.length>0);
 assert.ok(results.length<=GLOBAL_SEARCH_MAX_RESULTS);
 const many=Array.from({length:80},(_,index)=>({
  id:'page-'+index,title:'Workspace '+index,subtitle:'Navigation',href:'#/workspace/'+index
 }));
 assert.equal(buildGlobalSearchResults('workspace',{navigation:many,limit:100}).length,30);
});

test('uses textContent, bounded live queries, stale-response suppression and accessible listbox navigation',()=>{
 assert.match(source,/label\.textContent=item\.title/);
 assert.match(source,/meta\.textContent=item\.subtitle/);
 assert.match(source,/option\.setAttribute\('role','option'\)/);
 assert.match(source,/input\.setAttribute\('role','combobox'\)/);
 assert.match(source,/input\.setAttribute\('aria-label','Search applications, boards and records'\)/);
 assert.match(source,/event\.key==='ArrowDown'\|\|event\.key==='ArrowUp'/);
 assert.match(source,/event\.key==='Enter'/);
 assert.match(source,/event\.key==='Escape'/);
 assert.match(source,/if\(active===input\)\{event\.preventDefault\(\);closeButton\.focus\(\);\}/);
 assert.match(source,/else if\(active===closeButton\)\{event\.preventDefault\(\);input\.focus\(\);\}/);
 assert.match(source,/else if\(!restoreFocus\)doc\.activeElement\?\.blur\?\.\(\);/);
 assert.match(source,/event\.target\?\.closest\?\.\('\[role="dialog"\]\[aria-modal="true"\]:not\(\[data-global-search-layer\]\)'\)/);
 assert.match(source,/serial!==requestSerial/);
 assert.match(source,/setTimeout\(\(\)=>\{debounceHandle=null;void runSearch\(\);\},180\)/);
 assert.doesNotMatch(source,/\.innerHTML\s*=|insertAdjacentHTML|document\.write|eval\(/);
});

test('preserves app routing and opens a selected record after loading additional board pages as needed',()=>{
 assert.match(app,/import \{startGlobalSearch\} from '\.\/global-search\.js'/);
 assert.match(app,/globalSearchController=startGlobalSearch\(/);
 assert.match(app,/data-global-search-open/);
 assert.match(app,/navigateGlobalSearchResult/);
 assert.match(app,/await openPendingGlobalSearchItem\(parts\[1\]\)/);
 assert.match(app,/while\(current\(\)&&!state\.board\.items\.some/);
 assert.match(app,/db\.boardNextPage\(boardId/);
 assert.match(app,/await openBoardItemDetails\(pending\.itemId\)/);
 assert.match(app,/globalSearchController\?\.syncScope\(\)/);
 assert.match(source,/syncScope\(\)\{syncTriggers\(opened\)/);
 assert.match(app,/globalSearchController\?\.close\(\{restoreFocus:false\}\)/);
});

test('uses the existing read-only API contract and does not invalidate board caches',()=>{
 assert.match(data,/'wm_search_workspace_content'/);
 assert.match(data,/async searchWorkspaceContent\(query,limit=40\)/);
 assert.match(data,/INVALID_WORKSPACE_SEARCH/);
 assert.match(data,/this\.rpc\('wm_search_workspace_content'/);
});

test('server search reuses existing workspace and board-view checks without changing roles or RLS',()=>{
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.match(sql,/private\.wm_search_workspace_content_impl/);
 assert.match(sql,/SET search_path TO ''/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/public\.current_workspace_id\(v_actor\)/);
 assert.match(sql,/public\.work_board_access\(b\.id, 'view'\)/);
 assert.match(sql,/b\.status IN \('active', 'archived'\)/);
 assert.match(sql,/regexp_replace\(lower\(btrim\(coalesce\(p_query, ''\)\)\), '\\s\+', ' ', 'g'\)/);
 assert.match(sql,/string_to_array\(v_query, ' '\)/);
 assert.match(sql,/candidate_matches AS/);
 assert.match(sql,/HAVING count\(\*\) = \(SELECT count\(\*\) FROM tokens\)/);
 assert.match(sql,/extensions\.gin_trgm_ops/);
 assert.match(sql,/work_board_items_search_prefix_idx/);
 assert.match(sql,/work_board_item_values_search_prefix_idx/);
 assert.match(prefixSql,/DROP INDEX IF EXISTS public\.work_board_items_search_prefix_idx/);
 assert.match(prefixSql,/DROP INDEX IF EXISTS public\.work_board_item_values_search_prefix_idx/);
 assert.match(prefixSql,/IF length\(v_query\) = 2 THEN/);
 assert.match(prefixSql,/EXECUTE \$query\$/);
 assert.match(prefixSql,/v_short_item_ids/);
 assert.match(prefixSql,/v_short_cell_ids/);
 assert.doesNotMatch(prefixSql,/CREATE POLICY|ALTER POLICY|DROP POLICY|CREATE ROLE|ALTER ROLE|INSERT INTO|UPDATE public\.|DELETE FROM/);
 assert.match(prefixSql,/left\(lower\(coalesce\(i\.title/);
 assert.match(prefixSql,/left\(lower\(coalesce\(v\.value/);
 assert.match(sql,/p_limit integer DEFAULT 40/);
 assert.match(sql,/p_limit > 50/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.wm_search_workspace_content\(text, integer\) FROM PUBLIC, anon/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.wm_search_workspace_content\(text, integer\) TO authenticated/);
 assert.doesNotMatch(sql,/CREATE POLICY|ALTER POLICY|DROP POLICY|CREATE ROLE|ALTER ROLE|INSERT INTO|UPDATE public\.|DELETE FROM/);
});


test('normalizes native records into application-aware deep links and relevance scores',()=>{
 const adapter=createNativeSearchAdapter({
  id:'toolbox-issues',name:'Toolbox Issues',recordType:'Issue',
  read:async()=>[],
  getId:row=>row.id,getTitle:row=>row.title,
  getSubtitle:row=>row.status,getExcerpt:row=>row.summary,
  getHref:row=>'#/boards/'+row.boardId+'/items'
 });
 const row=normalizeNativeSearchResult(adapter,{
  id:'issue-1',title:'Hydraulic pump leak',status:'Open',
  summary:'Pump station 4',boardId:activeBoard.id
 },'hydraulic pump');
 assert.equal(row.native,true);
 assert.equal(row.type,'native-record');
 assert.equal(row.application,'Toolbox Issues');
 assert.equal(row.recordId,'issue-1');
 assert.equal(row.href,'#/boards/'+activeBoard.id+'/items');
 assert.equal(row.score,1);
 const merged=buildGlobalSearchResults('hydraulic pump',{
  modules:[],boards:[],navigation:[],records:[row]
 });
 assert.equal(merged[0].type,'native-record');
 assert.equal(merged[0].applicationId,'toolbox-issues');
 assert.equal(merged[0].excerpt,'Pump station 4');
 assert.equal(merged[0].query,'hydraulic pump');
 assert.equal(merged[0].navigationScope,'');
 assert.equal(scoreNativeSearchResult('hydraulic pump',['Hydraulic pump leak']),1);
});

test('runs native adapters concurrently with bounded reads, deduplication and isolated failures',async()=>{
 let active=0,maxActive=0,seenLimits=[];
 const make=(id,delay=0,fail=false)=>createNativeSearchAdapter({
  id,name:id,recordType:'Record',
  read:async(query,context)=>{
   active++;maxActive=Math.max(maxActive,active);seenLimits.push(context.limit);
   await new Promise(resolve=>setTimeout(resolve,delay));
   active--;
   if(fail)throw Error('adapter unavailable');
   return [{id:'same-id',title:'Pump request',summary:'Hydraulic pump'}];
  },
  getId:r=>r.id,getTitle:r=>r.title,getSubtitle:()=>'',getExcerpt:r=>r.summary,
  getHref:()=> '#/boards/'+activeBoard.id+'/items'
 });
 const registry=createNativeSearchRegistry([
  make('one',10),make('two',10),make('broken',0,true)
 ],{limit:30});
 const response=await registry.search('pump',{workspaceId:'workspace'});
 assert.ok(maxActive>1,'independent adapters should execute concurrently');
 assert.deepEqual(seenLimits,[20,20,20]);
 assert.equal(response.results.length,1,'same application record should be deduplicated');
 assert.equal(response.errors.length,1);
 assert.equal(response.errors[0].adapterId,'broken');
 assert.deepEqual(await registry.search('x'),{results:[],errors:[]});
});

test('rejects unsafe native adapter contracts and invalid navigation destinations',()=>{
 assert.throws(()=>createNativeSearchAdapter({id:'bad id'}),/Invalid native search adapter/);
 const adapter=createNativeSearchAdapter({
  id:'sample',name:'Sample',recordType:'Record',read:async()=>[],
  getId:r=>r.id,getTitle:r=>r.title,getHref:()=> 'https://example.com'
 });
 assert.equal(normalizeNativeSearchResult(adapter,{id:'1',title:'Pump'},'pump'),null);
});

test('wires TradeLink to its existing bounded signed document search and native detail route',()=>{
 const adapters=readFileSync('frontend/global-search-adapters.js','utf8');
 const tradeLink=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 assert.match(app,/createNativeSearchRegistry\(\[tradeLinkNativeSearchAdapter,frtNativeSearchAdapter,timeTrackerAttendanceSearchAdapter,timeTrackerOvertimeSearchAdapter,fuelTrackNativeSearchAdapter,fuelTransNativeSearchAdapter,\.\.\.remainingNativeSearchAdapters\]\)/);
 assert.match(app,/tradeLinkDraftWorkspace\.searchPage\(/);
 assert.match(app,/tradeLinkDraftWorkspace\.assignedDocuments\(bounded\)/);
 assert.match(app,/applicationId==='tradelink'/);
 assert.match(app,/openTradeLinkDocument\(selectedDocument\)/);
 assert.match(app,/openTradeLinkAssignedDocument\(selectedDocument\)/);
 assert.match(app,/pendingNativeSearchSelection/);
 assert.ok(app.includes("fundTracker.searchRequests(query,{limit})"));
 assert.match(app,/timeTrackerSearchSnapshot/);
 assert.match(app,/timeTrackerAttendanceSearchAdapter/);
 assert.match(app,/timeTrackerOvertimeSearchAdapter/);
 assert.match(app,/ttOtExpandedRequestIds/);
 assert.match(app,/await import\('\.\/fueltrans\/supabase-client\.js'\)/);
 assert.match(app,/searchFuelTransTickets\(context,\{query,limit\}\)/);
 assert.match(app,/fuelTransApplicationHref\('ticket\/'\+encodeURIComponent\(row\.id\)\)/);
 assert.match(app,/nativeSearchRegistry\.search\(query/);
 assert.match(app,/Promise\.allSettled\(\[/);
 assert.match(tradeLink,/async searchPage\(\{filters=initialTradeLinkDraftListFilters\(\),cursor=null,limit=50\}/);
 assert.match(tradeLink,/limit must be 1–50/);
 assert.match(adapters,/NATIVE_SEARCH_ADAPTER_LIMIT=20/);
});

test('binds FRT, FuelTrack+ and TimeTracker through existing signed native clients and detail views',()=>{
 const overtime=readFileSync('frontend/time-tracker-overtime.js','utf8');
 const fuelTrack=readFileSync('frontend/fueltrack-v3-domain-client.js','utf8');
 const frt=readFileSync('frontend/frt-finance-readonly.js','utf8');
 assert.ok(app.includes("fundTracker.searchRequests(query,{limit})"));
 assert.match(frt,/api\.rpc\('frt_board_list_safe'/);
 assert.match(app,/loadFRTFinanceDetail\(pending\.recordId,seq\)/);
 assert.match(app,/fuelTrackSearchSnapshot=createSnapshotReader/);
 assert.match(fuelTrack,/async read\(\{limit=100\}/);
 assert.match(app,/fuelTrackSearchSnapshot\(\{userId,workspaceId,boardId:FUELTRACK_V3_ID\}\)/);
 assert.match(app,/receipt_number/);
 assert.match(app,/fuelTrackRequestFilters=\{\.\.\.FUELTRACK_REQUEST_FILTER_DEFAULTS/);
 assert.match(app,/applicationId==='fueltrack'/);
 assert.match(app,/timeTrackerSearchSnapshot=createSnapshotReader/);
 assert.match(app,/timeTracker\.snapshot\(boardId\)/);
 assert.match(app,/ttLogExpandedIds=\[pending\.recordId\]/);
 assert.match(app,/ttOtExpandedRequestIds=\[pending\.recordId\]/);
 assert.match(overtime,/expandedRequestIds\.includes\(r\.id\)/);
});

test('binds remaining native applications to their existing signed read APIs and exact record routes',()=>{
 const native=readFileSync('frontend/global-search-native-apps.js','utf8');
 for(const rpc of ['tool_traceability_list_tools','tool_traceability_list_requests','toolbox_issues_list_issues',
  'material_request_hub_list_requests','employee_evaluation_management_snapshot','employee_evaluation_my_snapshot','fm1_list_tickets_v1','fm1_ticket_detail_v1'])
  assert.ok(native.includes(rpc),'missing native read contract '+rpc);
 for(const table of ['order_intake_orders','aps_aims_entities'])assert.ok(native.includes(table));
 assert.match(native,/p_path:'\/items\/query'/);
 assert.match(native,/p_path:'\/items\/'\+recordId/);
 assert.match(app,/openPendingNativeSearchRecord\(parts\[1\]\)/);
 assert.match(app,/applicationId:item\.applicationId,recordId:item\.recordId/);
 assert.match(app,/native-search-detail-drawer/);
 assert.match(app,/applicationId==='fm1'/);
 assert.match(app,/openPendingNativeSearchRecord\(null\)/);
 assert.match(native,/fm1_list_tickets_v1/);
 assert.match(native,/fm1_ticket_detail_v1/);
 assert.match(data,/'tool_traceability_list_tools'.*'tool_traceability_list_requests'/s);
 assert.match(data,/'employee_evaluation_management_snapshot','employee_evaluation_my_snapshot'/);
 assert.match(data,/'fm1_list_tickets_v1','fm1_ticket_detail_v1'/);
 assert.match(css,/native-search-detail-fields/);
});

test('responsive palette and exact-commit Pages asset manifests include new assets',()=>{
 assert.match(css,/\.aps-global-search-backdrop\[hidden\]\{display:none!important\}/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(forced-colors:active\)/);
 assert.match(css,/focus-visible/);
 assert.match(styleManifest,/frontend\/global-search\.css/);
 assert.match(index,/frontend\/global-search\.css/);
 assert.match(smoke,/frontend\/global-search\.js/);
 assert.match(smoke,/frontend\/global-search\.css/);
});


test('specialized native search results retain exact record identity in refreshable deep links',()=>{
 assert.ok(app.includes("getHref:row=>tradeLinkApplicationHref('documents/record/'+encodeURIComponent(row.documentId))"));
 assert.ok(app.includes("getHref:row=>fundTrackerRecordHref(row.companyCode,row.requestId)"));
 assert.ok(app.includes("getHref:row=>'#/time-tracker/attendance/'+encodeURIComponent(row.id)"));
 assert.ok(app.includes("getHref:row=>'#/time-tracker/overtime/'+encodeURIComponent(row.id)"));
 assert.ok(app.includes("getHref:row=>fuelTrackHref('requests')+'/record/'+encodeURIComponent(row.id)"));
 assert.ok(app.includes("const routePath=hash.split('?')[0]"));
 assert.ok(app.includes("query:routeQuery"));
 assert.ok(app.includes("parts[1]==='attendance'&&validUuid(parts[2])"));
 assert.ok(app.includes("parts[3]==='record'&&parts[4]&&validUuid(parts[5])"));
});

test('application identification is presentation-only and distinguishes same-name records and boards',()=>{
 const navigation=[{title:'TimeTracker',subtitle:'Navigation',href:'#/time-tracker',isApplication:true},
  {title:'TimeTracker help',subtitle:'Navigation',href:'#/help'}];
 const modules=[{key:'timetracker',name:'TimeTracker',description:'Attendance',recordType:'Attendance session'}];
 const boards=[{id:activeBoard.id,name:'TimeTracker',status:'active'}];
 const records=[{...record,item_title:'TimeTracker',board_name:'TimeTracker'},
  {native:true,id:'qa-session',title:'TimeTracker',subtitle:'Attendance',href:'#/time-tracker/attendance/qa',recordType:'Attendance session',score:0}];
 const options={navigation,modules,boards,records};
 const results=buildGlobalSearchResults('TimeTracker',options);
 assert.equal(results.length,6);
 for(const row of results){
  const expected={module:'Application',page:row.href==='#/time-tracker'?'Application':'Page',board:'Board',record:'Record','native-record':'Attendance session'};
  assert.equal(globalSearchResultKind(row),expected[row.type]);
 }
 const plain=buildGlobalSearchResults('TimeTracker',{...options,navigation:navigation.map(({isApplication,...row})=>row)});
 assert.deepEqual(results.map(({isApplication,...row})=>row),plain);
 assert.equal(globalSearchResultKind({type:'native-record',application:'TimeTracker'}),'Application record');
 assert.equal(globalSearchResultKind({type:'board',isApplication:true}),'Board');
 const quick=buildGlobalSearchResults('',options);
 assert.equal(globalSearchResultKind(quick.find(row=>row.href==='#/time-tracker')),'Application');
 assert.equal(globalSearchResultKind(quick.find(row=>row.type==='module')),'Application');
});
