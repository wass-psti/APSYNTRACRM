import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  FUELTRACK_V3_APPLICATION_ROUTE,
  fuelTrackApplicationHref,
  parseFuelTrackApplicationRoute
} from '../fueltrack-v3-application-route.js';
import {FUELTRACK_V3_ID} from '../fueltrack-v3-application.js';
import {sidebarIcon} from '../sidebar-visuals.js';
import {workspaceApplicationsForNavigation} from '../workspace-application-routing.js';
import {WORK_MANAGEMENT_WORKSPACE_ID} from '../workspace-identity.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('FuelTrack uses a canonical standalone route with section navigation', () => {
  assert.equal(FUELTRACK_V3_APPLICATION_ROUTE, '#/fueltrack');
  assert.equal(fuelTrackApplicationHref(), '#/fueltrack');
  assert.equal(fuelTrackApplicationHref('analytics'), '#/fueltrack/analytics');
  assert.equal(parseFuelTrackApplicationRoute(['fueltrack']).canonicalHash, '#/fueltrack');
  assert.equal(parseFuelTrackApplicationRoute(['fueltrack', 'new-request']).section, 'new-request');
  assert.equal(parseFuelTrackApplicationRoute(['fueltrack', 'activity']).section, 'activity');
  assert.equal(parseFuelTrackApplicationRoute(['boards', FUELTRACK_V3_ID]), null);
});

test('FuelTrack preserves analytics filters and exact request deep links', () => {
  const analytics = parseFuelTrackApplicationRoute([
    'fueltrack', 'analytics', 'odometer', 'week', 'volume'
  ]);
  assert.equal(analytics.analyticsView, 'odometer');
  assert.equal(analytics.analyticsRange, 'week');
  assert.equal(analytics.analyticsMetric, 'volume');
  assert.equal(analytics.canonicalHash, '#/fueltrack/analytics/odometer/week/volume');

  const request = parseFuelTrackApplicationRoute(['fueltrack', 'requests', 'record', id]);
  assert.equal(request.recordId, id);
  assert.equal(request.canonicalHash, '#/fueltrack/requests/record/' + id);
});

test('FuelTrack route parser normalizes unknown sections, malformed IDs and invalid analytics filters', () => {
  assert.equal(parseFuelTrackApplicationRoute(['fueltrack', 'unknown']).canonicalHash, '#/fueltrack');
  assert.equal(
    parseFuelTrackApplicationRoute(['fueltrack', 'requests', 'record', 'bad']).canonicalHash,
    '#/fueltrack/requests'
  );
  assert.equal(
    parseFuelTrackApplicationRoute(['fueltrack', 'analytics', 'bad', 'bad', 'bad']).canonicalHash,
    '#/fueltrack/analytics/fuel-price/all/both'
  );
});

test('FuelTrack host mounts its native renderer and adapter through the existing CRM lifecycle', () => {
  const app = readFileSync('frontend/app.js', 'utf8');
  assert.match(app, /if\(parts\[0\]==='fueltrack'\)/);
  assert.match(app, /parseFuelTrackApplicationRoute\(parts\)/);
  assert.match(app, /db\.nativeApplicationBoardContext\('fueltrack-plus'\)/);
  assert.match(app, /loadBoard\(FUELTRACK_V3_ID,'fueltrack',null,null,fuelTrackContext\)/);
  assert.match(app, /if\(state\.fuelTrackStandalone&&isFuelTrackV3ApplicationBoard\(b\)\)/);
  assert.match(app, /from '\.\/fueltrack-v3-native\.js'/);
  assert.match(app, /from '\.\/fueltrack-v3-ui\.js\?v=cp-ft-all-requests-redesign-02-20261126-cp-ft-new-request-redesign-01-20261126-cp-ft-approvals-redesign-01-20261126-cp-ft-approvals-context-02-20261127'/);
  assert.match(app,/workspaceApplicationsForNavigation\(state\.context\?\.workspace_id,state\.boards\)/);
  assert.equal(workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID,[]).find(application=>application.id==='fueltrack')?.href,FUELTRACK_V3_APPLICATION_ROUTE);
  assert.match(app, /if\(parts\[1\]===FUELTRACK_V3_ID\)/);
  assert.doesNotMatch(app, /isFuelTrackV3ApplicationBoard\(b\)\?\[\{key:'fueltrack'/);
});

test('FuelTrack has a dedicated sidebar icon instead of a generic board fallback', () => {
  const icon = sidebarIcon('fueltrack');
  assert.match(icon, /class=\"sidebar-svg-icon\"/);
  assert.match(icon, /M5 21V5/);
  assert.notEqual(icon, sidebarIcon('boards'));
});
