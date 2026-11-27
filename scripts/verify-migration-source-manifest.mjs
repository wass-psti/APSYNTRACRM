import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDir = resolve(root, 'supabase/migrations');
const archiveDir = resolve(root, 'supabase/applied-only');
const manifest = JSON.parse(readFileSync(resolve(root, 'supabase/migration-source-manifest.json'), 'utf8'));

assert.equal(manifest.schema_version, 1);
assert.equal(manifest.project_ref, 'jtlusodorfnyzgyuewkz');
assert.equal(manifest.remote_ledger.migration_count, 222);
assert.equal(manifest.remote_ledger.distinct_versions, 222);
assert.equal(manifest.remote_ledger.sql_statement_count, 290);
assert.equal(manifest.remote_ledger.empty_statement_sets, 0);
assert.equal(manifest.files.length, 222);

const forwardMigrations = manifest.forward_migrations || [];
const appliedOnly = manifest.applied_only || [];
const compatibilityPairs = manifest.compatibility_pairs || [];
const replayable = [
  ...manifest.files.map(entry => ({ entry, kind: 'baseline', directory: migrationDir })),
  ...forwardMigrations.map(entry => ({ entry, kind: 'forward', directory: migrationDir }))
];
const archived = appliedOnly.map(entry => ({ entry, kind: 'applied-only', directory: archiveDir }));
const records = [...replayable, ...archived];

assert.deepEqual(
  readdirSync(migrationDir).filter(name => name.endsWith('.sql')).sort(),
  replayable.map(record => record.entry.file).sort(),
  'Migration directory must match recovered baseline plus registered forward migrations'
);
assert.deepEqual(
  readdirSync(archiveDir).filter(name => name.endsWith('.sql')).sort(),
  appliedOnly.map(entry => entry.file).sort(),
  'Applied-only archive directory must match its manifest'
);

for (const entry of [...forwardMigrations, ...appliedOnly]) {
  assert.ok(entry.version > manifest.remote_ledger.last_version, 'Forward or applied-only version must follow recovered production baseline');
}

const pairByVersion = new Map();
for (const pair of compatibilityPairs) {
  assert.match(pair.version, /^\d{14}$/);
  assert.equal(pairByVersion.has(pair.version), false, 'Duplicate compatibility-pair metadata: ' + pair.version);
  pairByVersion.set(pair.version, pair);
}

const versionGroups = new Map();
for (const record of records) {
  const { entry, directory } = record;
  assert.match(entry.version, /^\d{14}$/);
  assert.equal(entry.file, entry.version + '_' + entry.name + '.sql');
  const group = versionGroups.get(entry.version) || [];
  group.push(record);
  versionGroups.set(entry.version, group);

  const path = resolve(directory, entry.file);
  assert.equal(path.startsWith(directory + sep), true, 'Migration path must remain inside its registered directory');
  const raw = readFileSync(path);
  const matchesManifest = data =>
    data.length === entry.bytes &&
    createHash('sha256').update(data).digest('hex') === entry.sha256;
  const normalized = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  assert.ok(matchesManifest(raw) || matchesManifest(normalized), 'Byte length or SHA-256 mismatch: ' + entry.file);
}

let pairedVersions = 0;
for (const [version, group] of versionGroups) {
  const pair = pairByVersion.get(version);
  if (group.length === 1) {
    assert.equal(pair, undefined, 'Compatibility metadata must not exist without a duplicate source pair: ' + version);
    continue;
  }

  assert.equal(group.length, 2, 'Only one replayable source plus one applied-only archive may share a version: ' + version);
  const replayableEntry = group.find(record => record.kind === 'forward')?.entry;
  const appliedOnlyEntry = group.find(record => record.kind === 'applied-only')?.entry;
  assert.ok(replayableEntry, 'Paired version must have one replayable forward source: ' + version);
  assert.ok(appliedOnlyEntry, 'Paired version must have one applied-only archive: ' + version);
  assert.ok(pair, 'Duplicate version requires explicit compatibility metadata: ' + version);
  assert.equal(pair.name, replayableEntry.name);
  assert.equal(pair.name, appliedOnlyEntry.name);
  assert.equal(pair.replayable_file, replayableEntry.file);
  assert.equal(pair.applied_only_file, appliedOnlyEntry.file);
  assert.equal(pair.replayable_sha256, replayableEntry.sha256);
  assert.equal(pair.applied_only_sha256, appliedOnlyEntry.sha256);
  pairedVersions++;
}

assert.equal(pairByVersion.size, pairedVersions, 'Every compatibility pair must correspond to exactly one intentional duplicate version');
const replayVersions = replayable.map(record => record.entry.version);
assert.equal(new Set(replayVersions).size, replayVersions.length, 'Replayable migration versions must remain unique');
assert.equal(manifest.files[0].version, '20260917142647');
assert.equal(manifest.files.at(-1).version, '20261115132051');

console.log('PASS: ' + manifest.files.length + ' recovered baseline and ' + forwardMigrations.length + ' forward migration files match their SHA-256 manifests.');
console.log('PASS: ' + appliedOnly.length + ' applied-only archive files match their SHA-256 manifests and remain outside replay directory.');
console.log('PASS: ' + pairedVersions + ' explicit compatibility pair(s); ' + versionGroups.size + ' unique migration versions.');
