import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDir = resolve(root, 'supabase/migrations');
const manifestPath = resolve(root, 'supabase/migration-source-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

assert.equal(manifest.schema_version, 1);
assert.equal(manifest.project_ref, 'jtlusodorfnyzgyuewkz');
assert.equal(manifest.remote_ledger.migration_count, 222);
assert.equal(manifest.remote_ledger.distinct_versions, 222);
assert.equal(manifest.remote_ledger.sql_statement_count, 290);
assert.equal(manifest.remote_ledger.empty_statement_sets, 0);
assert.equal(manifest.files.length, 222);

const diskFiles = readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort();
const manifestFiles = manifest.files.map((entry) => entry.file).sort();
assert.deepEqual(diskFiles, manifestFiles, 'Applied migration directory must exactly match the recovered production manifest');

const versions = new Set();
for (const entry of manifest.files) {
  assert.match(entry.version, /^\d{14}$/);
  assert.equal(entry.file, entry.version + '_' + entry.name + '.sql');
  assert.equal(versions.has(entry.version), false, 'Duplicate migration version: ' + entry.version);
  versions.add(entry.version);

  const path = resolve(migrationDir, entry.file);
  assert.equal(path.startsWith(migrationDir + '/'), true, 'Migration path must remain inside supabase/migrations');
  assert.equal(statSync(path).size, entry.bytes, 'Byte length changed: ' + entry.file);
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.equal(digest, entry.sha256, 'SHA-256 mismatch: ' + entry.file);
}

assert.equal(manifest.files[0].version, '20260917142647');
assert.equal(manifest.files.at(-1).version, '20261115132051');
console.log('PASS: ' + manifest.files.length + ' production migration files match the recovered source manifest.');
