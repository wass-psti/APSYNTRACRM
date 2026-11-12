/** Disposable Chromium interaction acceptance. No sessions, remote requests or writes. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const root=resolve(import.meta.dirname,'..');
const html=`<!doctype html><html><head><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"><style>body{margin:0}#app .aps-board-shell{padding:50px}.group-heading{display:flex;gap:12px;align-items:center;width:460px}</style></head><body><div id="app"><div class="aps-board-shell"><div class="group-heading"><h3>QA group</h3><details class="board-group-actions"><summary aria-label="Group actions">⋮</summary><div class="board-group-actions-list"><button type="button" data-action="group-inline-edit">Edit name inline</button><button type="button" data-action="group-select-visible">Select visible records</button><button type="button" data-action="group-delete-empty">Delete group</button></div></details></div></div><script type="module">import {startActionMenuExperience} from '/frontend/action-menu-experience.js';startActionMenuExperience(document.body);window.selected=[];document.addEventListener('click',e=>{if(e.target.closest?.('[data-action]'))window.selected.push(e.target.closest('[data-action]').dataset.action);});</script></body></html>`;
const server=createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 if(!u.pathname.startsWith('/frontend/')||u.pathname.includes('..')){res.writeHead(404).end();return;}
 const file=resolve(root,u.pathname.slice(1));
 try{const data=readFileSync(file);res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(data);}catch{res.writeHead(404).end();}
});
class CDP{
 constructor(url){this.ws=new WebSocket(url);this.i=0;this.pending=new Map();this.ready=new Promise(ok=>this.ws.addEventListener('open',ok));this.ws.addEventListener('message',e=>{const o=JSON.parse(e.data);if(!o.id)return;const p=this.pending.get(o.id);if(!p)return;this.pending.delete(o.id);if(o.error)p.reject(Error(o.error.message));else p.resolve(o.result);});}
 async call(method,params={}){await this.ready;return new Promise((ok,no)=>{const id=++this.i;this.pending.set(id,{resolve:ok,reject:no});this.ws.send(JSON.stringify({id,method,params}));});}
 async eval(expression){const r=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value;}
 close(){this.ws.close();}
}
const until=async fn=>{for(let i=0;i<160;i++){try{if(await fn())return}catch{}await sleep(65)}throw Error('Browser timeout');};
async function main(){
 const chrome=[process.env.CHROME_BIN,'/Applications/Chromium.app/Contents/MacOS/Chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(path=>path&&existsSync(path));
 assert.ok(chrome,'Chromium required');const profile=mkdtempSync(join(tmpdir(),'aps-group-menu-'));
 let browser,page;try{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 browser=spawn(chrome,['--headless=new','--no-first-run','--no-sandbox','--disable-background-networking','--disable-extensions','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
 await until(()=>existsSync(join(profile,'DevToolsActivePort')));
 const port=Number(readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
 page=new CDP(target.webSocketDebuggerUrl);await page.call('Runtime.enable');await page.call('Page.enable');
 await page.call('Network.setBlockedURLs',{urls:['*unpkg.com/*','*supabase.co/*']});
 await page.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
 await until(()=>page.eval(`!!document.querySelector('.aps-action-surface')`));
 const hit=async selector=>page.eval(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
 const click=async point=>{
  for(const [type,button] of [['mouseMoved','none'],['mousePressed','left'],['mouseReleased','left']])
   await page.call('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button,clickCount:1});
 };
 const summary='.board-group-actions>summary';
 const details=()=>page.eval(`document.querySelector('.board-group-actions').open`);
 await click(await hit(summary));
 await sleep(100);
 assert.equal(await details(),true,'summary opens the menu');
 assert.equal(await page.eval(`document.querySelector('.board-group-actions-list').matches(':popover-open')`),true);
 const selected=await hit('[data-action="group-select-visible"]');
 assert.equal(await page.eval(`document.elementFromPoint(${selected.x},${selected.y})?.dataset?.action`),'group-select-visible');
 await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:selected.x,y:selected.y});
 await page.call('Input.dispatchMouseEvent',{type:'mousePressed',x:selected.x,y:selected.y,button:'left',clickCount:1});
 assert.equal(await details(),true,'pointerdown inside popup must not dismiss it');
 await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:selected.x,y:selected.y,button:'left',clickCount:1});
 await sleep(30);
 assert.deepEqual(await page.eval('window.selected'),['group-select-visible'],
  'real mouse selection must reach the command handler');
 assert.equal(await details(),false,'successful command selection closes the menu');
 // Outside pointerdown is a legitimate dismissal, with no command selected.
 await click(await hit(summary));await sleep(50);
 assert.equal(await details(),true);
 await click({x:20,y:20});await sleep(20);
 assert.equal(await details(),false,'outside click dismisses the popup');
 assert.deepEqual(await page.eval('window.selected'),['group-select-visible']);
 // Escape also dismisses; opening and keyboard navigation do not.
 await click(await hit(summary));await sleep(50);
 assert.equal(await details(),true);
 await page.eval(`document.querySelector('[data-action="group-delete-empty"]').focus()`);
 assert.equal(await details(),true,'internal keyboard focus keeps menu open');
 await page.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await page.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await sleep(20);
 assert.equal(await details(),false,'Escape dismisses the popup');
 console.log('GROUP_MENU_BROWSER_PASS: real pointer selection, outside click, keyboard focus and Escape');
 }finally{page?.close();if(browser)browser.kill('SIGTERM');await new Promise(ok=>server.close(ok));await sleep(500);try{rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:150})}catch{}}}
main().catch(e=>{console.error('GROUP_MENU_BROWSER_FAIL',e.stack);process.exitCode=1});
