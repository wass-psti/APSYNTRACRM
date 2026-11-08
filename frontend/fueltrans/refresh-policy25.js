// No network activity for the timer heartbeat, hidden tabs or editable forms.
export const REFRESH_OPTIONS25=Object.freeze([0,30000,60000,120000,300000]);
export const DEFAULT_REFRESH25=60000;
export const AUTO_ROUTES25=Object.freeze(['dashboard','tickets','l1-workspace','l2-dispatch','handover','notifications','users','sessions','audit','it-issues','admin']);
export function normalizeRefresh25(value){const v=Number(value);return REFRESH_OPTIONS25.includes(v)?v:DEFAULT_REFRESH25;}
export function canAutoRefresh25({interval,route,busy,hidden,online,editing,scrolled}={}){
 return normalizeRefresh25(interval)>0&&AUTO_ROUTES25.includes(route)&&!busy&&!hidden&&online!==false&&!editing&&!scrolled;
}
export function refreshLabel25(ms){return ms===0?'Off':`${ms/1000} seconds`;}
