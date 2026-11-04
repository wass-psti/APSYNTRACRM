/** CP-ROLE-VIS01 — lightweight static SVGs and one-shot view motion.
 * No external dependencies, backend writes, rendering loops, or telemetry.
 */
const paths=Object.freeze({
 roles:'<path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/><circle cx="12" cy="7" r="4"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 11a3 3 0 1 0-1-5.8M19 20v-2a6 6 0 0 0-3.3-5.4"/>',
 boards:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 proposals:'<path d="M12 4v16M4 12h16"/><circle cx="12" cy="12" r="9"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5M5.5 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.4-2"/>',
 shield:'<path d="M12 22s8-4.2 8-10V5l-8-3-8 3v7c0 5.8 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
});
/** @param {'roles'|'users'|'boards'|'proposals'|'refresh'|'shield'|'lock'} kind */
export function roleConfigurationIcon(kind){
 return '<svg class="role-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" '+
  'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" '+
  'aria-hidden="true" focusable="false">'+(Object.hasOwn(paths,kind)?paths[kind]:paths.shield)+'</svg>';
}
/** Minimal-motion presentation hook retained for existing shell imports.
 * Route content appears at its final position without stagger or overshoot.
 */
export function mountRoleConfigurationMotion(){}
export function stopRoleConfigurationMotion(){}
