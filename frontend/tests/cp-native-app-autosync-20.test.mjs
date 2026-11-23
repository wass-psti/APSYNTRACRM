import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessRegisteredModuleContract}
 from '../../scripts/cp-native-app-autosync-20-registered-contract.mjs';

const runner=readFileSync('scripts/cp-native-app-autosync-20-isolated-owner-clone.sh','utf8');
const verification=readFileSync('sql/acceptance/cp-native-app-autosync-20-owner-clone.sql','utf8');
const selection=readFileSync('scripts/cp-native-app-autosync-20-registered-contract.mjs','utf8');

test('CP20 owner clone uses a separate, network-isolated and disposable PostgreSQL container',()=>{
 assert.match(runner,/name="cp_native20_pg_owner_qa"/);
 assert.match(runner,/image="postgres:17-alpine"/);
 assert.match(runner,/network_arg="none"/);
 assert.match(runner,/--network "\$network_arg"/);
 assert.match(runner,/--env-file/);
 assert.match(runner,/POSTGRES_PASSWORD/);
 assert.match(runner,/secrets\.token_urlsafe\(48\)/);
 assert.match(runner,/trap cleanup EXIT/);
});
test('CP20 never removes an existing container it did not create',()=>{
 assert.match(runner,/created=false/);
 assert.match(runner,/if \[\[ "\$created" == true \]\]; then/);
 assert.match(runner,/docker rm -f "\$name"/);
 assert.match(runner,/already exists|container exists; refusing overwrite/);
 assert.match(runner,/created=true/);
});
test('only actual staged owner declarations survive, with managed ACLs omitted locally',()=>{
 assert.match(runner,/ALTER .* OWNER TO/);
 assert.match(runner,/NOLOGIN/);
 assert.match(runner,/AUTHORIZATION/);
 assert.match(runner,/ALTER DEFAULT PRIVILEGES/);
 assert.match(runner,/skip=\('ALTER DEFAULT PRIVILEGES ','GRANT ','REVOKE '\)/);
 assert.match(runner,/staged ownership preserved/);
 assert.doesNotMatch(runner,/supabase db push|apply_migration|supabase migration up/);
});
test('verified owner topology must match the actual staging Auth inventory',()=>{
 assert.match(verification,/current_database\(\)<>'cp_native20_owner_clone'/);
 assert.match(verification,/supabase_admin/);
 assert.match(verification,/supabase_auth_admin/);
 assert.match(verification,/<>27/);
 assert.match(verification,/<>1/);
 assert.match(verification,/EXISTS\(SELECT 1 FROM auth.users\)/);
});
test('new module cannot be inferred without an actual registered module',()=>{
 assert.deepEqual(assessRegisteredModuleContract([],{}),
  {status:'BLOCKED',reason:'No genuinely new registered module'});
 assert.equal(assessRegisteredModuleContract(null,{}).status,'BLOCKED');
 assert.equal(assessRegisteredModuleContract([{moduleId:'order-intake'}],{
  'order-intake':['Admin','User','Viewer']
 }).status,'BLOCKED');
});
test('new valid registration requires explicit contract and server writer review',()=>{
 assert.deepEqual(assessRegisteredModuleContract([
  {moduleId:'order-intake'}, {moduleId:'new-module'}
 ],{'order-intake':['User']}),{
  status:'CONTRACT_REVIEW_REQUIRED',
  reason:'New registered module needs explicit role vocabulary and server writer',
  count:1
 });
 assert.equal(assessRegisteredModuleContract([{moduleId:'../unsafe'}],{}).status,'BLOCKED');
});
test('registry selector is read-only and uses actual board metadata, not invented roles',()=>{
 assert.match(selection,/description LIKE '\[APSYNTRA:MODULE:%'/);
 assert.match(selection,/public\.work_boards/);
 assert.match(selection,/archived_at IS NULL/);
 assert.match(selection,/NOT VERIFIED: newly registered module-specific writer/);
 assert.doesNotMatch(selection,/CREATE TABLE|ALTER ROLE|INSERT INTO|UPDATE public|DELETE FROM|GRANT EXECUTE/);
});
test('CP20 scripts preserve inference-only architecture and add no training dependency',()=>{
 const sources=[runner,verification,selection].join('\n');
 assert.doesNotMatch(sources,/torch\.optim|tensorflow|model\.fit\(|optimizer\.step\(|\.backward\(|gradient_descent\s*\(|fine_tune\s*\(/i);
 assert.doesNotMatch(sources,/npm install|pip install|train_model|retrain_model/i);
});
