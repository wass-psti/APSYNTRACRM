import { WORK_MANAGEMENT_BOARD_IDS } from './workspace-application-ownership.js';

export const ORDER_INTAKE_ROUTE = '#/order-intake';
export const ORDER_INTAKE_BOARD_ID = WORK_MANAGEMENT_BOARD_IDS.orders;
export const ORDER_INTAKE_SECTIONS = Object.freeze(['dashboard', 'workflow', 'search', 'all-orders', 'archived']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function orderIntakeHref(section = 'dashboard', filters = {}, recordId = null) {
  const params = new URLSearchParams();
  for (const key of ['year', 'q', 'status', 'from', 'to', 'company', 'industry', 'currency']) {
    if (filters[key]) params.set(key, filters[key]);
  }
  const path = section === 'dashboard' ? ORDER_INTAKE_ROUTE : ORDER_INTAKE_ROUTE + '/' + section;
  return path + (recordId ? '/record/' + encodeURIComponent(recordId) : '') +
    (params.size ? '?' + params : '');
}

export function parseOrderIntakeRoute(hash) {
  const [path, query] = String(hash || '').split('?');
  const parts = path.replace(/^#\/?/, '').split('/');
  if (parts[0] !== 'order-intake') return null;
  const section = ORDER_INTAKE_SECTIONS.includes(parts[1]) ? parts[1] : 'dashboard';
  const recordId = parts[2] === 'record' && uuid.test(parts[3] || '') ? parts[3] : null;
  const params = new URLSearchParams(query);
  const filters = {};
  for (const key of ['year', 'q', 'status', 'from', 'to', 'company', 'industry', 'currency']) {
    filters[key] = (params.get(key) || '').trim().slice(0, 240);
  }
  if (!/^\d{4}$/.test(filters.year)) filters.year = '';
  for (const key of ['from', 'to']) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filters[key])) filters[key] = '';
  }
  return { section, filters, recordId, canonicalHash: orderIntakeHref(section, filters, recordId) };
}
