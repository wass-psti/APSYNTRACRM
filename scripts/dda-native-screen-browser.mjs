import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const root = new URL('../frontend/apps/DailyDepartmentActivity/',import.meta.url);
const files = new Set(['activity-screen.js','activity-screen.css','activity-model.js','activity-drafts.js','activity-controller.js']);
const server = createServer(async (req,res)=>{
  try {
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DDA test fixture</title><link rel="stylesheet" href="/activity-screen.css"><div id="host"></div></html>');return;}
    const file=req.url.slice(1);
    if(!files.has(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');
    res.end(await readFile(new URL(file,root)));
  } catch {res.writeHead(500).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
let browser;
try {
  browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:chromium.executablePath()});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
    const {createActivityController}=await import('/activity-controller.js');
    const {mountDailyDepartmentActivity}=await import('/activity-screen.js');
    let snapshot={workspaceId:'fixture',revision:0,directory:{departments:[{id:'d',name:'Operations'}],people:[{id:'p',name:'Synthetic person',departmentId:'d'}]},categories:[],records:[]};
    const repository={
      async load(){return structuredClone(snapshot);},
      async mutate(command){
        if(command.expectedRevision!==snapshot.revision)throw Error('Conflict');
        const {action,record}=command;
        if(action==='save-activity')snapshot.records=[...snapshot.records.filter(row=>row.id!==record.id),record];
        else if(action==='delete-activity')snapshot.records=snapshot.records.filter(row=>row.id!==record.id);
        else if(action==='save-category')snapshot.categories=[...snapshot.categories.filter(row=>row.id!==record.id),record];
        else throw Error('Unknown command');
        snapshot.revision++;
        return structuredClone(snapshot);
      }
    };
    window.mountFixture=async()=>{
      window.fixture?.dispose();
      const controller=createActivityController({repository,workspaceId:'fixture',userId:'fixture-user',draftStorage:localStorage});
      window.fixture=mountDailyDepartmentActivity(document.querySelector('#host'),controller,{today:'2026-11-26',confirmDelete:()=>true});
      await window.fixture.ready;
    };
    await window.mountFixture();
  });
  const form=name=>page.locator('form[data-dda-form="'+name+'"]');
  const notice=text=>page.waitForFunction(value=>document.querySelector('[data-dda-notice]')?.textContent===value,text);
  await form('category').getByLabel('Category name').fill('Reporting');
  await form('category').getByRole('button',{name:'Save category'}).click();
  await notice('Category saved.');
  await form('new').getByRole('button',{name:'New activity'}).click();
  await form('activity').getByLabel('Activity title').fill('Daily <img src=x> report');
  await form('activity').getByLabel('Details').fill('Draft notes');
  await form('activity').getByLabel('Category').selectOption({label:'Reporting'});
  await form('activity').getByRole('button',{name:'Close (keep draft)'}).click();
  await page.evaluate(()=>window.mountFixture());
  await form('new').getByRole('button',{name:'New activity'}).click();
  await notice('Unsaved draft restored.');
  assert.equal(await form('activity').getByLabel('Activity title').inputValue(),'Daily <img src=x> report');
  assert.equal(await form('activity').getByLabel('Details').inputValue(),'Draft notes');
  await form('activity').getByRole('button',{name:'Save activity'}).click();
  await notice('Activity saved.');
  assert.equal(await page.locator('.dda-entry').count(),1);
  assert.equal(await page.locator('.dda-entry img').count(),0);
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
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#host input,#host select,#host textarea')].every(el=>el.labels.length>0)),true);
  await page.locator('.dda-entry').getByRole('button',{name:'Delete'}).click();
  await notice('Activity deleted.');
  assert.equal(await page.locator('.dda-entry').count(),0);
  await page.evaluate(()=>window.fixture.dispose());
  assert.equal(await page.locator('#host').evaluate(el=>el.children.length),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: native screen category, draft remount, create, edit, filter, delete, escaped text, mobile layout, labeled controls and disposal');
} finally {
  try {await browser?.close();} finally {await new Promise(resolve=>server.close(resolve));}
}
