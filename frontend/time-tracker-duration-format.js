/** Presentation-only elapsed duration helpers. Stored units and business rules are unchanged. */
export function formatTimeTrackerDurationMs(ms){
 if(!Number.isFinite(ms)||ms<0||!Number.isSafeInteger(Math.round(ms)))return '—';
 const seconds=Math.floor(ms/1000);
 const hours=Math.floor(seconds/3600);
 const minutes=Math.floor((seconds%3600)/60);
 return String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+':'+
  String(seconds%60).padStart(2,'0');
}
export function formatTimeTrackerDurationMinutes(minutes){
 return Number.isSafeInteger(minutes)&&minutes>=0&&Number.isSafeInteger(minutes*60000)?
  formatTimeTrackerDurationMs(minutes*60000):'—';
}
export function parseTimeTrackerDuration(value,{maxHours=744}={}){
 const match=/^(\d{2,}):([0-5]\d):([0-5]\d)$/.exec(String(value??'').trim());
 if(!match)return null;
 const [hours,minutes,seconds]=match.slice(1).map(Number);
 const result=(hours*3600+minutes*60+seconds)*1000;
 return Number.isSafeInteger(result)&&result<=maxHours*3600000?result:null;
}
