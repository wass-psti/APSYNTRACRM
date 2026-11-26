import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {readFile} from 'node:fs/promises';
const css=await readFile('frontend/apsyntra-styles.bundle.css','utf8');
const cases=[
 ['text','clientName','Client Name','Enter client name'],
 ['email','contactEmail','Contact email','Enter contact email'],
 ['tel','contactPhone','Contact number','Enter contact number'],
 ['number','quantity','Quantity','Enter quantity'],
 ['password','password','Password','Enter password'],
 ['url','website','Website','Enter website'],
 ['textarea','remarks','Additional remarks','Enter additional remarks'],
 ['search','tt-log-search','Search','Search attendance logs...']
];
for(const [name,engine] of [['Chromium',chromium],['Firefox',firefox],['WebKit',webkit]]){
 const browser=await engine.launch({headless:true});
 try{
  for(const theme of ['light','dark'])for(const width of [1366,390]){
   const page=await browser.newPage({viewport:{width,height:900}});
   await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
   await page.setContent('<!doctype html><html '+(theme==='dark'?'data-aps-monday-theme="dark"':'')+'><head><style>'+css+'</style></head><body><div id="app"><form id="test-form">'+
    cases.map(([type,name,label])=>type==='textarea'?'<label>'+label+'<textarea name="'+name+'"></textarea></label>':'<label>'+label+'<input type="'+type+'" name="'+name+'"></label>').join('')+
    '<label>Start date<input type="date" name="startDate"></label><label>Receipt<input type="file" name="receipt"></label><label>Enabled<input type="checkbox" name="enabled"></label><input type="hidden" name="secret" value="hidden-value"><input name="existing" placeholder="Keep existing guidance" value="existing-value"></form></div></body></html>');
   const module=await page.evaluate(async()=>await import('/frontend/input-experience.js'));
   const stop=await page.evaluate(async()=>{const m=await import('/frontend/input-experience.js');window.__stop=m.startInputExperience(document.body);return true;});
   for(const [type,name,label,hint] of cases){
    const control=page.locator('[name="'+name+'"]');
    assert.equal(await control.getAttribute('placeholder'),hint,name);
    assert.equal(await control.evaluate(el=>el.matches(':placeholder-shown')),true,name);
    const value=type==='number'?'2':type==='email'?'sample@example.test':type==='url'?'https://example.test':'sample value';
    await control.fill(value);
    assert.equal(await control.evaluate(el=>el.matches(':placeholder-shown')),false,name);
    await control.fill('');
    assert.equal(await control.evaluate(el=>el.matches(':placeholder-shown')),true,name);
   }
   assert.equal(await page.locator('[name=startDate]').getAttribute('placeholder'),null);
   assert.equal(await page.locator('[name=receipt]').getAttribute('placeholder'),null);
   assert.equal(await page.locator('[name=enabled]').getAttribute('placeholder'),null);
   assert.equal(await page.locator('[name=secret]').getAttribute('placeholder'),null);
   assert.equal(await page.locator('[name=existing]').getAttribute('placeholder'),'Keep existing guidance');
   const before=await page.locator('#test-form').evaluate(el=>JSON.stringify([...new FormData(el).entries()]));
   await page.locator('body').evaluate(el=>el.insertAdjacentHTML('beforeend','<label>Project name<input name="projectName"></label><label>Search clients<input type="search" name="clientSearch" aria-label="Search clients"></label>'));
   await page.waitForFunction(()=>document.querySelector('[name=projectName]')?.hasAttribute('placeholder'));
   assert.equal(await page.locator('[name=projectName]').getAttribute('placeholder'),'Enter project name');
   assert.equal(await page.locator('[name=clientSearch]').getAttribute('placeholder'),'Search clients...');
   const after=await page.locator('#test-form').evaluate(el=>JSON.stringify([...new FormData(el).entries()]));
   assert.equal(after,before);
   const ratio=await page.locator('[name=clientName]').evaluate(el=>{
    const rgb=v=>v.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);
    const a=rgb(getComputedStyle(el,'::placeholder').color),b=rgb(getComputedStyle(el).backgroundColor);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   });
   assert.ok(ratio>=4.5,'placeholder contrast '+ratio);
   await page.evaluate(()=>window.__stop());
   console.log('PASS',name,theme,width,cases.length+2,'text/search controls; contrast',ratio.toFixed(2));
   await page.close();
  }
 }finally{await browser.close();}
}
