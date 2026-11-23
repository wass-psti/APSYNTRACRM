#!/usr/bin/env node
// Offline CP-FT-UI-09 verification. No network, browser, credential, or database access.
import {readFile} from 'node:fs/promises';
import {prepareStationImportDryRun} from '../frontend/fueltrans/station-import-plan09.js';

function usage(){
 console.error('Usage: node scripts/cp-ft-ui09-station-import-dry-run.mjs <staging.json> <signed-receipt.json> <trusted-owner-public-keys.json> <workspace-uuid> <existing-station-snapshot.json>');
 console.error('All five arguments are required. A signed receipt and trusted key must be obtained independently.');
}
async function parseFile(path){
 const raw=await readFile(path);
 if(raw.length>2*1024*1024)throw Error('Review file exceeds 2 MB size limit');
 return JSON.parse(raw.toString('utf8'));
}
async function main(){
 if(process.argv.length!==7){usage();process.exitCode=2;return;}
 const [stagingPath,receiptPath,keysPath,workspaceId,existingPath]=process.argv.slice(2);
 const [staging,receipt,trustedKeys,existingStations]=await Promise.all([
  parseFile(stagingPath),parseFile(receiptPath),parseFile(keysPath),parseFile(existingPath)
 ]);
 const plan=await prepareStationImportDryRun({staging,receipt,trustedKeys,workspaceId,existingStations});
 process.stdout.write(JSON.stringify(plan,null,2)+'\n');
}
main().catch(error=>{
 console.error('Station dry-run rejected:',error.message);
 process.exitCode=1;
});
