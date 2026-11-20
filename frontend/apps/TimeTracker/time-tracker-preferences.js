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
