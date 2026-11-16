import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=dirname(fileURLToPath(import.meta.url));

export default defineConfig({
 root:resolve(root,'..'),
 configFile:false,
 build:{
  lib:{
   entry:resolve(root,'frt-pdf-engine-entry.js'),
   formats:['es'],
   fileName:'frt-pdf-engine'
  },
  outDir:resolve(root,'../frontend/vendor'),
  emptyOutDir:false,
  minify:'oxc',
  sourcemap:false,
 }
});
