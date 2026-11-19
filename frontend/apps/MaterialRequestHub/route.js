/**
 * Dedicated Material Request Hub CRM route.
 * Requests are not Material Sourcing work_board_items; do not map IDs between models.
 */
export const MRH_APPLICATION_ROUTE='#/material-request-hub';
export const MRH_SECTIONS=Object.freeze(['overview','new-request','requests','approvals','release']);
const requestId=/^[A-Za-z0-9:_-]{1,180}$/;
export function materialRequestHubHref(section='overview',id=null){
 const target=MRH_SECTIONS.includes(section)?section:'overview';
 return MRH_APPLICATION_ROUTE+'/'+target+(target==='requests'&&id&&requestId.test(id)?
  '/'+encodeURIComponent(id):'');
}
export function parseMaterialRequestHubRoute(parts){
 if(!Array.isArray(parts)||parts[0]!=='material-request-hub')return null;
 const section=MRH_SECTIONS.includes(parts[1])?parts[1]:'overview';
 let id=null;
 if(section==='requests'&&parts[2]){
  try{id=decodeURIComponent(parts[2]);}catch{return null;}
  if(!requestId.test(id))return null;
 }
 return Object.freeze({section,requestId:id,canonicalHash:materialRequestHubHref(section,id)});
}
