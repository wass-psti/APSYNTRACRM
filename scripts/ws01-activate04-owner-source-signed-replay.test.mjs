import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const file=new URL('./ws01-activate04-owner-source-signed-replay.sh',import.meta.url);
const script=readFileSync(file,'utf8');

test('owner replay is syntactically valid and refuses missing protected source',()=>{
 const syntax=spawnSync('bash',['-n',file.pathname],{encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
 const denied=spawnSync('bash',[file.pathname],{encoding:'utf8',env:{PATH:process.env.PATH}});
 assert.notEqual(denied.status,0);
 assert.match(denied.stderr,/CP_WS_ACTIVATE04_REPLAY_BLOCKED: USAGE/);
});

test('source-faithful replay keeps owner sources local and ephemeral',()=>{
 assert.match(script,/--full-live-private-dir/);
 assert.match(script,/--repo-sha|COMMIT/);
 assert.match(script,/docker|DOCKER/);
 assert.match(script,/--network none --read-only/);
 assert.match(script,/--mount "type=bind,source=\$SOURCE_DIR,target=\/protected,readonly"/);
 assert.match(script,/workspace_disposable/);
 assert.match(script,/cp-ws01b-disposable-acceptance\.sql/);
 assert.match(script,/ws01-activate04-concurrent-cas-disposable\.sh/);
 assert.match(script,/ORIGINAL_SOURCE_SIGNED_ACCEPTANCE_PASS/);
 assert.match(script,/ORIGINAL_SOURCE_CONCURRENT_CAS_PASS/);
 assert.doesNotMatch(script,/--network host|--privileged|--publish|--volume .*postgres/);
 assert.doesNotMatch(script,/--upload-file|curl\s+.*-T|git\s+push|gh\s+api.*contents/);
});

test('script cannot use ambient PostgreSQL client credentials',()=>{
 assert.match(script,/PRODUCTION_DB_ENV_PRESENT/);
 assert.match(script,/PGHOST\|PGDATABASE\|PGPASSWORD/);
 assert.match(script,/PINNED|COMMIT/);
});
