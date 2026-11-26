import {cp,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
async function check(folder) {
  for(const entry of await readdir(folder,{withFileTypes:true})){
    const path=join(folder,entry.name);
    if(entry.isDirectory())await check(path);
    else if(/\.(js|mjs)$/.test(path))execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
  }
}
for(const folder of ['src','scripts','tests'])await check(folder);
await mkdir('dist',{recursive:true});
await cp('src','dist/src',{recursive:true});
await cp('index.html','dist/index.html');
console.log('PASS: JavaScript syntax checks and static build (dist/)');
