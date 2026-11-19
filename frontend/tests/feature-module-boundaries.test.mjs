import test from 'node:test';
import assert from 'node:assert/strict';

const paths = [
 ['TimeTracker routes', '../time-tracker-application.js', '../apps/TimeTracker/time-tracker-application.js'],
 ['TimeTracker policy', '../time-tracker-policy.js', '../apps/TimeTracker/time-tracker-policy.js'],
 ['TimeTracker recovery', '../time-tracker-pending-recovery.js', '../apps/TimeTracker/time-tracker-pending-recovery.js'],
 ['Fund Tracker routes', '../fund-tracker-application.js', '../apps/FundTracker/fund-tracker-application.js'],
 ['TradeLink routes', '../tradelink-application-route.js', '../apps/TradeLink/tradelink-application-route.js'],
 ['FuelTrack+ routes', '../fueltrack-v3-application-route.js', '../apps/FuelTrack/fueltrack-v3-application-route.js'],
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
