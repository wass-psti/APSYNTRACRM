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

test('DDA reporting overview and directory filtering include historical contributors and escape directory text',()=>{
 const directory={departments:[{id:'d',name:'Operations'},{id:'e',name:'Engineering'}],people:[{id:'p',name:'<Former>',departmentId:'e',employeeId:'E-100'}],unassigned:[]};
 const record={id:'a',personId:'p',departmentId:'d',date:filters.date,title:'Prior work',details:'',status:'Completed',categoryId:null};
 const html=renderActivityScreen({...base,snapshot:{...snapshot,directory,records:[record]},records:[record],filters:{...filters,departmentId:'d'},directoryFilters:{query:'E-100',departmentId:''}});
 assert.match(html,/Former contributor/);assert.match(html,/&lt;Former&gt;/);assert.doesNotMatch(html,/<Former>/);
 assert.match(html,/1 matching personnel of 1/);assert.match(html,/Personnel activity overview \(1\)/);
});

test('DDA dashboard separates activity work from organization settings and shows semantic totals',()=>{
 const html=renderActivityScreen(base);
 assert.match(html,/class="dda-stats" aria-label="Activity totals"/);
 for(const key of ['activities','pending','progress','completed'])assert.match(html,new RegExp('dda-metric-'+key));
 assert.match(html,/class="dda-empty"/);
 assert.ok(html.indexOf('dda-stats')<html.indexOf('dda-filters'));
 assert.ok(html.indexOf('dda-records')<html.indexOf('dda-management'));
 assert.match(html,/Organization &amp; Settings/);
});

test('DDA dedicated views expose only their intended sections and retain shared filters',()=>{
 const main=renderActivityScreen(base);
 const organization=renderActivityScreen({...base,view:'organization'});
 const insights=renderActivityScreen({...base,view:'insights'});
 for(const [html,active] of [[main,'activities'],[organization,'organization'],[insights,'insights']]){
   assert.match(html,new RegExp('data-view="'+active+'" aria-pressed="true"'));
   for(const inactive of ['activities','organization','insights'].filter(id=>id!==active)){
     assert.match(html,new RegExp('data-view="'+inactive+'" aria-pressed="false"'));
     assert.match(html,new RegExp('data-dda-views="'+inactive+'" hidden'));
   }
   assert.doesNotMatch(html,new RegExp('data-dda-views="'+active+'" hidden'));
 }
 assert.match(organization,/data-dda-views="activities insights" hidden/);
 assert.doesNotMatch(insights,/data-dda-views="activities insights" hidden/);
 assert.match(main,/aria-label="Daily Department Activity views"/);
});
