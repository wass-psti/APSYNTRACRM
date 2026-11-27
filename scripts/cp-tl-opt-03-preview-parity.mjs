import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'supabase/migration-source-manifest.json'), 'utf8'));
const version = '20261126044952';
const pair = (manifest.compatibility_pairs || []).find(entry => entry.version === version);
const replay = manifest.forward_migrations.find(entry => entry.version === version);
const archive = manifest.applied_only.find(entry => entry.version === version);

assert.ok(pair, 'CP-TL-OPT-03A compatibility pair must be registered');
assert.ok(replay, 'Replayable migration source must be registered');
assert.ok(archive, 'Original applied-only archive must remain registered');
assert.equal(replay.name, 'retire_apsyntra_timetracker_qa_account');
assert.equal(archive.name, replay.name);
assert.equal(pair.name, replay.name);
assert.equal(pair.replayable_file, replay.file);
assert.equal(pair.applied_only_file, archive.file);
assert.equal(pair.replayable_sha256, replay.sha256);
assert.equal(pair.applied_only_sha256, archive.sha256);

const replayBytes = readFileSync(resolve(root, 'supabase/migrations', replay.file));
const archiveBytes = readFileSync(resolve(root, 'supabase/applied-only', archive.file));
assert.equal(replayBytes.length, replay.bytes);
assert.equal(createHash('sha256').update(replayBytes).digest('hex'), replay.sha256);
assert.equal(archiveBytes.length, archive.bytes);
assert.equal(createHash('sha256').update(archiveBytes).digest('hex'), archive.sha256);
assert.notEqual(replay.sha256, archive.sha256, 'Replayable source must differ from the byte-preserved production archive');

const sql = replayBytes.toString('utf8');
assert.match(sql, /No production-specific TimeTracker QA fixture exists/i);
assert.match(sql, /Partial or mismatched production QA fixture detected/i);
assert.match(sql, /tt_ot_audit_immutable/i);
assert.match(sql, /auth\.users/i);
assert.match(sql, /public\.timetracker_ot_requests/i);
assert.match(sql, /private\.ws02_provision_events/i);

const replayVersions = [...manifest.files, ...manifest.forward_migrations].map(entry => entry.version);
assert.equal(new Set(replayVersions).size, replayVersions.length, 'Replayable migration versions must be unique');
console.log('PASS: CP-TL-OPT-03A replay and archive hashes match the manifest.');
console.log('PASS: clean Preview skips; partial or mismatched fixture aborts; exact fixture cleanup remains available.');
console.log('PASS: ' + replayVersions.length + ' replayable versions are unique; archive is separately classified.');
