/** Package the committed Pages runtime without rebundling or changing its URL layout. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, lstatSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, '.cloudflare-build');
const prefix = 'APSYNTRACRM';
const maxFiles = 20_000;
const maxBytes = 25 * 1024 * 1024;
const rootFiles = new Set(['index.html', '404.html', 'service-worker.js']);
const extensions = /\.(js|mjs|css|html|webp|png|jpe?g|svg|woff2?|ttf|ico|json|txt)$/i;

function isRuntime(path) {
  if (rootFiles.has(path)) return true;
  if (!/^(frontend|paseo)\//.test(path)) return false;
  if (/(^|\/)(tests|fixtures)(\/|$)/.test(path)) return false;
  if (path.startsWith('frontend/apps/Paseo/source/')) return false;
  if (/\.(test|spec)\.[^/]+$/.test(path)) return false;
  return extensions.test(path);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean);
const paths = [...new Set(tracked.filter(isRuntime))].sort();
const required = [
  'index.html', '404.html', 'service-worker.js', 'frontend/app.js',
  'frontend/startup-guard.js', 'frontend/apsyntra-styles.bundle.css',
  'frontend/vendor/supabase-auth.js', 'frontend/vendor/frt-pdf-engine.js',
  'paseo/index.html', 'paseo/404.html', 'paseo/pages-redirect.js', 'paseo/pages-restore.js',
];
for (const path of required) assert.ok(paths.includes(path), 'Missing runtime asset: ' + path);
assert.ok(paths.length + 1 <= maxFiles, 'Cloudflare free-plan asset count exceeded');

// Verify the two shipped HTML entry points reference assets in the package.
for (const entry of ['index.html', 'paseo/index.html', '404.html', 'paseo/404.html']) {
  const html = readFileSync(join(root, entry), 'utf8');
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const ref = match[1];
    if (!ref.startsWith('./') && !ref.startsWith('/' + prefix + '/')) continue;
    const url = new URL(ref, 'https://example.invalid/' + prefix + '/' + entry);
    const path = decodeURIComponent(url.pathname.slice(prefix.length + 2));
    if (!path || path.endsWith('/')) continue;
    assert.ok(paths.includes(path), entry + ': missing local reference ' + ref);
  }
}

// Only the fixed generated directory is replaced; never copy repository-wide files.
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
let total = 0;
let largest = 0;
for (const path of paths) {
  const source = join(root, path);
  const destination = join(output, prefix, path);
  const stat = lstatSync(source);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Expected regular file: ' + path);
  assert.ok(stat.size <= maxBytes, 'Cloudflare file limit exceeded: ' + path);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  assert.equal(sha256(readFileSync(destination)), sha256(readFileSync(source)), 'Copy mismatch: ' + path);
  total += stat.size;
  largest = Math.max(largest, stat.size);
}
writeFileSync(join(output, '_redirects'), '/ /APSYNTRACRM/ 302\n');
console.log(JSON.stringify({ files: paths.length, bytes: total, largest, output: '.cloudflare-build' }));
