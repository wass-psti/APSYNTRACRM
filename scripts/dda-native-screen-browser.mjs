import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const root = new URL('../frontend/apps/DailyDepartmentActivity/',import.meta.url);
const files = new Set(['activity-screen.js','activity-screen.css','activity-model.js','activity-drafts.js','activity-controller.js','activity-repository.js','activity-runtime.js','dda-native-host.js']);
const server = createServer(async (req,res)=>{
  try {
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DDA test fixture</title><link rel="stylesheet" href="/activity-screen.css?v=cp-dda-ui-05-20261126"><div id="host"></div></html>');return;}
    const file=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
    if(!files.has(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');
    res.end(await readFile(file==='dda-native-host.js'?new URL('../frontend/dda-native-host.js',import.meta.url):new URL(file,root)));
  } catch {res.writeHead(500).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
let browser;
try {
  browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:chromium.executablePath()});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
    const {createDdaHostSync}=await import('/dda-native-host.js');
    let snapshot={workspaceId:'fixture',revision:0,directory:{departments:[{id:'d',name:'Operations'}],people:[{id:'p',name:'Synthetic person',departmentId:'d'}],unassigned:[{id:'p2',name:'Unassigned fixture'}]},categories:[],records:[]};
    const receipts=new Map();
    const auth={isSignedIn:true,userId:'fixture-user'};
    const api={async rpc(name,args){
      if(name==='dda_snapshot_v1'){window.ddaSnapshotReads=(window.ddaSnapshotReads||0)+1;return structuredClone(snapshot);}
      if(name!=='dda_submit_v1')throw Error('Unknown RPC');
      let receipt=receipts.get(args.p_request_id);
      if(receipt)return structuredClone({...snapshot,...receipt,replayed:true});
      if(args.p_expected_revision!==snapshot.revision){
        receipt={rejectedRequestId:args.p_request_id,rejectionReason:'Revision conflict'};
      }else{
        const action=args.p_action,record=args.p_record;
        if(action==='save-activity')snapshot.records=[...snapshot.records.filter(row=>row.id!==record.id),record];
        else if(action==='delete-activity')snapshot.records=snapshot.records.filter(row=>row.id!==record.id);
        else if(action==='save-category')snapshot.categories=[...snapshot.categories.filter(row=>row.id!==record.id),record];
        else if(action==='save-department')snapshot.directory.departments=[...snapshot.directory.departments.filter(row=>row.id!==record.id),record];
        else if(action==='save-person'){snapshot.directory.people=[...snapshot.directory.people.filter(row=>row.id!==record.id).map(row=>record.isHead&&row.departmentId===record.departmentId?{...row,isHead:false}:row),record];snapshot.directory.unassigned=snapshot.directory.unassigned.filter(row=>row.id!==record.id);}
        else throw Error('Unknown command');
        snapshot.revision++;
        receipt={acknowledgedRequestId:args.p_request_id,acknowledgedRevision:snapshot.revision};
      }
      receipts.set(args.p_request_id,receipt);
      if(window.interruptNextSave){window.interruptNextSave=false;throw Error('Connection interrupted');}
      return structuredClone({...snapshot,...receipt});
    }};
    const sync=createDdaHostSync({load:()=>import('/activity-runtime.js')});
    window.syncFixture=()=>sync({container:document.querySelector('#host'),auth,api,workspaceId:'fixture',userId:'fixture-user',storage:localStorage});
    window.fixture={dispose:()=>sync()};
    window.mountFixture=async()=>{await sync();await window.syncFixture();};
    await window.mountFixture();
  });
  const form=name=>page.locator('form[data-dda-form="'+name+'"]');
  const view=async(name)=>{
    await page.locator('[data-dda-action="view"][data-view="'+name+'"]').click();
    assert.equal(await page.locator('[data-dda-action="view"][aria-pressed="true"]').getAttribute('data-view'),name);
  };
  const org=async(name)=>{
    await page.locator('[data-dda-action="organization-view"][data-org-view="'+name+'"]').click();
    assert.equal(await page.locator('[data-dda-action="organization-view"][aria-pressed="true"]').getAttribute('data-org-view'),name);
    for(const id of ['personnel','departments','categories'])assert.equal(await page.locator('[data-dda-org-panel="'+id+'"]').isVisible(),id===name);
  };
  const notice=text=>page.waitForFunction(value=>document.querySelector('[data-dda-notice]')?.textContent===value,text);
  assert.equal(await page.locator('.dda-metric').count(),4);
  assert.equal(await page.locator('.dda-records .dda-empty').isVisible(),true);
  assert.equal(await page.locator('.dda-quick-record').isVisible(),true);
  const startDate=await form('filters').getByLabel('Activity date').inputValue();
  await form('filters').getByLabel('Search').fill('no matches');
  await form('filters').getByLabel('Department').selectOption('d');
  await form('filters').getByRole('button',{name:'Apply filters'}).click();
  assert.match(await page.locator('.dda-scope-chip').innerText(),/Operations/);
  await form('filters').getByRole('button',{name:'Clear filters'}).click();
  assert.equal(await form('filters').getByLabel('Search').inputValue(),'');
  assert.equal(await form('filters').getByLabel('Department').inputValue(),'');
  assert.equal(await form('filters').getByLabel('Activity date').inputValue(),startDate);
  const surfaces=await page.locator('.dda-panel').first().evaluate(el=>{
    const light=getComputedStyle(el).backgroundColor;
    document.documentElement.dataset.apsMondayTheme='dark';
    const dark=getComputedStyle(el).backgroundColor;
    document.documentElement.removeAttribute('data-aps-monday-theme');
    return {light,dark};
  });
  assert.notEqual(surfaces.light,surfaces.dark);
  await page.setViewportSize({width:800,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:1280,height:900});
  assert.equal(await page.locator('.dda-management').isVisible(),false);
  assert.equal(await page.locator('.dda-reporting').isVisible(),false);
  const navReads=await page.evaluate(()=>window.ddaSnapshotReads);
  await view('organization');
  assert.equal(await page.locator('.dda-layout').isVisible(),false);
  assert.equal(await page.locator('.dda-filters').isVisible(),false);
  assert.equal(await page.locator('.dda-management').isVisible(),true);
  assert.equal(await page.locator('.dda-org-metric').count(),4);
  assert.equal(await page.locator('[data-dda-org-panel="personnel"]').isVisible(),true);
  await org('categories');
  await form('category').getByLabel('Category name').fill('Reporting');
  await view('insights');
  assert.equal(await page.locator('.dda-management').isVisible(),false);
  assert.equal(await page.locator('.dda-reporting').isVisible(),true);
  assert.equal(await page.locator('.dda-filters').isVisible(),true);
  assert.equal(await page.locator('.dda-insight-metric').count(),4);
  assert.equal(await page.locator('.dda-insight-department').count(),1);
  assert.equal(await page.locator('.dda-insight-person').count(),1);
  assert.match(await page.locator('.dda-insight-summary').innerText(),/No matching activities/);
  await page.getByRole('button',{name:'View team'}).click();
  assert.equal(await form('filters').getByLabel('Department').inputValue(),'d');
  assert.equal(await page.locator('.dda-insight-department.is-selected').count(),1);
  assert.equal(await page.locator('.dda-reporting').isVisible(),true);
  await form('filters').getByLabel('Department').selectOption('');
  await form('filters').getByRole('button',{name:'Apply filters'}).click();
  await view('organization');
  // Repaints from applying filters retain the existing application behavior;
  // a plain navigation switch itself must preserve unsubmitted inputs.
  await form('category').getByLabel('Category name').fill('Reporting');
  await org('departments');
  await form('department').getByLabel('Department name').fill('Unsubmitted department');
  await org('categories');
  assert.equal(await form('category').getByLabel('Category name').inputValue(),'Reporting');
  await org('departments');
  assert.equal(await form('department').getByLabel('Department name').inputValue(),'Unsubmitted department');
  await org('categories');
  await view('activities');
  await view('organization');
  assert.equal(await form('category').getByLabel('Category name').inputValue(),'Reporting');
  assert.equal(await page.evaluate(()=>window.ddaSnapshotReads),navReads);
  await form('category').getByRole('button',{name:'Save category'}).click();
  await notice('Category saved.');
  assert.equal(await page.locator('.dda-management').isVisible(),true);
  await view('activities');
  await form('new').getByRole('button',{name:'New activity'}).click();
  assert.equal(await page.locator('.dda-editor-open').isVisible(),true);
  await form('activity').getByLabel('Activity title').fill('Daily <img src=x> report');
  await form('activity').getByLabel('Details').fill('Draft notes');
  await form('activity').getByLabel('Category').selectOption({label:'Reporting'});
  await view('insights');
  await view('organization');
  await view('activities');
  assert.equal(await form('activity').getByLabel('Activity title').inputValue(),'Daily <img src=x> report');
  assert.equal(await form('activity').getByLabel('Details').inputValue(),'Draft notes');
  const initialReads=await page.evaluate(()=>window.ddaSnapshotReads);
  await page.evaluate(()=>window.syncFixture());
  assert.equal(await page.evaluate(()=>window.ddaSnapshotReads),initialReads);
  assert.equal(await form('activity').getByLabel('Activity title').inputValue(),'Daily <img src=x> report');
  await form('activity').getByRole('button',{name:'Close (keep draft)'}).click();
  await page.evaluate(()=>window.mountFixture());
  await form('new').getByRole('button',{name:'New activity'}).click();
  await notice('Unsaved draft restored.');
  assert.equal(await form('activity').getByLabel('Activity title').inputValue(),'Daily <img src=x> report');
  assert.equal(await form('activity').getByLabel('Details').inputValue(),'Draft notes');
  await page.evaluate(()=>{window.interruptNextSave=true;});
  await form('activity').getByRole('button',{name:'Save activity'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-dda-error]')?.textContent==='Connection interrupted');
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await notice('Previous request confirmed without a duplicate save.');
  assert.equal(await page.locator('.dda-entry').count(),1);
  assert.equal(await form('activity').count(),0);
  await form('new').getByRole('button',{name:'New activity'}).click();
  assert.equal(await form('activity').getByLabel('Activity title').inputValue(),'');
  await form('activity').getByRole('button',{name:'Close (keep draft)'}).click();
  assert.equal(await page.locator('.dda-entry img').count(),0);
  assert.equal(await page.locator('.dda-register-list .dda-entry').count(),1);
  await page.locator('.dda-entry').getByRole('button',{name:'Edit'}).click();
  await form('activity').getByLabel('Activity title').fill('Revised report');
  await form('activity').getByRole('button',{name:'Save activity'}).click();
  await notice('Activity saved.');
  await form('filters').getByLabel('Search').fill('missing');
  await form('filters').getByRole('button',{name:'Apply filters'}).click();
  assert.equal(await page.locator('.dda-entry').count(),0);
  await form('filters').getByLabel('Search').fill('Revised');
  await form('filters').getByRole('button',{name:'Apply filters'}).click();
  assert.equal(await page.locator('.dda-entry').count(),1);
  await view('insights');
  assert.match(await page.locator('.dda-insight-summary').innerText(),/100%/);
  assert.equal(await page.locator('.dda-insight-person td').first().innerText(),'1');
  await view('organization');
  await org('departments');
  await form('department').getByLabel('Department name').fill('Field operations');
  await form('department').getByLabel('Abbreviation').fill('FO');
  await form('department').getByRole('button',{name:'Save department'}).click();
  await notice('Department saved.');
  assert.equal(await page.locator('[data-dda-org-panel="departments"]').isVisible(),true);
  await org('personnel');
  await form('person').getByLabel('Personnel to assign').selectOption('p2');
  assert.equal(await form('person').getByLabel('Personnel display name').inputValue(),'Unassigned fixture');
  await form('person').getByLabel('Assign department').selectOption({label:'Field operations'});
  await form('person').getByLabel('Employee ID').fill('E-101');
  await form('person').getByLabel('Position').fill('Engineer');
  await form('person').getByLabel('Company').selectOption('PSTI');
  await form('person').getByLabel('Designate department or unit supervisor').check();
  await form('person').getByRole('button',{name:'Save personnel'}).click();
  await notice('Personnel saved.');
  await form('directory').getByLabel('Directory search').fill('E-101');
  await form('directory').getByRole('button',{name:'Apply personnel filters'}).click();
  assert.equal(await form('person').locator('select[name=id] option').count(),2);
  await form('person').getByLabel('Personnel to assign').selectOption('p2');
  assert.equal(await form('person').getByLabel('Position').inputValue(),'Engineer');
  assert.equal(await form('person').getByLabel('Designate department or unit supervisor').isChecked(),true);
  await form('directory').getByLabel('Directory search').fill('');
  await form('directory').getByRole('button',{name:'Apply personnel filters'}).click();
  await form('person').getByLabel('Personnel to assign').selectOption('p');
  await form('person').getByLabel('Assign department').selectOption({label:'Field operations'});
  await form('person').getByLabel('Designate department or unit supervisor').check();
  await form('person').getByRole('button',{name:'Save personnel'}).click();
  await notice('Personnel saved.');
  await form('person').getByLabel('Personnel to assign').selectOption('p2');
  assert.equal(await form('person').getByLabel('Designate department or unit supervisor').isChecked(),false);
  await view('activities');
  assert.equal(await form('filters').getByLabel('Search').inputValue(),'Revised');
  assert.match(await page.locator('.dda-entry').innerText(),/Operations/);
  await page.setViewportSize({width:390,height:844});
  await view('organization');
  for(const name of ['departments','categories','personnel']){
    await org(name);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  for(const name of ['organization','insights','activities']){
    await view(name);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#host input,#host select,#host textarea')].every(el=>el.labels.length>0)),true);
  await page.locator('.dda-entry').getByRole('button',{name:'Delete'}).click();
  await notice('Activity deleted.');
  assert.equal(await page.locator('.dda-entry').count(),0);
  await page.evaluate(()=>window.fixture.dispose());
  assert.equal(await page.locator('#host').evaluate(el=>el.children.length),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: directory management and historical transfer, native lazy host mounting, same-scope editor preservation, category, draft remount, lost-response receipt recovery, create, edit, filter, delete, escaped text, mobile layout, labeled controls and disposal');
} finally {
  try {await browser?.close();} finally {await new Promise(resolve=>server.close(resolve));}
}
