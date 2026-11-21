/** Build the native Paseo entry independently of APSYNTRA's signed CRM bundle. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('frontend/apps/Paseo/source');
const target = resolve('paseo');
const base = '/APSYNTRACRM/paseo/';
const api = 'https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/pdl-guest-api';

export function runBuild(command = spawnSync) {
  const result = command('npm', ['run','build','--',`--base=${base}`], {
    cwd: root, stdio: 'inherit',
    env: {...process.env, VITE_RESERVATION_API_BASE_URL: api},
  });
  if (result.error || result.status !== 0) throw Error('Paseo build failed. Existing published assets preserved.');
  const from = resolve(root, 'dist');
  const html = readFileSync(resolve(from, 'index.html'), 'utf8');
  if (!html.includes(`${base}assets/`)) throw Error('Paseo assets do not use the CRM subdirectory base');
  rmSync(target,{recursive:true,force:true});
  mkdirSync(target,{recursive:true});
  cpSync(from,target,{recursive:true});
  cpSync(resolve('frontend/apps/Paseo/pages-redirect.js'),resolve(target,'pages-redirect.js'));
  cpSync(resolve('frontend/apps/Paseo/pages-restore.js'),resolve(target,'pages-restore.js'));
  writeFileSync(resolve(target,'404.html'),html);
  writeFileSync(resolve(target,'.nojekyll'),'');
  console.log('Native Paseo public bundle built at /APSYNTRACRM/paseo/');
}
if (process.argv[1]?.endsWith('build-pdl-native.mjs')) runBuild();
