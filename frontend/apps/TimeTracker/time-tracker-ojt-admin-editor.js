/** Signed shared-login intern attendance editor. OJT identity and GPS evidence are immutable.
 * IT Administrators may correct times; System Admins may also edit location/note.
 */
import {TT_LOCATIONS} from '../../time-tracker-policy.js';
import {timeTrackerAdminDateTimeLocal,parseTimeTrackerAdminDateTime} from '../../time-tracker-record-management.js';
import {formatTimeTrackerAdminWallDateTime} from '../../time-tracker-time-format.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const timeField=value=>formatTimeTrackerAdminWallDateTime(timeTrackerAdminDateTimeLocal(value));
const val=(form,name)=>String(form.get(name)??'').trim();

export function buildTimeTrackerOjtAdminPatch(form,{record,timeOnly=false}={}){
 if(!record||!form||typeof form.get!=='function')
  throw Error('Signed intern attendance required for correction.');
 const patch={};
 const inText=val(form,'clockInAt'),oldIn=timeField(record.clockIn);
 if(!inText)throw Error('Clock-In time is required.');
 if(inText!==oldIn)patch.clockInAt=parseTimeTrackerAdminDateTime(inText);
 const outText=val(form,'clockOutAt'),oldOut=record.clockOut?timeField(record.clockOut):'';
 if(outText!==oldOut){
  if(!outText)throw Error('A completed session cannot have its Clock-Out removed.');
  if(timeOnly&&!record.clockOut)
   throw Error('Time correction cannot create a new Clock-Out.');
  patch.clockOutAt=parseTimeTrackerAdminDateTime(outText);
 }
 if(!timeOnly){
  const location=val(form,'location');
  if(!TT_LOCATIONS.includes(location))
   throw Error('Select a valid work location.');
  if(location!==record.location)patch.location=location;
  const note=val(form,'workNote');
  if(note.length>500)throw Error('Work note must be 500 characters or less.');
  if(location==='Offsite (Home)'&&!note)
   throw Error('A work note is required for Offsite (Home).');
  if(note!==String(record.workNote||'').trim())patch.workNote=note;
 }
 if(!Object.keys(patch).length)
  throw Error('Change at least one attendance field before saving.');
 const start=Date.parse(patch.clockInAt||record.clockIn);
 const end=patch.clockOutAt?Date.parse(patch.clockOutAt):
  (record.clockOut?Date.parse(record.clockOut):null);
 if(end!==null&&end<start)
  throw Error('Clock-Out cannot be earlier than Clock-In.');
 return Object.freeze({patch:Object.freeze(patch),reason:val(form,'reason').slice(0,500)});
}

export function renderTimeTrackerOjtAdminEditor({editor=null,busy=false,error=''}={}){
 if(!editor?.ojt||!editor.record)return '';
 const record=editor.record,timeOnly=editor.timeOnly===true,active=!record.clockOut;
 const option=(value)=>'<option value="'+esc(value)+'"'+
  (record.location===value?' selected':'')+'>'+esc(value)+'</option>';
 const field=(label,name,value,placeholder='YYYY-MM-DD hh:mm AM/PM')=>
  '<label class="tt-admin-field"><span>'+esc(label)+'</span>'+
   '<input type="text" name="'+name+'" value="'+esc(value||'')+
    '" placeholder="'+esc(placeholder)+'"></label>';
 return '<div class="tt-admin-editor-backdrop" data-tt-admin-backdrop>'+
  '<form id="tt-attendance-admin-form" class="tt-admin-editor" role="dialog" aria-modal="true" data-tt-admin-dialog data-ojt-admin-editor="true" aria-labelledby="tt-admin-editor-title">'+
   '<header class="tt-admin-editor-head"><div class="tt-admin-editor-title-group">'+
    '<span class="tt-admin-eyebrow">'+(timeOnly?'IT ADMINISTRATOR · TIME CORRECTION':'SYSTEM ADMIN · OJT ATTENDANCE MANAGEMENT')+'</span>'+
    '<h3 id="tt-admin-editor-title">'+(timeOnly?'Correct OJT attendance times':'Edit OJT attendance record')+'</h3>'+
    '<p>Intern identity remains '+esc(record.name)+'. Original GPS evidence is never fabricated or replaced.</p></div>'+
    '<button type="button" class="tt-admin-close" data-action="tt-log-admin-cancel" aria-label="Close editor"'+(busy?' disabled':'')+'>×</button></header>'+
   (error?'<p class="tt-admin-error" role="alert">'+esc(error)+'</p>':'')+
   '<fieldset class="tt-admin-editor-fields"'+(busy?' disabled':'')+'><div class="tt-admin-editor-body">'+
    '<div class="tt-admin-record-context"><strong>'+esc(record.name)+'</strong> <small>OJT intern · '+(active?'Active session':'Completed session')+'</small></div>'+
    '<section class="tt-admin-field-section"><h4>Philippine Time (UTC+08:00)</h4><div class="tt-admin-grid tt-admin-grid-two">'+
     field('Clock-In date and time','clockInAt',timeField(record.clockIn))+
     ((!timeOnly||!active)?field('Clock-Out date and time','clockOutAt',timeField(record.clockOut),'Leave empty to keep active'):'')+
    '</div><p>Edited times are administrative corrections. Arrival and working hours are recalculated from the saved timestamps.</p></section>'+
    (timeOnly?'':'<section class="tt-admin-field-section"><h4>Work details</h4><div class="tt-admin-grid tt-admin-grid-two">'+
      '<label class="tt-admin-field"><span>Work location</span><select name="location">'+TT_LOCATIONS.map(option).join('')+'</select></label>'+
      '<label class="tt-admin-field"><span>Work note</span><textarea name="workNote" maxlength="500" rows="3">'+esc(record.workNote||'')+'</textarea></label>'+
     '</div><p>OJT attribution and originally captured coordinates cannot be reassigned through this editor.</p></section>')+
    '<section class="tt-admin-field-section"><h4>Correction note</h4>'+
      '<label class="tt-admin-field"><span>Audit explanation (optional)</span><textarea name="reason" maxlength="500" rows="2"></textarea></label></section>'+
   '</div></fieldset>'+
   '<footer class="tt-admin-editor-actions"><span class="tt-admin-editor-footnote">Before/after values are retained in private append-only audit history.</span><div>'+
     '<button type="button" class="secondary" data-action="tt-log-admin-cancel"'+(busy?' disabled':'')+'>Cancel</button>'+
     '<button type="submit" class="primary"'+(busy?' disabled':'')+'>'+(busy?'Saving…':timeOnly?'Save time correction':'Save changes')+'</button>'+
   '</div></footer></form></div>';
}
