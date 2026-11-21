/** Fixture-only browser acceptance: no signed production data is written. */
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import {renderTalkBoxApplication} from '../frontend/talkbox-ui.js';
import {meetingReportCsv} from '../frontend/talkbox-meetings.js';

const css=readFileSync('frontend/talkbox-application.css','utf8');
const issue={id:'5',name:'Open delivery issue',status:'Working on it',version:2,
 date:'2026-11-25',person:[{name:'Operations'}],updates:[],subitems:[],assets:[],
 timeTracking:{hours:0,minutes:15}};
const record={date:'2026-11-21',issueIds:['5','9'],issueSnapshots:[
 {id:'5',name:issue.name,status:issue.status,date:issue.date,person:'Operations'},
 {id:'9',name:'Archived sample issue',status:'Stuck',date:null,person:''}],
 carriedFrom:'2026-11-19',carriedIssueIds:['5'],notes:'Follow up on materials',
 createdAt:'2026-11-21T00:00:00Z',updatedAt:'2026-11-21T00:00:00Z'};
const archived={id:'9',name:'Archived sample issue',status:'Stuck',date:null,person:[],unavailable:true};
const html=extra=>renderTalkBoxApplication({page:{items:[issue],total:1},canEdit:true,
 features:{threadedReplies:true,attachmentRemoval:true,serverTimer:true},
 meetingHistory:[record],...extra});
const browser=await chromium.launch({headless:true,
 executablePath:'/Applications/Chromium.app/Contents/MacOS/Chromium',args:['--no-sandbox']});
try{
 for(const [name,width,height] of [['desktop',1440,900],['tablet',820,1000],['phone',390,844]]){
  const page=await browser.newPage({viewport:{width,height}});
  const body=html({meetingOpen:true,meetingDate:record.date,meetingRecord:record,meetingRows:[issue,archived]});
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f3f6fa}</style><style>'+css+'</style></head><body>'+body+'</body></html>');
  if(!await page.getByRole('button',{name:'Download report CSV'}).isVisible())throw Error('Report missing '+name);
  if(!await page.locator('#tb-meeting-notes').isVisible())throw Error('Notes missing '+name);
  if(await page.locator('#tb-meeting-notes').inputValue()!=='Follow up on materials')throw Error('Saved notes missing '+name);
  if(!await page.getByText('Archived / unavailable').isVisible())throw Error('Archived history missing '+name);
  if(await page.locator('[data-tb-inline-status]').count()!==1)throw Error('Unavailable issue is editable '+name);
  const bounds=await page.evaluate(()=>({pageWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
  if(bounds.pageWidth>width+2)throw Error('Horizontal page overflow '+name+' '+JSON.stringify(bounds));
  await page.screenshot({path:'/tmp/cp-tb-meeting-02-'+name+'.png',fullPage:true});
  console.log('PASS',name,'saved notes, report, archived history, scoped inline edit, no page overflow');
  await page.close();
 }
 const page=await browser.newPage();
 await page.setContent('<!doctype html><html><head><style>'+css+'</style></head><body>'+html()+'</body></html>');
 if(!await page.getByRole('button',{name:/2026-11-21/}).isVisible())throw Error('History navigation missing');
 if(!meetingReportCsv(record,[issue]).includes('Follow up on materials'))throw Error('CSV report incomplete');
 await page.close();
 console.log('PASS meeting history and CSV source');
}finally{await browser.close();}
