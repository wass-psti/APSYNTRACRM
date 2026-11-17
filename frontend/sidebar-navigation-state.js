/**
 * Resolve exactly one sidebar destination from the current hash route.
 *
 * The hash route is authoritative: application view flags can remain stale
 * while a standalone application is mounted and must never select siblings.
 *
 * @param {string} hash
 * @param {string[]} recentBoardIds
 * @returns {string|null} The one navigation href to mark current, or null.
 */
export function resolveSidebarActiveHref(hash, recentBoardIds = []) {
 const normalized = String(hash || '#/overview').split('?')[0];
 const route = normalized.replace(/^#\/?/, '').replace(/\/+$/, '');
 if (!route) return '#/overview';

 const [section, resourceId] = route.split('/');

 if (section === 'boards') {
  if (resourceId && recentBoardIds.includes(resourceId)) return '#/boards/' + resourceId;
  return '#/boards';
 }

 const destinations = Object.freeze({
  overview: '#/overview',
  fm1: '#/fm1',
  'time-tracker': '#/time-tracker',
  'fund-tracker': '#/fund-tracker',
  fueltrack: '#/fueltrack',
  tradelink: '#/tradelink',
  foundation: '#/foundation',
  security: '#/security',
  'role-configuration': '#/role-configuration',
  'user-role-management': '#/user-role-management',
  settings: '#/settings',
  acceptance: '#/acceptance'
 });

 return destinations[section] || null;
}
