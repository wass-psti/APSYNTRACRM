/** Real browser download acceptance using disposable signed-shaped fixture data only. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {renderTalkBoxApplication} from '../frontend/talkbox-ui.js';
import {meetingReportCsv} from '../frontend/talkbox-meetings.js';

const meeting={date:'2026-11-22',issueIds:['5'],issueSnapshots:[
 {id:'5',name:'=QA issue, "test"',status:'Working on it',date:null,person:'Operations'}],
 carriedFrom:'2026-11-21',carriedIssueIds:['5'],notes:'Verified exported meeting report',
 createdAt:'2026-11-22T00:00:00Z',updatedAt:'2026-11-22T00:00:00Z'};
const issue={id:'5',name:'=QA issue, "test"',status:'Done',date:null,person:[],
 updates:[],subitems:[],assets:[],timeTracking:{hours:0,minutes:0}};
const csv=meetingReportCsv(meeting,[issue]);
const expected=Buffer.from(csv,'utf8');
const expectedHash=createHash('sha256').update(expected).digest('hex');
const browser=await chromium.launch({headless:true,
 executablePath:'/Applications/Chromium.app/Contents/MacOS/Chromium',args:['--no-sandbox']});
try{
 for(const [label,width,height] of [['desktop',1440,900],['tablet',820,1000],['phone',390,844]]){
  const context=await browser.newContext({acceptDownloads:true,viewport:{width,height}});
  const page=await context.newPage();
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
  const blobUrl=await page.evaluate(source=>URL.createObjectURL(new Blob([source],
   {type:'text/csv;charset=utf-8'})),csv);
  await page.locator('body').evaluate((body,html)=>{body.innerHTML=html;},
   renderTalkBoxApplication({page:{items:[issue],total:1},meetingOpen:true,
    meetingDate:meeting.date,meetingRecord:meeting,meetingRows:[issue],
    reportUrl:blobUrl,canEdit:true}));
  const link=page.getByRole('link',{name:'Download report CSV'});
  if(!await link.isVisible())throw Error(label+': report link missing');
  if(await link.getAttribute('download')!=='talkbox-meeting-2026-11-22.csv')
   throw Error(label+': downloaded filename mismatch');
  const [download]=await Promise.all([page.waitForEvent('download'),link.click()]);
  if(download.suggestedFilename()!=='talkbox-meeting-2026-11-22.csv')
   throw Error(label+': browser suggested different file name');
  const file=join(tmpdir(),'cp-tb-meeting-02b-'+label+'.csv');
  try{
   await download.saveAs(file);
   const bytes=readFileSync(file);
   const hash=createHash('sha256').update(bytes).digest('hex');
   if(hash!==expectedHash||!bytes.equals(expected))
    throw Error(label+': downloaded CSV integrity failed');
   console.log('PASS',label,download.suggestedFilename(),bytes.length,'bytes',hash);
  }finally{rmSync(file,{force:true});}
  await page.evaluate(url=>URL.revokeObjectURL(url),blobUrl);
  await context.close();
 }
}finally{await browser.close();}
