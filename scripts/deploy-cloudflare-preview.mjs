/** Deploy only the isolated preview; Cloudflare Builds can override the Worker name. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = 'apsyntracrm-preview';
const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
assert.equal(config.name, target, 'Expected isolated preview Worker');
const override = process.env.WRANGLER_CI_OVERRIDE_NAME;
assert.ok(!override || override === target, 'Cloudflare build target is not the isolated preview');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--dry-run'), 'Only --dry-run is supported');
const result = spawnSync('npx', ['--yes', 'wrangler@4.166.0', 'deploy', '--config', 'wrangler.jsonc', ...args], {
  cwd: root,
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
