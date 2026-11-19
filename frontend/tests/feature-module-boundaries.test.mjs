import test from 'node:test';
import assert from 'node:assert/strict';

const paths = [
 ['TimeTracker routes', '../time-tracker-application.js', '../apps/TimeTracker/time-tracker-application.js'],
 ['TimeTracker policy', '../time-tracker-policy.js', '../apps/TimeTracker/time-tracker-policy.js'],
 ['TimeTracker recovery', '../time-tracker-pending-recovery.js', '../apps/TimeTracker/time-tracker-pending-recovery.js'],
 ['Fund Tracker routes', '../fund-tracker-application.js', '../apps/FundTracker/fund-tracker-application.js'],
 ['TradeLink routes', '../tradelink-application-route.js', '../apps/TradeLink/tradelink-application-route.js'],
 ['FuelTrack+ routes', '../fueltrack-v3-application-route.js', '../apps/FuelTrack/fueltrack-v3-application-route.js'],
 ['TimeTracker accounting-reconciliation', '../time-tracker-accounting-reconciliation.js', '../apps/TimeTracker/time-tracker-accounting-reconciliation.js'],
 ['TimeTracker board-projection', '../time-tracker-board-projection.js', '../apps/TimeTracker/time-tracker-board-projection.js'],
 ['TimeTracker calendar', '../time-tracker-calendar.js', '../apps/TimeTracker/time-tracker-calendar.js'],
 ['TimeTracker clock-recovery', '../time-tracker-clock-recovery.js', '../apps/TimeTracker/time-tracker-clock-recovery.js'],
 ['TimeTracker gps', '../time-tracker-gps.js', '../apps/TimeTracker/time-tracker-gps.js'],
 ['TimeTracker history', '../time-tracker-history.js', '../apps/TimeTracker/time-tracker-history.js'],
 ['TimeTracker log', '../time-tracker-log.js', '../apps/TimeTracker/time-tracker-log.js'],
 ['TimeTracker main-group', '../time-tracker-main-group.js', '../apps/TimeTracker/time-tracker-main-group.js'],
 ['TimeTracker map', '../time-tracker-map.js', '../apps/TimeTracker/time-tracker-map.js'],
 ['TimeTracker monitor', '../time-tracker-monitor.js', '../apps/TimeTracker/time-tracker-monitor.js'],
 ['TimeTracker my-hours', '../time-tracker-my-hours.js', '../apps/TimeTracker/time-tracker-my-hours.js'],
 ['TimeTracker native', '../time-tracker-native.js', '../apps/TimeTracker/time-tracker-native.js'],
 ['TimeTracker overtime', '../time-tracker-overtime.js', '../apps/TimeTracker/time-tracker-overtime.js'],
 ['TimeTracker overview', '../time-tracker-overview.js', '../apps/TimeTracker/time-tracker-overview.js'],
 ['TimeTracker pixi-scene', '../time-tracker-pixi-scene.js', '../apps/TimeTracker/time-tracker-pixi-scene.js'],
 ['TimeTracker record-management', '../time-tracker-record-management.js', '../apps/TimeTracker/time-tracker-record-management.js'],
 ['TimeTracker reports', '../time-tracker-reports.js', '../apps/TimeTracker/time-tracker-reports.js'],
 ['TimeTracker team', '../time-tracker-team.js', '../apps/TimeTracker/time-tracker-team.js'],
 ['TimeTracker ui', '../time-tracker-ui.js', '../apps/TimeTracker/time-tracker-ui.js'],
];

for (const [label, oldPath, canonicalPath] of paths) {
 test(label + ': legacy module preserves named exports and identities', async () => {
  const [legacy, canonical] = await Promise.all([
   import(oldPath), import(canonicalPath)
  ]);
  assert.deepEqual(Object.keys(legacy).sort(), Object.keys(canonical).sort());
  for (const name of Object.keys(canonical)) {
   assert.strictEqual(legacy[name], canonical[name], label + ': ' + name);
  }
 });
}
