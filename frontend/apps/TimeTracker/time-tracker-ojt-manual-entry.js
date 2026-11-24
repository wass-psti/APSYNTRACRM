import {parseTimeTrackerAdminDateTime} from '../../time-tracker-record-management.js';
import {TT_LOCATIONS} from '../../time-tracker-policy.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const uuid=/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

/** Manual OJT entries are administrator attested, never GPS verified. */
export function buildTimeTrackerManualOjtEntry(data,{interns=[],now=Date.now()}={}){
 const read=key=>String(data.get(key)??'').trim();
 const internId=read('internId'),location=read('location');
 const reason=read('reason'),workNote=read('workNote');
 if(!uuid.test(internId)||!interns.some(i=>i.id===internId))
  throw Error('Select a currently registered OJT intern.');
 if(!TT_LOCATIONS.includes(location))throw Error('Select a valid work location.');
 if(reason.length<10||reason.length>500)
  throw Error('Explain the missed clock-in in at least 10 characters (maximum 500).');
 if(workNote.length>500||(location==='Offsite (Home)'&&!workNote))
  throw Error('Offsite (Home) requires a work plan of up to 500 characters.');
 const clockIn=parseTimeTrackerAdminDateTime(read('clockInAt'));
 const clockOut=read('clockOutAt')?parseTimeTrackerAdminDateTime(read('clockOutAt')):null;
 const inMs=Date.parse(clockIn),outMs=clockOut===null?null:Date.parse(clockOut);
 if(inMs>now+120000||inMs<now-365*86400000)
  throw Error('Clock-In must be within the past 365 days, not in the future.');
 if(outMs!==null&&(outMs<=inMs||outMs>now+120000))
  throw Error('Clock-Out must be later than Clock-In and cannot be in the future.');
 return Object.freeze({internId,clockIn,clockOut,location,workNote,reason});
}

export function renderTimeTrackerManualOjtEntry({editor=null,busy=false,error=''}={}){
 if(!editor?.manualCreate)return '';
 const interns=Array.isArray(editor.interns)?editor.interns:[];
 const draft=editor.draft||{};
 const field=(label,name,placeholder,required=false)=>
  '<label class="tt-admin-field"><span>'+esc(label)+'</span>'+
  '<input name="'+name+'" type="text" placeholder="'+esc(placeholder)+
  '" value="'+esc(draft[name]||'')+'"'+(required?' required':'')+'></label>';
 return '<div class="tt-admin-editor-backdrop" data-tt-admin-backdrop>'+
  '<form id="tt-ojt-manual-entry-form" class="tt-admin-editor" role="dialog" aria-modal="true" aria-labelledby="tt-manual-entry-title" data-tt-admin-dialog>'+
  '<header class="tt-admin-editor-head"><div class="tt-admin-editor-title-group">'+
  '<span class="tt-admin-eyebrow">SYSTEM ADMIN · AUDITED ATTENDANCE ENTRY</span>'+
  '<h3 id="tt-manual-entry-title">Add missed OJT clock-in</h3>'+
  '<p>For interns who could not clock in through the application. This entry is manually attested, not GPS verified.</p></div>'+
  '<button type="button" class="tt-admin-close" data-action="tt-log-admin-cancel"'+(busy?' disabled':'')+' aria-label="Close manual attendance form">×</button></header>'+
  (error?'<p class="tt-admin-error" role="alert">'+esc(error)+'</p>':'')+
  '<fieldset class="tt-admin-editor-fields"'+(busy?' disabled':'')+'><div class="tt-admin-editor-body">'+
  '<section class="tt-admin-field-section"><h4>Intern and work location</h4><div class="tt-admin-grid tt-admin-grid-two">'+
  '<label class="tt-admin-field"><span>Intern name</span><select name="internId" required>'+
  '<option value="">Select OJT intern</option>'+
  interns.map(i=>'<option value="'+esc(i.id)+'"'+(i.id===draft.internId?' selected':'')+'>'+esc(i.name)+'</option>').join('')+
  '</select></label>'+
  '<label class="tt-admin-field"><span>Work location</span><select name="location" required>'+
  TT_LOCATIONS.map(v=>'<option value="'+esc(v)+'"'+(v===(draft.location||TT_LOCATIONS[0])?' selected':'')+'>'+esc(v)+'</option>').join('')+
  '</select></label></div></section>'+
  '<section class="tt-admin-field-section"><h4>Philippine Time (UTC+08:00)</h4>'+
  '<div class="tt-admin-grid tt-admin-grid-two">'+
  field('Actual Clock-In date and time','clockInAt','YYYY-MM-DD hh:mm AM/PM',true)+
  field('Actual Clock-Out date and time (optional)','clockOutAt','YYYY-MM-DD hh:mm AM/PM')+
  '</div><p>Leave Clock-Out blank only if the intern is still working. Active entries will follow the existing nine-hour OJT auto-clock-out policy.</p></section>'+
  '<section class="tt-admin-field-section"><h4>Supporting record</h4>'+
  '<label class="tt-admin-field"><span>Work plan or note</span><textarea name="workNote" maxlength="500" rows="2" placeholder="Required when working from home">'+esc(draft.workNote||'')+'</textarea></label>'+
  '<label class="tt-admin-field"><span>Reason for missed clock-in (required)</span><textarea name="reason" required minlength="10" maxlength="500" rows="3" placeholder="For example: Employee reported a GPS failure and supervisor confirmed arrival time.">'+esc(draft.reason||'')+'</textarea></label>'+
  '<p>GPS is recorded as not captured. The administrator, timestamp, reason and record details are permanently audited.</p></section>'+
  '</div></fieldset><footer class="tt-admin-editor-actions"><span class="tt-admin-editor-footnote">Overlapping sessions cannot be created. Changes to existing records use the normal correction workflow.</span><div>'+
  '<button type="button" class="secondary" data-action="tt-log-admin-cancel"'+(busy?' disabled':'')+'>Cancel</button>'+
  '<button type="submit" class="primary"'+(busy||!interns.length?' disabled':'')+'>Save manual attendance</button>'+
  '</div></footer></form></div>';
}
