import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderActivityScreen} from '../apps/DailyDepartmentActivity/activity-screen.js';
const snapshot={workspaceId:'w',revision:1,directory:{departments:[{id:'d',name:'Operations'}],people:[{id:'p',name:'Person',departmentId:'d'}]},categories:[{id:'c',name:'Reporting'}],records:[]};
const filters={date:'2026-11-26',departmentId:'',personId:'',status:'',categoryId:'',query:''};
const base={snapshot,records:[],filters,editor:null,fields:{},busy:false,notice:'',error:'',requiresReload:false};
test('DDA screen empty and loading states distinguish missing data from empty records',()=>{
  assert.match(renderActivityScreen({...base,snapshot:null,busy:true}),/Loading activities/);
  assert.match(renderActivityScreen({...base,snapshot:null}),/service unavailable/);
  assert.match(renderActivityScreen(base),/No matching activities/);
  assert.match(renderActivityScreen({...base,snapshot:{...snapshot,directory:{departments:[],people:[]}}}),/No personnel available/);
});
test('DDA screen renders historical department and escapes all record strings',()=>{
  const row={id:'" onclick="bad',title:'<img src=x>',details:'<script>bad</script>',date:filters.date,personId:'p',departmentId:'d',categoryId:'c',status:'Completed'};
  const html=renderActivityScreen({...base,records:[row]});
  assert.match(html,/Operations/);
  assert.match(html,/&lt;img src=x&gt;/);
  assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<img|<script| onclick="bad/);
});
test('DDA editor retains field values and blocks writes during uncertain persistence',()=>{
  const html=renderActivityScreen({...base,editor:{activityId:'a',personId:'p',date:filters.date},fields:{title:'draft',details:'notes',status:'Pending',categoryId:'c'},requiresReload:true});
  assert.match(html,/Edit activity/);
  assert.match(html,/value="draft"/);
  assert.match(html,/<fieldset disabled>/);
  assert.match(html,/value="Pending" selected/);
  assert.match(html,/value="c" selected/);
});
