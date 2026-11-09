/** Deterministic CSS concatenation; no rewrites, dependencies or CSS minification. */
import {readFileSync,writeFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from './priority5-style-manifest.mjs';
const header='/* APSYNTRA CRM CSS delivery bundle. Generated; run node scripts/build-priority5-styles.mjs */\n';
export function generateStyleBundle(){
 return header+STYLE_SOURCES.map(path=>'/* '+path+' */\n'+
  readFileSync(path,'utf8')+'\n').join('').trimEnd()+'\n';
}
const output=generateStyleBundle();
if(process.argv[1]?.endsWith('build-priority5-styles.mjs')){
 if(process.argv.includes('--check')){
  if(readFileSync(STYLE_BUNDLE,'utf8')!==output){
   console.error('FAIL: generated style bundle differs from manifest sources');
   process.exitCode=1;
  }else console.log('CSS_BUNDLE_UP_TO_DATE: '+STYLE_SOURCES.length+' files, '+Buffer.byteLength(output)+' bytes');
 }else{
  writeFileSync(STYLE_BUNDLE,output);
  console.log('CSS_BUNDLE_BUILT: '+STYLE_SOURCES.length+' files, '+Buffer.byteLength(output)+' bytes');
 }
}
