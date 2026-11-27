/** Disposable local Supabase Storage API smoke test for CP-CRM-PERF-01B.
 * Uses only the generated loopback project and a synthetic private bucket.
 * No production endpoint, credentials, data, or bucket policies are touched.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const apiUrl = new URL(process.env.API_URL || '');
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || '';
assert.equal(apiUrl.protocol, 'http:', 'Storage test must use local HTTP');
assert.equal(apiUrl.hostname, '127.0.0.1', 'Storage test must use loopback');
assert.ok(serviceRoleKey, 'Disposable local service-role key is required');

const bucket = 'cp-crm-perf-01b-' + randomUUID().slice(0, 8);
const objectPath = 'synthetic/' + randomUUID() + '.txt';
const payload = 'CP-CRM-PERF-01B local Storage round-trip';
const authHeaders = {
  apikey: serviceRoleKey,
  Authorization: 'Bearer ' + serviceRoleKey,
};
const report = {
  checkpoint: 'CP-CRM-PERF-01B',
  environment: 'local-disposable',
  service: 'supabase-storage',
  apiHost: apiUrl.hostname,
  bucket,
  objectPath,
  payloadBytes: Buffer.byteLength(payload),
  status: 'running',
  productionWrites: 0,
};
const timings = {};
let bucketCreated = false;
let objectUploaded = false;
let failure = null;

async function request(path, options = {}) {
  const started = performance.now();
  const response = await fetch(new URL(path, apiUrl), {
    ...options,
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.text();
  return {
    response,
    body,
    elapsedMs: +(performance.now() - started).toFixed(2),
  };
}

function assertStatus(result, accepted, label) {
  assert.ok(
    accepted.includes(result.response.status),
    label + ' returned HTTP ' + result.response.status + ': ' + result.body.slice(0, 240),
  );
}

async function waitForStorage() {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await request('/storage/v1/version', {headers: authHeaders});
    lastStatus = result.response.status;
    if (result.response.ok) {
      timings.healthMs = result.elapsedMs;
      report.storageVersion = result.body.slice(0, 120);
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error('Local Storage service did not become ready; last HTTP status ' + lastStatus);
}

async function cleanup() {
  const errors = [];
  if (bucketCreated && objectUploaded) {
    try {
      const result = await request('/storage/v1/object/' + bucket, {
        method: 'DELETE',
        headers: {...authHeaders, 'Content-Type': 'application/json'},
        body: JSON.stringify({prefixes: [objectPath]}),
      });
      assertStatus(result, [200, 204], 'Delete synthetic Storage object');
      timings.deleteObjectMs = result.elapsedMs;
    } catch (error) {
      errors.push('object cleanup: ' + String(error.message || error));
    }
  }
  if (bucketCreated) {
    try {
      const result = await request('/storage/v1/bucket/' + bucket, {
        method: 'DELETE',
        headers: authHeaders,
      });
      assertStatus(result, [200, 204], 'Delete synthetic Storage bucket');
      timings.deleteBucketMs = result.elapsedMs;
    } catch (error) {
      errors.push('bucket cleanup: ' + String(error.message || error));
    }
  }
  return errors;
}

try {
  await waitForStorage();

  const create = await request('/storage/v1/bucket', {
    method: 'POST',
    headers: {...authHeaders, 'Content-Type': 'application/json'},
    body: JSON.stringify({id: bucket, name: bucket, public: false}),
  });
  assertStatus(create, [200, 201], 'Create private synthetic bucket');
  bucketCreated = true;
  timings.bucketCreateMs = create.elapsedMs;

  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const upload = await request('/storage/v1/object/' + bucket + '/' + encodedPath, {
    method: 'POST',
    headers: {...authHeaders, 'Content-Type': 'text/plain', 'x-upsert': 'false'},
    body: payload,
  });
  assertStatus(upload, [200, 201], 'Upload synthetic object');
  objectUploaded = true;
  timings.uploadMs = upload.elapsedMs;

  const download = await request('/storage/v1/object/' + bucket + '/' + encodedPath, {
    headers: authHeaders,
  });
  assertStatus(download, [200], 'Download synthetic object');
  assert.equal(download.body, payload, 'Storage round-trip must preserve exact object bytes');
  timings.downloadMs = download.elapsedMs;
  report.objectMatches = true;
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.status = 'failed';
  report.error = String(error.message || error);
} finally {
  const cleanupErrors = await cleanup();
  report.cleanup = {
    bucketCreated,
    objectUploaded,
    completed: cleanupErrors.length === 0,
    errors: cleanupErrors,
  };
  if (cleanupErrors.length > 0) {
    report.status = 'failed';
    const cleanupMessage = cleanupErrors.join('; ');
    report.error = report.error ? report.error + '; ' + cleanupMessage : cleanupMessage;
  }
  report.timings = timings;
  mkdirSync(resolve('artifacts'), {recursive: true});
  writeFileSync(resolve('artifacts/cp-crm-perf-01b-storage.json'), JSON.stringify(report, null, 2) + '\n');
}

console.log('CP_CRM_PERF_01B_STORAGE_' + report.status.toUpperCase() + ' ' + JSON.stringify(report));
if (failure) throw failure;
if (!report.cleanup.completed) throw new Error(report.cleanup.errors.join('; '));
