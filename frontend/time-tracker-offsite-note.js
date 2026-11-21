/** Work-location note rule; identity must come from the verified signed account. */
const HOME_LOCATION='Offsite (Home)';
const HOME_NOTE_EXEMPT_EMAILS=new Set([
 'asenagan@watchdogautomation.com.ph',
 'mvasquez@watchdogautomation.com.ph'
]);
export function isTimeTrackerHomeNoteRequired(location,verifiedEmail){
 if(location!==HOME_LOCATION)return false;
 const email=typeof verifiedEmail==='string'?verifiedEmail.trim().toLowerCase():'';
 return !HOME_NOTE_EXEMPT_EMAILS.has(email);
}
