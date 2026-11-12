import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyMaterialSourcingDetailError,renderMaterialSourcingUnavailableDetails}
 from '../material-sourcing-detail-tabs.js';
import {renderProtectedSourcingEditor} from '../material-sourcing-application.js';
test('failed reads distinguish access, transient failure and other response failures',()=>{
 for(const status of [401,403])
  assert.equal(classifyMaterialSourcingDetailError({status}),'restricted');
 assert.equal(classifyMaterialSourcingDetailError({code:'42501'}),'restricted');
 for(const status of [0,408,429,500,503])
  assert.equal(classifyMaterialSourcingDetailError({status}),'retry');
 assert.equal(classifyMaterialSourcingDetailError({status:422}),'unavailable');
});
test('restricted fallback never claims that saved values are missing',()=>{
 const html=renderMaterialSourcingUnavailableDetails({reason:'restricted'});
 assert.match(html,/Restricted/);
 assert.match(html,/restricted for this session/);
 assert.doesNotMatch(html,/not entered|No protected values|could not be loaded/);
 assert.doesNotMatch(html,/data-mrh-private-field|name="value"/);
});
test('network failure is retryable and not misrepresented as permission denial',()=>{
 const html=renderMaterialSourcingUnavailableDetails({reason:'retry'});
 assert.match(html,/Refresh the item to retry/);
 assert.match(html,/data-mrh-details-retry/);
 assert.doesNotMatch(html,/restricted for this session|not been entered/);
});
test('authorized empty response is different from a denied response',()=>{
 const html=renderProtectedSourcingEditor({}, {editing:false});
 assert.match(html,/No protected values entered yet/);
 assert.doesNotMatch(html,/restricted for this session/);
 const nonempty=renderProtectedSourcingEditor({'Buying Price':{value:123,revision:1}});
 assert.match(nonempty,/>123</);
 assert.doesNotMatch(nonempty,/No protected values entered yet/);
});
test('drawer checks post-save reload before claiming success',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const part=source.slice(source.indexOf('async function openBoardItemDetails('),source.indexOf('async function openBoardMembers('));
 assert.match(part,/readProtectedSourcingItem\(input\),db\.board\(snapshot\.boardId\)/);
 assert.match(part,/Saved values could not be verified/);
 assert.match(part,/updateDisplay\(values\)/);
 assert.match(part,/classifyMaterialSourcingDetailError\(error\)/);
 assert.match(part,/data-mrh-details-retry/);
 assert.match(part,/renderMaterialSourcingUnavailableDetails\(\{/);
 assert.match(part,/return true;/);
 assert.match(part,/return false;/);
});

test('central Save changes keeps inputs mounted, reconciles receipts, and never reloads the board',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const part=source.slice(source.indexOf('async function openBoardItemDetails('),source.indexOf('async function openBoardMembers('));
 const save=part.slice(part.indexOf("saveAll?.addEventListener('click'"));
 assert.match(part,/data-mrh-save-all hidden>Save changes/);
 assert.match(part,/data-mrh-save-feedback/);
 assert.match(part,/planProtectedSourcingChanges\(values,rawDraft\(\)\)/);
 assert.match(save,/writeProtectedSourcingField\(\{\.\.\.input,/);
 assert.match(save,/readProtectedSourcingItem\(input\),db\.board\(snapshot\.boardId\)/);
 assert.match(save,/updateDisplay\(values\)/);
 assert.match(save,/Your edits are retained/);
 assert.doesNotMatch(save,/await loadBoard\(|window\.location\.reload|privateHost\.innerHTML=renderProtectedSourcingEditor/);
 const app=readFileSync(new URL('../material-sourcing-application.js',import.meta.url),'utf8');
 const renderer=app.slice(app.indexOf('export function renderProtectedSourcingEditor('),app.indexOf('/** Add a real part number'));
 assert.doesNotMatch(renderer,/<button class="secondary" type="submit">Save/);
});
