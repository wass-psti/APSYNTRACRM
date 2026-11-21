/** Compare TimeTracker attendance administration and monitor in Chromium. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const oldCss=execFileSync('git',['show','origin/main:frontend/apsyntra-styles.bundle.css'],{encoding:'utf8',maxBuffer:9*1024*1024});
const newCss=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const output='docs/visual/cp-crm-dark-08';mkdirSync(output,{recursive:true});
const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"><div class="aps-board-shell"><div class="tt-native"><div class="tt-log-command"><div class="tt-log-admin-toolbar"><div class="tt-log-admin-toolbar-copy"><div class="tt-log-admin-toolbar-heading"><span class="tt-log-admin-toolbar-icon">✎</span><div><strong>Attendance record management</strong><span>Authorized actions</span></div></div><div class="tt-log-admin-selection-status"><strong class="tt-log-admin-selected">2</strong><span>selected</span></div></div><div class="tt-log-admin-toolbar-actions"><button>Edit records</button><button class="tt-log-admin-delete" disabled>Delete</button></div></div><div class="tt-log-records"><div class="tt-log-empty">No matching records</div></div><div class="tt-log-admin-feedback is-success">Saved</div></div><div class="tt-admin-editor-backdrop" style="position:relative;inset:auto"><div class="tt-admin-editor" role="dialog"><header class="tt-admin-editor-head"><div class="tt-admin-editor-title-group"><span class="tt-admin-eyebrow">SYSTEM ADMIN</span><h3>Edit attendance record</h3><p>Review values</p></div><button class="tt-admin-close">×</button></header><div class="tt-admin-editor-body"><div class="tt-admin-record-context"><span class="tt-admin-record-avatar">E</span><div><strong>Employee</strong><small>Active record</small></div><span class="tt-admin-record-status">Open</span></div><div class="tt-admin-bulk-guidance"><span>i</span><div><strong>Record guidance</strong><p>Existing authorized flow</p></div></div><section class="tt-admin-field-section"><h4>Clock-in details</h4><div class="tt-admin-grid"><label class="tt-admin-field">Time<input value="09:00"/></label><label class="tt-admin-field">Status<select><option>Present</option></select></label></div><fieldset class="tt-admin-gps"><legend>GPS</legend><p>Recorded location</p></fieldset></section></div><footer class="tt-admin-editor-actions"><span class="tt-admin-editor-footnote">Changes are recorded</span><div><button>Cancel</button><button class="primary">Save</button></div></footer></div></div><div class="tt-admin-delete-backdrop" style="position:relative;inset:auto"><section class="tt-admin-delete-dialog" role="dialog"><span class="tt-admin-delete-icon">!</span><span class="tt-admin-eyebrow">DELETION</span><h3>Delete selected records?</h3><p>This action requires confirmation.</p><div class="tt-admin-delete-records"><span>Selected records</span><ul><li>Record 1</li></ul></div><div class="tt-admin-delete-audit-note"><strong>Audit trace</strong><span>Existing logging retained</span></div><div class="tt-admin-delete-actions"><button>Cancel</button><button class="tt-admin-delete-confirm">Delete</button></div></section></div><div class="tt-monitor-command"><h3 class="tt-monitor-subheading">Monitoring</h3><div class="tt-monitor-empty"><span>!</span><strong>No activity yet</strong><p>Attendance events appear here</p></div><div class="tt-monitor-stats"><div class="tt-monitor-stat"><span>Active today</span><strong>18</strong></div></div></div></div></div></div></body></html>`;
const selectors=['.tt-log-admin-toolbar','.tt-log-admin-toolbar-heading strong','.tt-log-admin-toolbar-heading span','.tt-log-admin-selection-status','.tt-log-admin-selected','.tt-log-admin-toolbar-actions button','.tt-log-admin-toolbar-actions .tt-log-admin-delete','.tt-log-records .tt-log-empty','.tt-log-admin-feedback.is-success','.tt-admin-editor','.tt-admin-editor-body','.tt-admin-record-context','.tt-admin-record-context>div strong','.tt-admin-bulk-guidance','.tt-admin-field-section','.tt-admin-field-section h4','.tt-admin-field input','.tt-admin-field select','.tt-admin-gps','.tt-admin-editor-actions','.tt-admin-editor-actions button:not(.primary)','.tt-admin-delete-dialog','.tt-admin-delete-dialog h3','.tt-admin-delete-dialog>p','.tt-admin-delete-records','.tt-admin-delete-audit-note','.tt-admin-delete-actions button:not(.tt-admin-delete-confirm)','.tt-monitor-empty','.tt-monitor-empty strong','.tt-monitor-empty p','.tt-monitor-stat','.tt-monitor-stat strong'];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
let checked=0;const ok=(value,message)=>{assert.ok(value,message);checked++};
const inspect=selectors=>{
 const rgb=s=>{const m=s.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').slice(0,3).map(Number):null};
 const light=rgb=>rgb.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
 const bg=el=>{for(let e=el;e;e=e.parentElement){const b=getComputedStyle(e).backgroundColor;if(b.startsWith('rgb('))return b}return 'rgb(255, 255, 255)'};
 return selectors.map(selector=>{const el=document.querySelector(selector),style=getComputedStyle(el),background=bg(el),a=light(rgb(style.color)),b=light(rgb(background));return {selector,color:style.color,background:style.backgroundColor,contrast:((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2)};});
};
try{
 for(const width of [390,768,1440])for(const theme of ['light','dark']){
  let baseline;
  for(const [version,css] of [['before',oldCss],['after',newCss]]){
   const page=await browser.newPage({viewport:{width,height:960}});
   await page.setContent(html);await page.evaluate(t=>document.documentElement.dataset.apsMondayTheme=t,theme);
   await page.addStyleTag({content:css});await page.waitForTimeout(280);
   const values=await page.evaluate(inspect,selectors);
   if(version==='after'){
    if(theme==='light')for(let i=0;i<values.length;i++)for(const field of ['color','background'])ok(values[i][field]===baseline[i][field],`${width} light ${values[i].selector} ${field}`);
    else{
     for(const sel of ['.tt-log-admin-toolbar','.tt-log-admin-selection-status','.tt-admin-editor','.tt-admin-editor-body','.tt-admin-record-context','.tt-admin-bulk-guidance','.tt-admin-field-section','.tt-admin-field input','.tt-admin-editor-actions','.tt-admin-delete-dialog','.tt-admin-delete-records','.tt-admin-delete-audit-note','.tt-monitor-empty','.tt-monitor-stat']){
      const value=values.find(v=>v.selector===sel);ok(['rgb(41, 41, 41)','rgb(37, 37, 37)','rgb(48, 48, 48)','rgb(32, 32, 32)','rgb(45, 66, 55)','rgb(51, 58, 74)'].includes(value.background),`${width} ${sel} remained light ${value.background}`);
     }
     for(const sel of ['.tt-log-admin-toolbar-heading strong','.tt-log-admin-toolbar-heading span','.tt-admin-record-context>div strong','.tt-admin-field-section h4','.tt-admin-delete-dialog h3','.tt-admin-delete-dialog>p','.tt-monitor-empty strong','.tt-monitor-empty p','.tt-monitor-stat strong']){
      const value=values.find(v=>v.selector===sel);ok(+value.contrast>=4.5,`${width} ${sel} contrast ${value.contrast}`);
     }
     await page.locator('.tt-admin-field input').focus();ok(await page.locator('.tt-admin-field input').evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',`${width} editor focus missing`);
     await page.emulateMedia({reducedMotion:'reduce'});ok(await page.locator('.tt-log-admin-toolbar-actions button').first().evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<=.001),`${width} reduced motion`);
    }
   }else baseline=values;
   if(theme==='dark'&&width===1440)await page.screenshot({path:`${output}/${version}-1440.png`,fullPage:true});
   await page.close();
  }
 }
 console.log(`CP_CRM_DARK_08_BROWSER_PASS ${checked} assertions`);
}finally{await browser.close()}
