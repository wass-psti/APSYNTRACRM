/** Presentation-only opt-in for engineering diagnostics.
 * Not an authorization grant. Existing route, backend and feature permissions
 * remain independently enforced by signed server-side policies.
 */
export function showEngineeringDiagnostics(search='',bootstrapVerified=false){
 if(bootstrapVerified!==true||typeof search!=='string')return false;
 try{return new URLSearchParams(search).get('diagnostics')==='1';}
 catch{return false;}
}
