import {manualAttendanceToday,manualAttendanceDatePolicy,TT_MANUAL_LOCATIONS,buildManualAttendanceEntry} from './time-tracker-manual-attendance.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const opt=(value,label,selected,disabled=false)=>'<option value="'+esc(value)+'"'+
 (value===selected?' selected':'')+(disabled?' disabled':'')+'>'+esc(label)+'</option>';
export function manualAttendancePreviewRoster(snapshot){
 const groups=snapshot?.ojtAdmin?.groups||[];
 const shared=new Set(groups.map(g=>g.userId));
 shared.add('d613280d-907b-418f-b872-c0f6dd53e580');
 return (snapshot?.access?.overviewDirectory||[])
  .filter(m=>m.status==='active'&&!shared.has(m.id))
  .map(m=>({id:m.id,type:'regular',name:m.display_name,active:true}))
  .sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
export function readManualAttendanceDraft(form){
 const data=new FormData(form);
 const [employeeType,employeeId]=String(data.get('employee')||'').split(':');
 return {employeeType,employeeId,date:String(data.get('date')||''),status:String(data.get('status')||''),
  clockInTime:String(data.get('clockInTime')||''),clockOutMode:String(data.get('clockOutMode')||'standard'),
  clockOutDate:String(data.get('clockOutDate')||''),clockOutTime:String(data.get('clockOutTime')||''),
  location:String(data.get('location')||''),workNote:String(data.get('workNote')||''),
  reason:String(data.get('reason')||'')};
}
export function syncManualAttendanceForm(form,now=new Date()){
 const date=form.elements.date,status=form.elements.status,mode=form.elements.clockOutMode;
 const policy=manualAttendanceDatePolicy(date.value,now);
 date.max=manualAttendanceToday(now);
 date.setCustomValidity(policy.allowed?'':'Select today or a past date.');
 status.querySelector('option[value="active"]').disabled=!policy.activeAllowed;
 status.querySelector('option[value="completed"]').disabled=!policy.historicalAllowed;
 if(policy.allowed)status.value=policy.defaultStatus;
 const completed=policy.historicalAllowed&&status.value==='completed';
 const outDate=form.elements.clockOutDate,outTime=form.elements.clockOutTime;
 const modeField=form.querySelector('[data-tt-manual-clockout-mode]');
 const outFields=form.querySelector('[data-tt-manual-out]');
 if(completed){
  if(!mode.value)mode.value='standard';
  mode.disabled=false;
  const actual=mode.value==='actual';
  outDate.disabled=outTime.disabled=!actual;
  outDate.required=outTime.required=actual;
  outDate.min=date.value;outDate.max=date.max;
  if(actual&&(!outDate.value||outDate.value<date.value))outDate.value=date.value;
  if(!actual){outDate.value='';outTime.value='';}
  modeField.hidden=false;modeField.style.display='';
  outFields.hidden=!actual;outFields.style.display=actual?'':'none';
 }else{
  mode.value='standard';mode.disabled=true;
  outDate.disabled=outTime.disabled=true;
  outDate.required=outTime.required=false;
  outDate.value='';outTime.value='';
  modeField.hidden=true;modeField.style.display='none';
  outFields.hidden=true;outFields.style.display='none';
 }
 form.elements.workNote.required=form.elements.location.value==='Offsite (Home)';
 const policyText=policy.activeAllowed?
  'Today: create an active employee session. The existing nine-credited-hour auto clock-out applies, unless approved overtime extends it.':
  policy.historicalAllowed?
   'Past date: create a completed HR record. Standard calculates nine credited hours with unpaid lunch excluded; actual lets you enter the real clock-out. Historical records never enter today’s auto-clockout queue.':
   'Select today or a past Philippine date. Future dates are not permitted.';
 form.querySelector('[data-tt-manual-policy]').textContent=policyText;
 return readManualAttendanceDraft(form);
}
export function renderManualAttendanceEditor({editor,busy=false,error='',now=new Date()}={}){
 if(editor?.mode!=='manual')return '';
 const today=manualAttendanceToday(now),d=editor.draft||{};
 const date=d.date||today,policy=manualAttendanceDatePolicy(date,now);
 const status=policy.allowed?policy.defaultStatus:'active';
 const completed=status==='completed';
 const clockOutMode=completed?(d.clockOutMode||'standard'):'standard';
 const capability=editor.capability||{};
 const activeReady=capability.activeReady===true;
 const historicalReady=capability.historicalReady===true;
 const ready=editor.signedCreateReady===true&&!editor.uncertain&&
  (completed?historicalReady:activeReady);
 const warning=editor.uncertain?
  'Save confirmation uncertain. Refresh the Log before retrying.':
  completed&&!historicalReady?
   'Historical attendance service is not verified. Saving is disabled.':
   !completed&&!activeReady?
    'Regular employee auto clock-out is not active or could not be verified. Today’s active manual clock-in is disabled; past-date corrections remain available.':'';
 const input=(label,name,type,value,attrs='')=>'<label class="tt-admin-field"><span>'+esc(label)+'</span><input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+attrs+'></label>';
 const employee=d.employeeType&&d.employeeId?d.employeeType+':'+d.employeeId:'';
 return '<div class="tt-admin-editor-backdrop" data-tt-admin-backdrop>'+
 '<form id="tt-attendance-admin-form" class="tt-admin-editor" role="dialog" aria-modal="true" aria-labelledby="tt-admin-editor-title" data-tt-admin-dialog data-mode="manual">'+
 '<header class="tt-admin-editor-head"><div class="tt-admin-editor-title-group"><span class="tt-admin-eyebrow">SYSTEM ADMIN · MANUAL ATTENDANCE</span><h3 id="tt-admin-editor-title">Add Attendance Log</h3><p>Correct a missed employee clock-in for today or a previous Philippine date.</p></div>'+
 '<button type="button" class="tt-admin-close" data-action="tt-log-admin-cancel" aria-label="Close editor"'+(busy?' disabled':'')+'>×</button></header>'+
 (error?'<p class="tt-admin-error" role="alert">'+esc(error)+'</p>':'')+
 (warning?'<p class="tt-admin-error" role="status" data-tt-manual-readiness-warning>'+esc(warning)+'</p>':'')+
 '<fieldset class="tt-admin-editor-fields"'+(busy?' disabled':'')+'><div class="tt-admin-editor-body">'+
 '<section class="tt-admin-field-section"><h4>Employee and attendance</h4><label class="tt-admin-field"><span>Regular employee</span><select name="employee" required>'+
 opt('','Select employee…',employee)+(editor.roster||[]).filter(m=>m.type==='regular'&&m.active).map(m=>opt('regular:'+m.id,m.name,employee)).join('')+'</select></label>'+
 '<div class="tt-admin-grid tt-admin-grid-two">'+input('Attendance date','date','date',date,'required max="'+today+'" data-previous-date="'+esc(date)+'"')+
 '<label class="tt-admin-field"><span>Session status</span><select name="status" required>'+
 opt('active','Active / Ongoing',status,!policy.activeAllowed)+
 opt('completed','Completed historical record',status,!policy.historicalAllowed)+'</select></label>'+
 input('Actual clock-in time','clockInTime','time',d.clockInTime||'','required')+'</div>'+
 '<p data-tt-manual-policy>'+(policy.activeAllowed?
  'Today: create an active employee session. The existing nine-credited-hour auto clock-out applies, unless approved overtime extends it.':
  'Past date: create a completed HR record. Standard calculates nine credited hours with unpaid lunch excluded; actual lets you enter the real clock-out. Historical records never enter today’s auto-clockout queue.')+'</p>'+
 '<label class="tt-admin-field" data-tt-manual-clockout-mode'+(completed?'':' hidden style="display:none"')+'><span>Historical clock-out method</span><select name="clockOutMode">'+
 opt('standard','Standard · 9 credited hours (lunch excluded)',clockOutMode)+
 opt('actual','Enter actual clock-out time',clockOutMode)+'</select></label>'+
 '<div class="tt-admin-grid tt-admin-grid-two" data-tt-manual-out'+(completed&&clockOutMode==='actual'?'':' hidden style="display:none"')+'>'+
 input('Actual clock-out date','clockOutDate','date',completed&&clockOutMode==='actual'?(d.clockOutDate||date):'','min="'+esc(date)+'" max="'+today+'" '+(completed&&clockOutMode==='actual'?'required':'disabled'))+
 input('Actual clock-out time','clockOutTime','time',completed&&clockOutMode==='actual'?(d.clockOutTime||''):'',completed&&clockOutMode==='actual'?'required':'disabled')+'</div></section>'+
 '<section class="tt-admin-field-section"><h4>Manual entry details</h4><label class="tt-admin-field"><span>Work location</span><select name="location" required>'+
 TT_MANUAL_LOCATIONS.map(v=>opt(v,v,d.location||TT_MANUAL_LOCATIONS[0])).join('')+'</select></label>'+
 '<label class="tt-admin-field"><span>Work note (required for offsite home)</span><textarea name="workNote" maxlength="500"'+(d.location==='Offsite (Home)'?' required':'')+'>'+esc(d.workNote)+'</textarea></label>'+
 '<label class="tt-admin-field"><span>Reason for manual entry</span><textarea name="reason" maxlength="500" required>'+esc(d.reason)+'</textarea></label>'+
 '<p>No GPS coordinates will be fabricated. Every manual entry records the creating System Admin and reason in the immutable audit trail.</p></section>'+
 '</div></fieldset><footer class="tt-admin-editor-actions"><span class="tt-admin-editor-footnote">'+
 (completed?'Historical corrections create completed HR records and never change the employee’s current Clock.':
  'The employee sees this active session in their own Clock and can end it normally.')+
 '</span><div><button type="button" class="secondary" data-action="tt-log-admin-cancel"'+(busy?' disabled':'')+'>Cancel</button><button type="submit"'+(!ready||busy?' disabled':'')+'>Save Attendance Log</button></div></footer></form></div>';
}
export function validateManualAttendanceForm(form,editor,now=new Date()){
 if(editor?.signedCreateReady!==true||editor.uncertain)
  throw Error('Signed manual attendance creation is unavailable.');
 const draft=syncManualAttendanceForm(form,now);
 const entry=buildManualAttendanceEntry(draft,{now,roster:editor.roster});
 const capability=editor.capability||{};
 if(entry.status==='active'&&capability.activeReady!==true)
  throw Error('Regular employee auto clock-out is not active. Today’s manual clock-in is unavailable.');
 if(entry.status==='completed'&&capability.historicalReady!==true)
  throw Error('Historical attendance creation is not available.');
 return entry;
}
