/** Canonical standalone FuelTrack+ v3 routes. The board ID remains an internal data-source identity. */
import {validUuid} from '../../data.js';

export const FUELTRACK_V3_APPLICATION_ROUTE = '#/fueltrack';
export const FUELTRACK_V3_MODULE_ID = 'fueltrack';

const sections = new Set([
  'dashboard', 'analytics', 'requests', 'new-request', 'approvals', 'lightfuels', 'activity'
]);
const analyticsViews = new Set(['fuel-price', 'efficiency', 'frequency', 'requestors', 'odometer']);
const analyticsRanges = new Set(['all', 'six-months', 'month', 'week']);
const analyticsMetrics = new Set(['spend', 'volume', 'both']);

export function fuelTrackApplicationHref(path = '') {
  const suffix = String(path ?? '').split('/').filter(Boolean).join('/');
  return suffix ? FUELTRACK_V3_APPLICATION_ROUTE + '/' + suffix : FUELTRACK_V3_APPLICATION_ROUTE;
}

/** Parse native and legacy deep-link segments without trusting arbitrary IDs or filters. */
export function parseFuelTrackApplicationRoute(parts) {
  if (!Array.isArray(parts) || parts[0] !== FUELTRACK_V3_MODULE_ID) return null;

  const raw = parts.slice(1);
  const section = sections.has(raw[0]) ? raw[0] : 'dashboard';
  let recordId = null;
  let analyticsView = 'fuel-price';
  let analyticsRange = 'all';
  let analyticsMetric = 'both';
  let suffix = [];

  if (section === 'requests' && raw[1] === 'record' && validUuid(raw[2] || '')) {
    recordId = raw[2];
    suffix = ['requests', 'record', recordId];
  } else if (section === 'analytics') {
    analyticsView = analyticsViews.has(raw[1]) ? raw[1] : 'fuel-price';
    analyticsRange = analyticsRanges.has(raw[2]) ? raw[2] : 'all';
    analyticsMetric = analyticsMetrics.has(raw[3]) ? raw[3] : 'both';
    suffix = raw.length > 1 ? ['analytics', analyticsView, analyticsRange, analyticsMetric] : ['analytics'];
  } else {
    suffix = raw.length && sections.has(raw[0]) ? [section] : [];
  }

  return Object.freeze({
    section,
    recordId,
    analyticsView,
    analyticsRange,
    analyticsMetric,
    canonicalHash: fuelTrackApplicationHref(suffix.join('/'))
  });
}
