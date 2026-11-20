import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {chromium} from 'playwright';
const port=5192;
const host='http://127.0.0.1:'+port;
const dist=resolve('access-preview/dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,host).pathname);
  const wanted=resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
  if(wanted!==dist&&!wanted.startsWith(dist+sep)){
   res.writeHead(403);res.end('Forbidden');return;
  }
  const bytes=await readFile(wanted);
  res.writeHead(200,{'content-type':types[extname(wanted)]||'application/octet-stream',
   'cache-control':'no-store'});
  res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise((resolve,reject)=>{
 server.once('error',reject);server.listen(port,'127.0.0.1',resolve);
});
let browser=null;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,
  args:['--no-sandbox','--disable-gpu']});
 await mkdir('artifacts/access-v2',{recursive:true});
 const specs=[
  {screen:'workspace',title:'User Role Management',select:'.ap-workspace-grid'},
  {screen:'board',title:'I.T - Daily Activities',select:'.ap-invite-modal'},
  {screen:'app',title:'Settings',select:'.ap-app-grid'},
  {screen:'overview',title:'Three layers of access, each managed where it belongs',select:'.ap-layer-grid'}
 ];
 const page=await browser.newPage({viewport:{width:1280,height:860},deviceScaleFactor:1});
 for(const spec of specs){
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(host+'/?screen='+spec.screen,{waitUntil:'domcontentloaded'});
  await page.locator(spec.select).waitFor({state:'visible'});
  const h1=await page.locator('h1').first().innerText();
  assert.equal(h1,spec.title,spec.screen+' heading');
  assert.equal(errors.length,0,spec.screen+' JS errors: '+errors.join('|'));
  const token=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  assert.equal(token,'rgb(247, 248, 252)','global page color');
  const side=await page.locator('.ap-sidebar').boundingBox();
  assert.ok(Math.abs(side.width-240)<1,'side width 240');
  if(spec.screen==='workspace'){
   const selector=await page.locator('.ap-team-side').boundingBox();
   const right=await page.locator('.ap-team-detail').boundingBox();
   assert.equal(Math.round(selector.width),300,'team card 300px');
   assert.equal(Math.round(right.x-selector.x-selector.width),20,'20px gap');
   assert.equal(await page.locator('.ap-team-nav button').count(),8,'seven teams and All teams');
   assert.equal(await page.locator('.ap-members-table tbody tr').count(),2,'two IT members');
   assert.equal(await page.locator('.ap-board-access-row').count(),3,'visible reference board rows');
  }
  if(spec.screen==='app'){
   const width=(await page.locator('.ap-roles-sidebar').boundingBox()).width;
   assert.equal(Math.round(width),280,'app roles list 280px');
   assert.equal(await page.locator('.ap-capability-table tbody tr').count(),4);
   assert.equal(await page.locator('.ap-person-chip').count(),3);
   assert.equal(await page.locator('.ap-save-footer').count(),1,'unsaved footer on reference state');
  }
  if(spec.screen==='board'){
   const box=await page.locator('.ap-invite-modal').boundingBox();
   assert.ok(Math.abs(box.width-680)<1,'board dialog 680px wide');
   assert.equal(await page.locator('.ap-invite-search input').count(),1);
  }
  await page.screenshot({path:'artifacts/access-v2/'+spec.screen+'-desktop.png',fullPage:true});
  console.log('ACCESS_V2_'+spec.screen.toUpperCase()+'_DESKTOP_PASS');
 }
 await page.goto(host+'/?screen=board',{waitUntil:'domcontentloaded'});
 await page.locator('.ap-invite-search input').press('Enter');
 assert.match(await page.locator('.ap-split-invite').innerText(),/Invite \/ 4/);
 await page.goto(host+'/?screen=app',{waitUntil:'domcontentloaded'});
 await page.locator('.ap-capability-table input[type=checkbox]').first().click();
 await page.locator('.ap-save-footer').waitFor();
 await page.locator('.ap-save-footer button').last().click();
 assert.equal(await page.locator('.ap-save-footer').count(),0);
 await page.setViewportSize({width:390,height:844});
 for(const spec of specs){
  await page.goto(host+'/?screen='+spec.screen,{waitUntil:'domcontentloaded'});
  await page.locator(spec.select).waitFor({state:'visible'});
  const side=await page.locator('.ap-sidebar').boundingBox();
  assert.ok(side.width<=390,'mobile sidebar fits');
  await page.screenshot({path:'artifacts/access-v2/'+spec.screen+'-mobile.png',fullPage:true});
 }
 console.log('ACCESS_V2_DESKTOP_MOBILE_REACT_ACCEPTANCE_PASS');
}finally{
 if(browser)await browser.close();
 server.closeAllConnections();
 await new Promise(resolve=>server.close(resolve));
}
