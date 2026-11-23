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
 const ready=Number.isSafeInteger(editor.revision)&&editor.revision>=1&&!editor.verifying;
 const blocked=busy||!ready;
 const context='<div class="tt-admin-record-context"><span class="tt-admin-record-avatar" aria-hidden="true">'+
  esc(record.name.trim().split(/\\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'O')+
  '</span><div><strong>'+esc(record.name)+'</strong><small>OJT intern · Shared login · '+(active?'Active session':'Completed session')+
  '</small></div><span class="tt-admin-record-status">'+(active?'Active':'Completed')+'</span></div>';
 const field=(label,name,value,placeholder='YYYY-MM-DD hh:mm AM/PM')=>
  '<label class="tt-admin-field"><span>'+esc(label)+'</span>'+
   '<input type="text" name="'+name+'" value="'+esc(value||'')+
   '" placeholder="'+esc(placeholder)+'"'+(name==='clockInAt'?' required':'')+'></label>';
 const display=(label,value)=>
  '<label class="tt-admin-field"><span>'+esc(label)+'</span><input type="text" value="'+esc(value)+
   '" readonly aria-readonly="true"></label>';
 const intro=timeOnly?
  '<span class="tt-admin-eyebrow">AUTHORIZED ADMIN · TIME CORRECTION ONLY</span>'+
  '<h3 id="tt-admin-editor-title">Correct attendance times</h3>'+
  '<p>Original OJT timestamps and corrected values remain in the private audit history.</p>':
  '<span class="tt-admin-eyebrow">SYSTEM ADMIN · ATTENDANCE MANAGEMENT</span>'+
  '<span class="tt-admin-mode-pill">INDIVIDUAL CORRECTION</span>'+
  '<h3 id="tt-admin-editor-title">Edit attendance record</h3>'+
  '<p>Review and correct this intern attendance record without changing the intern identity or original GPS evidence.</p>';
 const clockIn=field('Clock-In date and time','clockInAt',timeField(record.clockIn));
 const clockOut=field('Clock-Out date and time','clockOutAt',timeField(record.clockOut),
  active?'Enter a time to complete this session':'YYYY-MM-DD hh:mm AM/PM');
 const clockSections=timeOnly?
  '<section class="tt-admin-field-section"><h4>Philippine Time (UTC+08:00)</h4>'+
  '<div class="tt-admin-grid tt-admin-grid-two">'+clockIn+(active?'':clockOut)+'</div>'+
  '<p>Active sessions keep running after Clock-In corrections. Completed sessions recalculate credited working hours. Original GPS evidence remains unchanged.</p></section>':
  '<section class="tt-admin-field-section"><h4>Employee and attendance</h4>'+
   '<div class="tt-admin-grid tt-admin-grid-two">'+
   display('Employee',record.name)+
   '<label class="tt-admin-field"><span>Work location</span><select name="location">'+
    TT_LOCATIONS.map(location=>'<option value="'+esc(location)+'"'+
     (record.location===location?' selected':'')+'>'+esc(location)+'</option>').join('')+
   '</select></label>'+
   display('Department','OJT')+display('Attendance status',active?'Active':'Completed')+
   '</div><p>OJT identity and department are fixed. Adding a Clock-Out time completes an active session; completed sessions cannot be reopened through this editor.</p></section>'+
  '<section class="tt-admin-field-section"><h4>Clock-In correction</h4>'+
   '<div class="tt-admin-grid tt-admin-grid-two">'+clockIn+'</div></section>'+
  '<section class="tt-admin-field-section"><h4>Clock-Out correction</h4>'+
   '<div class="tt-admin-grid tt-admin-grid-two">'+clockOut+'</div>'+
   '<p>Original browser GPS is retained unchanged; an administrator-entered Clock-Out never fabricates GPS evidence.</p></section>'+
  '<section class="tt-admin-field-section"><h4>Work details</h4>'+
   '<label class="tt-admin-field"><span>Work note</span><textarea name="workNote" maxlength="500" rows="3">'+
    esc(record.workNote||'')+'</textarea></label></section>';
 return '<div class="tt-admin-editor-backdrop" data-tt-admin-backdrop>'+
  '<form id="tt-attendance-admin-form" class="tt-admin-editor" role="dialog" aria-modal="true" '+
   'data-tt-admin-dialog data-ojt-admin-editor="true" aria-labelledby="tt-admin-editor-title">'+
   '<header class="tt-admin-editor-head"><div class="tt-admin-editor-title-group">'+intro+
   '</div><button type="button" class="tt-admin-close" data-action="tt-log-admin-cancel"'+
   (busy?' disabled':'')+' aria-label="Close editor">×</button></header>'+
   (error?'<p class="tt-admin-error" role="alert">'+esc(error)+'</p>':
    !ready?'<p class="tt-admin-error" role="status">'+
     (editor.verifying?'Verifying current signed OJT attendance before editing…':
      'Signed OJT administration is unavailable. Deploy the OJT admin migration and refresh Logs before saving.')+
    '</p>':'')+
   '<fieldset class="tt-admin-editor-fields"'+(busy?' disabled':'')+'><div class="tt-admin-editor-body">'+
    context+clockSections+
    '<section class="tt-admin-field-section"><h4>Correction note (optional)</h4>'+
     '<label class="tt-admin-field"><span>Additional context, if needed</span>'+
      '<textarea name="reason" maxlength="500" rows="3" placeholder="Optional explanation for this correction"></textarea></label></section>'+
   '</div></fieldset>'+
   '<footer class="tt-admin-editor-actions"><span class="tt-admin-editor-footnote">'+
    'Before/after corrections are retained in private append-only audit history.</span><div>'+
    '<button type="button" class="secondary" data-action="tt-log-admin-cancel"'+
      (busy?' disabled':'')+'>Cancel</button>'+
    '<button type="submit" class="primary"'+(blocked?' disabled':'')+'>'+
      (busy?'Verifying…':timeOnly?'Save time correction':'Save changes')+'</button>'+
   '</div></footer></form></div>';
}
