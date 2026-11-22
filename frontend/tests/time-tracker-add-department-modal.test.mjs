import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateTimeTrackerNewDepartmentName} from '../apps/TimeTracker/time-tracker-add-department-modal.js';

const js=readFileSync('frontend/apps/TimeTracker/time-tracker-add-department-modal.js','utf8');
const css=readFileSync('frontend/apps/TimeTracker/time-tracker-add-department-modal.css','utf8');
const app=readFileSync('frontend/app.js','utf8');
const index=readFileSync('index.html','utf8');

test('new department requires the deployed 2–60 character policy and trims input',()=>{
 assert.equal(validateTimeTrackerNewDepartmentName(''),'Department name is required.');
 assert.equal(validateTimeTrackerNewDepartmentName('  '),'Department name is required.');
 assert.match(validateTimeTrackerNewDepartmentName('X'),/at least 2 characters/);
 assert.equal(validateTimeTrackerNewDepartmentName(' Customer Support '), '');
 assert.equal(validateTimeTrackerNewDepartmentName('a'.repeat(60)),'');
 assert.match(validateTimeTrackerNewDepartmentName('a'.repeat(61)),/cannot exceed 60/);
 assert.match(validateTimeTrackerNewDepartmentName('Test\nteam'),/invalid characters/);
});
test('duplicate names are rejected case-insensitively against signed catalog names',()=>{
 assert.equal(validateTimeTrackerNewDepartmentName(' engineering ',[
  {id:'first',name:'Engineering'},{id:'second',name:'HR'}
 ]),'A department with this name already exists.');
 assert.equal(validateTimeTrackerNewDepartmentName('hr',['HR']),
  'A department with this name already exists.');
 assert.equal(validateTimeTrackerNewDepartmentName('Client Success',['HR']),'');
});
test('accessible dialog owns focus, dismissal, form errors and saving state',()=>{
 for(const fragment of [
  'role="dialog"','aria-modal="true"','aria-labelledby="tt-add-department-title"',
  'aria-label="Close dialog"','for="tt-add-department-name"',
  'placeholder="e.g. Customer Support"','aria-invalid="false"',
  'New departments become available immediately for assigning employees in this workspace.',
  "event.key==='Escape'","event.key!=='Tab'",
  'event.target===backdrop&&!input.value.trim()',
  'restore?.focus?.()','input.focus()',
  "submitLabel.textContent=busy?'Adding…':'Add department'",
  'input.disabled=busy','cancelButton.disabled=busy','closeButton.disabled=busy',
  'new FormData(form)'
 ])assert.ok(js.includes(fragment),fragment);
 assert.doesNotMatch(js,/\.rpc\(|mutateDepartmentCatalog|fetch\(|localStorage/i);
});
test('modal-only stylesheet uses full-width field, accessible states and mobile stacking',()=>{
 for(const fragment of [
  '.tt-add-department-backdrop','#tt-add-department-name',
  'width:min(480px,calc(100vw - 32px))','height:44px',
  'padding:0 14px','font:400 15px/1.4',
  '#5d61e833','[aria-invalid="true"]',
  'gap:12px','margin:24px 0 0',
  'flex-direction:column-reverse','prefers-reduced-motion:reduce'
 ])assert.ok(css.includes(fragment),fragment);
 assert.match(index,/frontend\/apps\/TimeTracker\/time-tracker-add-department-modal\.css/);
});
test('Add department routes to scoped modal, while rename/delete preserve existing server mutation',()=>{
 assert.match(app,/import \{openTimeTrackerAddDepartmentModal\}/);
 assert.match(app,/if\(rename\)\{/);
 assert.match(app,/openModal\('Rename '\+dept\.name/);
 assert.match(app,/modal=openTimeTrackerAddDepartmentModal\(/);
 assert.match(app,/onSubmit:submitDepartment/);
 assert.match(app,/timeTracker\.mutateDepartmentCatalog\(boardId,\{/);
 assert.match(app,/expectedRevision:catalog\.revision/);
});
