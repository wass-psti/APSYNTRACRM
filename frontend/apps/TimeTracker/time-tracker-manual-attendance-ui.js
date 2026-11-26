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
 const history=form.querySelector('[data-tt-manual-history]');
 if(history){history.hidden=!completed;history.style.display=completed?'':'none';}
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
 const offsite=form.elements.location.value==='Offsite (Home)';
 const noteField=form.querySelector('[data-tt-manual-work-note]');
 const requiredBadge=form.querySelector('[data-tt-manual-note-required]');
 form.elements.workNote.required=offsite;
 if(noteField){noteField.hidden=!offsite;noteField.style.display=offsite?'':'none';}
 if(requiredBadge)requiredBadge.hidden=!offsite;
 const policyText=policy.activeAllowed?
  'Times are in Philippine Time. Ongoing sessions can only be added for today.':
  policy.historicalAllowed?
   'Times are in Philippine Time. Past dates create completed historical records. Historical records never enter today’s auto-clockout queue.':
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
 const location=d.location||TT_MANUAL_LOCATIONS[0];
 const offsite=location==='Offsite (Home)';
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
 const policyText=policy.activeAllowed?
  'Times are in Philippine Time. Ongoing sessions can only be added for today.':
  policy.historicalAllowed?
   'Times are in Philippine Time. Past dates create completed historical records. Historical records never enter today’s auto-clockout queue.':
   'Select today or a past Philippine date. Future dates are not permitted.';
 return '<div class="tt-admin-editor-backdrop tt-manual-attendance-backdrop" data-tt-admin-backdrop>'+
 '<form id="tt-attendance-admin-form" class="tt-admin-editor" role="dialog" aria-modal="true" aria-labelledby="tt-admin-editor-title" aria-describedby="tt-manual-policy" data-tt-admin-dialog data-mode="manual" data-tt-manual-attendance>'+
 '<header class="tt-admin-editor-head"><div class="tt-manual-attendance-heading">'+
 '<span class="tt-manual-add-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>'+
 '<div class="tt-admin-editor-title-group"><h3 id="tt-admin-editor-title">Add Attendance Log</h3><p>Record a missed clock-in for an employee.</p></div></div>'+
 '<button type="button" class="tt-admin-close" data-action="tt-log-admin-cancel" aria-label="Close editor"'+(busy?' disabled':'')+'>×</button></header>'+
 (error?'<p class="tt-admin-error" role="alert">'+esc(error)+'</p>':'')+
 (warning?'<p class="tt-admin-error" role="status" data-tt-manual-readiness-warning>'+esc(warning)+'</p>':'')+
 '<fieldset class="tt-admin-editor-fields"'+(busy?' disabled':'')+'><div class="tt-admin-editor-body">'+
 '<label class="tt-admin-field tt-manual-employee-field"><span>Employee</span><select name="employee" required>'+
 opt('','Select employee…',employee)+(editor.roster||[]).filter(m=>m.type==='regular'&&m.active).map(m=>opt('regular:'+m.id,m.name,employee)).join('')+'</select></label>'+
 '<div class="tt-admin-grid tt-admin-grid-two tt-manual-form-grid">'+
 input('Attendance date','date','date',date,'required max="'+today+'" data-previous-date="'+esc(date)+'"')+
 input('Clock-in time','clockInTime','time',d.clockInTime||'','required')+
 '<label class="tt-admin-field"><span>Session status</span><select name="status" required>'+
 opt('active','Active / Ongoing',status,!policy.activeAllowed)+
 opt('completed','Completed',status,!policy.historicalAllowed)+'</select></label>'+
 '<label class="tt-admin-field"><span>Work location</span><select name="location" required>'+
 TT_MANUAL_LOCATIONS.map(v=>opt(v,v==='Offsite (Home)'?'Offsite – Home':v,location)).join('')+'</select></label></div>'+
 '<div class="tt-manual-history" data-tt-manual-history'+(completed?'':' hidden style="display:none"')+'>'+
 '<label class="tt-admin-field" data-tt-manual-clockout-mode'+(completed?'':' hidden style="display:none"')+'><span>Historical clock-out method</span><select name="clockOutMode">'+
 opt('standard','Standard · 9 credited hours (lunch excluded)',clockOutMode)+
 opt('actual','Enter actual clock-out time',clockOutMode)+'</select></label>'+
 '<div class="tt-admin-grid tt-admin-grid-two" data-tt-manual-out'+(completed&&clockOutMode==='actual'?'':' hidden style="display:none"')+'>'+
 input('Actual clock-out date','clockOutDate','date',completed&&clockOutMode==='actual'?(d.clockOutDate||date):'','min="'+esc(date)+'" max="'+today+'" '+(completed&&clockOutMode==='actual'?'required':'disabled'))+
 input('Actual clock-out time','clockOutTime','time',completed&&clockOutMode==='actual'?(d.clockOutTime||''):'',completed&&clockOutMode==='actual'?'required':'disabled')+'</div></div>'+
 '<label class="tt-admin-field tt-manual-work-note" data-tt-manual-work-note'+(offsite?'':' hidden style="display:none"')+'><span>Work note <span class="tt-manual-required" data-tt-manual-note-required'+(offsite?'':' hidden')+'>Required</span></span><textarea name="workNote" maxlength="500"'+(offsite?' required':'')+'>'+esc(d.workNote)+'</textarea></label>'+
 '<label class="tt-admin-field tt-manual-reason-field"><span>Reason for manual entry</span><textarea name="reason" maxlength="500" rows="2" required>'+esc(d.reason)+'</textarea></label>'+
 '<p class="tt-manual-policy" id="tt-manual-policy" data-tt-manual-policy>'+policyText+'</p>'+
 '</div></fieldset><footer class="tt-admin-editor-actions"><span class="tt-admin-editor-footnote">'+
 (completed?'Historical corrections create completed HR records and never change the employee’s current Clock.':
  'The employee can clock out from their own Clock screen.')+
 '</span><div><button type="button" class="secondary" data-action="tt-log-admin-cancel"'+(busy?' disabled':'')+'>Cancel</button><button type="submit" class="primary"'+(!ready||busy?' disabled':'')+'>'+(busy?'Saving Attendance Log…':'Save Attendance Log')+'</button></div></footer></form></div>';
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
