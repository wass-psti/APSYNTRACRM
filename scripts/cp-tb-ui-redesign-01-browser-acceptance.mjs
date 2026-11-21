import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import {renderTalkBoxApplication} from '../frontend/talkbox-ui.js';

const style=readFileSync('frontend/talkbox-application.css','utf8');
const issue={id:'5',name:'Fueltrans (UNIOIL)',status:'Working on it',date:'2026-11-24',
 version:4,person:[{id:'abc',name:'Operations'}],updates:[{id:'7',text_body:'Supplier follow-up and open action notes',
 creator:{name:'Meeting lead'},created_at:'2026-11-21T10:00:00Z'}],subitems:[{id:'14',name:'Confirm release',status:'Stuck'}],
 assets:[{id:'12',name:'meeting-notes.pdf',size:2048}],timeTracking:{hours:1,minutes:35}};
const view=extra=>renderTalkBoxApplication({page:{items:[issue],total:1,cursor:null},selected:null,canEdit:true,
 features:{threadedReplies:true,attachmentRemoval:true,serverTimer:true},...extra});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Chromium.app/Contents/MacOS/Chromium',args:['--no-sandbox']});
try{
 for(const [label,width,height] of [['desktop',1440,900],['tablet',820,1000],['phone',390,844]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font:14px -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;background:#f3f6fa;color:#152b47}</style><style>'+style+'</style></head><body>'+view()+'</body></html>');
  if(!await page.getByRole('button',{name:/Enter Meeting/}).isVisible())throw Error(label+': meeting entry missing');
  if(!await page.locator('[data-action=tb-open]').first().isVisible())throw Error(label+': issue link missing');
  const shell=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth,hero:document.querySelector('.tb-hero')?.getBoundingClientRect().width}));
  if(shell.scroll>width+2){const offenders=await page.evaluate(()=>[...document.querySelectorAll('*')].map(x=>({tag:x.tagName,cls:String(x.className).slice(0,70),width:Math.round(x.getBoundingClientRect().width),right:Math.round(x.getBoundingClientRect().right),scroll:x.scrollWidth})).filter(x=>x.right>innerWidth+2).sort((a,b)=>b.right-a.right).slice(0,12));console.log('OVERFLOW',JSON.stringify(offenders));throw Error(label+': page horizontal overflow '+JSON.stringify(shell));}
  await page.screenshot({path:'/tmp/cp-tb-ui-redesign-01-'+label+'.png',fullPage:true});
  await page.close();
  console.log('PASS',label,'meeting entry, issue row, overflow',JSON.stringify(shell));
 }
 const page=await browser.newPage({viewport:{width:820,height:920}});
 await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font:14px -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;background:#f3f6fa;color:#152b47}</style><style>'+style+'</style></head><body>'+view({selected:issue,meetingOpen:true,meetingDate:'2026-11-21'})+'</body></html>');
 const meetingStatus=page.locator('[data-tb-inline-status="5"]');
 if(!await meetingStatus.isVisible())throw Error('meeting sheet inline status not visible');
 if(await meetingStatus.inputValue()!=='Working on it')throw Error('meeting sheet status did not reflect persisted record');
 await meetingStatus.selectOption('Stuck');
 if(await meetingStatus.inputValue()!=='Stuck')throw Error('native status select interaction failed');
 const dialog=page.getByRole('dialog',{name:'Issue details'});
 if(!await dialog.isVisible())throw Error('right drawer not visible');
 for(const action of ['tb-post','tb-file-upload','tb-timer-start','tb-subtask-new'])
  if(!await page.locator('[data-action="'+action+'"]').isVisible())throw Error('missing detail action '+action);
 await page.screenshot({path:'/tmp/cp-tb-ui-redesign-01-drawer.png',fullPage:true});
 console.log('PASS drawer, discussion, files, time tracking, subtasks visible');
 await page.close();
}finally{await browser.close();}
