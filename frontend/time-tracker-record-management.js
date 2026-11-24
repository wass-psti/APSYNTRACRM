import {formatTimeTrackerDurationMs,parseTimeTrackerDuration} from './time-tracker-duration-format.js';
import {formatTimeTrackerAdminWallDateTime,parseTimeTrackerAdminWallDateTime,formatTimeTrackerDateTime} from './time-tracker-time-format.js';
/** System Admin attendance record editor. All mutations are delegated to the signed PostgreSQL RPC. */
import {TT_LOCATIONS,creditedAttendanceMs} from './time-tracker-policy.js';

export const TT_ADMIN_RECORD_LIMIT=100;
export const TT_ADMIN_DEPARTMENTS=Object.freeze([
  'HR','Materials and Logistics','Engineering','Finance and Accounting',
  'Sales and Marketing','Information Technology','General Administration'
]);

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const finite=value=>Number.isFinite(Number(value));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function timeTrackerAdminDateTimeLocal(value){
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return '';
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date(value)).reduce((result,part)=>{
    result[part.type]=part.value;return result;
  },{});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function parseTimeTrackerAdminDateTime(value){
  const original=String(value??'').trim();
  const raw=/^\d{4}-\d{2}-\d{2}T/.test(original)?original:parseTimeTrackerAdminWallDateTime(original);
  if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw))
    throw Error('Enter a valid Philippine date and time.');
  const parsed=new Date(`${raw}:00+08:00`);
  if(!Number.isFinite(parsed.getTime())||timeTrackerAdminDateTimeLocal(parsed.toISOString())!==raw)
    throw Error('Enter a valid Philippine date and time.');
  return parsed.toISOString();
}

const geoValue=(record,kind)=>kind==='in'?record?.clockIn?.geo:record?.clockOut?.geo;
const timeValue=(record,kind)=>kind==='in'?record?.clockIn?.timestamp:record?.clockOut?.timestamp;
const hasClockOut=record=>record?.clockOut&&typeof record.clockOut==='object'&&
  typeof record.clockOut.timestamp==='string'&&Number.isFinite(Date.parse(record.clockOut.timestamp));
const employeeId=record=>String(record?.ownerId||'').replace(/^cloud:/,'');
const sameNumber=(a,b)=>finite(a)&&finite(b)&&Number(a)===Number(b);

function readGeo(formData,prefix,current,{bulk}){
  const values=['latitude','longitude','accuracy'].map(key=>String(formData.get(`${prefix}${key}`)||'').trim());
  if(values.every(value=>value===''))return null;
  if(values.some(value=>value===''))throw Error(`${prefix==='clockInGeo'?'Clock-In':'Clock-Out'} GPS requires latitude, longitude and accuracy.`);
  const [latitude,longitude,accuracy]=values.map(Number);
  if(!values.every((value,index)=>value!==''&&Number.isFinite([latitude,longitude,accuracy][index]))||
    latitude < -90||latitude>90||longitude < -180||longitude>180||accuracy<0||accuracy>100000)
    throw Error('GPS coordinates or accuracy are outside the supported range.');
  if(!bulk&&current&&sameNumber(latitude,current.latitude)&&
    sameNumber(longitude,current.longitude)&&sameNumber(accuracy,current.accuracy))return null;
  return {latitude,longitude,accuracy};
}

/** Build a sparse patch. Blank fields in bulk mode always mean leave unchanged. */
export function buildTimeTrackerAdminPatch(formData,{mode='single',record=null,records=[]}={}){
  const bulk=mode==='bulk',patch={};
  const read=key=>String(formData.get(key)??'').trim();
  const assign=(key,value)=>{if(value!==undefined)patch[key]=value;};

  const selectedEmployee=read('employeeId');
  if(selectedEmployee){
    if(!uuid.test(selectedEmployee))throw Error('Select a valid active employee.');
    if(bulk||selectedEmployee!==employeeId(record))assign('employeeId',selectedEmployee);
  }

  const location=read('location');
  if(location){
    if(!TT_LOCATIONS.includes(location))throw Error('Select a valid work location.');
    if(bulk||location!==record?.clockIn?.location||
      location!==(hasClockOut(record)?record.clockOut.location:record?.clockIn?.location))assign('location',location);
  }
  const department=read('department');
  if(department){
    if(!TT_ADMIN_DEPARTMENTS.includes(department))throw Error('Select a valid department.');
    if(bulk||department!==record?.clockIn?.department||
      department!==(hasClockOut(record)?record.clockOut.department:record?.clockIn?.department))assign('department',department);
  }

  const status=read('status');
  if(status){
    if(!['Active','Completed'].includes(status))throw Error('Select Active or Completed attendance status.');
    const current=hasClockOut(record)?'Completed':'Active';
    if(bulk||status!==current)assign('status',status);
  }
  const effectiveStatus=status||(bulk?null:
    hasClockOut(record)?'Completed':'Active'
  );
  const needsClockOut=bulk?records.some(item=>!hasClockOut(item)):!hasClockOut(record);

  const clockInAt=read('clockInAt');
  if(clockInAt){
    const iso=parseTimeTrackerAdminDateTime(clockInAt);
    if(bulk||timeTrackerAdminDateTimeLocal(iso)!==timeTrackerAdminDateTimeLocal(timeValue(record,'in')))assign('clockInAt',iso);
  }
  const clockInGeo=readGeo(formData,'clockInGeo',geoValue(record,'in'),{bulk});
  if(clockInGeo)assign('clockInGeo',clockInGeo);

  if(effectiveStatus!=='Active'){
    const clockOutAt=read('clockOutAt');
    if(clockOutAt){
      const iso=parseTimeTrackerAdminDateTime(clockOutAt);
      if(bulk||timeTrackerAdminDateTimeLocal(iso)!==timeTrackerAdminDateTimeLocal(timeValue(record,'out')))assign('clockOutAt',iso);
    }
    const clockOutGeo=readGeo(formData,'clockOutGeo',geoValue(record,'out'),{bulk});
    if(clockOutGeo)assign('clockOutGeo',clockOutGeo);
    if(effectiveStatus==='Completed'&&needsClockOut&&
      (!read('clockOutAt')||!clockOutGeo&&!geoValue(record,'out')))
      throw Error('Completing an active session requires a Clock-Out timestamp and GPS fix.');
    if(bulk&&needsClockOut&&(read('clockOutAt')||clockOutGeo)&&
      (!read('clockOutAt')||!clockOutGeo))
      throw Error('Bulk completion of active sessions requires a Clock-Out timestamp and GPS fix.');
  }

  const validateTimeOrder=item=>{
    const start=patch.clockInAt||timeValue(item,'in');
    const end=effectiveStatus==='Active'?null:patch.clockOutAt||timeValue(item,'out');
    if(end&&(!Number.isFinite(Date.parse(start||''))||!Number.isFinite(Date.parse(end))||
      Date.parse(end)<Date.parse(start)))
      throw Error('Clock-Out must be at or after Clock-In.');
  };
  if(bulk)records.forEach(validateTimeOrder);
  else validateTimeOrder(record);

  const durationMode=read('durationMode');
  if(durationMode){
    if(!['auto','manual'].includes(durationMode))throw Error('Select automatic or manual working duration.');
    if(durationMode==='auto'){
      if(bulk||Number.isSafeInteger(record?.creditedMsOverride))assign('creditedMsOverride',null);
    }else{
      const hoursText=read('durationHours');
      if(!hoursText)throw Error('Enter the corrected working duration as HH:MM:SS.');
      const milliseconds=parseTimeTrackerDuration(hoursText);
      if(milliseconds===null)throw Error('Working duration must use HH:MM:SS (maximum 744 hours).');
      if(effectiveStatus!=='Completed'&&(!bulk||needsClockOut))
        throw Error('Manual working duration requires completed attendance records.');
      if(bulk||milliseconds!==record?.creditedMsOverride||patch.clockInAt||patch.clockOutAt)
        assign('creditedMsOverride',milliseconds);
    }
  }

  if(!Object.keys(patch).length)throw Error('No attendance fields have changed.');
  return Object.freeze({patch:Object.freeze(patch),reason:read('reason').slice(0,500)});
}

const option=(value,label,selected)=>`<option value="${esc(value)}"${selected===value?' selected':''}>${esc(label)}</option>`;
const selectField=(label,name,items,value,{bulk=false}={})=>
  `<label class="tt-admin-field"><span>${esc(label)}</span><select name="${name}"${bulk?'':' required'}>`+
  (bulk?option('','No change',value):'')+
  items.map(item=>option(item.value,item.label,value)).join('')+
  '</select></label>';
const inputField=(label,name,value,{type='text',step=null,min=null,max=null,placeholder='',required=false}={})=>
  `<label class="tt-admin-field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}"`+
  (step!==null?` step="${step}"`:'')+(min!==null?` min="${min}"`:'')+
  (max!==null?` max="${max}"`:'')+(placeholder?` placeholder="${esc(placeholder)}"`:'')+
  (required?' required':'')+'></label>';

function gpsFields(record,kind,{bulk=false}={}){
  const geo=geoValue(record,kind)||{};
  const prefix=kind==='in'?'clockInGeo':'clockOutGeo';
  const placeholder=bulk?'Leave unchanged':'';
  return `<fieldset class="tt-admin-gps"><legend>${kind==='in'?'Clock-In GPS':'Clock-Out GPS'}</legend><div class="tt-admin-grid tt-admin-grid-three">`+
    inputField('Latitude',`${prefix}latitude`,bulk?'':geo.latitude??'',{type:'number',step:'any',min:-90,max:90,placeholder})+
    inputField('Longitude',`${prefix}longitude`,bulk?'':geo.longitude??'',{type:'number',step:'any',min:-180,max:180,placeholder})+
    inputField('Accuracy (m)',`${prefix}accuracy`,bulk?'':geo.accuracy??'',{type:'number',step:'any',min:0,max:100000,placeholder})+
    '</div><p>Changed coordinates are stored as administrative corrections, not browser-captured GPS.</p></fieldset>';
}

export function renderTimeTrackerAdminEditor({editor,directory=[],busy=false,error='',timeOnly=false}={}){
  if(!editor)return '';
  const bulk=editor.mode==='bulk';
  const record=bulk?null:editor.records?.[0]||null;
  if(timeOnly){
    if(bulk||!record)return '';
    const active=!hasClockOut(record);
    return '<div class="tt-admin-editor-backdrop" data-tt-admin-backdrop>'+
     '<form id="tt-attendance-admin-form" class="tt-admin-editor" role="dialog" aria-modal="true" aria-labelledby="tt-admin-editor-title" data-mode="single" data-tt-admin-dialog>'+
     '<header class="tt-admin-editor-head"><div class="tt-admin-editor-title-group">'+
      '<span class="tt-admin-eyebrow">AUTHORIZED ADMIN · TIME CORRECTION ONLY</span>'+
      '<h3 id="tt-admin-editor-title">Correct attendance times</h3>'+
      '<p>Changes are recorded in the private append-only audit history.</p></div>'+
      '<button type="button" class="tt-admin-close" data-action="tt-log-admin-cancel"'+(busy?' disabled':'')+' aria-label="Close editor">×</button></header>'+
     (error?'<p class="tt-admin-error" role="alert">'+esc(error)+'</p>':'')+
     '<fieldset class="tt-admin-editor-fields"'+(busy?' disabled':'')+'><div class="tt-admin-editor-body">'+
      '<div class="tt-admin-record-context"><div><strong>'+esc(record.ownerName||'Employee')+'</strong>'+
       '<small>'+esc(active?'Active clock-in session':'Completed attendance session')+'</small></div></div>'+
      '<section class="tt-admin-field-section"><h4>Philippine Time (UTC+08:00)</h4><div class="tt-admin-grid tt-admin-grid-two">'+
       inputField('Clock-In date and time','clockInAt',formatTimeTrackerAdminWallDateTime(timeTrackerAdminDateTimeLocal(record.clockIn?.timestamp)),{type:'text',placeholder:'YYYY-MM-DD hh:mm AM/PM'})+
       (active?'':inputField('Clock-Out date and time','clockOutAt',formatTimeTrackerAdminWallDateTime(timeTrackerAdminDateTimeLocal(record.clockOut?.timestamp)),{type:'text',placeholder:'YYYY-MM-DD hh:mm AM/PM'}))+
      '</div><p>Active sessions remain active, and their Clock timer updates from the corrected start time after signed synchronization. Completed sessions recalculate credited hours. GPS and employee ownership remain unchanged.</p></section>'+
      '<section class="tt-admin-field-section"><h4>Correction note (optional)</h4>'+
       '<label class="tt-admin-field"><span>Additional context, if needed</span>'+
       '<textarea name="reason" maxlength="500" rows="3" placeholder="Optional explanation for this time correction"></textarea></label></section>'+
      '</div></fieldset><footer class="tt-admin-editor-actions"><span class="tt-admin-editor-footnote">Original timestamps and corrected values remain in the audit trail.</span><div>'+
       '<button type="button" class="secondary" data-action="tt-log-admin-cancel"'+(busy?' disabled':'')+'>Cancel</button>'+
       '<button type="submit" class="primary"'+(busy?' disabled':'')+'>Save time correction</button>'+
      '</div></footer></form></div>';
  }
  const currentEmployee=employeeId(record);
  const employeeItems=[...directory.map(member=>({
    value:member.id,label:member.displayName||member.display_name||'Workforce member'
  }))];
  if(record&&currentEmployee&&!employeeItems.some(item=>item.value===currentEmployee))
    employeeItems.push({value:currentEmployee,label:record.ownerName||record.name||'Current employee'});
  const employeeOptions=employeeItems.map(item=>option(item.value,item.label,bulk?'':currentEmployee)).join('');
  const locationItems=TT_LOCATIONS.map(value=>({value,label:value}));
  const departmentItems=TT_ADMIN_DEPARTMENTS.map(value=>({value,label:value}));
  const status=hasClockOut(record)?'Completed':'Active';
  const durationMode=Number.isSafeInteger(record?.creditedMsOverride)?'manual':'auto';
  const durationMs=Number.isSafeInteger(record?.creditedMsOverride)?record.creditedMsOverride:
    record?.clockOut?.timestamp?creditedAttendanceMs(record.clockIn?.timestamp,record.clockOut.timestamp):null;
  const hours=durationMs===null?'':formatTimeTrackerDurationMs(durationMs);
  const reasonLabel=bulk?'Reason for bulk correction':'Reason for correction';
  const recordName=record?.ownerName||record?.name||'Selected employee';
  const recordMeta=[record?.department||'Unassigned department',record?.clockIn?.location||'Unspecified location',
    record?.clockIn?.timestamp?timeTrackerAdminDateTimeLocal(record.clockIn.timestamp).replace('T',' '):'Time unavailable']
    .join(' · ');
  return '<div class="tt-admin-editor-backdrop" data-tt-admin-backdrop>'+
    '<form id="tt-attendance-admin-form" class="tt-admin-editor" role="dialog" aria-modal="true" aria-labelledby="tt-admin-editor-title" data-mode="'+(bulk?'bulk':'single')+'" data-tt-admin-dialog>'+
    '<header class="tt-admin-editor-head"><div class="tt-admin-editor-title-group"><span class="tt-admin-eyebrow">SYSTEM ADMIN · ATTENDANCE MANAGEMENT</span>'+
    '<span class="tt-admin-mode-pill">'+(bulk?'BULK CORRECTION':'INDIVIDUAL CORRECTION')+'</span>'+
    '<h3 id="tt-admin-editor-title">'+(bulk?'Bulk edit attendance':'Edit attendance record')+'</h3>'+
    '<p>'+(bulk?(editor.recordIds?.length||0)+' selected records · Blank fields remain unchanged':'Review and correct the selected employee attendance record')+'</p></div>'+
    '<button type="button" class="tt-admin-close" data-action="tt-log-admin-cancel"'+(busy?' disabled':'')+' aria-label="Close editor">×</button></header>'+
    (error?'<p class="tt-admin-error" role="alert">'+esc(error)+'</p>':'')+
    '<fieldset class="tt-admin-editor-fields"'+(busy?' disabled':'')+'><div class="tt-admin-editor-body">'+
    (bulk?'<aside class="tt-admin-bulk-guidance"><span aria-hidden="true">✦</span><div><strong>'+(editor.recordIds?.length||0)+' records selected</strong><p>Only fields you change will be applied. Leave every other field set to “No change” or blank.</p></div></aside>':
      '<div class="tt-admin-record-context"><span class="tt-admin-record-avatar" aria-hidden="true">'+esc(recordName.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'U')+'</span><div><strong>'+esc(recordName)+'</strong><small>'+esc(recordMeta)+'</small></div><span class="tt-admin-record-status">'+(status==='Completed'?'Completed':'Active')+'</span></div>')+
    '<section class="tt-admin-field-section"><h4>Employee and attendance</h4><div class="tt-admin-grid tt-admin-grid-two">'+
    `<label class="tt-admin-field"><span>Employee</span><select name="employeeId">${bulk?option('','No change','') :''}${employeeOptions}</select></label>`+
    selectField('Work location','location',locationItems,bulk?'':record?.clockIn?.location||'',{bulk})+
    selectField('Department','department',departmentItems,bulk?'':record?.clockIn?.department||'',{bulk})+
    selectField('Attendance status','status',[
      {value:'Active',label:'Active'},{value:'Completed',label:'Completed'}
    ],bulk?'':status,{bulk})+
    '</div></section>'+
    '<section class="tt-admin-field-section"><h4>Clock-In correction</h4><div class="tt-admin-grid tt-admin-grid-two">'+
    inputField('Clock-In date and time','clockInAt',bulk?'':formatTimeTrackerAdminWallDateTime(timeTrackerAdminDateTimeLocal(record?.clockIn?.timestamp)),{type:'text',placeholder:bulk?'Leave unchanged':'YYYY-MM-DD hh:mm AM/PM'})+
    '</div>'+gpsFields(record,'in',{bulk})+'</section>'+
    '<section class="tt-admin-field-section"><h4>Clock-Out correction</h4><div class="tt-admin-grid tt-admin-grid-two">'+
    inputField('Clock-Out date and time','clockOutAt',bulk?'':formatTimeTrackerAdminWallDateTime(timeTrackerAdminDateTimeLocal(record?.clockOut?.timestamp)),{type:'text',placeholder:bulk?'Leave unchanged':'YYYY-MM-DD hh:mm AM/PM'})+
    '</div>'+gpsFields(record,'out',{bulk})+'</section>'+
    '<section class="tt-admin-field-section"><h4>Working duration</h4><div class="tt-admin-grid tt-admin-grid-two">'+
    selectField('Duration calculation','durationMode',[
      {value:'auto',label:'Calculate from corrected timestamps'},
      {value:'manual',label:'Set manual credited duration'}
    ],bulk?'':durationMode,{bulk})+
    inputField('Working duration (HH:MM:SS)','durationHours',bulk?'':hours,{type:'text',placeholder:bulk?'Leave unchanged':'00:00:00'})+
    '</div><p>Automatic duration applies the existing Philippine Time unpaid-break policy. Manual duration is stored as an explicit administrative override.</p></section>'+
    '<section class="tt-admin-field-section"><h4>Correction note</h4><label class="tt-admin-field"><span>'+reasonLabel+'</span><textarea name="reason" maxlength="500" rows="2" placeholder="Optional explanation for the audit record"></textarea></label></section>'+
    '</div></fieldset><footer class="tt-admin-editor-actions"><span class="tt-admin-editor-footnote">'+
    (bulk?'Changes apply to all selected records. Blank fields are preserved.':'Changes are saved to the existing attendance record.')+
    '</span><div><button type="button" class="secondary" data-action="tt-log-admin-cancel"'+(busy?' disabled':'')+'>Cancel</button>'+
    '<button type="submit" class="primary"'+(busy?' disabled':'')+'>'+(busy?'Saving changes…':'Save changes')+'</button></div></footer>'+
    '</form></div>';

}


/** Custom, accessible confirmation surface for individual and bulk deletion. */
export function renderTimeTrackerAdminDeleteDialog({confirmation=null,busy=false,error=''}={}){
  if(!confirmation)return '';
  const ids=Array.isArray(confirmation.recordIds)?confirmation.recordIds:[];
  if(!ids.length)return '';
  const records=Array.isArray(confirmation.records)?confirmation.records:[];
  const bulk=ids.length>1;
  const title=bulk?'Delete selected attendance records':confirmation.ojt?'Delete OJT attendance record':'Delete attendance record';
  const names=records.slice(0,4).map(record=>record?.name||record?.ownerName||'Attendance record');
  const extra=Math.max(0,ids.length-names.length);
  return '<div class="tt-admin-delete-backdrop" data-tt-admin-delete-backdrop>'+
    '<section class="tt-admin-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tt-admin-delete-title" aria-describedby="tt-admin-delete-description" tabindex="-1" data-tt-admin-dialog>'+
    '<div class="tt-admin-delete-icon" aria-hidden="true">!</div>'+
    '<span class="tt-admin-eyebrow">SYSTEM ADMIN · RECORD REMOVAL</span>'+
    '<h3 id="tt-admin-delete-title">'+title+'</h3>'+
    '<p id="tt-admin-delete-description">'+(bulk?'You are about to remove '+ids.length+' attendance records.':'You are about to remove this attendance record.')+(confirmation.ojt?' The OJT attendance record will be removed, but its before/after evidence is retained in the private audit history.':' The records will disappear from the TimeTracker Log and their linked attendance-board projection. This action cannot be undone from the Log.')+'</p>'+
    (names.length?'<div class="tt-admin-delete-records"><span>Selected records</span><ul>'+names.map(name=>'<li>'+esc(name)+'</li>').join('')+
      (extra?'<li>and '+extra+' more</li>':'')+'</ul></div>':'')+
    '<div class="tt-admin-delete-audit-note"><strong>Audit evidence is retained</strong><span>The private administrative before/after audit history is not deleted.</span></div>'+
    (error||confirmation.error?'<p class="tt-admin-error" role="alert">'+esc(error||confirmation.error)+'</p>':'')+
    '<footer class="tt-admin-delete-actions"><button type="button" data-action="tt-log-admin-delete-cancel"'+(busy?' disabled':'')+'>Cancel</button>'+
    '<button type="button" class="tt-admin-delete-confirm" data-action="tt-log-admin-delete-confirm"'+(busy||(confirmation.ojt&&(!Number.isSafeInteger(confirmation.revision)||confirmation.revision<1))?' disabled':'')+'>'+(busy?'Deleting…':bulk?'Delete '+ids.length+' records':'Delete record')+'</button></footer>'+
    '</section></div>';
}

/** Time-only administrative closure, anchored to the signed attendance date.
 * For an earlier wall-clock time, use the following day (overnight session).
 * The operator never supplies a date or audit reason.
 */
export function buildTimeTrackerManualClockOut(formData,record,now=new Date()){
 const raw=String(formData.get('clockOutAt')??'').trim();
 const match=/^(0?[1-9]|1[0-2]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM)$/i.exec(raw);
 const machine=/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(raw);
 if(!match&&!machine)throw Error('Enter a valid Philippine clock-out time (hh:mm:ss AM/PM).');
 const hour=match?Number(match[1])%12+(match[4].toUpperCase()==='PM'?12:0):Number(machine[1]);
 const minutes=(match||machine)[2];
 const seconds=Number((match||machine)[3]||0);
 const start=typeof record?.clockIn==='string'?record.clockIn:record?.clockIn?.timestamp;
 const startMs=Date.parse(start);
 if(!Number.isFinite(startMs)||record?.clockOut)
  throw Error('The session must still be active.');
 const day=timeTrackerAdminDateTimeLocal(start).slice(0,10);
 const isoLocal=day+'T'+String(hour).padStart(2,'0')+':'+minutes;
 const base=parseTimeTrackerAdminDateTime(isoLocal);
 let endMs=Date.parse(base)+seconds*1000;
 // Compare whole seconds because the time input has second precision.
 if(endMs<Math.floor(startMs/1000)*1000)endMs+=86400000;
 if(endMs<startMs||endMs>new Date(now).getTime())
  throw Error('Clock-out must be at or after clock-in and not in the future.');
 return Object.freeze({patch:Object.freeze({clockOutAt:new Date(endMs).toISOString()}),reason:'Administrative manual clock-out'});
}

export function renderTimeTrackerManualClockOut({editor,busy=false,error=''}={}){
 const record=editor?.ojt?editor.record:editor?.records?.[0];
 if(!record)return '';
 const start=typeof record.clockIn==='string'?record.clockIn:record.clockIn?.timestamp;
 const alreadyClosed=Boolean(record.clockOut);
 return '<div class="tt-admin-editor-backdrop" data-tt-admin-backdrop>'+
  '<form id="tt-attendance-admin-form" class="tt-admin-editor" role="dialog" aria-modal="true" aria-labelledby="tt-admin-editor-title" data-mode="single" data-tt-admin-dialog>'+
  '<header class="tt-admin-editor-head"><div class="tt-admin-editor-title-group"><span class="tt-admin-eyebrow">SYSTEM ADMIN · MANUAL CLOCK-OUT</span>'+
  '<h3 id="tt-admin-editor-title">Manual clock-out</h3><p>Close the selected active attendance session. This is an administrative action, not employee GPS evidence.</p></div>'+
  '<button type="button" class="tt-admin-close" data-action="tt-log-admin-cancel"'+(busy?' disabled':'')+' aria-label="Close editor">×</button></header>'+
  (error?'<p class="tt-admin-error" role="alert">'+esc(error)+'</p>':'')+
  '<fieldset class="tt-admin-editor-fields"'+(busy||alreadyClosed?' disabled':'')+'><div class="tt-admin-editor-body">'+
  '<div class="tt-admin-record-context"><div><strong>'+esc(record.ownerName||record.name||'Selected employee')+'</strong><small>Clock in: '+esc(formatTimeTrackerDateTime(start,{seconds:true}))+'</small></div></div>'+
  (alreadyClosed?'<p role="status">This session is already completed. Refresh the Log.</p>':'')+
  '<section class="tt-admin-field-section"><h4>Verified clock-out · Philippine Time</h4>'+
  inputField('Clock-out time','clockOutAt',editor.clockOutDraft||'',{placeholder:'06:48:32 PM',required:true})+
  '<p>Attendance date: '+esc(timeTrackerAdminDateTimeLocal(start).slice(0,10))+'. A time earlier than clock-in is treated as the following day. Future times are not allowed.</p>'+
  '</section>'+
  '</div></fieldset><footer class="tt-admin-editor-actions"><span class="tt-admin-editor-footnote">The original record and administrator identity remain in the audit history.</span><div>'+
  '<button type="button" class="secondary" data-action="tt-log-admin-cancel"'+(busy?' disabled':'')+'>Cancel</button>'+
  '<button type="submit" class="primary"'+(busy||alreadyClosed?' disabled':'')+'>'+(busy?'Saving…':'Confirm clock-out')+'</button></div></footer></form></div>';
}
