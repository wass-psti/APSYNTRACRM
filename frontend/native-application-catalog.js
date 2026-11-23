/** Display catalog from the existing signed role-management snapshot.
 * The backend owns registration; this adapter never grants an assignment.
 */
import { ROLE_MODULE_OPTIONS } from './role-configuration-ui.js';

const knownNames = new Map(ROLE_MODULE_OPTIONS);
const moduleIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function nativeApplicationOptions(snapshot) {
  if (!Array.isArray(snapshot?.modules)) return ROLE_MODULE_OPTIONS;
  const seen = new Set();
  const result = [];
  for (const entry of snapshot.modules) {
    const id = typeof entry === 'string' ? entry : entry?.moduleId;
    if (typeof id !== 'string' || !moduleIdPattern.test(id) || seen.has(id)) continue;
    seen.add(id);
    const suppliedName = typeof entry === 'object' && entry !== null ? entry.name : null;
    const name = typeof suppliedName === 'string' && suppliedName.trim()
      ? suppliedName.trim() : knownNames.get(id) || id;
    result.push([id, name]);
  }
  return result;
}

/** Revalidate on authoritative board registry hints without request storms. */
export function shouldRefreshNativeCatalogOnSync({
 reason,view,tab,adminVerified=false,busy=false,now=0,lastReadAt=0,
 cooldownMs=15000
}={}){
 return reason==='broadcast'&&view==='role-configuration'&&
  tab==='application-access'&&adminVerified===true&&busy!==true&&
  Number.isFinite(now)&&now>0&&
  (!Number.isFinite(lastReadAt)||lastReadAt<=0||now-lastReadAt>=cooldownMs);
}
