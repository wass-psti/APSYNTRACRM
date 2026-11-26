import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
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
const forwardMigrations = manifest.forward_migrations || [];
const appliedOnly = manifest.applied_only || [];
const archiveDir = resolve(root, 'supabase/applied-only');
const replayable = [...manifest.files, ...forwardMigrations];
const allEntries = [...replayable, ...appliedOnly];
const manifestFiles = replayable.map((entry) => entry.file).sort();
assert.deepEqual(readdirSync(archiveDir).filter(name => name.endsWith('.sql')).sort(), appliedOnly.map(entry => entry.file).sort(), 'Applied-only archive must match its manifest');
assert.deepEqual(diskFiles, manifestFiles, 'Applied migration directory must match the recovered baseline plus tracked forward migrations');
for (const entry of [...forwardMigrations, ...appliedOnly]) assert.ok(entry.version > manifest.remote_ledger.last_version, 'Forward migration must follow recovered production baseline');

const versions = new Set();
for (const entry of allEntries) {
  assert.match(entry.version, /^\d{14}$/);
  assert.equal(entry.file, entry.version + '_' + entry.name + '.sql');
  assert.equal(versions.has(entry.version), false, 'Duplicate migration version: ' + entry.version);
  versions.add(entry.version);

  const sourceDir = appliedOnly.includes(entry) ? archiveDir : migrationDir;
  const path = resolve(sourceDir, entry.file);
  assert.equal(path.startsWith(sourceDir + sep), true, 'Migration path must remain inside its registered directory');
  const raw = readFileSync(path);

  const matchesManifest = (data) =>
    data.length === entry.bytes &&
    createHash('sha256').update(data).digest('hex') === entry.sha256;

  // Git may convert LF to CRLF when checking out files on Windows.
  // Accept only exact source bytes or their LF-normalized equivalent.
  const normalized = Buffer.from(
    raw.toString('utf8').replace(/\r\n/g, '\n'),
    'utf8'
  );

  assert.ok(
    matchesManifest(raw) || matchesManifest(normalized),
    'Byte length or SHA-256 mismatch: ' + entry.file
  );
}

assert.equal(manifest.files[0].version, '20260917142647');
assert.equal(manifest.files.at(-1).version, '20261115132051');
console.log('PASS: ' + manifest.files.length + ' recovered baseline and ' + forwardMigrations.length + ' forward migration files match their SHA-256 manifests.');

console.log('PASS: ' + appliedOnly.length + ' applied-only production maintenance files match their SHA-256 manifests; excluded from replay directory.');
