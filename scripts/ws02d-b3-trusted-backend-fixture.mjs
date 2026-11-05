/**
 * CP-WS-02D/B3 — trusted-backend preflight execution, disposable PG17 only.
 * Exercises the EXACT server adapter SQL against real synthetic auth.sessions,
 * user state and workspace membership. GoTrue HTTP is MOCKED; JWTs are fake.
 * No production connection, real credentials, or user data are permitted.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {
  WS02D_ACTIVE_SESSION_SQL,
  createLiveSessionAuthority,
  createTrustedSignedActorReadVerifier
} from '../server/ws02d-gotrue-live-read-adapters.mjs';

if (process.env.CI!=='true' ||
    process.env.PGDATABASE!=='workspace_disposable' ||
    process.env.PGHOST!=='127.0.0.1' ||
    process.env.PGUSER!=='postgres') {
  throw new Error('Blocked: only disposable GitHub Actions PostgreSQL fixture');
}
const ACTOR_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SID_A='aaaaaaaa-0000-4000-8000-000000000001';
const SID_B='bbbbbbbb-0000-4000-8000-000000000001';
const SID_UNKNOWN='99999999-0000-4000-8000-000000000001';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function execute(sql){
  return execFileSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{
    input:sql,encoding:'utf8',timeout:20000,maxBuffer:65536
  }).trim();
}
assert.equal(execute(
  "SELECT CASE WHEN current_database()='workspace_disposable'"+
  " AND current_setting('server_version_num')::int>=170000"+
  " THEN 'DISPOSABLE_PG17' ELSE 'DENIED' END"),'DISPOSABLE_PG17');
assert.match(WS02D_ACTIVE_SESSION_SQL,/^SELECT EXISTS\(/);
assert.match(WS02D_ACTIVE_SESSION_SQL,/s\.id=\$2::uuid/);
assert.match(WS02D_ACTIVE_SESSION_SQL,/s\.user_id=\$1::uuid/);
assert.doesNotMatch(WS02D_ACTIVE_SESSION_SQL,/\b(INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/i);

const sqlBody=WS02D_ACTIVE_SESSION_SQL;
// EXECUTE ... USING is PostgreSQL server-side parameter binding, not string
// substitution. Test-only temporary function reuses the production adapter SQL.
const fixture=[
 'BEGIN;',
 "ALTER TABLE auth.users ADD COLUMN deleted_at timestamptz, ADD COLUMN banned_until timestamptz;",
 'CREATE FUNCTION pg_temp.ws02d_b3_read(p_actor uuid,p_session uuid)',
 ' RETURNS boolean LANGUAGE plpgsql AS $func$',
 ' DECLARE found boolean;',
 ' BEGIN',
 '  EXECUTE $read$'+sqlBody+'$read$ INTO found USING p_actor,p_session;',
 '  RETURN found IS TRUE;',
 ' END $func$;',
 'DO $checks$ BEGIN',
 " IF NOT pg_temp.ws02d_b3_read('"+ACTOR_A+"','"+SID_A+"')",
 " THEN RAISE EXCEPTION 'Valid owner signed session denied'; END IF;",
 " IF NOT pg_temp.ws02d_b3_read('"+ACTOR_B+"','"+SID_B+"')",
 " THEN RAISE EXCEPTION 'Valid foreign user own session denied'; END IF;",
 " IF pg_temp.ws02d_b3_read('"+ACTOR_B+"','"+SID_A+"')",
 " THEN RAISE EXCEPTION 'Cross-identity session mismatch accepted'; END IF;",
 " IF pg_temp.ws02d_b3_read('"+ACTOR_A+"','"+SID_UNKNOWN+"')",
 " THEN RAISE EXCEPTION 'Absent session accepted'; END IF;",
 'END $checks$;',
 "UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id='"+SID_A+"';",
 'DO $checks$ BEGIN',
 " IF pg_temp.ws02d_b3_read('"+ACTOR_A+"','"+SID_A+"')",
 " THEN RAISE EXCEPTION 'Expired session accepted'; END IF;",
 'END $checks$;',
 "UPDATE auth.sessions SET not_after=NULL WHERE id='"+SID_A+"';",
 "UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='"+ACTOR_A+"';",
 'DO $checks$ BEGIN',
 " IF pg_temp.ws02d_b3_read('"+ACTOR_A+"','"+SID_A+"')",
 " THEN RAISE EXCEPTION 'Banned user session accepted'; END IF;",
 'END $checks$;',
 "UPDATE auth.users SET banned_until=NULL, deleted_at=now() WHERE id='"+ACTOR_A+"';",
 'DO $checks$ BEGIN',
 " IF pg_temp.ws02d_b3_read('"+ACTOR_A+"','"+SID_A+"')",
 " THEN RAISE EXCEPTION 'Deleted user session accepted'; END IF;",
 'END $checks$;',
 "UPDATE auth.users SET deleted_at=NULL WHERE id='"+ACTOR_A+"';",
 "UPDATE public.profiles SET status='disabled' WHERE id='"+ACTOR_A+"';",
 'DO $checks$ BEGIN',
 " IF pg_temp.ws02d_b3_read('"+ACTOR_A+"','"+SID_A+"')",
 " THEN RAISE EXCEPTION 'Inactive profile session accepted'; END IF;",
 'END $checks$;',
 "UPDATE public.profiles SET status='active' WHERE id='"+ACTOR_A+"';",
 "UPDATE public.workspace_members SET active=false WHERE user_id='"+ACTOR_A+"';",
 'DO $checks$ BEGIN',
 " IF pg_temp.ws02d_b3_read('"+ACTOR_A+"','"+SID_A+"')",
 " THEN RAISE EXCEPTION 'No active membership session accepted'; END IF;",
 'END $checks$;',
 "UPDATE public.workspace_members SET active=true WHERE user_id='"+ACTOR_A+"';",
 "DELETE FROM auth.sessions WHERE id='"+SID_A+"';",
 'DO $checks$ BEGIN',
 " IF pg_temp.ws02d_b3_read('"+ACTOR_A+"','"+SID_A+"')",
 " THEN RAISE EXCEPTION 'Revoked session accepted'; END IF;",
 'END $checks$;',
 'ROLLBACK;'
].join('\n');
execute(fixture);
// Assert all temporary changes have been rolled back, including the table
// columns and the deleted synthetic session.
const cleanup=execute(
 "SELECT (SELECT count(*) FROM auth.sessions WHERE id='"+SID_A+"')::text"+
 " ||':'||(SELECT count(*) FROM information_schema.columns"+
 " WHERE table_schema='auth' AND table_name='users'"+
 " AND column_name IN('deleted_at','banned_until'))::text");
assert.equal(cleanup,'1:0');

function queryPsql(preparedSql,values){
 assert.equal(preparedSql,WS02D_ACTIVE_SESSION_SQL);
 assert.equal(values.length,2);
 assert.ok(values.every(v=>UUID.test(v)));
 // PG PREPARE/EXECUTE enforces $1/$2 type binding in the actual engine.
 const statement=[
  'PREPARE ws02d_b3_check(uuid,uuid) AS '+preparedSql+';',
  "EXECUTE ws02d_b3_check('"+values[0]+"','"+values[1]+"');",
  'DEALLOCATE ws02d_b3_check;'
 ].join('\n');
 const answer=execute(statement);
 assert.ok(answer==='t'||answer==='f');
 return {rows:[{active:answer==='t'}]};
}
const db={query:async(q,params)=>queryPsql(q,params)};
const authority=createLiveSessionAuthority({enabled:true,db});
assert.equal(await authority({actorId:ACTOR_A,sessionId:SID_A}),true);
assert.equal(await authority({actorId:ACTOR_B,sessionId:SID_B}),true);
assert.equal(await authority({actorId:ACTOR_B,sessionId:SID_A}),false);
assert.equal(await authority({actorId:ACTOR_A,sessionId:SID_UNKNOWN}),false);

const makeJwt=(user,sid)=>[
 'eyJhbGciOiJIUzI1NiJ9',
 Buffer.from(JSON.stringify({
   sub:user,session_id:sid,role:'authenticated',
   exp:2000000000,is_anonymous:false
 })).toString('base64url'),
 'not_a_signed_jwt_for_CI'
].join('.');
let goTrueChecks=0;
const fakeGetUser=async()=>{
 goTrueChecks++;
 return {ok:true,json:async()=>({id:ACTOR_A,is_anonymous:false})};
};
const verifier=createTrustedSignedActorReadVerifier({
 enabled:true,
 projectUrl:'https://jtlusodorfnyzgyuewkz.supabase.co/',
 publishableKey:'sb_publishable_disposable_fixture_key',
 fetchImpl:fakeGetUser,db,clock:()=>1900000000000
});
const accepted=await verifier(makeJwt(ACTOR_A,SID_A));
assert.deepEqual(accepted,{
 id:ACTOR_A,sessionId:SID_A,active:true,verified:true
});
await assert.rejects(verifier(makeJwt(ACTOR_A,SID_UNKNOWN)),
 /authentication denied/);
await assert.rejects(verifier(makeJwt(ACTOR_B,SID_A)),
 /authentication denied/);
assert.equal(goTrueChecks,3);
// Never put user identifiers, secrets or tokens into CI stdout.
process.stdout.write('WS02D_B3_TRUSTED_PG17_SESSION_INTEGRATION_PASS '+
 'valid=2 foreign_own=1 cross_identity=denied '+
 'expired=denied banned=denied deleted=denied inactive=denied '+
 'membership_revoked=denied session_revoked=denied cleanup=PASS '+
 'auth_provider=MOCK_ONLY\n');
