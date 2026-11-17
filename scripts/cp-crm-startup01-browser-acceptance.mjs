import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const browser=await chromium.launch({
 headless:true,
 executablePath:process.env.CHROMIUM_EXECUTABLE||
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
});
const source=fileURLToPath(new URL('../frontend/startup-guard.js',import.meta.url));
const template='<div id="apsyntra-init" data-phase="startup"><div class="aps-init-content"><span id="apsyntra-init-phase">Preparing frontend</span></div></div>';
try{
 const page=await browser.newPage();
 await page.setContent(template);
 await page.addScriptTag({path:source});
 const unrelated=await page.evaluate(()=>{
  window.dispatchEvent(new ErrorEvent('error',{message:'optional resource failed'}));
  window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection',{
   promise:Promise.resolve(),reason:Error('optional task failed')
  }));
  const image=document.createElement('img');document.body.append(image);
  image.dispatchEvent(new Event('error'));
  return {state:window.__APSYNTRA_STARTUP.state,
   fatal:!!document.querySelector('.aps-init-recovery'),
   began:window.__APSYNTRA_STARTUP.begin(),
   resolved:window.__APSYNTRA_STARTUP.resolve('AUTHENTICATED')};
 });
 assert.deepEqual(unrelated,{state:'INITIALIZING',fatal:false,began:true,resolved:true});
 await page.close();

 const failure=await browser.newPage();
 await failure.setContent(template);
 await failure.addScriptTag({path:source});
 const required=await failure.evaluate(()=>{
  const entry=document.createElement('script');
  Object.defineProperty(entry,'src',{
   value:'https://wass-psti.github.io/APSYNTRACRM/frontend/app.js'
  });
  document.body.append(entry);
  entry.dispatchEvent(new Event('error'));
  return {state:window.__APSYNTRA_STARTUP.state,
   fatal:!!document.querySelector('.aps-init-recovery')};
 });
 assert.deepEqual(required,{state:'FATAL_ERROR',fatal:true});
 await failure.close();
 console.log('CP-CRM-STARTUP-01 Chromium acceptance: 2/2 PASS (unrelated errors ignored; genuine entry failure remains actionable).');
}finally{await browser.close();}
