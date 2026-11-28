/** Deploy only the isolated preview; Cloudflare Builds can override the Worker name. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = 'apsyntracrm-preview';
const account = '521910d64f92c18a0e6e3eb1b2e93c71';
const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
assert.equal(config.name, target, 'Expected isolated preview Worker');
assert.equal(config.account_id, account, 'Expected Watchdog Cloudflare account');
assert.ok(!process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID === account, 'Unexpected Cloudflare account override');
const override = process.env.WRANGLER_CI_OVERRIDE_NAME;
assert.ok(!override || override === target, 'Cloudflare build target is not the isolated preview');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--dry-run'), 'Only --dry-run is supported');
const result = spawnSync('npx', ['--yes', 'wrangler@4.166.0', 'deploy', '--config', 'wrangler.jsonc', ...args], {
  cwd: root,
  env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account, WRANGLER_SEND_METRICS: 'false' },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
