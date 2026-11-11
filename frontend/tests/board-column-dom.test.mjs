import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchBoardColumnDom} from '../board-column-dom.js';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const structure=readFileSync(new URL('../board-structure-admin.js',import.meta.url),'utf8');
const columnDom=readFileSync(new URL('../board-column-dom.js',import.meta.url),'utf8');

test('column DOM patcher validates keys and requires a mounted ordinary-board table',()=>{
 assert.deepEqual(patchBoardColumnDom(null,{key:'record'}),
  {status:'invalid',tables:0,cells:0});
 assert.deepEqual(patchBoardColumnDom({querySelectorAll:()=>[]},{key:'record'}),
  {status:'missing',tables:0,cells:0});
 assert.equal(patchBoardColumnDom({querySelectorAll:()=>[]},{key:'col:invalid'}).status,'invalid');
});

test('column DOM patcher updates only the target column and preserves unrelated DOM identity',()=>{
 assert.match(columnDom,/thead th\[data-column-key/);
 assert.match(columnDom,/td\[data-board-cell-key/);
 assert.match(columnDom,/renderCell\(itemId\)/);
 assert.match(columnDom,/trigger\.replaceWith\(content\)/);
 assert.match(columnDom,/replaceChildren\(content\)/);
 assert.match(columnDom,/data-board-summary-key/);
 assert.doesNotMatch(columnDom,/\.innerHTML\s*=|root\.innerHTML|fetch\(|localStorage|sessionStorage/);
});

test('column visibility patch handles active inline editors without discarding their draft',()=>{
 assert.match(columnDom,/data-inline-cell-form/);
 assert.match(columnDom,/status:'pending'/);
 assert.match(columnDom,/status:pending\?'partial':'patched'/);
 assert.match(app,/let pendingBoardColumnDomPatch=null/);
 assert.match(app,/pending\.boardId!==state\.boardId/);
 assert.match(app,/function flushPendingBoardColumnDomPatch\(/);
 assert.match(app,/flushPendingBoardColumnDomPatch\(\)/);
});

test('column editor save reconciles one authoritative board snapshot and patches one column',()=>{
 const start=app.indexOf('function contextualColumnEditor(');
 const end=app.indexOf('function contextualColumnDelete(',start);
 const editor=app.slice(start,end);
 assert.match(editor,/await verifyInlineColumnBoard\(snapshot\)/);
 assert.match(editor,/await boardStructureClient\.mutate\(fresh/);
 assert.match(editor,/await readBackBoardColumnMutation\(snapshot,receipt\)/);
 assert.match(editor,/patchBoardColumn\(key\)/);
 assert.doesNotMatch(editor,/update\.visible!==target\.visible/);
 assert.doesNotMatch(editor,/loadBoard\(/);
});

test('column creation and structure editor use local state reconciliation instead of route reload',()=>{
 const createStart=app.indexOf('function contextualColumnCreate(');
 const createEnd=app.indexOf('async function openBoardStructure(',createStart);
 const create=app.slice(createStart,createEnd);
 assert.match(create,/readBackBoardColumnMutation/);
 assert.match(create,/render\(\)/);
 assert.doesNotMatch(create,/loadBoard\(/);
 const submitStart=app.indexOf("view.addEventListener('submit',async event=>{",createEnd);
 const submitEnd=app.indexOf("view.addEventListener('click',async event=>{",submitStart);
 const submit=app.slice(submitStart,submitEnd);
 assert.match(submit,/state\.boardUi=saved/);
 assert.match(submit,/patchBoardColumnHeaders\(\)/);
 assert.match(submit,/readBackBoardColumnMutation/);
 assert.doesNotMatch(submit,/loadBoard\(/);
});

test('column display settings update the existing headers without rebuilding the application shell',()=>{
 const start=app.indexOf('function patchBoardColumnHeaders(');
 const end=app.indexOf('async function readBackBoardColumnMutation(',start);
 const patch=app.slice(start,end);
 assert.match(patch,/patchBoardColumn\(column\.key/);
 assert.match(patch,/refreshBoardColumnMenu\(\)/);
 assert.doesNotMatch(patch,/render\(\)|loadBoard\(/);
});

test('duplicate preflight permission and session RPCs are removed while authoritative writer checks remain',()=>{
 const start=app.indexOf('async function verifyInlineColumnBoard(');
 const end=app.indexOf('function inlineColumnSnapshot(',start);
 const preflight=app.slice(start,end);
 assert.match(preflight,/auth\.getVerifiedUser\(\)/);
 assert.match(preflight,/db\.context\(\)/);
 assert.match(preflight,/db\.board\(snapshot\.boardId\)/);
 assert.match(preflight,/snapshot\.boardRevision/);
 assert.doesNotMatch(preflight,/db\.allowed\(|db\.rpc\('wm_board_ui_read'/);
 assert.match(structure,/await hasManage\(this\.api,id\)/);
 assert.match(structure,/wm_board_schema_mutate/);
});
