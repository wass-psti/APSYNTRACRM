/** Non-authoritative UI preference, scoped to one signed employee and workspace.
 * No attendance records, GPS coordinates, notes or server permissions are stored.
 */
import {TT_LOCATIONS} from '../../time-tracker-policy.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREFIX='apsyntra.tt.location-pref.v1:';
export function timeTrackerLocationKey({userId,workspaceId}={}){
 return UUID.test(userId||'')&&UUID.test(workspaceId||'')?
  PREFIX+workspaceId+':'+userId:null;
}
export function readTimeTrackerLocationPreference(storage,scope){
 const key=timeTrackerLocationKey(scope);
 if(!key)return '';
 try{
  const value=storage?.getItem?.(key);
  return TT_LOCATIONS.includes(value)?value:'';
 }catch{return '';}
}
export function saveTimeTrackerLocationPreference(storage,scope,location){
 const key=timeTrackerLocationKey(scope);
 if(!key||!TT_LOCATIONS.includes(location))return false;
 try{storage?.setItem?.(key,location);return true;}
 catch{return false;}
}

const VIEW_PREFIX='apsyntra.tt.view-pref.v1:';
// Restore only ordinary navigation. Privileged and special-purpose views
// keep their existing explicit navigation and authorization flow.
const RESTORABLE_VIEWS=['clock','overview','log','ot','reports','calendar','hours'];
function timeTrackerViewKey({userId,workspaceId,boardId}={}){
 return [userId,workspaceId,boardId].every(id=>UUID.test(id||''))?
  VIEW_PREFIX+workspaceId+':'+boardId+':'+userId:null;
}
export function readTimeTrackerViewPreference(storage,scope){
 const key=timeTrackerViewKey(scope);
 if(!key)return 'clock';
 try{
  const value=storage?.getItem?.(key);
  return RESTORABLE_VIEWS.includes(value)?value:'clock';
 }catch{return 'clock';}
}
export function saveTimeTrackerViewPreference(storage,scope,view){
 const key=timeTrackerViewKey(scope);
 if(!key)return false;
 try{
  if(!storage)return false;
  storage.setItem(key,RESTORABLE_VIEWS.includes(view)?view:'clock');
  return true;
 }catch{return false;}
}
