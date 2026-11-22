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
    const name = knownNames.get(id) ||
      (typeof suppliedName === 'string' && suppliedName.trim() ? suppliedName.trim() : id);
    result.push([id, name]);
  }
  return result;
}
