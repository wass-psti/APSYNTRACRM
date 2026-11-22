/** Work-location note rule; identity must come from the verified signed account. */
const HOME_LOCATION='Offsite (Home)';
const HOME_NOTE_EXEMPT_EMAILS=new Set([
 'asenagan@watchdogautomation.com.ph',
 'mvasquez@watchdogautomation.com.ph'
]);
// These IDs belong to the two existing exempt auth.users accounts. Only a
// user ID from the server-verified TimeTracker snapshot may be passed here.
const HOME_NOTE_EXEMPT_USER_IDS=new Set([
 'df04e803-faed-4ee1-bf9b-4e32884e90a4',
 '5655922e-bb42-45e4-bf8b-348a0bf77f3a'
]);
export function isTimeTrackerHomeNoteRequired(location,verifiedEmail,verifiedUserId){
 if(location!==HOME_LOCATION)return false;
 const email=typeof verifiedEmail==='string'?verifiedEmail.trim().toLowerCase():'';
 // An explicitly verified email is authoritative. The ID fallback applies
 // only if the verified profile omitted its optional email field.
 if(email)return !HOME_NOTE_EXEMPT_EMAILS.has(email);
 const userId=typeof verifiedUserId==='string'?verifiedUserId.trim().toLowerCase():'';
 return !HOME_NOTE_EXEMPT_USER_IDS.has(userId);
}

/**
 * Volatile, signed-scope work-plan draft. Never persists a draft in browser
 * storage or sends one to the attendance server before a Clock In request.
 * One draft at a time prevents a shared-OJT intern from seeing another's text.
 */
export function createTimeTrackerWorkNoteDraft(){
 let draft=null;
 const key=scope=>{
  if(!scope||!['userId','workspaceId','boardId'].every(field=>
   typeof scope[field]==='string'&&scope[field].length>0))return null;
  const internId=scope.internId??'';
  if(typeof internId!=='string')return null;
  return JSON.stringify([scope.userId,scope.workspaceId,scope.boardId,internId]);
 };
 return Object.freeze({
  read(scope){
   const k=key(scope);
   return k&&draft?.key===k?draft.text:'';
  },
  write(scope,text){
   const k=key(scope);
   if(!k)return;
   draft={key:k,text:String(text??'').slice(0,500)};
  },
  clear(scope=null){
   if(scope===null||key(scope)===draft?.key)draft=null;
  }
 });
}
