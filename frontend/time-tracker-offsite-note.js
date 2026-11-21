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
