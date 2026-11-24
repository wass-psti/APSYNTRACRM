import { orderIntakeHref, parseOrderIntakeRoute } from './order-intake-route.js';
const prefix='apsyntra.crm.order-intake.preference.v1:';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keys=['year','status','from','to','company','industry','currency'];
function key(scope){
 const parts=String(scope).split('|');
 return parts.length===2&&parts.every(part=>uuid.test(part))?prefix+scope.toLowerCase():null;
}
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function saveOrderIntakePreference(scope,route,storage=browserStorage()){
 const id=key(scope);
 if(!id||!storage||!route||route.recordId)return false;
 const filters=Object.fromEntries(keys.map(name=>[name,route.filters[name]||'']));
 try{storage.setItem(id,orderIntakeHref(route.section,filters));return true;}catch{return false;}
}
export function readOrderIntakePreference(scope,storage=browserStorage()){
 const id=key(scope);
 if(!id||!storage)return null;
 try{
  const route=parseOrderIntakeRoute(storage.getItem(id));
  if(!route||route.recordId)return null;
  return orderIntakeHref(route.section,Object.fromEntries(keys.map(name=>[name,route.filters[name]])));
 }catch{return null;}
}
