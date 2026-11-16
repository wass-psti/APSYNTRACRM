import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 normalizeGlobalSearchQuery,isGlobalSearchShortcut,isGlobalSearchEditableTarget,
 buildGlobalSearchResults,GLOBAL_SEARCH_MIN_QUERY,GLOBAL_SEARCH_MAX_RESULTS
} from '../global-search.js';

const source=readFileSync('frontend/global-search.js','utf8');
const app=readFileSync('frontend/app.js','utf8');
const data=readFileSync('frontend/data.js','utf8');
const css=readFileSync('frontend/global-search.css','utf8');
const sql=readFileSync('supabase/migrations/20261116055059_cp_crm_global_search_02_indexed_workspace_search.sql','utf8');
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
 assert.match(source,/input\.setAttribute\('aria-label','Search modules, boards and records'\)/);
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
 assert.match(sql,/p_limit integer DEFAULT 40/);
 assert.match(sql,/p_limit > 50/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.wm_search_workspace_content\(text, integer\) FROM PUBLIC, anon/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.wm_search_workspace_content\(text, integer\) TO authenticated/);
 assert.doesNotMatch(sql,/CREATE POLICY|ALTER POLICY|DROP POLICY|CREATE ROLE|ALTER ROLE|INSERT INTO|UPDATE public\.|DELETE FROM/);
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
