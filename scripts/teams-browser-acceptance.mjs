import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {renderTeamsConsole} from '../frontend/teams/teams-ui.js';

// Synthetic visual fixture only: no real employee data or live permissions.
const ws='00000000-0000-4000-8000-000000000001';
const actor='00000000-0000-4000-8000-000000000002';
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const departments=[
 ['Engineering',16],['Finance',3],['General administration',1],
 ['HR/Admin',3],['Information Technology (IT)',2],['Materials & logistics',5],
 ['Sales & marketing',3]
];
const teams=departments.map(([name,count],idx)=>({
 id:id(idx+10),name,memberCount:count,ownerCount:1,contentCount:idx===4?1:0,
 systemAdminCount:idx===2?1:0,isSystem:idx===2,
 canManage:true,avatarUrl:null,coverUrl:null
}));
const members=[];
const directory=[];
let next=30;
for(const team of teams){
 for(let i=0;i<team.memberCount;i++){
  const userId=id(next++);
  const display=team.name==='Information Technology (IT)'?
   ['Team Owner','IT Specialist'][i]:team.name+' member '+(i+1);
  const item={teamId:team.id,userId,name:display,
    email:('staff'+next+'@example.invalid'),title:i===0?'Team Lead':'Team Specialist',
    isOwner:i===0,systemAdminSource:team.isSystem?'inherited':'none',
    systemAdminExplicit:false,grantedByName:null,grantedAt:null};
  members.push(item);
  directory.push({userId,name:item.name,email:item.email});
 }
}
const snapshot={status:'VERIFIED_TEAMS',workspaceId:ws,actorId:actor,revision:1,
 canManageSystemAdmins:true,teams,members,directory,
 content:[{teamId:teams[4].id,contentType:'board',contentId:id(98),
  name:'Daily Activities',accessLevel:'viewer'}]};
const browser=await chromium.launch({
 headless:true,executablePath:process.env.CHROME_BIN||undefined,
 args:['--no-sandbox','--disable-gpu']
});
const output=path.resolve('artifacts/teams-console');
fs.mkdirSync(output,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1728,height:900},deviceScaleFactor:1});
 for(const theme of ['dark','light']){
  const doc='<!doctype html><html><head><meta charset="utf-8">'+
   '<style>body{margin:0;background:#252635;font-family:Inter,Arial,sans-serif}#app{height:100vh}</style>'+
   '</head><body><main id="app">'+renderTeamsConsole({
    snapshot,selectedTeamId:teams[4].id,theme
   })+'</main></body></html>';
  await page.setContent(doc);
  await page.addStyleTag({path:'frontend/teams/teams.css'});
  await page.evaluate(()=>document.fonts.ready);
  const dialog=await page.locator('.teams-dialog').boundingBox();
  const side=await page.locator('.teams-sidebar').boundingBox();
  const cover=await page.locator('.teams-cover').boundingBox();
  assert.ok(dialog&&side&&cover,'Teams modal, sidebar and cover must render');
  assert.ok(dialog.width>1500&&dialog.height>730,'Teams modal should cover nearly the whole desktop');
  assert.ok(side.width>=300&&side.width<=400,'Team navigator should follow reference proportion');
  assert.ok(cover.width>900&&cover.height>=110,'Wide team cover should be present');
  assert.equal(await page.locator('.teams-nav-row').count(),8);
  assert.equal(await page.locator('.teams-table tbody tr').count(),2);
  assert.ok(await page.locator('.teams-owner').count()>0,'Owner crown expected');
  assert.equal(await page.locator('.teams-heading h2').textContent(),'Information Technology (IT)');
  assert.equal(await page.locator('.teams-system-badge').count(),0);
  const dialogTheme=await page.locator('.teams-dialog').getAttribute('data-teams-theme');
  assert.equal(dialogTheme,theme);
  await page.screenshot({path:path.join(output,'teams-'+theme+'.png'),fullPage:true});
  console.log('TEAMS_BROWSER_'+theme.toUpperCase()+'_PASS: '+
    JSON.stringify({dialogWidth:dialog.width,dialogHeight:dialog.height,
     leftPaneWidth:side.width,members:2,teams:7}));
 }
 await page.setViewportSize({width:390,height:844});
 await page.setContent('<!doctype html><html><body style="margin:0">'+
  '<div id="app">'+renderTeamsConsole({snapshot,selectedTeamId:teams[4].id,theme:'dark'})+
  '</div></body></html>');
 await page.addStyleTag({path:'frontend/teams/teams.css'});
 const mobile=await page.locator('.teams-dialog').boundingBox();
 assert.ok(mobile&&mobile.width<=391,'Teams modal should fit mobile width');
 assert.equal(await page.locator('.teams-nav-row').count(),8);
 await page.screenshot({path:path.join(output,'teams-mobile.png'),fullPage:true});
 console.log('TEAMS_BROWSER_MOBILE_PASS');
}finally{await browser.close();}
